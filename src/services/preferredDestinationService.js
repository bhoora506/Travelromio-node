'use strict';

/**
 * src/services/preferredDestinationService.js
 * 
 * Handles business logic for preferred destinations.
 */

const preferredDestinationRepository = require('../repositories/preferredDestinationRepository');
class HttpError extends Error {
  constructor(statusCode, message, payload) {
    super(message);
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

class PreferredDestinationService {
  
  async createDestination(userId, data) {
    // 1. Validation limits (Max 50)
    const count = await preferredDestinationRepository.countByUserId(userId);
    if (count >= 50) {
      throw new HttpError(422, 'Validation failed', {
        success: false,
        message: 'The given data was invalid.',
        errors: {
          destination: ['You have reached the maximum limit of 50 preferred destinations.']
        }
      });
    }

    // 2. Duplicate checking
    await this._checkDuplicates(userId, data);

    // 3. Create
    return await preferredDestinationRepository.create(userId, data);
  }

  async updateDestination(userId, destinationId, data) {
    // 1. Ownership check
    const existing = await preferredDestinationRepository.findById(destinationId);
    if (!existing) {
      throw new HttpError(404, 'Destination not found', { success: false, message: 'Destination not found' });
    }
    
    if (existing.user_id.toString() !== userId.toString()) {
      throw new HttpError(403, 'Unauthorized action.', { success: false, message: 'Unauthorized action.' });
    }

    // 2. Duplicate checking (excluding self)
    await this._checkDuplicates(userId, data, destinationId);

    // 3. Update
    return await preferredDestinationRepository.update(destinationId, data);
  }

  async deleteDestination(userId, destinationId) {
    // 1. Ownership check
    const existing = await preferredDestinationRepository.findById(destinationId);
    if (!existing) {
      throw new HttpError(404, 'Destination not found', { success: false, message: 'Destination not found' });
    }

    if (existing.user_id.toString() !== userId.toString()) {
      throw new HttpError(403, 'Unauthorized action.', { success: false, message: 'Unauthorized action.' });
    }

    // 2. Delete
    await preferredDestinationRepository.delete(destinationId);
  }

  async _checkDuplicates(userId, data, excludeId = null) {
    const existing = await preferredDestinationRepository.getByUserId(userId);
    
    const newPlaceId = data.place_id || null;
    const newNormalizedDest = (data.destination || '').trim().toLowerCase();

    for (const dest of existing) {
      if (excludeId && dest.id.toString() === excludeId.toString()) {
        continue;
      }

      // Case A: Both have place_id
      if (newPlaceId && dest.place_id && newPlaceId === dest.place_id) {
        throw new HttpError(422, 'Validation failed', {
          success: false,
          message: 'The given data was invalid.',
          errors: {
            destination: ['You have already added this destination.']
          }
        });
      }

      // Case B & C: Fallback to string match
      const destNormalized = (dest.destination || '').trim().toLowerCase();
      if (destNormalized === newNormalizedDest) {
        throw new HttpError(422, 'Validation failed', {
          success: false,
          message: 'The given data was invalid.',
          errors: {
            destination: ['You have already added this destination.']
          }
        });
      }
    }
  }
}

module.exports = new PreferredDestinationService();
