'use strict';

/**
 * src/db/transaction.js
 *
 * Reusable transaction helper around Prisma's $transaction API.
 *
 * Purpose:
 *   Allows future service-layer code to execute multiple repository
 *   operations atomically without coupling services directly to the
 *   Prisma client.
 *
 * Design constraints:
 *   - Uses the single shared Prisma client (src/config/database.js).
 *   - Does NOT create a new PrismaClient.
 *   - Does NOT contain business logic.
 *   - Propagates errors — never swallows them.
 *   - Supports both interactive transactions (callback style) and
 *     sequential operation arrays.
 *
 * Usage example (future service layer):
 *
 *   const { withTransaction } = require('../db/transaction');
 *
 *   await withTransaction(async (tx) => {
 *     await membershipRepository.create(tx, { trip_id, user_id, role: 'member' });
 *     await joinRequestRepository.updateStatus(tx, requestId, 'approved');
 *   });
 *
 * NOTE: N2-C does NOT implement actual business transactions yet.
 *       This file only establishes the helper for future phases.
 */

const prisma = require('../config/database');
const { normaliseError } = require('./errors');

/**
 * withTransaction(fn, options?)
 *
 * Executes `fn` inside a Prisma interactive transaction.
 *
 * The function receives a transaction client (`tx`) that should be
 * forwarded to repository methods instead of the shared `prisma` client.
 *
 * @param {function(tx: PrismaClient): Promise<any>} fn
 *   Async callback receiving the transaction-scoped Prisma client.
 *
 * @param {object} [options]
 *   Optional Prisma transaction options, e.g. { maxWait, timeout }.
 *
 * @returns {Promise<any>}  The return value of fn.
 * @throws {DatabaseError}  Normalised database error on failure.
 */
async function withTransaction(fn, options) {
  try {
    return await prisma.$transaction(fn, options);
  } catch (error) {
    throw normaliseError(error);
  }
}

module.exports = { withTransaction };
