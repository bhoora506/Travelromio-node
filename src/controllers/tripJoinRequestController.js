'use strict';

const tripJoinRequestService = require('../services/tripJoinRequestService');
const joinRequestRepository = require('../repositories/joinRequestRepository');
const tripRepository = require('../repositories/tripRepository');
const tripJoinRequestResource = require('../resources/tripJoinRequestResource');
const { successResponse, errorResponse } = require('../utils/response');

/**
 * Ensures the join request exists and belongs to the given tripId.
 * Mirrors Laravel's ensureRequestBelongsToTrip()
 * Returns the request if valid. Throws/returns response otherwise.
 */
async function ensureRequestBelongsToTrip(res, joinRequestId, tripId) {
  const joinRequest = await joinRequestRepository.findById(joinRequestId);
  if (!joinRequest || String(joinRequest.trip_id) !== String(tripId)) {
    return errorResponse(res, 'Join request not found for this trip.', [], 404);
  }
  return joinRequest;
}

/**
 * POST /api/trips/:tripId/join-requests
 */
async function store(req, res) {
  try {
    const authId = req.user.id;
    const tripId = req.params.tripId;

    const trip = await tripRepository.findById(tripId);
    if (!trip) {
      return errorResponse(res, 'Not Found', [], 404);
    }

    // Owner cannot request to join their own trip (Policy)
    if (String(trip.user_id) === String(authId)) {
      return errorResponse(res, 'This action is unauthorized.', [], 403);
    }

    // Only published trips accept join requests (Policy)
    if (trip.status !== 'published') {
      return errorResponse(res, 'This action is unauthorized.', [], 403);
    }

    const joinRequest = await tripJoinRequestService.createRequest(authId, trip);

    return successResponse(
      res,
      { join_request: tripJoinRequestResource.toResource(joinRequest) },
      'Join request submitted successfully.',
      201
    );
  } catch (err) {
    if (err.statusCode) {
      return errorResponse(res, err.message, [], err.statusCode);
    }
    console.error(err);
    return errorResponse(res, 'Internal Server Error', [], 500);
  }
}

/**
 * GET /api/trips/:tripId/join-requests
 */
async function index(req, res) {
  try {
    const authId = req.user.id;
    const tripId = req.params.tripId;

    const trip = await tripRepository.findById(tripId);
    if (!trip) {
      return errorResponse(res, 'Not Found', [], 404);
    }

    // Only trip owner may view requests
    if (String(trip.user_id) !== String(authId)) {
      return errorResponse(res, 'This action is unauthorized.', [], 403);
    }

    const requests = await joinRequestRepository.findByTripIdWithRequester(tripId);

    return successResponse(
      res,
      { join_requests: requests.map(tripJoinRequestResource.toResource) },
      'Join requests retrieved successfully.',
      200
    );
  } catch (err) {
    if (err.statusCode) {
      return errorResponse(res, err.message, [], err.statusCode);
    }
    console.error(err);
    return errorResponse(res, 'Internal Server Error', [], 500);
  }
}

/**
 * POST /api/trips/:tripId/join-requests/:joinRequestId/approve
 */
async function approve(req, res) {
  try {
    const authId = req.user.id;
    const tripId = req.params.tripId;
    const joinRequestId = req.params.joinRequestId;

    const trip = await tripRepository.findById(tripId);
    if (!trip) {
      return errorResponse(res, 'Not Found', [], 404);
    }

    const joinRequest = await ensureRequestBelongsToTrip(res, joinRequestId, tripId);
    if (joinRequest.statusCode === 404) return joinRequest; // Early return for errorResponse

    // Only trip owner may approve
    if (String(trip.user_id) !== String(authId)) {
      return errorResponse(res, 'This action is unauthorized.', [], 403);
    }

    const updatedRequest = await tripJoinRequestService.approve(joinRequest);

    return successResponse(
      res,
      { join_request: tripJoinRequestResource.toResource(updatedRequest) },
      'Join request approved.',
      200
    );
  } catch (err) {
    if (err.statusCode) {
      return errorResponse(res, err.message, [], err.statusCode);
    }
    console.error(err);
    return errorResponse(res, 'Internal Server Error', [], 500);
  }
}

/**
 * POST /api/trips/:tripId/join-requests/:joinRequestId/reject
 */
async function reject(req, res) {
  try {
    const authId = req.user.id;
    const tripId = req.params.tripId;
    const joinRequestId = req.params.joinRequestId;

    const trip = await tripRepository.findById(tripId);
    if (!trip) {
      return errorResponse(res, 'Not Found', [], 404);
    }

    const joinRequest = await ensureRequestBelongsToTrip(res, joinRequestId, tripId);
    if (joinRequest.statusCode === 404) return joinRequest;

    // Only trip owner may reject
    if (String(trip.user_id) !== String(authId)) {
      return errorResponse(res, 'This action is unauthorized.', [], 403);
    }

    const updatedRequest = await tripJoinRequestService.reject(joinRequest);

    return successResponse(
      res,
      { join_request: tripJoinRequestResource.toResource(updatedRequest) },
      'Join request rejected.',
      200
    );
  } catch (err) {
    if (err.statusCode) {
      return errorResponse(res, err.message, [], err.statusCode);
    }
    console.error(err);
    return errorResponse(res, 'Internal Server Error', [], 500);
  }
}

/**
 * POST /api/trips/:tripId/join-requests/:joinRequestId/cancel
 */
async function cancel(req, res) {
  try {
    const authId = req.user.id;
    const tripId = req.params.tripId;
    const joinRequestId = req.params.joinRequestId;

    const trip = await tripRepository.findById(tripId);
    if (!trip) {
      return errorResponse(res, 'Not Found', [], 404);
    }

    const joinRequest = await ensureRequestBelongsToTrip(res, joinRequestId, tripId);
    if (joinRequest.statusCode === 404) return joinRequest;

    // Only requester may cancel
    if (String(joinRequest.user_id) !== String(authId)) {
      return errorResponse(res, 'This action is unauthorized.', [], 403);
    }

    const updatedRequest = await tripJoinRequestService.cancel(joinRequest);

    return successResponse(
      res,
      { join_request: tripJoinRequestResource.toResource(updatedRequest) },
      'Join request cancelled.',
      200
    );
  } catch (err) {
    if (err.statusCode) {
      return errorResponse(res, err.message, [], err.statusCode);
    }
    console.error(err);
    return errorResponse(res, 'Internal Server Error', [], 500);
  }
}

module.exports = {
  store,
  index,
  approve,
  reject,
  cancel
};
