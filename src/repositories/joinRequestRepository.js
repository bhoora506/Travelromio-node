'use strict';

/**
 * src/repositories/joinRequestRepository.js
 *
 * Data-access methods for the `trip_join_requests` table.
 *
 * Notable schema facts (N2-A §3.18, §9.2):
 *   - NO unique(trip_id, user_id) at DB level.
 *   - "Only one PENDING per (trip_id, user_id)" is APPLICATION logic only.
 *   - Composite index on (trip_id, status) for owner inbox queries.
 *   - trip_id FK → trips.id CASCADE DELETE.
 *   - user_id FK → users.id RESTRICT.
 *   - status: VARCHAR(20) backed by PHP JoinRequestStatus enum
 *     (pending, approved, rejected, cancelled).
 *
 * IMPORTANT:
 *   This repository does NOT enforce "only one pending per user+trip".
 *   That invariant is a service-layer responsibility (future N3+).
 *   findPendingByTripAndUser() is provided to SUPPORT that check.
 */

const prisma = require('../config/database');
const { normaliseError } = require('../db/errors');

/**
 * findById(id, client?)
 *
 * @param {BigInt|string|number} id
 * @param {PrismaClient} [client]
 * @returns {Promise<object|null>}
 */
async function findById(id, client) {
  const db = client || prisma;
  try {
    return await db.trip_join_requests.findUnique({
      where: { id: BigInt(id) },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * findByTripId(tripId, client?)
 *
 * Returns all join requests for a trip.
 *
 * @param {BigInt|string|number} tripId
 * @param {PrismaClient} [client]
 * @returns {Promise<object[]>}
 */
async function findByTripId(tripId, client) {
  const db = client || prisma;
  try {
    return await db.trip_join_requests.findMany({
      where: { trip_id: BigInt(tripId) },
      orderBy: { created_at: 'desc' },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * findByUserId(userId, client?)
 *
 * Returns all join requests made by a user.
 *
 * @param {BigInt|string|number} userId
 * @param {PrismaClient} [client]
 * @returns {Promise<object[]>}
 */
async function findByUserId(userId, client) {
  const db = client || prisma;
  try {
    return await db.trip_join_requests.findMany({
      where: { user_id: BigInt(userId) },
      orderBy: { created_at: 'desc' },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * findPendingByTripAndUser(tripId, userId, client?)
 *
 * Returns all pending requests for a given (trip, user) pair.
 * Service layer uses this to enforce the "only one pending" invariant.
 *
 * @param {BigInt|string|number} tripId
 * @param {BigInt|string|number} userId
 * @param {PrismaClient} [client]
 * @returns {Promise<object[]>}
 */
async function findPendingByTripAndUser(tripId, userId, client) {
  const db = client || prisma;
  try {
    return await db.trip_join_requests.findMany({
      where: {
        trip_id: BigInt(tripId),
        user_id: BigInt(userId),
        status: 'pending',
      },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * create(data, client?)
 *
 * @param {object} data
 * @param {PrismaClient} [client]
 * @returns {Promise<object>}
 */
async function create(data, client) {
  const db = client || prisma;
  try {
    return await db.trip_join_requests.create({ data });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * updateStatus(id, status, client?)
 *
 * @param {BigInt|string|number} id
 * @param {string} status  JoinRequestStatus enum value.
 * @param {PrismaClient} [client]
 * @returns {Promise<object>}
 */
async function updateStatus(id, status, client) {
  const db = client || prisma;
  try {
    return await db.trip_join_requests.update({
      where: { id: BigInt(id) },
      data: { status },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

module.exports = {
  findById,
  findByTripId,
  findByUserId,
  findPendingByTripAndUser,
  create,
  updateStatus,
};
