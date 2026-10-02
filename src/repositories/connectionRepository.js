'use strict';

/**
 * src/repositories/connectionRepository.js
 *
 * Data-access methods for the `connection_requests` table.
 *
 * Notable schema facts (N2-A §3.19, §9.3):
 *   - NO unique(requester_id, recipient_id) at DB level.
 *   - "Only one PENDING" and "no self-connection" are APPLICATION logic only.
 *   - requester_id FK → users.id RESTRICT.
 *   - recipient_id FK → users.id RESTRICT.
 *   - status: VARCHAR(20) backed by PHP ConnectionStatus enum
 *     (pending, accepted, rejected, cancelled).
 *   - Composite indexes on (requester_id, status) and (recipient_id, status).
 *
 * IMPORTANT:
 *   This repository does NOT enforce "only one pending" or reverse-direction
 *   checks or self-connection prevention. Those are service-layer rules (N3+).
 *   findBetweenUsers() supports those checks without enforcing them.
 *   findPendingOrAcceptedBetweenUsers() maps directly to the query used in
 *   ConnectionRequestService::sendRequest() (Rules 3 and 4).
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
    return await db.connection_requests.findUnique({
      where: { id: BigInt(id) },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * findByRequester(requesterId, client?)
 *
 * Returns all connection requests sent by a user.
 *
 * @param {BigInt|string|number} requesterId
 * @param {PrismaClient} [client]
 * @returns {Promise<object[]>}
 */
async function findByRequester(requesterId, client) {
  const db = client || prisma;
  try {
    return await db.connection_requests.findMany({
      where: { requester_id: BigInt(requesterId) },
      orderBy: { created_at: 'desc' },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * findByRecipient(recipientId, client?)
 *
 * Returns all connection requests received by a user.
 *
 * @param {BigInt|string|number} recipientId
 * @param {PrismaClient} [client]
 * @returns {Promise<object[]>}
 */
async function findByRecipient(recipientId, client) {
  const db = client || prisma;
  try {
    return await db.connection_requests.findMany({
      where: { recipient_id: BigInt(recipientId) },
      orderBy: { created_at: 'desc' },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * findBetweenUsers(userAId, userBId, client?)
 *
 * Returns all connection_requests rows where EITHER direction matches.
 * The service layer uses this to check for duplicate/reverse pending
 * requests before creating a new one.
 *
 * @param {BigInt|string|number} userAId
 * @param {BigInt|string|number} userBId
 * @param {PrismaClient} [client]
 * @returns {Promise<object[]>}
 */
async function findBetweenUsers(userAId, userBId, client) {
  const db = client || prisma;
  try {
    return await db.connection_requests.findMany({
      where: {
        OR: [
          { requester_id: BigInt(userAId), recipient_id: BigInt(userBId) },
          { requester_id: BigInt(userBId), recipient_id: BigInt(userAId) },
        ],
      },
      orderBy: { created_at: 'desc' },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * findPendingOrAcceptedBetweenUsers(userAId, userBId, client?)
 *
 * Returns pending OR accepted connection requests between two users
 * in either direction. Used by the future ConnectionRequestService to
 * enforce:
 *   Rule 3: no pending request already exists in either direction
 *   Rule 4: no accepted connection already exists in either direction
 *
 * Maps to Laravel's ConnectionRequestService::sendRequest() queries:
 *   ConnectionRequest::where('status', 'pending')
 *     ->where(fn($q) => A->B OR B->A)
 *   ConnectionRequest::where('status', 'accepted')
 *     ->where(fn($q) => A->B OR B->A)
 *
 * @param {BigInt|string|number} userAId
 * @param {BigInt|string|number} userBId
 * @param {PrismaClient} [client]
 * @returns {Promise<object[]>}  Records with status 'pending' or 'accepted' in either direction.
 */
async function findPendingOrAcceptedBetweenUsers(userAId, userBId, client) {
  const db = client || prisma;
  try {
    return await db.connection_requests.findMany({
      where: {
        status: { in: ['pending', 'accepted'] },
        OR: [
          { requester_id: BigInt(userAId), recipient_id: BigInt(userBId) },
          { requester_id: BigInt(userBId), recipient_id: BigInt(userAId) },
        ],
      },
      orderBy: { created_at: 'desc' },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * findByIdForUpdate(id, client)
 *
 * Pessimistic lock for connection request. Must be run inside a transaction client (tx).
 *
 * @param {BigInt|string|number} id
 * @param {PrismaClient} [client]
 * @returns {Promise<object|null>}
 */
async function findByIdForUpdate(id, client) {
  const db = client || prisma;
  try {
    const result = await db.$queryRaw`SELECT * FROM connection_requests WHERE id = ${BigInt(id)} FOR UPDATE`;
    return result.length > 0 ? result[0] : null;
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * create(data, client?)
 *
 * @param {object} data  { requester_id, recipient_id }
 * @param {PrismaClient} [client]
 * @returns {Promise<object>}
 */
async function create(data, client) {
  const db = client || prisma;
  try {
    return await db.connection_requests.create({ data });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * updateStatus(id, status, client?)
 *
 * @param {BigInt|string|number} id
 * @param {string} status  ConnectionStatus enum value.
 * @param {PrismaClient} [client]
 * @returns {Promise<object>}
 */
async function updateStatus(id, status, client) {
  const db = client || prisma;
  try {
    return await db.connection_requests.update({
      where: { id: BigInt(id) },
      data: { status },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

module.exports = {
  findById,
  findByIdForUpdate,
  findByRequester,
  findByRecipient,
  findBetweenUsers,
  findPendingOrAcceptedBetweenUsers,
  create,
  updateStatus,
};
