'use strict';

/**
 * src/repositories/profileRepository.js
 *
 * Data-access methods for the `user_profiles` table.
 *
 * Notable schema facts (N2-A):
 *   - user_id has a UNIQUE constraint — one profile per user.
 *   - languages is a JSON column → Prisma maps it as Json type.
 *   - is_discoverable is tinyint(1) → Prisma maps it as Boolean.
 *   - preferred_budget_min/max are Decimal(12,2) → Prisma Decimal.
 *   - travel_style is VARCHAR(50) backed by PHP TravelStyle enum.
 *
 * FK behaviour:
 *   - user_id FK → users.id CASCADE DELETE (profile deleted with user).
 */

const prisma = require('../config/database');
const { normaliseError } = require('../db/errors');

/**
 * findByUserId(userId, client?)
 *
 * Returns the profile for a given user, or null.
 *
 * @param {BigInt|string|number} userId
 * @param {PrismaClient} [client]
 * @returns {Promise<object|null>}
 */
async function findByUserId(userId, client) {
  const db = client || prisma;
  try {
    return await db.user_profiles.findUnique({
      where: { user_id: BigInt(userId) },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * findWithUser(userId, client?)
 *
 * Returns the profile with the associated user record included.
 *
 * @param {BigInt|string|number} userId
 * @param {PrismaClient} [client]
 * @returns {Promise<object|null>}
 */
async function findWithUser(userId, client) {
  const db = client || prisma;
  try {
    return await db.user_profiles.findUnique({
      where: { user_id: BigInt(userId) },
      include: { users: true },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * update(userId, data, client?)
 *
 * Updates a profile for the given user.
 * Only provided fields are updated (partial update semantics).
 *
 * @param {BigInt|string|number} userId
 * @param {object} data  Partial user_profiles fields.
 * @param {PrismaClient} [client]
 * @returns {Promise<object>}
 */
async function update(userId, data, client) {
  const db = client || prisma;
  try {
    return await db.user_profiles.update({
      where: { user_id: BigInt(userId) },
      data,
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

module.exports = { findByUserId, findWithUser, update };
