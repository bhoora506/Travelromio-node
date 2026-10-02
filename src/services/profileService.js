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

    if (updateData.languages) {
      if (!Array.isArray(updateData.languages)) {
        throw new HttpError(422, 'Validation failed', {
          success: false,
          message: 'The given data was invalid.',
          errors: { languages: ['The languages must be an array.'] }
        });
      }
      if (updateData.languages.length > 10) {
        throw new HttpError(422, 'Validation failed', {
          success: false,
          message: 'The given data was invalid.',
          errors: { languages: ['The languages may not have more than 10 items.'] }
        });
      }
    }

    if (updateData.travel_style !== undefined && updateData.travel_style !== null) {
      const allowedStyles = [
        'luxury', 'budget', 'adventure', 'relaxing', 'cultural',
        'nature', 'foodie', 'party', 'family', 'solo'
      ];
      if (!allowedStyles.includes(updateData.travel_style)) {
        throw new HttpError(422, 'Validation failed', {
          success: false,
          message: 'The given data was invalid.',
          errors: { travel_style: ['The selected travel style is invalid.'] }
        });
      }
    }

    if (updateData.preferred_budget_max !== undefined && updateData.preferred_budget_max !== null) {
      if (updateData.preferred_budget_min !== undefined && updateData.preferred_budget_min !== null) {
        if (parseFloat(updateData.preferred_budget_max) < parseFloat(updateData.preferred_budget_min)) {
          throw new HttpError(422, 'Validation failed', {
            success: false,
            message: 'The given data was invalid.',
            errors: { preferred_budget_max: ['The preferred budget max must be greater than or equal to preferred budget min.'] }
          });
        }
      }
    }

    await profileRepository.upsert(userId, updateData);
    
    // Laravel reloads the user with profile and interests
    return await userRepository.findByIdWithProfileAndInterests(userId);
  }

  async updateInterests(userId, interestIds) {
    if (!Array.isArray(interestIds)) {
      throw new HttpError(422, 'Validation failed', {
        success: false,
        message: 'The given data was invalid.',
        errors: { interest_ids: ['The interest ids must be an array.'] }
      });
    }

    if (interestIds.length > 20) {
      throw new HttpError(422, 'Validation failed', {
        success: false,
        message: 'The given data was invalid.',
        errors: { interest_ids: ['The interest ids may not have more than 20 items.'] }
      });
    }

    // Verify all IDs exist
    for (const id of interestIds) {
      const interest = await interestRepository.findById(id);
      if (!interest) {
        throw new HttpError(422, 'Validation failed', {
          success: false,
          message: 'The given data was invalid.',
          errors: { interest_ids: ['The selected interest ids is invalid.'] }
        });
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
