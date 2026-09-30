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
 *   - ConversationService.MAX_BODY_LENGTH = 5000 chars (enforced at service layer, not here).
 *
 * Laravel ConversationService.markAsRead pattern:
 *   Message::where('conversation_id', id)
 *          ->where('sender_id', '!=', readerId)
 *          ->whereNull('read_at')
 *          ->update(['read_at' => now()])
 *   This marks ALL unread messages from the OTHER participant in one bulk query.
 *   markConversationAsRead() below maps to this pattern.
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
 * Sets read_at to the current UTC timestamp for a SINGLE message by ID.
 *
 * NOTE: This is a low-level primitive. The Laravel-equivalent batch operation
 * is markConversationAsRead() below, which matches ConversationService::markAsRead().
 *
 * IMPORTANT: The caller (future ConversationService) is responsible for ensuring
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

/**
 * markConversationAsRead(conversationId, readerId, client?)
 *
 * Marks ALL unread messages from the OTHER participant as read.
 * Maps directly to Laravel's ConversationService::markAsRead():
 *
 *   Message::where('conversation_id', id)
 *           ->where('sender_id', '!=', readerId)
 *           ->whereNull('read_at')
 *           ->update(['read_at' => now()])
 *
 * Safe to call repeatedly (idempotent — skips already-read messages).
 * Never touches messages sent BY the reader themselves.
 *
 * IMPORTANT: The caller (future ConversationService) must verify
 * that readerId is a participant in the conversation before calling this.
 *
 * @param {BigInt|string|number} conversationId
 * @param {BigInt|string|number} readerId  The user marking messages as read.
 * @param {PrismaClient} [client]
 * @returns {Promise<{count: number}>}  Prisma updateMany result with count of updated rows.
 */
async function markConversationAsRead(conversationId, readerId, client) {
  const db = client || prisma;
  try {
    return await db.messages.updateMany({
      where: {
        conversation_id: BigInt(conversationId),
        sender_id: { not: BigInt(readerId) },
        read_at: null,
      },
      data: { read_at: new Date() },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

module.exports = { findByConversationId, findById, create, markAsRead, markConversationAsRead };
