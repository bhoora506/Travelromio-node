'use strict';

/**
 * src/controllers/tripController.js
 *
 * Implements N3-C Trip reading/discovery endpoints.
 */

const { successResponse, errorResponse } = require('../utils/response');
const tripRepository = require('../repositories/tripRepository');
const tripDiscoveryService = require('../services/tripDiscoveryService');
const tripResource = require('../resources/tripResource');
const { normaliseError, NotFoundError } = require('../db/errors');

/**
 * GET /api/trips
 * Trip discovery - paginated feed of published trips, excluding user's own trips.
 */
async function index(req, res) {
  try {
    // In Laravel, validation is handled by TripDiscoveryRequest.
    // Our discoveryService parses and protects against bad numbers (parseInt, Math.max, etc.)
    const filters = req.query;
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

module.exports = { index, show, myTrips, joinedTrips };
