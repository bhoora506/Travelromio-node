'use strict';

/**
 * src/repositories/destinationRepository.js
 *
 * Data-access methods for the `preferred_destinations` table.
 *
 * Notable schema facts (N2-A §3.17):
 *   - user_id FK → users.id CASCADE DELETE.
 *   - latitude, longitude: Decimal(10,7) — do NOT convert to float.
 *   - Indexes on user_id and place_id.
 */

const prisma = require('../config/database');
const { normaliseError } = require('../db/errors');

/**
 * findByUserId(userId, client?)
 *
 * @param {BigInt|string|number} userId
 * @param {PrismaClient} [client]
 * @returns {Promise<object[]>}
 */
async function findByUserId(userId, client) {
  const db = client || prisma;
  try {
    return await db.preferred_destinations.findMany({
      where: { user_id: BigInt(userId) },
      orderBy: { created_at: 'desc' },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * create(data, client?)
 *
 * @param {object} data  { user_id, destination, place_id?, latitude?, longitude? }
 * @param {PrismaClient} [client]
 * @returns {Promise<object>}
 */
async function create(data, client) {
  const db = client || prisma;
  try {
    return await db.preferred_destinations.create({ data });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * update(id, data, client?)
 *
 * @param {BigInt|string|number} id
 * @param {object} data  Partial preferred_destinations fields.
 * @param {PrismaClient} [client]
 * @returns {Promise<object>}
 */
async function update(id, data, client) {
  const db = client || prisma;
  try {
    return await db.preferred_destinations.update({
      where: { id: BigInt(id) },
      data,
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * remove(id, client?)
 *
 * @param {BigInt|string|number} id
 * @param {PrismaClient} [client]
 * @returns {Promise<object>}
 */
async function remove(id, client) {
  const db = client || prisma;
  try {
    return await db.preferred_destinations.delete({
      where: { id: BigInt(id) },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

module.exports = { findByUserId, create, update, remove };
