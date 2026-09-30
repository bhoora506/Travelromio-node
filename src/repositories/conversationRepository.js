'use strict';

/**
 * src/repositories/conversationRepository.js
 *
 * Data-access methods for the `conversations` table.
 *
 * Notable schema facts (N2-A §3.20, §9.4):
 *   - UNIQUE constraint on (requester_id, recipient_id) — DB-enforced.
 *   - CANONICAL ORDERING: requester_id = MIN(userA_id, userB_id).
 *     This is an APPLICATION invariant, not a DB constraint.
 *   - requester_id FK → users.id RESTRICT.
 *   - recipient_id FK → users.id RESTRICT.
 *   - Messages CASCADE DELETE with the conversation.
 *
 * IMPORTANT:
 *   The canonical-pair ordering (smaller ID first) is a business invariant
 *   owned by the CONVERSATION SERVICE (future N3+).
 *   This repository accepts the IDs as-is and does NOT reorder them.
 *   findBetweenUsers() accepts BOTH orderings to support service lookups.
 *
 *   The future ConversationService must always call:
 *     const [lo, hi] = [Math.min(a, b), Math.max(a, b)]
 *   before calling create() or findBetweenUsers().
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
    return await db.conversations.findUnique({
      where: { id: BigInt(id) },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * findBetweenUsers(requesterId, recipientId, client?)
 *
 * Looks up a conversation by the exact (requester_id, recipient_id) pair.
 * The caller (ConversationService) is responsible for canonical ordering.
 *
 * @param {BigInt|string|number} requesterId  Lower user ID (canonical).
 * @param {BigInt|string|number} recipientId  Higher user ID (canonical).
 * @param {PrismaClient} [client]
 * @returns {Promise<object|null>}
 */
async function findBetweenUsers(requesterId, recipientId, client) {
  const db = client || prisma;
  try {
    return await db.conversations.findUnique({
      where: {
        requester_id_recipient_id: {
          requester_id: BigInt(requesterId),
          recipient_id: BigInt(recipientId),
        },
      },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * findByUserId(userId, client?)
 *
 * Returns all conversations where the user appears as either participant.
 *
 * @param {BigInt|string|number} userId
 * @param {PrismaClient} [client]
 * @returns {Promise<object[]>}
 */
async function findByUserId(userId, client) {
  const db = client || prisma;
  try {
    return await db.conversations.findMany({
      where: {
        OR: [
          { requester_id: BigInt(userId) },
          { recipient_id: BigInt(userId) },
        ],
      },
      orderBy: { updated_at: 'desc' },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * create(data, client?)
 *
 * Creates a conversation. Canonical ordering must be applied by the caller.
 * DB UNIQUE(requester_id, recipient_id) prevents duplicate conversations.
 *
 * @param {{ requester_id: BigInt, recipient_id: BigInt }} data
 * @param {PrismaClient} [client]
 * @returns {Promise<object>}
 */
async function create(data, client) {
  const db = client || prisma;
  try {
    return await db.conversations.create({ data });
  } catch (err) {
    throw normaliseError(err);
  }
}

module.exports = { findById, findBetweenUsers, findByUserId, create };
