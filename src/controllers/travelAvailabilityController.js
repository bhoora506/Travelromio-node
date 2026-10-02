'use strict';

/**
 * src/controllers/travelAvailabilityController.js
 * 
 * Implements N3-F Travel Availability GET endpoint.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { normaliseError } = require('../db/errors');
const { successResponse } = require('../utils/response');
const travelAvailabilityResource = require('../resources/travelAvailabilityResource');

class TravelAvailabilityController {
  
  /**
   * GET /api/profile/availability
   * Retrieves travel availability for the authenticated user.
   */
  async index(req, res, next) {
    try {
      const userId = BigInt(req.user.id);

      // Fetch from database ordering by start_date asc
      const availabilities = await prisma.travel_availabilities.findMany({
        where: { user_id: userId },
        orderBy: { start_date: 'asc' }
      });

      res.status(200).json(successResponse(
        { availabilities: travelAvailabilityResource.collection(availabilities) },
        'Availability retrieved successfully.'
      ));
      
    } catch (error) {
      next(normaliseError(error));
    }
  }
}

module.exports = new TravelAvailabilityController();
