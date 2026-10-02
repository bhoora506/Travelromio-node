'use strict';

/**
 * src/controllers/profileStatsController.js
 * 
 * Implements N3-F Profile Stats GET endpoint.
 */

const prisma = require('../config/database');
const { normaliseError } = require('../db/errors');
const { successResponse } = require('../utils/response');

class ProfileStatsController {
  
  /**
   * GET /api/profile/stats
   * Get aggregated statistics for the authenticated user.
   */
  async show(req, res, next) {
    try {
      const userId = BigInt(req.user.id);

      // 1. Count unique active trips (owner or joined)
      // Laravel MemberStatus::Active->value is 'active'.
      const tripsCount = await prisma.trip_members.count({
        where: {
          user_id: userId,
          status: 'active'
        }
      });

      // 2. Count unique accepted connections
      // Laravel ConnectionStatus::Accepted->value is 'accepted'.
      const connectionsCount = await prisma.connection_requests.count({
        where: {
          status: 'accepted',
          OR: [
            { requester_id: userId },
            { recipient_id: userId }
          ]
        }
      });

      return successResponse(
        res,
        {
          trips_count: tripsCount,
          connections_count: connectionsCount
        },
        'Stats retrieved successfully'
      );
      
    } catch (error) {
      next(normaliseError(error));
    }
  }
}

module.exports = new ProfileStatsController();
