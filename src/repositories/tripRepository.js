'use strict';

/**
 * src/repositories/tripRepository.js
 *
 * Data-access methods for the `trips` table.
 *
 * Notable schema facts (N2-A §3.13):
 *   - user_id FK → users.id RESTRICT (user cannot be deleted while owning trips).
 *   - latitude, longitude: Decimal(10,7) — must NOT be converted to JS float.
 *   - budget_min, budget_max: Decimal(12,2) — same.
 *   - status: VARCHAR(20) backed by PHP TripStatus enum
 *     (draft, published, ongoing, completed, cancelled).
 *   - trip_type: VARCHAR(50) backed by PHP TripType enum:
 *     (weekend, adventure, backpacking, road_trip, nature, photography, cultural, beach, mountains, other)
 *   - Composite index on (status, start_date, end_date) for discovery queries.
 *   - image_path added by a later migration — may be NULL.
 *   - max_members INCLUDES the owner (e.g. max_members=4 means owner + 3 members).
 *
 * Laravel equivalents:
 *   - findById          → Trip::findOrFail()
 *   - findByOwnerId     → User::trips() scope
 *   - findPublished     → Trip::where('status','published')
 *   - findPublishedUpcoming → TripDiscoveryService base query:
 *                         published + end_date >= today
 *   - findByStatus      → Trip::where('status', $status)
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
    return await db.trips.findUnique({
      where: { id: BigInt(id) },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * findByOwnerId(userId, client?)
 *
 * Returns all trips owned by the given user ordered by created_at desc.
 *
 * @param {BigInt|string|number} userId
 * @param {PrismaClient} [client]
 * @returns {Promise<object[]>}
 */
async function findByOwnerId(userId, client) {
  const db = client || prisma;
  try {
    return await db.trips.findMany({
      where: { user_id: BigInt(userId) },
      orderBy: { created_at: 'desc' },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * findPublished(client?)
 *
 * Returns all trips with status='published' ordered by start_date asc.
 * Leverages the composite (status, start_date, end_date) index.
 *
 * NOTE: This returns all published trips, including those with past end_dates.
 * For the discovery feed (excluding past trips) use findPublishedUpcoming().
 *
 * @param {PrismaClient} [client]
 * @returns {Promise<object[]>}
 */
async function findPublished(client) {
  const db = client || prisma;
  try {
    return await db.trips.findMany({
      where: { status: 'published' },
      orderBy: { start_date: 'asc' },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * findPublishedUpcoming(client?)
 *
 * Returns published trips whose end_date >= today (upcoming/current trips only).
 * Maps to Laravel's TripDiscoveryService base query:
 *   Trip::where('status', 'published')->where('end_date', '>=', today())
 *
 * This is the correct base query for the discovery feed.
 * It excludes published trips that have already ended.
 *
 * Secondary sort by id ASC as stable tie-breaker (matches Laravel pagination behaviour).
 *
 * @param {PrismaClient} [client]
 * @returns {Promise<object[]>}
 */
async function findPublishedUpcoming(client) {
  const db = client || prisma;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  try {
    return await db.trips.findMany({
      where: {
        status: 'published',
        end_date: { gte: today },
      },
      orderBy: [{ start_date: 'asc' }, { id: 'asc' }],
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * findByStatus(status, client?)
 *
 * Returns all trips matching the given status string.
 * The caller is responsible for passing a valid TripStatus value.
 *
 * @param {string} status  One of: draft, published, ongoing, completed, cancelled
 * @param {PrismaClient} [client]
 * @returns {Promise<object[]>}
 */
async function findByStatus(status, client) {
  const db = client || prisma;
  try {
    return await db.trips.findMany({
      where: { status },
      orderBy: { created_at: 'desc' },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * create(data, client?)
 *
 * Creates a trip record.
 * Business rules (max_members, status transitions) are NOT enforced here.
 *
 * @param {object} data
 * @param {PrismaClient} [client]
 * @returns {Promise<object>}
 */
async function create(data, client) {
  const db = client || prisma;
  try {
    return await db.trips.create({ data });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * update(id, data, client?)
 *
 * Partial update of a trip record.
 * Status transition validation is NOT performed here.
 *
 * @param {BigInt|string|number} id
 * @param {object} data  Partial trips fields.
 * @param {PrismaClient} [client]
 * @returns {Promise<object>}
 */
async function update(id, data, client) {
  const db = client || prisma;
  try {
    return await db.trips.update({
      where: { id: BigInt(id) },
      data,
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

module.exports = { findById, findByOwnerId, findPublished, findPublishedUpcoming, findByStatus, create, update };
