'use strict';

/**
 * src/controllers/preferredDestinationController.js
 * 
 * Implements N3-F Preferred Destination GET endpoint.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { normaliseError } = require('../db/errors');
const { successResponse } = require('../utils/response');
const preferredDestinationResource = require('../resources/preferredDestinationResource');

class PreferredDestinationController {
  
  /**
   * GET /api/profile/destinations
   * Retrieves preferred destinations for the authenticated user.
   */
  async index(req, res, next) {
    try {
      const userId = BigInt(req.user.id);

      // Fetch from database ordering by latest() -> created_at desc
      const destinations = await prisma.preferred_destinations.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' }
      });

      res.status(200).json(successResponse(
        { destinations: preferredDestinationResource.collection(destinations) },
        'Preferred destinations retrieved successfully'
      ));
      
    } catch (error) {
      next(normaliseError(error));
    }
  }
}

module.exports = new PreferredDestinationController();
