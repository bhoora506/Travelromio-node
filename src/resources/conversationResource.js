'use strict';

/**
 * src/resources/conversationResource.js
 *
 * API representation of a Conversation.
 */

const { bigIntToString } = require('../utils/prisma');

/**
 * Transforms a Conversation model into a resource.
 *
 * @param {object} conversation
 * @param {BigInt|number|string} authUserId
 * @returns {object}
 */
function toResource(conversation, authUserId) {
  if (!conversation) return null;

  const authIdStr = authUserId.toString();
  const reqIdStr = conversation.requester_id.toString();

  // Determine the other participant
  const isAuthRequester = authIdStr === reqIdStr;
  
  const other = isAuthRequester
    ? conversation.users_conversations_recipient_idTousers
    : conversation.users_conversations_requester_idTousers;

  let otherParticipant = null;
  if (other) {
    const oProfile = other.user_profiles || null;
    let profilePhotoUrl = null;
    if (oProfile && oProfile.profile_photo_path) {
      profilePhotoUrl = `${process.env.APP_URL}/storage/${oProfile.profile_photo_path}`;
    }
    otherParticipant = {
      id: bigIntToString(other.id),
      name: other.name,
      profile_photo_url: profilePhotoUrl
    };
  }

  // Determine latest message
  let latestMessage = null;
  if (conversation.messages && conversation.messages.length > 0) {
    const latest = conversation.messages[0]; // Assuming ordered by created_at desc in Prisma include
    latestMessage = {
      id: bigIntToString(latest.id),
      body: latest.body,
      sender_id: bigIntToString(latest.sender_id),
      created_at: latest.created_at
    };
  } else if (conversation.latestMessage) {
      // In case we mapped it explicitly
      const latest = conversation.latestMessage;
      latestMessage = {
          id: bigIntToString(latest.id),
          body: latest.body,
          sender_id: bigIntToString(latest.sender_id),
          created_at: latest.created_at
        };
  }

  // Unread count
  // We'll calculate this in the repository or controller and attach it to the object as `_unreadCount`
  const unreadCount = conversation._unreadCount || 0;

  return {
    id: bigIntToString(conversation.id),
    other_participant: otherParticipant,
    latest_message: latestMessage,
    unread_count: unreadCount,
    created_at: conversation.created_at,
    updated_at: conversation.updated_at
  };
}

/**
 * Transforms an array of Conversation models into resources.
 *
 * @param {Array} conversations
 * @param {BigInt|number|string} authUserId
 * @returns {Array}
 */
function toCollection(conversations, authUserId) {
  if (!Array.isArray(conversations)) return [];
  return conversations.map(c => toResource(c, authUserId));
}

module.exports = {
  toResource,
  toCollection
};
