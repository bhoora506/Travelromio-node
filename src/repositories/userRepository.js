'use strict';

/**
 * src/repositories/userRepository.js
 *
 * Data-access methods for the `users` table.
 *
 * Rules:
 *   - Uses the shared Prisma client (or a tx client for transactions).
 *   - No HTTP, no auth, no business logic.
 *   - No password hashing (authentication belongs to a later phase).
 *   - BigInt IDs are returned as-is from Prisma; callers serialise for output.
 */

const prisma = require('../config/database');
const { normaliseError } = require('../db/errors');

/**
 * findById(id, client?)
 *
 * Finds a user by primary key (BigInt / numeric id).
 * Returns null if not found.
 *
 * @param {BigInt|string|number} id
 * @param {PrismaClient} [client]  Prisma or transaction client.
 * @returns {Promise<object|null>}
 */
async function findById(id, client) {
  const db = client || prisma;
  try {
    return await db.users.findUnique({
      where: { id: BigInt(id) },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * findByIdWithProfileAndInterests(id, client?)
 *
 * Finds a user by ID and includes their user_profiles and user_interests (with actual interests).
 *
 * @param {BigInt|string|number} id
 * @param {PrismaClient} [client]
 * @returns {Promise<object|null>}
 */
async function findByIdWithProfileAndInterests(id, client) {
  const db = client || prisma;
  try {
    return await db.users.findUnique({
      where: { id: BigInt(id) },
      include: {
        user_profiles: true,
        user_interests: {
          include: {
            interests: true
          }
        }
      }
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * findByIdWithInterestsCount(id, client?)
 *
 * Finds a user by ID and includes the count of their user_interests for profile completion calculation.
 *
 * @param {BigInt|string|number} id
 * @param {PrismaClient} [client]
 * @returns {Promise<object|null>}
 */
async function findByIdWithInterestsCount(id, client) {
  const db = client || prisma;
  try {
    return await db.users.findUnique({
      where: { id: BigInt(id) },
      include: {
        user_profiles: true, // We still need user_profiles to calculate completion
        _count: {
          select: { user_interests: true }
        }
      }
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * findByEmail(email, client?)
 *
 * Finds a user by their unique email address.
 * Returns null if not found.
 *
 * @param {string} email
 * @param {PrismaClient} [client]
 * @returns {Promise<object|null>}
 */
async function findByEmail(email, client) {
  const db = client || prisma;
  try {
    return await db.users.findUnique({
      where: { email },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * create(data, client?)
 *
 * Creates a user record in the database.
 *
 * IMPORTANT: Password hashing is NOT performed here.
 * The caller (a future authService) must hash the password
 * before passing it to this method.
 *
 * This method is included in N2-C for structural completeness only.
 * It must NOT be called from any API endpoint or migration yet.
 *
 * @param {{ name: string, email: string, password: string }} data
 * @param {PrismaClient} [client]
 * @returns {Promise<object>}
 */
async function create(data, client) {
  const db = client || prisma;
  try {
    return await db.users.create({ data });
  } catch (err) {
    throw normaliseError(err);
  }
}

module.exports = { findById, findByEmail, create, findByIdWithProfileAndInterests, findByIdWithInterestsCount };
