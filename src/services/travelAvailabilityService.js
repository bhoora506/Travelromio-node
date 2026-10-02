'use strict';

/**
 * src/services/travelAvailabilityService.js
 * 
 * Handles business logic for travel availability.
 */

const travelAvailabilityRepository = require('../repositories/travelAvailabilityRepository');
class HttpError extends Error {
  constructor(statusCode, message, payload) {
    super(message);
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

class TravelAvailabilityService {
  
  async createAvailability(userId, data) {
    this._validateDates(data.start_date, data.end_date);
    return await travelAvailabilityRepository.create(userId, data);
  }

  async updateAvailability(userId, availabilityId, data) {
    // 1. Validation
    this._validateDates(data.start_date, data.end_date);

    // 2. Ownership check
    const existing = await travelAvailabilityRepository.findById(availabilityId);
    if (!existing) {
      throw new HttpError(404, 'Availability not found', { success: false, message: 'Availability not found' });
    }

    if (existing.user_id.toString() !== userId.toString()) {
      throw new HttpError(403, 'Unauthorized action.', { success: false, message: 'Unauthorized action.' });
    }

    // 3. Update
    return await travelAvailabilityRepository.update(availabilityId, data);
  }

  async deleteAvailability(userId, availabilityId) {
    // 1. Ownership check
    const existing = await travelAvailabilityRepository.findById(availabilityId);
    if (!existing) {
      throw new HttpError(404, 'Availability not found', { success: false, message: 'Availability not found' });
    }

    if (existing.user_id.toString() !== userId.toString()) {
      throw new HttpError(403, 'Unauthorized action.', { success: false, message: 'Unauthorized action.' });
    }

    // 2. Delete
    await travelAvailabilityRepository.delete(availabilityId);
  }

  _validateDates(startDate, endDate) {
    if (!startDate) {
      throw new HttpError(422, 'Validation failed', {
        success: false,
        message: 'The given data was invalid.',
        errors: { start_date: ['The start date field is required.'] }
      });
    }

    if (!endDate) {
      throw new HttpError(422, 'Validation failed', {
        success: false,
        message: 'The given data was invalid.',
        errors: { end_date: ['The end date field is required.'] }
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime())) {
      throw new HttpError(422, 'Validation failed', {
        success: false,
        message: 'The given data was invalid.',
        errors: { start_date: ['The start date is not a valid date.'] }
      });
    }

    if (isNaN(end.getTime())) {
      throw new HttpError(422, 'Validation failed', {
        success: false,
        message: 'The given data was invalid.',
        errors: { end_date: ['The end date is not a valid date.'] }
      });
    }

    if (end < start) {
      throw new HttpError(422, 'Validation failed', {
        success: false,
        message: 'The given data was invalid.',
        errors: { end_date: ['The end date must be on or after the start date.'] }
      });
    }
  }
}

module.exports = new TravelAvailabilityService();
