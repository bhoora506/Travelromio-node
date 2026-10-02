'use strict';

/**
 * src/controllers/preferredDestinationController.js
 * 
 * Implements N3-F Preferred Destination GET endpoint
 * and N3-G POST/PUT/DELETE endpoints.
 */

const { normaliseError, ValidationError } = require('../db/errors');
const { successResponse } = require('../utils/response');
const preferredDestinationResource = require('../resources/preferredDestinationResource');
const preferredDestinationRepository = require('../repositories/preferredDestinationRepository');
const preferredDestinationService = require('../services/preferredDestinationService');

function validateStoreUpdate(body) {
  if (!body.destination || typeof body.destination !== 'string' || body.destination.trim() === '') {
    throw {
      statusCode: 422,
      payload: {
        success: false,
        message: 'The given data was invalid.',
        errors: { destination: ['The destination field is required.'] }
      }
    };
  }

  if (body.destination.length > 200) {
    throw {
      statusCode: 422,
      payload: {
        success: false,
        message: 'The given data was invalid.',
        errors: { destination: ['The destination may not be greater than 200 characters.'] }
      }
    };
  }

  let place_id = null;
  if (body.place_id !== undefined && body.place_id !== null) {
    if (typeof body.place_id !== 'string' || body.place_id.length > 100) {
      throw {
        statusCode: 422,
        payload: {
          success: false,
          message: 'The given data was invalid.',
          errors: { place_id: ['The place_id may not be greater than 100 characters.'] }
        }
      };
    }
    place_id = body.place_id;
  }

  let latitude = null;
  if (body.latitude !== undefined && body.latitude !== null) {
    const lat = parseFloat(body.latitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      throw {
        statusCode: 422,
        payload: {
          success: false,
          message: 'The given data was invalid.',
          errors: { latitude: ['The latitude must be between -90 and 90.'] }
        }
      };
    }
    latitude = lat;
  }

  let longitude = null;
  if (body.longitude !== undefined && body.longitude !== null) {
    const lon = parseFloat(body.longitude);
    if (isNaN(lon) || lon < -180 || lon > 180) {
      throw {
        statusCode: 422,
        payload: {
          success: false,
          message: 'The given data was invalid.',
          errors: { longitude: ['The longitude must be between -180 and 180.'] }
        }
      };
    }
    longitude = lon;
  }

  return {
    destination: body.destination,
    place_id,
    latitude,
    longitude
  };
}

class PreferredDestinationController {
  
  /**
   * GET /api/profile/destinations
   * Retrieves preferred destinations for the authenticated user.
   */
  async index(req, res, next) {
    try {
      const userId = req.user.id;
      const destinations = await preferredDestinationRepository.getByUserId(userId);

      return successResponse(
        res,
        { destinations: preferredDestinationResource.collection(destinations) },
        'Preferred destinations retrieved successfully'
      );
      
    } catch (error) {
      next(normaliseError(error));
    }
  }

  /**
   * POST /api/profile/destinations
   */
  async store(req, res, next) {
    try {
      const userId = req.user.id;
      const data = validateStoreUpdate(req.body);

      const destination = await preferredDestinationService.createDestination(userId, data);

      return successResponse(
        res,
        { destination: preferredDestinationResource.preferredDestinationResource(destination) },
        'Preferred destination added successfully',
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
   * PUT /api/profile/destinations/:id
   */
  async update(req, res, next) {
    try {
      const userId = req.user.id;
      const destinationId = req.params.id;
      const data = validateStoreUpdate(req.body);

      const destination = await preferredDestinationService.updateDestination(userId, destinationId, data);

      return successResponse(
        res,
        { destination: preferredDestinationResource.preferredDestinationResource(destination) },
        'Preferred destination updated successfully'
      );
    } catch (error) {
      if (error.statusCode) {
        return res.status(error.statusCode).json(error.payload);
      }
      next(normaliseError(error));
    }
  }

  /**
   * DELETE /api/profile/destinations/:id
   */
  async destroy(req, res, next) {
    try {
      const userId = req.user.id;
      const destinationId = req.params.id;

      await preferredDestinationService.deleteDestination(userId, destinationId);

      return successResponse(
        res,
        null,
        'Preferred destination deleted successfully'
      );
    } catch (error) {
      if (error.statusCode) {
        return res.status(error.statusCode).json(error.payload);
      }
      next(normaliseError(error));
    }
  }

}

module.exports = new PreferredDestinationController();
