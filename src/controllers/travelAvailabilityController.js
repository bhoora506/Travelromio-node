'use strict';

/**
 * src/controllers/travelAvailabilityController.js
 * 
 * Implements N3-F Travel Availability GET endpoint
 * and N3-G POST/PUT/DELETE endpoints.
 */

const { normaliseError } = require('../db/errors');
const { successResponse } = require('../utils/response');
const travelAvailabilityResource = require('../resources/travelAvailabilityResource');
const travelAvailabilityRepository = require('../repositories/travelAvailabilityRepository');
const travelAvailabilityService = require('../services/travelAvailabilityService');

class TravelAvailabilityController {
  
  /**
   * GET /api/profile/availability
   * Retrieves travel availability for the authenticated user.
   */
  async index(req, res, next) {
    try {
      const userId = req.user.id;
      const availabilities = await travelAvailabilityRepository.getByUserId(userId);

      return successResponse(
        res,
        { availabilities: travelAvailabilityResource.collection(availabilities) },
        'Availability retrieved successfully.'
      );
      
    } catch (error) {
      next(normaliseError(error));
    }
  }

  /**
   * POST /api/profile/availability
   */
  async store(req, res, next) {
    try {
      const userId = req.user.id;
      const data = {
        start_date: req.body.start_date,
        end_date: req.body.end_date
      };

      const availability = await travelAvailabilityService.createAvailability(userId, data);

      return successResponse(
        res,
        { availability: travelAvailabilityResource.travelAvailabilityResource(availability) },
        'Availability created successfully.',
        201
      );
    } catch (error) {
      if (error.statusCode) {
        return res.status(error.statusCode).json(error.payload);
      }
      next(normaliseError(error));
    }
  }

  /**
   * PUT /api/profile/availability/:id
   */
  async update(req, res, next) {
    try {
      const userId = req.user.id;
      const availabilityId = req.params.id;
      const data = {
        start_date: req.body.start_date,
        end_date: req.body.end_date
      };

      const availability = await travelAvailabilityService.updateAvailability(userId, availabilityId, data);

      return successResponse(
        res,
        { availability: travelAvailabilityResource.travelAvailabilityResource(availability) },
        'Availability updated successfully.'
      );
    } catch (error) {
      if (error.statusCode) {
        return res.status(error.statusCode).json(error.payload);
      }
      next(normaliseError(error));
    }
  }

  /**
   * DELETE /api/profile/availability/:id
   */
  async destroy(req, res, next) {
    try {
      const userId = req.user.id;
      const availabilityId = req.params.id;

      await travelAvailabilityService.deleteAvailability(userId, availabilityId);

      return successResponse(
        res,
        null, // matches empty array/object usually used by Laravel for empty response data []
        'Availability deleted successfully.'
      );
    } catch (error) {
      if (error.statusCode) {
        return res.status(error.statusCode).json(error.payload);
      }
      next(normaliseError(error));
    }
  }
}

module.exports = new TravelAvailabilityController();
