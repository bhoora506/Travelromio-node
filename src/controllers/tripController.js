'use strict';

/**
 * src/controllers/tripController.js
 *
 * Implements N3-C Trip reading/discovery endpoints (index, show, myTrips, joinedTrips)
 * and N3-J Trip management mutation endpoints (store, update, publish, cancel).
 */

const { successResponse, errorResponse } = require('../utils/response');
const tripRepository = require('../repositories/tripRepository');
const tripDiscoveryService = require('../services/tripDiscoveryService');
const tripResource = require('../resources/tripResource');
const tripService = require('../services/tripService');
const interestRepository = require('../repositories/interestRepository');
const prisma = require('../config/database');
const { normaliseError, NotFoundError } = require('../db/errors');

/**
 * GET /api/trips
 * Trip discovery - paginated feed of published trips, excluding user's own trips.
 */
async function index(req, res) {
  try {
    const filters = req.query;
    
    // --- EXACT LARAVEL VALIDATION PARITY ---
    const errors = {};
    
    // page
    if (filters.page !== undefined) {
      const page = parseInt(filters.page, 10);
      if (isNaN(page) || page < 1) {
        errors.page = ['The page must be at least 1.'];
      }
    }
    
    // per_page
    if (filters.per_page !== undefined) {
      const perPage = parseInt(filters.per_page, 10);
      if (isNaN(perPage) || perPage < 1) {
        errors.per_page = ['The per page must be at least 1.'];
      } else if (perPage > 50) {
        errors.per_page = ['The per page must not be greater than 50.'];
      }
    }
    
    // sort
    if (filters.sort !== undefined) {
      if (!['newest', 'start_date', 'updated'].includes(filters.sort)) {
        errors.sort = ['Invalid sort value. Supported: newest, start_date, updated.'];
      }
    }
    
    // trip_type
    if (filters.trip_type !== undefined) {
      const validTypes = ['weekend', 'adventure', 'backpacking', 'road_trip', 'nature', 'photography', 'cultural', 'beach', 'mountains', 'other'];
      if (!validTypes.includes(filters.trip_type)) {
        errors.trip_type = ['Invalid trip type. Supported: ' + validTypes.join(', ') + '.'];
      }
    }
    
    // budgets
    let budgetMin = null;
    let budgetMax = null;
    
    if (filters.budget_min !== undefined && filters.budget_min !== '') {
      budgetMin = Number(filters.budget_min);
      if (isNaN(budgetMin) || budgetMin < 0) {
        errors.budget_min = ['The budget min must be at least 0.'];
      }
    }
    
    if (filters.budget_max !== undefined && filters.budget_max !== '') {
      budgetMax = Number(filters.budget_max);
      if (isNaN(budgetMax) || budgetMax < 0) {
        errors.budget_max = ['The budget max must be at least 0.'];
      }
      if (budgetMin !== null && !isNaN(budgetMin) && !isNaN(budgetMax) && budgetMax < budgetMin) {
        errors.budget_max = ['The maximum budget must be greater than or equal to the minimum budget.'];
      }
    }

    // dates
    let startDate = null;
    let endDate = null;
    
    if (filters.start_date !== undefined && filters.start_date !== '') {
      startDate = new Date(filters.start_date);
      if (isNaN(startDate.getTime())) {
        errors.start_date = ['The start date is not a valid date.'];
      }
    }
    
    if (filters.end_date !== undefined && filters.end_date !== '') {
      endDate = new Date(filters.end_date);
      if (isNaN(endDate.getTime())) {
        errors.end_date = ['The end date is not a valid date.'];
      }
      if (startDate !== null && !isNaN(startDate.getTime()) && !isNaN(endDate.getTime()) && endDate < startDate) {
        errors.end_date = ['The end date must be on or after the start date.'];
      }
    }
    
    if (Object.keys(errors).length > 0) {
      // Return Laravel compatible 422 Unprocessable Entity
      return res.status(422).json({
        message: 'The given data was invalid.',
        errors: errors
      });
    }
    
    const authId = req.user.id;

    const tripsPage = await tripDiscoveryService.discover(authId, filters);

    return successResponse(
      res,
      {
        items: tripResource.toCollection(tripsPage.items, authId),
        pagination: tripsPage.pagination
      },
      'Trips retrieved successfully.'
    );
  } catch (err) {
    console.error('[TripController.index] Error:', err);
    return errorResponse(res, 'An error occurred while retrieving trips', [], 500);
  }
}

/**
 * GET /api/trips/:tripId
 * View a trip (requires authorization).
 */
async function show(req, res) {
  try {
    const tripId = req.params.tripId;
    const authId = req.user.id;

    // We must load relations to calculate everything
    const trip = await tripRepository.findByIdWithRelations(tripId, authId);

    if (!trip) {
      return errorResponse(res, 'Trip not found.', [], 404);
    }

    // --- Authorization Logic (matching TripPolicy::view) ---
    // Owner can always view
    const isOwner = trip.user_id === BigInt(authId);
    
    // Active member can view
    const isMember = trip.trip_members && trip.trip_members.length > 0 && trip.trip_members[0].status === 'active';
    
    // Published trips are viewable by authenticated users
    const isPublished = trip.status === 'published';

    if (!isOwner && !isMember && !isPublished) {
      // Return 403 Forbidden
      return res.status(403).json({ success: false, message: 'This action is unauthorized.' });
    }

    return successResponse(
      res,
      { trip: tripResource.toResource(trip, authId) },
      'Trip retrieved successfully.'
    );
  } catch (err) {
    console.error('[TripController.show] Error:', err);
    // Handle specific DB errors safely
    const e = normaliseError(err);
    if (e.name === 'NotFoundError') {
      return errorResponse(res, 'Trip not found.', [], 404);
    }
    return errorResponse(res, 'An error occurred while retrieving the trip', [], 500);
  }
}

/**
 * GET /api/my/trips
 * List the authenticated user's own trips.
 */
async function myTrips(req, res) {
  try {
    const filters = req.query;
    if (filters.page !== undefined) {
      const pageNum = parseInt(filters.page, 10);
      if (isNaN(pageNum) || pageNum < 1) {
        return res.status(422).json({
          message: 'The given data was invalid.',
          errors: { page: ['The page must be at least 1.'] }
        });
      }
    }
    
    const authId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const perPage = 15; // Laravel defaults to 15 here

    const tripsPage = await tripRepository.findMyTripsPaginated(authId, page, perPage);

    return successResponse(
      res,
      {
        items: tripResource.toCollection(tripsPage.items, authId),
        pagination: {
          total: tripsPage.total,
          per_page: tripsPage.perPage,
          current_page: tripsPage.page,
          last_page: tripsPage.lastPage,
          has_more: tripsPage.page < tripsPage.lastPage
        }
      },
      'Trips retrieved successfully.'
    );
  } catch (err) {
    console.error('[TripController.myTrips] Error:', err);
    return errorResponse(res, 'An error occurred while retrieving your trips', [], 500);
  }
}

/**
 * GET /api/my/joined-trips
 * List the authenticated user's joined trips.
 */
async function joinedTrips(req, res) {
  try {
    const filters = req.query;
    if (filters.page !== undefined) {
      const pageNum = parseInt(filters.page, 10);
      if (isNaN(pageNum) || pageNum < 1) {
        return res.status(422).json({
          message: 'The given data was invalid.',
          errors: { page: ['The page must be at least 1.'] }
        });
      }
    }
    
    const authId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const perPage = 15;

    const tripsPage = await tripRepository.findMyJoinedTripsPaginated(authId, page, perPage);

    return successResponse(
      res,
      {
        items: tripResource.toCollection(tripsPage.items, authId),
        pagination: {
          total: tripsPage.total,
          per_page: tripsPage.perPage,
          current_page: tripsPage.page,
          last_page: tripsPage.lastPage,
          has_more: tripsPage.page < tripsPage.lastPage
        }
      },
      'Joined trips retrieved successfully.'
    );
  } catch (err) {
    console.error('[TripController.joinedTrips] Error:', err);
    return errorResponse(res, 'An error occurred while retrieving joined trips', [], 500);
  }
}

// ── N3-J: Trip mutation endpoints ─────────────────────────────────────────

/**
 * POST /api/trips
 * Create a new trip. Owner membership and interests are created atomically.
 *
 * Accepts multipart/form-data (when image included) or JSON.
 * Flutter sends multipart with '_method' not present on create.
 */
async function store(req, res) {
  try {
    const authId = req.user.id;
    const data = req.body;
    const file = req.file || null;

    // Validate interest_ids if provided as bracket notation (multipart)
    // Flutter sends: interest_ids[0]=1&interest_ids[1]=2
    // Express/multer parses this into req.body.interest_ids as an array automatically
    // when we use extended: true in bodyParser.

    const { errors, isValid } = tripService.validateCreatePayload(data, file);
    if (!isValid) {
      // Clean up uploaded file on validation failure
      if (file && file.path) {
        const fs = require('fs');
        try { fs.unlinkSync(file.path); } catch (_) {}
      }
      return res.status(422).json({
        message: 'The given data was invalid.',
        errors
      });
    }

    // Validate that interest IDs exist in DB
    if (Array.isArray(data.interest_ids) && data.interest_ids.length > 0) {
      for (const id of data.interest_ids) {
        const interest = await interestRepository.findById(parseInt(id, 10));
        if (!interest) {
          if (file && file.path) {
            const fs = require('fs');
            try { fs.unlinkSync(file.path); } catch (_) {}
          }
          return res.status(422).json({
            message: 'The given data was invalid.',
            errors: { 'interest_ids.*': ['The selected interest ids is invalid.'] }
          });
        }
      }
    }

    const trip = await tripService.createTrip(authId, data, file);

    // Load relations for response (matches Laravel controller eager loads)
    const tripWithRelations = await tripRepository.findByIdWithRelations(trip.id, authId);

    return successResponse(
      res,
      { trip: tripResource.toResource(tripWithRelations, authId) },
      'Trip created successfully.',
      201
    );
  } catch (err) {
    if (err.statusCode) {
      return errorResponse(res, err.message, [], err.statusCode);
    }
    console.error('[TripController.store] Error:', err);
    return errorResponse(res, 'An error occurred while creating trip', [], 500);
  }
}

/**
 * PUT /api/trips/:tripId
 * Update an existing trip (owner only, lifecycle-restricted).
 *
 * Flutter sends PUT for JSON-only updates.
 * Flutter sends POST with _method=PUT for multipart (with image).
 * We handle both via the route.
 */
async function update(req, res) {
  try {
    const authId = req.user.id;
    const tripId = BigInt(req.params.tripId);
    const data = req.body;
    const file = req.file || null;

    const trip = await tripRepository.findById(tripId);
    if (!trip) {
      return errorResponse(res, 'Not Found', [], 404);
    }

    // Authorization: owner only (mirrors TripPolicy::update)
    if (String(trip.user_id) !== String(authId)) {
      return errorResponse(res, 'This action is unauthorized.', [], 403);
    }

    // Validate payload
    const { errors, isValid } = tripService.validateUpdatePayload(data);
    if (!isValid) {
      if (file && file.path) {
        const fs = require('fs');
        try { fs.unlinkSync(file.path); } catch (_) {}
      }
      return res.status(422).json({
        message: 'The given data was invalid.',
        errors
      });
    }

    // Validate interest_ids exist if provided
    if (Array.isArray(data.interest_ids) && data.interest_ids.length > 0) {
      for (const id of data.interest_ids) {
        const interest = await interestRepository.findById(parseInt(id, 10));
        if (!interest) {
          if (file && file.path) {
            const fs = require('fs');
            try { fs.unlinkSync(file.path); } catch (_) {}
          }
          return res.status(422).json({
            message: 'The given data was invalid.',
            errors: { 'interest_ids.*': ['The selected interest ids is invalid.'] }
          });
        }
      }
    }

    const updated = await tripService.updateTrip(trip, data, file);

    // Load relations for response
    const tripWithRelations = await tripRepository.findByIdWithRelations(updated.id, authId);

    return successResponse(
      res,
      { trip: tripResource.toResource(tripWithRelations, authId) },
      'Trip updated successfully.'
    );
  } catch (err) {
    if (err.statusCode) {
      return errorResponse(res, err.message, [], err.statusCode);
    }
    console.error('[TripController.update] Error:', err);
    return errorResponse(res, 'An error occurred while updating trip', [], 500);
  }
}

/**
 * POST /api/trips/:tripId/publish
 * Publish a draft trip (owner only).
 */
async function publish(req, res) {
  try {
    const authId = req.user.id;
    const tripId = BigInt(req.params.tripId);

    const trip = await tripRepository.findById(tripId);
    if (!trip) {
      return errorResponse(res, 'Not Found', [], 404);
    }

    // Authorization: owner only (mirrors TripPolicy::publish)
    if (String(trip.user_id) !== String(authId)) {
      return errorResponse(res, 'This action is unauthorized.', [], 403);
    }

    const published = await tripService.publishTrip(trip);

    // Load relations for response
    const tripWithRelations = await tripRepository.findByIdWithRelations(published.id, authId);

    return successResponse(
      res,
      { trip: tripResource.toResource(tripWithRelations, authId) },
      'Trip published successfully.'
    );
  } catch (err) {
    if (err.statusCode) {
      return errorResponse(res, err.message, [], err.statusCode);
    }
    console.error('[TripController.publish] Error:', err);
    return errorResponse(res, 'An error occurred while publishing trip', [], 500);
  }
}

/**
 * POST /api/trips/:tripId/cancel
 * Cancel a trip from any non-terminal state (owner only).
 */
async function cancel(req, res) {
  try {
    const authId = req.user.id;
    const tripId = BigInt(req.params.tripId);

    const trip = await tripRepository.findById(tripId);
    if (!trip) {
      return errorResponse(res, 'Not Found', [], 404);
    }

    // Authorization: owner only (mirrors TripPolicy::cancel)
    if (String(trip.user_id) !== String(authId)) {
      return errorResponse(res, 'This action is unauthorized.', [], 403);
    }

    const cancelled = await tripService.cancelTrip(trip);

    // Load relations for response
    const tripWithRelations = await tripRepository.findByIdWithRelations(cancelled.id, authId);

    return successResponse(
      res,
      { trip: tripResource.toResource(tripWithRelations, authId) },
      'Trip cancelled successfully.'
    );
  } catch (err) {
    if (err.statusCode) {
      return errorResponse(res, err.message, [], err.statusCode);
    }
    console.error('[TripController.cancel] Error:', err);
    return errorResponse(res, 'An error occurred while cancelling trip', [], 500);
  }
}

module.exports = { index, show, myTrips, joinedTrips, store, update, publish, cancel };
