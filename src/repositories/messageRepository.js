'use strict';

/**
 * src/repositories/messageRepository.js
 *
 * Data-access methods for the `messages` table.
 *
 * Notable schema facts (N2-A §3.21, §9.5):
 *   - conversation_id FK → conversations.id CASCADE DELETE.
 *   - sender_id FK → users.id RESTRICT.
 *   - read_at: nullable timestamp — NULL means unread.
 *   - Composite index on (conversation_id, created_at) for paginated queries.
 *   - body: TEXT (no length limit enforced at DB level; app layer limits).
 *
 * Business rules NOT here:
 *   - Only the OTHER participant marks messages read (not the sender).
 *   - Chat authorization → middleware (future).
 *   - Accepted-connection requirement → ConversationService (future).
 *   - Realtime / FCM → future phases.
 */

const prisma = require('../config/database');
const { normaliseError } = require('../db/errors');

/**
 * findByConversationId(conversationId, client?)
 *
 * Returns all messages for a conversation ordered by created_at ascending.
 * Leverages the composite (conversation_id, created_at) index.
 *
 * @param {BigInt|string|number} conversationId
 * @param {PrismaClient} [client]
 * @returns {Promise<object[]>}
 */
async function findByConversationId(conversationId, client) {
  const db = client || prisma;
  try {
    return await db.messages.findMany({
      where: { conversation_id: BigInt(conversationId) },
      orderBy: { created_at: 'asc' },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

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
    return await db.messages.findUnique({
      where: { id: BigInt(id) },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * create(data, client?)
 *
 * @param {{ conversation_id: BigInt, sender_id: BigInt, body: string }} data
 * @param {PrismaClient} [client]
 * @returns {Promise<object>}
 */
async function create(data, client) {
  const db = client || prisma;
  try {
    return await db.messages.create({ data });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * markAsRead(id, client?)
 *
 * Sets read_at to the current UTC timestamp for a single message.
 *
 * IMPORTANT: The caller (future ChatService) is responsible for ensuring
 * that only the OTHER participant calls this — not the sender.
 *
 * @param {BigInt|string|number} id
 * @param {PrismaClient} [client]
 * @returns {Promise<object>}
 */
async function markAsRead(id, client) {
  const db = client || prisma;
  try {
    return await db.messages.update({
      where: { id: BigInt(id) },
      data: { read_at: new Date() },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

module.exports = { findByConversationId, findById, create, markAsRead };
