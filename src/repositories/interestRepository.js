'use strict';

/**
 * src/repositories/interestRepository.js
 *
 * Data-access methods for the `interests` table.
 *
 * Notable schema facts (N2-A §11):
 *   - 14 canonical seed records required for the app to function.
 *   - IDs are database-assigned and NOT stable across environments.
 *   - Always look up interests by SLUG, never by hard-coded ID.
 *   - name and slug both have UNIQUE constraints.
 */

const prisma = require('../config/database');
const { normaliseError } = require('../db/errors');

/**
 * findAll(client?)
 *
 * Returns all interest records ordered alphabetically by slug.
 *
 * @param {PrismaClient} [client]
 * @returns {Promise<object[]>}
 */
async function findAll(client) {
  const db = client || prisma;
  try {
    return await db.interests.findMany({
      orderBy: { slug: 'asc' },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * findBySlug(slug, client?)
 *
 * Returns a single interest by its unique slug, or null.
 * Preferred lookup method because IDs are environment-dependent.
 *
 * @param {string} slug
 * @param {PrismaClient} [client]
 * @returns {Promise<object|null>}
 */
async function findBySlug(slug, client) {
  const db = client || prisma;
  try {
    return await db.interests.findUnique({
      where: { slug },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * findById(id, client?)
 *
 * Returns a single interest by its primary key, or null.
 * Prefer findBySlug where possible due to ID instability.
 *
 * @param {BigInt|string|number} id
 * @param {PrismaClient} [client]
 * @returns {Promise<object|null>}
 */
async function findById(id, client) {
  const db = client || prisma;
  try {
    return await db.interests.findUnique({
      where: { id: BigInt(id) },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

module.exports = { findAll, findBySlug, findById };
