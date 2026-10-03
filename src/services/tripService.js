'use strict';

/**
 * src/services/tripService.js
 *
 * Business logic for trip lifecycle mutations: create, update, publish, cancel.
 *
 * State machine (verified from Laravel TripStatus.php):
 *   draft     -> published | cancelled
 *   published -> ongoing | cancelled
 *   ongoing   -> completed | cancelled
 *   completed -> (terminal)
 *   cancelled -> (terminal)
 *
 * Transition rules:
 *   publish: draft -> published only
 *   cancel:  draft | published | ongoing -> cancelled
 *   update:  draft | published -> all editable fields
 *            ongoing -> title | description only
 *            completed | cancelled -> throw 409 (immutable)
 *
 * Verified from Laravel TripService.php source.
 */

const prisma = require('../config/database');
const tripRepository = require('../repositories/tripRepository');
const { normaliseError } = require('../db/errors');
const fs = require('fs');
const path = require('path');

// ── Enums (verified from Laravel source) ───────────────────────────────────
const TRIP_TYPES = [
  'weekend', 'adventure', 'backpacking', 'road_trip', 'nature',
  'photography', 'cultural', 'beach', 'mountains', 'other'
];

const TRIP_STATUSES = ['draft', 'published', 'ongoing', 'completed', 'cancelled'];

// Verified from TripStatus::cancellableFrom()
const CANCELLABLE_FROM = ['draft', 'published', 'ongoing'];

// Verified from TripStatus::allowedTransitions()
function canTransitionTo(currentStatus, nextStatus) {
  const transitions = {
    draft:     ['published', 'cancelled'],
    published: ['ongoing', 'cancelled'],
    ongoing:   ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
  };
  return (transitions[currentStatus] || []).includes(nextStatus);
}

// ── Storage helpers ─────────────────────────────────────────────────────────
const STORAGE_ROOT = path.join(__dirname, '../../public/storage');

/**
 * Safe file deletion within storage root.
 * Protects against path traversal.
 * @param {string|null} relativePath  e.g. "trips/abc.jpg"
 */
function safeDeleteFile(relativePath) {
  if (!relativePath) return;
  try {
    const absPath = path.resolve(STORAGE_ROOT, relativePath);
    if (!absPath.startsWith(path.resolve(STORAGE_ROOT))) {
      // Path traversal attempt - skip silently
      return;
    }
    if (fs.existsSync(absPath)) {
      fs.unlinkSync(absPath);
    }
  } catch (_err) {
    // Non-fatal: log but do not throw
    console.error('[tripService] Failed to delete file:', relativePath, _err.message);
  }
}

// ── Validation helpers ──────────────────────────────────────────────────────
class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Validate create trip payload.
 * Mirrors CreateTripRequest.php exactly.
 * @param {object} data
 * @param {object} [file] multer file
 * @returns {{ errors: object, isValid: boolean }}
 */
function validateCreatePayload(data, file) {
  const errors = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // title: required, string, min:3, max:200
  if (!data.title || typeof data.title !== 'string' || data.title.trim() === '') {
    errors.title = ['The title field is required.'];
  } else if (data.title.length < 3) {
    errors.title = ['The title must be at least 3 characters.'];
  } else if (data.title.length > 200) {
    errors.title = ['The title must not be greater than 200 characters.'];
  }

  // destination: required, string, max:200
  if (!data.destination || typeof data.destination !== 'string' || data.destination.trim() === '') {
    errors.destination = ['The destination field is required.'];
  } else if (data.destination.length > 200) {
    errors.destination = ['The destination must not be greater than 200 characters.'];
  }

  // place_id: nullable, string, max:100
  if (data.place_id !== undefined && data.place_id !== null && data.place_id !== '') {
    if (typeof data.place_id !== 'string' || data.place_id.length > 100) {
      errors.place_id = ['The place id must not be greater than 100 characters.'];
    }
  }

  // latitude: nullable, numeric, between:-90,90
  if (data.latitude !== undefined && data.latitude !== null && data.latitude !== '') {
    const lat = parseFloat(data.latitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      errors.latitude = ['The latitude must be between -90 and 90.'];
    }
  }

  // longitude: nullable, numeric, between:-180,180
  if (data.longitude !== undefined && data.longitude !== null && data.longitude !== '') {
    const lng = parseFloat(data.longitude);
    if (isNaN(lng) || lng < -180 || lng > 180) {
      errors.longitude = ['The longitude must be between -180 and 180.'];
    }
  }

  // start_date: required, date, after_or_equal:today
  if (!data.start_date || data.start_date === '') {
    errors.start_date = ['The start date field is required.'];
  } else {
    const startDate = new Date(data.start_date);
    if (isNaN(startDate.getTime())) {
      errors.start_date = ['The start date is not a valid date.'];
    } else if (startDate < today) {
      errors.start_date = ['The start date must be today or in the future.'];
    }
  }

  // end_date: required, date, after_or_equal:start_date
  if (!data.end_date || data.end_date === '') {
    errors.end_date = ['The end date field is required.'];
  } else {
    const endDate = new Date(data.end_date);
    if (isNaN(endDate.getTime())) {
      errors.end_date = ['The end date is not a valid date.'];
    } else if (!errors.start_date && data.start_date) {
      const startDate = new Date(data.start_date);
      if (endDate < startDate) {
        errors.end_date = ['The end date must be on or after the start date.'];
      }
    }
  }

  // budget_min: nullable, numeric, min:0
  if (data.budget_min !== undefined && data.budget_min !== null && data.budget_min !== '') {
    const bmin = parseFloat(data.budget_min);
    if (isNaN(bmin) || bmin < 0) {
      errors.budget_min = ['The budget min must be at least 0.'];
    }
  }

  // budget_max: nullable, numeric, min:0, gte:budget_min
  if (data.budget_max !== undefined && data.budget_max !== null && data.budget_max !== '') {
    const bmax = parseFloat(data.budget_max);
    if (isNaN(bmax) || bmax < 0) {
      errors.budget_max = ['The budget max must be at least 0.'];
    } else if (data.budget_min !== undefined && data.budget_min !== null && data.budget_min !== '') {
      const bmin = parseFloat(data.budget_min);
      if (!isNaN(bmin) && bmax < bmin) {
        errors.budget_max = ['The maximum budget must be greater than or equal to the minimum budget.'];
      }
    }
  }

  // trip_type: required, string, Rule::in(TripType::values())
  if (!data.trip_type || typeof data.trip_type !== 'string' || data.trip_type.trim() === '') {
    errors.trip_type = ['The trip type field is required.'];
  } else if (!TRIP_TYPES.includes(data.trip_type)) {
    errors.trip_type = ['The selected trip type is invalid.'];
  }

  // description: nullable, string, max:5000
  if (data.description !== undefined && data.description !== null && data.description !== '') {
    if (typeof data.description !== 'string' || data.description.length > 5000) {
      errors.description = ['The description must not be greater than 5000 characters.'];
    }
  }

  // max_members: required, integer, min:2, max:20
  if (data.max_members === undefined || data.max_members === null || data.max_members === '') {
    errors.max_members = ['The max members field is required.'];
  } else {
    const mm = parseInt(data.max_members, 10);
    if (isNaN(mm) || !Number.isInteger(mm) || String(mm) !== String(parseInt(data.max_members, 10))) {
      errors.max_members = ['The max members must be an integer.'];
    } else if (mm < 2) {
      errors.max_members = ['The max members must be at least 2.'];
    } else if (mm > 20) {
      errors.max_members = ['The max members must not be greater than 20.'];
    }
  }

  // interest_ids: sometimes, nullable, array, max:10
  if (data.interest_ids !== undefined && data.interest_ids !== null) {
    if (!Array.isArray(data.interest_ids)) {
      errors.interest_ids = ['The interest ids must be an array.'];
    } else if (data.interest_ids.length > 10) {
      errors.interest_ids = ['The interest ids may not have more than 10 items.'];
    }
  }

  // image: nullable, image, mimes:jpeg,png,jpg,webp, max:5120
  // Multer handles MIME and size validation before controller is invoked.
  // If file is present, we accept it (MIME-type validated by multer fileFilter).

  return { errors, isValid: Object.keys(errors).length === 0 };
}

/**
 * Validate update trip payload.
 * Mirrors UpdateTripRequest.php exactly.
 * @param {object} data
 * @returns {{ errors: object, isValid: boolean }}
 */
function validateUpdatePayload(data) {
  const errors = {};

  // title: sometimes, string, min:3, max:200
  if (data.title !== undefined && data.title !== null) {
    if (typeof data.title !== 'string' || data.title.trim() === '') {
      errors.title = ['The title must be a string.'];
    } else if (data.title.length < 3) {
      errors.title = ['The title must be at least 3 characters.'];
    } else if (data.title.length > 200) {
      errors.title = ['The title must not be greater than 200 characters.'];
    }
  }

  // destination: sometimes, string, max:200
  if (data.destination !== undefined && data.destination !== null) {
    if (typeof data.destination !== 'string') {
      errors.destination = ['The destination must be a string.'];
    } else if (data.destination.length > 200) {
      errors.destination = ['The destination must not be greater than 200 characters.'];
    }
  }

  // place_id: sometimes, nullable, string, max:100
  if (data.place_id !== undefined && data.place_id !== null) {
    if (typeof data.place_id !== 'string' || data.place_id.length > 100) {
      errors.place_id = ['The place id must not be greater than 100 characters.'];
    }
  }

  // latitude: sometimes, nullable, numeric, between:-90,90
  if (data.latitude !== undefined && data.latitude !== null && data.latitude !== '') {
    const lat = parseFloat(data.latitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      errors.latitude = ['The latitude must be between -90 and 90.'];
    }
  }

  // longitude: sometimes, nullable, numeric, between:-180,180
  if (data.longitude !== undefined && data.longitude !== null && data.longitude !== '') {
    const lng = parseFloat(data.longitude);
    if (isNaN(lng) || lng < -180 || lng > 180) {
      errors.longitude = ['The longitude must be between -180 and 180.'];
    }
  }

  // start_date: sometimes, date (no after_or_equal:today on update)
  if (data.start_date !== undefined && data.start_date !== null && data.start_date !== '') {
    const startDate = new Date(data.start_date);
    if (isNaN(startDate.getTime())) {
      errors.start_date = ['The start date is not a valid date.'];
    }
  }

  // end_date: sometimes, date, after_or_equal:start_date
  if (data.end_date !== undefined && data.end_date !== null && data.end_date !== '') {
    const endDate = new Date(data.end_date);
    if (isNaN(endDate.getTime())) {
      errors.end_date = ['The end date is not a valid date.'];
    } else if (data.start_date !== undefined && data.start_date !== null && data.start_date !== '') {
      const startDate = new Date(data.start_date);
      if (!isNaN(startDate.getTime()) && endDate < startDate) {
        errors.end_date = ['The end date must be on or after the start date.'];
      }
    }
  }

  // budget_min: sometimes, nullable, numeric, min:0
  if (data.budget_min !== undefined && data.budget_min !== null && data.budget_min !== '') {
    const bmin = parseFloat(data.budget_min);
    if (isNaN(bmin) || bmin < 0) {
      errors.budget_min = ['The budget min must be at least 0.'];
    }
  }

  // budget_max: sometimes, nullable, numeric, min:0, gte:budget_min
  if (data.budget_max !== undefined && data.budget_max !== null && data.budget_max !== '') {
    const bmax = parseFloat(data.budget_max);
    if (isNaN(bmax) || bmax < 0) {
      errors.budget_max = ['The budget max must be at least 0.'];
    } else if (data.budget_min !== undefined && data.budget_min !== null && data.budget_min !== '') {
      const bmin = parseFloat(data.budget_min);
      if (!isNaN(bmin) && bmax < bmin) {
        errors.budget_max = ['The maximum budget must be greater than or equal to the minimum budget.'];
      }
    }
  }

  // trip_type: sometimes, string, Rule::in(TripType::values())
  if (data.trip_type !== undefined && data.trip_type !== null) {
    if (typeof data.trip_type !== 'string' || !TRIP_TYPES.includes(data.trip_type)) {
      errors.trip_type = ['The selected trip type is invalid.'];
    }
  }

  // description: sometimes, nullable, string, max:5000
  if (data.description !== undefined && data.description !== null) {
    if (typeof data.description !== 'string' || data.description.length > 5000) {
      errors.description = ['The description must not be greater than 5000 characters.'];
    }
  }

  // max_members: sometimes, integer, min:2, max:20
  if (data.max_members !== undefined && data.max_members !== null) {
    const mm = parseInt(data.max_members, 10);
    if (isNaN(mm)) {
      errors.max_members = ['The max members must be an integer.'];
    } else if (mm < 2) {
      errors.max_members = ['The max members must be at least 2.'];
    } else if (mm > 20) {
      errors.max_members = ['The max members must not be greater than 20.'];
    }
  }

  // interest_ids: sometimes, nullable, array, max:10
  if (data.interest_ids !== undefined && data.interest_ids !== null) {
    if (!Array.isArray(data.interest_ids)) {
      errors.interest_ids = ['The interest ids must be an array.'];
    } else if (data.interest_ids.length > 10) {
      errors.interest_ids = ['The interest ids may not have more than 10 items.'];
    }
  }

  // remove_image: sometimes, boolean
  if (data.remove_image !== undefined && data.remove_image !== null) {
    // Accept truthy booleans or string 'true'/'false'/'1'/'0'
    const val = String(data.remove_image).toLowerCase();
    if (!['true', 'false', '1', '0'].includes(val)) {
      errors.remove_image = ['The remove image field must be true or false.'];
    }
  }

  return { errors, isValid: Object.keys(errors).length === 0 };
}

// ── Service class ───────────────────────────────────────────────────────────
class TripService {

  /**
   * Create a trip with owner TripMember and optional interests.
   * Wrapped in a transaction (mirrors Laravel TripService::createTrip).
   *
   * Transaction order (verified from Laravel source):
   *   1. Image upload (BEFORE transaction - same as Laravel)
   *   2. DB::transaction {
   *        Trip::create(...)
   *        TripMember::create(owner)
   *        trip->interests()->sync(interestIds)  (if provided)
   *      }
   *   3. On any transaction failure: delete uploaded image
   *
   * @param {BigInt|number} ownerId
   * @param {object} data  Validated payload
   * @param {object|null} [file]  Multer file object
   * @returns {Promise<object>}  Created trip record
   */
  async createTrip(ownerId, data, file = null) {
    // Step 1: Upload image BEFORE transaction (matches Laravel's TripService)
    let imagePath = null;
    if (file) {
      // Node uploads to public/storage/trips/{filename}
      // DB stores relative path: "trips/{filename}"
      imagePath = `trips/${file.filename}`;
    }

    try {
      return await prisma.$transaction(async (tx) => {
        const interestIds = Array.isArray(data.interest_ids) ? data.interest_ids : [];

        // Build trip data - explicit allowlist (no mass assignment)
        const tripData = {
          user_id:     BigInt(ownerId),
          status:      'draft', // Always draft on creation (verified from Laravel)
          title:       data.title,
          destination: data.destination,
          trip_type:   data.trip_type,
          max_members: parseInt(data.max_members, 10),
          image_path:  imagePath,
        };

        if (data.place_id !== undefined && data.place_id !== null && data.place_id !== '') {
          tripData.place_id = data.place_id;
        }
        if (data.latitude !== undefined && data.latitude !== null && data.latitude !== '') {
          tripData.latitude = String(parseFloat(data.latitude));
        }
        if (data.longitude !== undefined && data.longitude !== null && data.longitude !== '') {
          tripData.longitude = String(parseFloat(data.longitude));
        }
        if (data.start_date) {
          tripData.start_date = new Date(data.start_date);
        }
        if (data.end_date) {
          tripData.end_date = new Date(data.end_date);
        }
        if (data.budget_min !== undefined && data.budget_min !== null && data.budget_min !== '') {
          tripData.budget_min = String(parseFloat(data.budget_min));
        }
        if (data.budget_max !== undefined && data.budget_max !== null && data.budget_max !== '') {
          tripData.budget_max = String(parseFloat(data.budget_max));
        }
        if (data.description !== undefined && data.description !== null && data.description !== '') {
          tripData.description = data.description;
        }

        // Create trip record
        const trip = await tx.trips.create({ data: tripData });

        // Create owner TripMember record
        // Verified from Laravel: role='owner', status='active', joined_at=null
        await tx.trip_members.create({
          data: {
            trip_id:   trip.id,
            user_id:   BigInt(ownerId),
            role:      'owner',
            status:    'active',
            joined_at: null,
          }
        });

        // Sync trip interests (if provided)
        if (interestIds.length > 0) {
          const uniqueIds = [...new Set(interestIds.map(Number))];
          // Delete existing (there are none on create, but mirror sync semantics)
          await tx.trip_interests.deleteMany({ where: { trip_id: trip.id } });
          // Insert new
          await tx.trip_interests.createMany({
            data: uniqueIds.map(id => ({
              trip_id:     trip.id,
              interest_id: BigInt(id),
            })),
            skipDuplicates: true,
          });
        }

        return trip;
      });
    } catch (err) {
      // On failure: delete uploaded image (mirrors Laravel's catch block)
      if (imagePath) {
        safeDeleteFile(imagePath);
      }
      throw err;
    }
  }

  /**
   * Update a trip (lifecycle-restricted).
   *
   * Lifecycle rules (verified from Laravel TripService::updateTrip):
   *   completed | cancelled: throw 409 (immutable)
   *   ongoing:               only title and description may change
   *   draft | published:     all editable fields allowed
   *
   * Image handling (verified from Laravel source):
   *   New image: upload, update DB, delete old image after successful DB update
   *   remove_image=true: set image_path=null, delete old image after successful DB update
   *   ongoing: image changes silently ignored
   *
   * @param {object} trip  Current trip record from DB
   * @param {object} data  Request payload (validated)
   * @param {object|null} [file]  Multer file
   * @returns {Promise<object>} Updated trip record
   */
  async updateTrip(trip, data, file = null) {
    const status = trip.status;

    // Immutable statuses
    if (status === 'completed' || status === 'cancelled') {
      throw new HttpError(409, `A ${status} trip cannot be updated.`);
    }

    // Extract interest_ids from data before building update payload
    const interestIds = Object.prototype.hasOwnProperty.call(data, 'interest_ids')
      ? data.interest_ids
      : false; // false = not present in request (do not sync)

    // Extract image-related fields
    let incomingFile = file;
    const removeImageRaw = Object.prototype.hasOwnProperty.call(data, 'remove_image')
      ? data.remove_image
      : false;
    const removeImage = removeImageRaw !== false
      ? ['true', '1', true].includes(removeImageRaw)
      : false;

    // Build update data with explicit allowlist
    let updateData = {};

    if (status === 'ongoing') {
      // Only title and description are editable in ongoing state
      if (data.title !== undefined) updateData.title = data.title;
      if (data.description !== undefined) updateData.description = data.description || null;
      // Image changes are silently ignored for ongoing trips (matches Laravel)
      if (file) {
        safeDeleteFile(`trips/${file.filename}`);
      }
      incomingFile = null;
    } else {
      // draft or published: all editable fields
      if (data.title !== undefined)       updateData.title = data.title;
      if (data.destination !== undefined) updateData.destination = data.destination;
      if (data.place_id !== undefined)    updateData.place_id = data.place_id || null;
      if (data.latitude !== undefined && data.latitude !== null && data.latitude !== '') {
        updateData.latitude = String(parseFloat(data.latitude));
      } else if (data.latitude === null || data.latitude === '') {
        updateData.latitude = null;
      }
      if (data.longitude !== undefined && data.longitude !== null && data.longitude !== '') {
        updateData.longitude = String(parseFloat(data.longitude));
      } else if (data.longitude === null || data.longitude === '') {
        updateData.longitude = null;
      }
      if (data.start_date !== undefined && data.start_date !== null && data.start_date !== '') {
        updateData.start_date = new Date(data.start_date);
      }
      if (data.end_date !== undefined && data.end_date !== null && data.end_date !== '') {
        updateData.end_date = new Date(data.end_date);
      }
      if (data.budget_min !== undefined) {
        updateData.budget_min = (data.budget_min !== null && data.budget_min !== '')
          ? String(parseFloat(data.budget_min)) : null;
      }
      if (data.budget_max !== undefined) {
        updateData.budget_max = (data.budget_max !== null && data.budget_max !== '')
          ? String(parseFloat(data.budget_max)) : null;
      }
      if (data.trip_type !== undefined)   updateData.trip_type = data.trip_type;
      if (data.description !== undefined) updateData.description = data.description || null;
      if (data.max_members !== undefined) updateData.max_members = parseInt(data.max_members, 10);
    }

    // Image handling (only if not ongoing)
    let newImagePath = null;
    let shouldDeleteOld = false;
    const oldImagePath = trip.image_path;

    if (incomingFile) {
      // Upload new image
      newImagePath = `trips/${incomingFile.filename}`;
      updateData.image_path = newImagePath;
      shouldDeleteOld = true;
    } else if (removeImage) {
      updateData.image_path = null;
      shouldDeleteOld = true;
    }

    // Perform DB update
    let updatedTrip;
    try {
      updatedTrip = await tripRepository.update(trip.id, updateData);
    } catch (err) {
      // On DB failure: delete newly uploaded image
      if (newImagePath) {
        safeDeleteFile(newImagePath);
      }
      throw err;
    }

    // After successful DB update: delete old image
    if (shouldDeleteOld && oldImagePath) {
      safeDeleteFile(oldImagePath);
    }

    // Sync interests only when key was explicitly present in request
    if (interestIds !== false) {
      const idsArray = Array.isArray(interestIds) ? interestIds : [];
      const uniqueIds = [...new Set(idsArray.map(Number))].filter(n => !isNaN(n));
      // Mirror Laravel's sync() semantics: delete all + insert new
      await prisma.trip_interests.deleteMany({ where: { trip_id: trip.id } });
      if (uniqueIds.length > 0) {
        await prisma.trip_interests.createMany({
          data: uniqueIds.map(id => ({
            trip_id:     trip.id,
            interest_id: BigInt(id),
          })),
          skipDuplicates: true,
        });
      }
    }

    return updatedTrip;
  }

  /**
   * Publish a draft trip.
   * Verified from Laravel TripService::publishTrip.
   *
   * @param {object} trip  Current trip record
   * @returns {Promise<object>} Updated trip record
   */
  async publishTrip(trip) {
    // Check valid transition (draft -> published only)
    if (!canTransitionTo(trip.status, 'published')) {
      throw new HttpError(409, `Cannot publish a trip that is ${trip.status}.`);
    }

    // Minimum publish requirements (verified from Laravel source)
    const missing = [];
    if (!trip.title)       missing.push('title');
    if (!trip.destination) missing.push('destination');
    if (!trip.start_date)  missing.push('start_date');
    if (!trip.end_date)    missing.push('end_date');
    if (!trip.trip_type)   missing.push('trip_type');
    if (!trip.max_members) missing.push('max_members');

    if (missing.length > 0) {
      throw new HttpError(
        422,
        `Trip cannot be published. Missing required fields: ${missing.join(', ')}.`
      );
    }

    return await tripRepository.update(trip.id, { status: 'published' });
  }

  /**
   * Cancel a trip from any non-terminal state.
   * Verified from Laravel TripService::cancelTrip.
   *
   * Cancellable from: draft, published, ongoing (verified from TripStatus::cancellableFrom())
   *
   * @param {object} trip  Current trip record
   * @returns {Promise<object>} Updated trip record
   */
  async cancelTrip(trip) {
    if (!CANCELLABLE_FROM.includes(trip.status)) {
      throw new HttpError(409, `Cannot cancel a trip that is already ${trip.status}.`);
    }

    return await tripRepository.update(trip.id, { status: 'cancelled' });
  }
}

// Validation helpers are exported so the controller can use them
module.exports = Object.assign(new TripService(), {
  validateCreatePayload,
  validateUpdatePayload,
  TRIP_TYPES,
  TRIP_STATUSES,
});
