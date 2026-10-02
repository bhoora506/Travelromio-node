'use strict';

/**
 * src/resources/messageResource.js
 *
 * API representation of a Message.
 */

const { bigIntToString } = require('../utils/prisma');

/**
 * Transforms a Message model into a resource.
 *
 * @param {object} message
 * @returns {object}
 */
function toResource(message) {
  if (!message) return null;

  const resource = {
    id: bigIntToString(message.id),
    conversation_id: bigIntToString(message.conversation_id),
    body: message.body,
    read_at: message.read_at,
    created_at: message.created_at,
    updated_at: message.updated_at
  };

  if (message.users !== undefined && message.users !== null) {
    const sender = message.users;
    const rProfile = sender.user_profiles || null;
    let profilePhotoUrl = null;
    if (rProfile && rProfile.profile_photo_path) {
      profilePhotoUrl = `${process.env.APP_URL}/storage/${rProfile.profile_photo_path}`;
    }
    resource.sender = {
      id: bigIntToString(sender.id),
      name: sender.name,
      profile_photo_url: profilePhotoUrl
    };
  }

  return resource;
}

/**
 * Transforms an array of Message models into resources.
 *
 * @param {Array} messages
 * @returns {Array}
 */
function toCollection(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.map(msg => toResource(msg));
}

module.exports = {
  toResource,
  toCollection
};
