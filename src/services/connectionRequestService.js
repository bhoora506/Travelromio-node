'use strict';

/**
 * src/services/connectionRequestService.js
 *
 * Centralises business rules for ConnectionRequest lifecycle (send, accept, reject, cancel).
 */

const connectionRepository = require('../repositories/connectionRepository');
const profileRepository = require('../repositories/profileRepository');
const prisma = require('../config/database');

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

class ConnectionRequestService {
  /**
   * Send a connection request.
   *
   * @param {BigInt|number} requesterId
   * @param {BigInt|number} recipientId
   * @returns {Promise<object>}
   */
  async sendRequest(requesterId, recipientId) {
    if (BigInt(requesterId) === BigInt(recipientId)) {
      throw new HttpError(409, 'You cannot send a connection request to yourself.');
    }

    const recipientProfile = await profileRepository.findByUserId(recipientId);
    if (!recipientProfile || !recipientProfile.is_discoverable) {
      throw new HttpError(404, 'User not found.');
    }

    // Rules 3 & 4: no pending or accepted request already exists in either direction
    const existing = await connectionRepository.findPendingOrAcceptedBetweenUsers(requesterId, recipientId);
    if (existing && existing.length > 0) {
      const pendingExists = existing.some(r => r.status === 'pending');
      if (pendingExists) {
        throw new HttpError(409, 'A pending connection request already exists between you and this user.');
      }
      
      const acceptedExists = existing.some(r => r.status === 'accepted');
      if (acceptedExists) {
        throw new HttpError(409, 'You are already connected with this user.');
      }
    }

    return await connectionRepository.create({
      requester_id: BigInt(requesterId),
      recipient_id: BigInt(recipientId),
      status: 'pending'
    });
  }

  /**
   * Accept a pending connection request (recipient only).
   *
   * @param {object} connectionRequest
   * @param {BigInt|number} userId (the authenticated recipient)
   * @returns {Promise<object>}
   */
  async accept(connectionRequest, userId) {
    return await prisma.$transaction(async (tx) => {
      // Pessimistic lock
      const locked = await connectionRepository.findByIdForUpdate(connectionRequest.id, tx);
      if (!locked) {
        throw new HttpError(404, 'Connection request not found.');
      }

      // Re-verify authorization
      if (BigInt(locked.recipient_id) !== BigInt(userId)) {
        throw new HttpError(403, 'This action is unauthorized.');
      }

      if (locked.status !== 'pending') {
        throw new HttpError(409, `Cannot accept a request that is already ${locked.status}.`);
      }

      const updated = await connectionRepository.updateStatus(locked.id, 'accepted', tx);
      return updated;
    });
  }

  /**
   * Reject a pending connection request (recipient only).
   *
   * @param {object} connectionRequest
   * @param {BigInt|number} userId
   * @returns {Promise<object>}
   */
  async reject(connectionRequest, userId) {
    if (BigInt(connectionRequest.recipient_id) !== BigInt(userId)) {
      throw new HttpError(403, 'This action is unauthorized.');
    }

    if (connectionRequest.status !== 'pending') {
      throw new HttpError(409, `Cannot reject a request that is already ${connectionRequest.status}.`);
    }

    return await connectionRepository.updateStatus(connectionRequest.id, 'rejected');
  }

  /**
   * Cancel a pending connection request (requester only).
   *
   * @param {object} connectionRequest
   * @param {BigInt|number} userId
   * @returns {Promise<object>}
   */
  async cancel(connectionRequest, userId) {
    if (BigInt(connectionRequest.requester_id) !== BigInt(userId)) {
      throw new HttpError(403, 'This action is unauthorized.');
    }

    if (connectionRequest.status !== 'pending') {
      throw new HttpError(409, `Cannot cancel a request that is already ${connectionRequest.status}.`);
    }

    return await connectionRepository.updateStatus(connectionRequest.id, 'cancelled');
  }
}

module.exports = new ConnectionRequestService();
