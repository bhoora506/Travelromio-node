'use strict';

const prisma = require('../config/database');
class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}
const joinRequestRepository = require('../repositories/joinRequestRepository');
const membershipRepository = require('../repositories/membershipRepository');

/**
 * Helper to check if a date is in the past.
 * Uses exact same logic as Laravel's isPast() (comparing dates ignoring time, or just time).
 * Laravel `end_date` is a date, so if end_date < today (at 00:00:00).
 */
function isDateInPast(dateObj) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateObj);
  target.setHours(0, 0, 0, 0);
  return target.getTime() < today.getTime();
}

/**
 * Submit a join request.
 *
 * @param {BigInt|string} authId
 * @param {object} trip
 */
async function createRequest(authId, trip) {
  // 1. Trip end_date must not be in the past
  if (isDateInPast(trip.end_date)) {
    throw new HttpError(409, 'This trip has already ended and is no longer accepting join requests.');
  }

  // 2. User must not already be an active member
  const membership = await membershipRepository.findByTripAndUser(trip.id, authId);
  if (membership && membership.status === 'active') {
    throw new HttpError(409, 'You are already a member of this trip.');
  }

  // 3. User must not already have a pending request for this trip
  const pendingRequests = await joinRequestRepository.findPendingByTripAndUser(trip.id, authId);
  if (pendingRequests.length > 0) {
    throw new HttpError(409, 'You already have a pending join request for this trip.');
  }

  // 4. Trip must have remaining capacity
  const activeCount = await membershipRepository.countActiveByTripId(trip.id);
  if (trip.max_members - activeCount <= 0) {
    throw new HttpError(409, 'This trip is full and is not accepting more members.');
  }

  // Create the request
  const joinRequest = await joinRequestRepository.create({
    trip_id: trip.id,
    user_id: BigInt(authId),
    status: 'pending'
  });

  return await joinRequestRepository.findByIdWithRequester(joinRequest.id);
}

/**
 * Approve a join request.
 * Uses Prisma transaction with raw FOR UPDATE lock to prevent concurrency bypass.
 *
 * @param {object} joinRequest
 */
async function approve(joinRequest) {
  return await prisma.$transaction(async (tx) => {
    // 1. Lock the trip row (FOR UPDATE)
    // We use queryRaw to lock the row.
    const tripRows = await tx.$queryRaw`SELECT * FROM trips WHERE id = ${joinRequest.trip_id} FOR UPDATE`;
    if (!tripRows || tripRows.length === 0) {
      throw new HttpError(404, 'Trip not found.');
    }
    const lockedTrip = tripRows[0];

    // 2. Re-validate the request is still pending
    // We fetch again to ensure it wasn't approved concurrently
    const refreshedRequest = await joinRequestRepository.findById(joinRequest.id, tx);
    if (refreshedRequest.status !== 'pending') {
      throw new HttpError(409, `Cannot approve a request that is already ${refreshedRequest.status}.`);
    }

    // 3. Trip must still be published
    if (lockedTrip.status !== 'published') {
      throw new HttpError(409, `Cannot approve a request — trip is ${lockedTrip.status}.`);
    }

    // 4. Re-check capacity
    const activeCount = await membershipRepository.countActiveByTripId(joinRequest.trip_id, tx);
    if (lockedTrip.max_members - activeCount <= 0) {
      throw new HttpError(409, 'This trip is full. No more members can be approved.');
    }

    // 5. Create confirmed membership (upsert/handle existing deleted rows properly?)
    // Wait, DB has UNIQUE(trip_id, user_id).
    // Let's check if there's an existing row (e.g. they left before and want to join again).
    const existingMembership = await membershipRepository.findByTripAndUser(joinRequest.trip_id, joinRequest.user_id, tx);
    if (existingMembership) {
      if (existingMembership.status === 'active') {
        throw new HttpError(409, 'User is already an active member of this trip.');
      }
      // If left or removed, we update status to active and reset joined_at.
      await tx.trip_members.update({
        where: { id: existingMembership.id },
        data: {
          role: 'member',
          status: 'active',
          joined_at: new Date()
        }
      });
    } else {
      await membershipRepository.create({
        trip_id: joinRequest.trip_id,
        user_id: joinRequest.user_id,
        role: 'member',
        status: 'active',
        joined_at: new Date()
      }, tx);
    }

    // 6. Mark request approved
    await joinRequestRepository.updateStatus(joinRequest.id, 'approved', tx);

    return await joinRequestRepository.findByIdWithRequester(joinRequest.id, tx);
  });
}

/**
 * Reject a join request.
 *
 * @param {object} joinRequest
 */
async function reject(joinRequest) {
  if (joinRequest.status !== 'pending') {
    throw new HttpError(409, `Cannot reject a request that is already ${joinRequest.status}.`);
  }
  
  await joinRequestRepository.updateStatus(joinRequest.id, 'rejected');
  return await joinRequestRepository.findByIdWithRequester(joinRequest.id);
}

/**
 * Cancel a join request.
 *
 * @param {object} joinRequest
 */
async function cancel(joinRequest) {
  if (joinRequest.status !== 'pending') {
    throw new HttpError(409, `Cannot cancel a request that is already ${joinRequest.status}.`);
  }

  await joinRequestRepository.updateStatus(joinRequest.id, 'cancelled');
  return await joinRequestRepository.findByIdWithRequester(joinRequest.id);
}

module.exports = {
  createRequest,
  approve,
  reject,
  cancel
};
