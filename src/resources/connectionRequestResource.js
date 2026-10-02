'use strict';

/**
 * src/resources/connectionRequestResource.js
 *
 * API representation of a ConnectionRequest.
 */

const { bigIntToString } = require('../utils/prisma');

/**
 * Transforms a ConnectionRequest model into a resource.
 *
 * @param {object} connectionRequest
 * @returns {object}
 */
function toResource(connectionRequest) {
  if (!connectionRequest) return null;

  const resource = {
    id: bigIntToString(connectionRequest.id),
    status: connectionRequest.status,
    created_at: connectionRequest.created_at,
    updated_at: connectionRequest.updated_at
  };

  if (connectionRequest.users_connection_requests_requester_idTousers !== undefined) {
    const requester = connectionRequest.users_connection_requests_requester_idTousers;
    const rProfile = requester.user_profiles || null;
    let profilePhotoUrl = null;
    if (rProfile && rProfile.profile_photo_path) {
      profilePhotoUrl = `${process.env.APP_URL}/storage/${rProfile.profile_photo_path}`;
    }
    resource.requester = {
      id: bigIntToString(requester.id),
      name: requester.name,
      profile_photo_url: profilePhotoUrl
    };
  }

  if (connectionRequest.users_connection_requests_recipient_idTousers !== undefined) {
    const recipient = connectionRequest.users_connection_requests_recipient_idTousers;
    const rProfile = recipient.user_profiles || null;
    let profilePhotoUrl = null;
    if (rProfile && rProfile.profile_photo_path) {
      profilePhotoUrl = `${process.env.APP_URL}/storage/${rProfile.profile_photo_path}`;
    }
    resource.recipient = {
      id: bigIntToString(recipient.id),
      name: recipient.name,
      profile_photo_url: profilePhotoUrl
    };
  }

  return resource;
}

/**
 * Transforms an array of ConnectionRequest models into resources.
 *
 * @param {Array} requests
 * @returns {Array}
 */
function toCollection(requests) {
  if (!Array.isArray(requests)) return [];
  return requests.map(req => toResource(req));
}

module.exports = {
  toResource,
  toCollection
};
