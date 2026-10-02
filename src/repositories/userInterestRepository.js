'use strict';

/**
 * src/repositories/userInterestRepository.js
 *
 * Data-access methods for the `user_interests` table.
 */

const prisma = require('../config/database');
const { normaliseError } = require('../db/errors');

/**
 * sync(userId, interestIds)
 *
 * Syncs the user's interests. Deletes existing interests and creates new ones.
 * Wrapped in a Prisma transaction.
 *
 * @param {BigInt|string|number} userId
 * @param {Array<number|string|BigInt>} interestIds
 * @returns {Promise<void>}
 */
async function sync(userId, interestIds) {
  try {
    await prisma.$transaction(async (tx) => {
      // 1. Delete all existing user interests
      await tx.user_interests.deleteMany({
        where: { user_id: BigInt(userId) },
      });

      // 2. Insert new interests if any exist
      if (interestIds && interestIds.length > 0) {
        // Deduplicate array to emulate Laravel Eloquent sync() behavior
        const uniqueIds = [...new Set(interestIds)];
        const data = uniqueIds.map(id => ({
          user_id: BigInt(userId),
          interest_id: BigInt(id),
          created_at: new Date(),
          updated_at: new Date(),
        }));

        await tx.user_interests.createMany({
          data,
          skipDuplicates: true // Defensive extra layer
        });
      }
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

module.exports = { sync };
