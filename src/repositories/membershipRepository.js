'use strict';

/**
 * src/repositories/membershipRepository.js
 *
 * Data-access methods for the `trip_members` table.
 *
 * Notable schema facts (N2-A §3.14):
 *   - UNIQUE constraint on (trip_id, user_id) — DB-enforced.
 *   - trip_id FK → trips.id CASCADE DELETE.
 *   - user_id FK → users.id RESTRICT.
 *   - role: VARCHAR(20) backed by PHP MemberRole enum (owner, member).
 *   - status: VARCHAR(20) backed by PHP MemberStatus enum (active, left, removed).
 *   - joined_at is nullable (owner row created at trip creation, not join event).
 *
 * Business rules (NOT here):
 *   - max_members enforcement → TripService (future)
 *   - ONE owner per trip → TripService (future)
 *   - Leave/remove workflow → TripMemberService (future)
 *   - Authorization → middleware (future)
 *
 * Laravel equivalents:
 *   - findByTripId       → Trip::tripMembers()  (all statuses)
 *   - findActiveByTripId → Trip::activeMembers() (status='active' only)
 *   - findByUserId       → User::tripMembers()  (all trips, all statuses)
 *   - findActiveByUserId → User::tripMembers().where('status','active')
 */

const prisma = require('../config/database');
const { normaliseError } = require('../db/errors');

/**
 * findByTripAndUser(tripId, userId, client?)
 *
 * @param {BigInt|string|number} tripId
 * @param {BigInt|string|number} userId
 * @param {PrismaClient} [client]
 * @returns {Promise<object|null>}
 */
async function findByTripAndUser(tripId, userId, client) {
  const db = client || prisma;
  try {
    return await db.trip_members.findUnique({
      where: {
        trip_id_user_id: {
          trip_id: BigInt(tripId),
          user_id: BigInt(userId),
        },
      },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * findByTripId(tripId, client?)
 *
 * Returns ALL membership rows for a trip (all statuses: active, left, removed).
 * Maps to Laravel's Trip::tripMembers() relationship.
 *
 * @param {BigInt|string|number} tripId
 * @param {PrismaClient} [client]
 * @returns {Promise<object[]>}
 */
async function findByTripId(tripId, client) {
  const db = client || prisma;
  try {
    return await db.trip_members.findMany({
      where: { trip_id: BigInt(tripId) },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * findActiveByTripId(tripId, client?)
 *
 * Returns only ACTIVE membership rows for a trip.
 * Maps to Laravel's Trip::activeMembers() relationship.
 * Used by future TripService for capacity checks (remainingSlots):
 *   remainingSlots = max_members - activeMembers.count
 *
 * @param {BigInt|string|number} tripId
 * @param {PrismaClient} [client]
 * @returns {Promise<object[]>}
 */
async function findActiveByTripId(tripId, client) {
  const db = client || prisma;
  try {
    return await db.trip_members.findMany({
      where: { trip_id: BigInt(tripId), status: 'active' },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * countActiveByTripId(tripId, client?)
 *
 * Returns the count of active members for a trip.
 * Efficient alternative to findActiveByTripId() when only the count is needed
 * for capacity checks. Maps to Trip::activeMembers()->count() in Laravel.
 *
 * @param {BigInt|string|number} tripId
 * @param {PrismaClient} [client]
 * @returns {Promise<number>}
 */
async function countActiveByTripId(tripId, client) {
  const db = client || prisma;
  try {
    return await db.trip_members.count({
      where: { trip_id: BigInt(tripId), status: 'active' },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * findByUserId(userId, client?)
 *
 * Returns all membership rows for a user (across trips).
 *
 * @param {BigInt|string|number} userId
 * @param {PrismaClient} [client]
 * @returns {Promise<object[]>}
 */
async function findByUserId(userId, client) {
  const db = client || prisma;
  try {
    return await db.trip_members.findMany({
      where: { user_id: BigInt(userId) },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * create(data, client?)
 *
 * Creates a membership row. DB UNIQUE(trip_id, user_id) prevents duplicates.
 *
 * @param {object} data
 * @param {PrismaClient} [client]
 * @returns {Promise<object>}
 */
async function create(data, client) {
  const db = client || prisma;
  try {
    return await db.trip_members.create({ data });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * updateStatus(tripId, userId, status, client?)
 *
 * Updates the status of a membership row (active → left / removed).
 * Status transition rules are NOT enforced here.
 *
 * @param {BigInt|string|number} tripId
 * @param {BigInt|string|number} userId
 * @param {string} status
 * @param {PrismaClient} [client]
 * @returns {Promise<object>}
 */
async function updateStatus(tripId, userId, status, client) {
  const db = client || prisma;
  try {
    return await db.trip_members.update({
      where: {
        trip_id_user_id: {
          trip_id: BigInt(tripId),
          user_id: BigInt(userId),
        },
      },
      data: { status },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * findActiveByTripIdWithUser(tripId, client?)
 *
 * @param {BigInt|string|number} tripId
 * @param {PrismaClient} [client]
 * @returns {Promise<object[]>}
 */
async function findActiveByTripIdWithUser(tripId, client) {
  const db = client || prisma;
  try {
    return await db.trip_members.findMany({
      where: {
        trip_id: BigInt(tripId),
        status: 'active',
      },
      include: {
        users: true,
      },
      orderBy: { joined_at: 'asc' },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

module.exports = {
  findByTripAndUser,
  findByTripId,
  findActiveByTripId,
  countActiveByTripId,
  findByUserId,
  create,
  updateStatus,
  findActiveByTripIdWithUser,
};
