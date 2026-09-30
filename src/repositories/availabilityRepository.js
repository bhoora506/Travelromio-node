'use strict';

/**
 * src/repositories/availabilityRepository.js
 *
 * Data-access methods for the `travel_availabilities` table.
 *
 * Notable schema facts (N2-A §3.16):
 *   - user_id FK → users.id CASCADE DELETE.
 *   - start_date, end_date: DB Date columns (no time component).
 *   - Indexes on user_id, start_date, end_date individually.
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
    return await db.travel_availabilities.findMany({
      where: { user_id: BigInt(userId) },
      orderBy: { start_date: 'asc' },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * create(data, client?)
 *
 * @param {object} data  { user_id, start_date, end_date }
 * @param {PrismaClient} [client]
 * @returns {Promise<object>}
 */
async function create(data, client) {
  const db = client || prisma;
  try {
    return await db.travel_availabilities.create({ data });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * update(id, data, client?)
 *
 * @param {BigInt|string|number} id
 * @param {object} data  Partial travel_availabilities fields.
 * @param {PrismaClient} [client]
 * @returns {Promise<object>}
 */
async function update(id, data, client) {
  const db = client || prisma;
  try {
    return await db.travel_availabilities.update({
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
 * Deletes an availability record by ID.
 * Named `remove` to avoid shadowing the JS reserved word `delete`.
 *
 * @param {BigInt|string|number} id
 * @param {PrismaClient} [client]
 * @returns {Promise<object>}
 */
async function remove(id, client) {
  const db = client || prisma;
  try {
    return await db.travel_availabilities.delete({
      where: { id: BigInt(id) },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

module.exports = { findByUserId, create, update, remove };
