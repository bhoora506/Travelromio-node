'use strict';

/**
 * src/repositories/tokenRepository.js
 *
 * Data-access methods for the `personal_access_tokens` table.
 * Used exclusively for Laravel Sanctum compatibility.
 */

const prisma = require('../config/database');
const { normaliseError } = require('../db/errors');

/**
 * findById(id)
 *
 * @param {BigInt|string|number} id
 * @returns {Promise<object|null>}
 */
async function findById(id) {
  try {
    return await prisma.personal_access_tokens.findUnique({
      where: { id: BigInt(id) },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

module.exports = { findById };
