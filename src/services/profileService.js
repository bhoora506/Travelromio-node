'use strict';

/**
 * src/services/profileService.js
 *
 * Handles business logic for profile updates, interests, and photos.
 */

const profileRepository = require('../repositories/profileRepository');
const userInterestRepository = require('../repositories/userInterestRepository');
const interestRepository = require('../repositories/interestRepository');
const userRepository = require('../repositories/userRepository');
const fs = require('fs');
const path = require('path');

class HttpError extends Error {
  constructor(statusCode, message, payload) {
    super(message);
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

class ProfileService {
  
  async updateProfile(userId, data) {
    const allowedFields = [
      'bio', 'city', 'country', 'languages', 'travel_style',
      'preferred_budget_min', 'preferred_budget_max'
    ];

    const updateData = {};
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updateData[field] = data[field];
      }
    }

    if (updateData.bio !== undefined && updateData.bio !== null) {
      if (typeof updateData.bio !== 'string' || updateData.bio.length > 1000) {
        throw new HttpError(422, 'Validation failed', { success: false, message: 'The given data was invalid.', errors: { bio: ['The bio must not be greater than 1000 characters.'] } });
      }
    }
    
    if (updateData.city !== undefined && updateData.city !== null) {
      if (typeof updateData.city !== 'string' || updateData.city.length > 100) {
        throw new HttpError(422, 'Validation failed', { success: false, message: 'The given data was invalid.', errors: { city: ['The city must not be greater than 100 characters.'] } });
      }
    }

    if (updateData.country !== undefined && updateData.country !== null) {
      if (typeof updateData.country !== 'string' || updateData.country.length > 100) {
        throw new HttpError(422, 'Validation failed', { success: false, message: 'The given data was invalid.', errors: { country: ['The country must not be greater than 100 characters.'] } });
      }
    }

    if (updateData.languages !== undefined && updateData.languages !== null) {
      if (!Array.isArray(updateData.languages)) {
        throw new HttpError(422, 'Validation failed', { success: false, message: 'The given data was invalid.', errors: { languages: ['The languages must be an array.'] } });
      }
      if (updateData.languages.length > 10) {
        throw new HttpError(422, 'Validation failed', { success: false, message: 'The given data was invalid.', errors: { languages: ['The languages may not have more than 10 items.'] } });
      }
      for (const l of updateData.languages) {
        if (typeof l !== 'string' || l.length > 50) {
          throw new HttpError(422, 'Validation failed', { success: false, message: 'The given data was invalid.', errors: { 'languages.*': ['The languages must not be greater than 50 characters.'] } });
        }
      }
    }

    if (updateData.travel_style !== undefined && updateData.travel_style !== null) {
      const allowedStyles = [
        'adventure', 'backpacking', 'budget', 'luxury', 'relaxed',
        'road_trip', 'nature', 'cultural'
      ];
      if (typeof updateData.travel_style !== 'string' || !allowedStyles.includes(updateData.travel_style)) {
        throw new HttpError(422, 'Validation failed', { success: false, message: 'The given data was invalid.', errors: { travel_style: ['The selected travel style is invalid.'] } });
      }
    }

    if (updateData.preferred_budget_min !== undefined && updateData.preferred_budget_min !== null) {
      const minNum = parseFloat(updateData.preferred_budget_min);
      if (isNaN(minNum) || minNum < 0) {
        throw new HttpError(422, 'Validation failed', { success: false, message: 'The given data was invalid.', errors: { preferred_budget_min: ['The preferred budget min must be at least 0.'] } });
      }
      updateData.preferred_budget_min = minNum;
    }

    if (updateData.preferred_budget_max !== undefined && updateData.preferred_budget_max !== null) {
      const maxNum = parseFloat(updateData.preferred_budget_max);
      if (isNaN(maxNum) || maxNum < 0) {
        throw new HttpError(422, 'Validation failed', { success: false, message: 'The given data was invalid.', errors: { preferred_budget_max: ['The preferred budget max must be at least 0.'] } });
      }
      if (updateData.preferred_budget_min !== undefined && updateData.preferred_budget_min !== null) {
        if (maxNum < updateData.preferred_budget_min) {
          throw new HttpError(422, 'Validation failed', { success: false, message: 'The given data was invalid.', errors: { preferred_budget_max: ['The preferred budget max must be greater than or equal to preferred budget min.'] } });
        }
      }
      updateData.preferred_budget_max = maxNum;
    }

    await profileRepository.upsert(userId, updateData);
    
    // Laravel reloads the user with profile and interests
    return await userRepository.findByIdWithProfileAndInterests(userId);
  }

  async updateInterests(userId, interestIds) {
    if (!interestIds || !Array.isArray(interestIds)) {
      throw new HttpError(422, 'Validation failed', { success: false, message: 'The given data was invalid.', errors: { interest_ids: ['The interest ids field is required and must be an array.'] } });
    }

    if (interestIds.length > 20) {
      throw new HttpError(422, 'Validation failed', { success: false, message: 'The given data was invalid.', errors: { interest_ids: ['The interest ids may not have more than 20 items.'] } });
    }

    // Verify all IDs exist
    for (const id of interestIds) {
      if (!Number.isInteger(id)) {
        throw new HttpError(422, 'Validation failed', { success: false, message: 'The given data was invalid.', errors: { 'interest_ids.*': ['The interest ids must be an integer.'] } });
      }
      const interest = await interestRepository.findById(id);
      if (!interest) {
        throw new HttpError(422, 'Validation failed', { success: false, message: 'The given data was invalid.', errors: { 'interest_ids.*': ['The selected interest ids is invalid.'] } });
      }
    }

    await userInterestRepository.sync(userId, interestIds);
    return await userRepository.findByIdWithProfileAndInterests(userId);
  }

  async uploadPhoto(userId, file) {
    if (!file) {
      throw new HttpError(422, 'Validation failed', {
        success: false,
        message: 'The given data was invalid.',
        errors: { photo: ['The photo field is required.'] }
      });
    }

    const profile = await profileRepository.findByUserId(userId);
    if (profile && profile.profile_photo_path) {
      // Delete old photo
      const oldPath = path.join(__dirname, '../../public/storage', profile.profile_photo_path);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    const relativePath = 'profile-photos/' + file.filename;
    await profileRepository.upsert(userId, { profile_photo_path: relativePath });

    return await userRepository.findByIdWithProfileAndInterests(userId);
  }

  async deletePhoto(userId) {
    const profile = await profileRepository.findByUserId(userId);
    if (profile && profile.profile_photo_path) {
      // Delete old photo
      const oldPath = path.join(__dirname, '../../public/storage', profile.profile_photo_path);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
      await profileRepository.upsert(userId, { profile_photo_path: null });
    }

    return await userRepository.findByIdWithProfileAndInterests(userId);
  }
}

module.exports = new ProfileService();
