'use strict';

/**
 * src/controllers/tripMemberController.js
 */

const { successResponse, errorResponse } = require('../utils/response');
const tripRepository = require('../repositories/tripRepository');
const membershipRepository = require('../repositories/membershipRepository');
const tripMemberResource = require('../resources/tripMemberResource');

/**
 * GET /api/trips/:tripId/members
 * List active members of a trip.
 */
async function index(req, res) {
  try {
    const tripId = req.params.tripId;
    const authId = req.user.id;

    // We must check if the trip exists and if the user is authorized to view it.
    // TripPolicy::view requires owner OR active member OR published.
    const trip = await tripRepository.findByIdWithRelations(tripId, authId);

    if (!trip) {
      return errorResponse(res, 'Trip not found.', [], 404);
    }

    const isOwner = trip.user_id === BigInt(authId);
    const isMember = trip.trip_members && trip.trip_members.length > 0 && trip.trip_members[0].status === 'active';
    const isPublished = trip.status === 'published';

    if (!isOwner && !isMember && !isPublished) {
      return res.status(403).json({ success: false, message: 'This action is unauthorized.' });
    }

    // Now fetch active members
    // Laravel: $members = $trip->activeMembers()->with('user')->get();
    const members = await membershipRepository.findActiveByTripIdWithUser(tripId);

    return successResponse(
      res,
      { members: tripMemberResource.toCollection(members) },
      'Trip members retrieved successfully.'
    );

  } catch (err) {
    console.error('[TripMemberController.index] Error:', err);
    return errorResponse(res, 'An error occurred while retrieving trip members', [], 500);
  }
}

module.exports = { index };
