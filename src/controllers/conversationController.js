'use strict';

/**
 * src/controllers/conversationController.js
 *
 * Implements N3-E Conversation & Message endpoints.
 */

const { successResponse, errorResponse } = require('../utils/response');
const prisma = require('../config/database');
const conversationResource = require('../resources/conversationResource');
const messageResource = require('../resources/messageResource');

/**
 * Helper to fetch a conversation and ensure the user is a participant.
 */
async function getConversationIfParticipant(conversationId, userId) {
  const conversation = await prisma.conversations.findUnique({
    where: { id: BigInt(conversationId) },
    include: {
      users_conversations_requester_idTousers: {
        include: { user_profiles: true }
      },
      users_conversations_recipient_idTousers: {
        include: { user_profiles: true }
      },
      messages: {
        orderBy: { created_at: 'desc' },
        take: 1
      }
    }
  });

  if (!conversation) {
    return null; // Not found
  }

  // Check participation
  if (conversation.requester_id !== BigInt(userId) && conversation.recipient_id !== BigInt(userId)) {
    return false; // Forbidden
  }

  return conversation;
}

/**
 * GET /api/conversations
 * List all conversations for the authenticated user.
 */
async function index(req, res) {
  try {
    const authId = req.user.id;

    // Fetch conversations where user is requester or recipient
    const whereClause = {
      OR: [
        { requester_id: BigInt(authId) },
        { recipient_id: BigInt(authId) }
      ]
    };

    const conversations = await prisma.conversations.findMany({
      where: whereClause,
      include: {
        users_conversations_requester_idTousers: {
          include: { user_profiles: true }
        },
        users_conversations_recipient_idTousers: {
          include: { user_profiles: true }
        },
        // Fetch the latest message for preview
        messages: {
          orderBy: { created_at: 'desc' },
          take: 1
        }
      },
      orderBy: { updated_at: 'desc' }
    });

    // Calculate unread counts
    for (const conversation of conversations) {
      const unreadCount = await prisma.messages.count({
        where: {
          conversation_id: conversation.id,
          sender_id: { not: BigInt(authId) },
          read_at: null
        }
      });
      conversation._unreadCount = unreadCount;
    }

    return successResponse(
      res,
      {
        conversations: conversationResource.toCollection(conversations, authId)
      },
      'Conversations retrieved successfully.'
    );
  } catch (err) {
    console.error('[ConversationController.index] Error:', err);
    return errorResponse(res, 'An error occurred while retrieving conversations', [], 500);
  }
}

/**
 * GET /api/conversations/:conversation
 * Retrieve a specific conversation by ID.
 */
async function show(req, res) {
  try {
    const authId = req.user.id;
    const { conversationId } = req.params;

    if (!conversationId || isNaN(parseInt(conversationId, 10))) {
        return errorResponse(res, 'Not found', [], 404);
    }

    const conversation = await getConversationIfParticipant(conversationId, authId);

    if (conversation === null) {
      return errorResponse(res, 'Not found', [], 404);
    }
    if (conversation === false) {
      // Forbidden, but we should match Laravel's 403 or 404. Laravel Policies throw 403.
      return res.status(403).json({ message: 'This action is unauthorized.' });
    }

    // Unread count
    conversation._unreadCount = await prisma.messages.count({
      where: {
        conversation_id: conversation.id,
        sender_id: { not: BigInt(authId) },
        read_at: null
      }
    });

    return successResponse(
      res,
      {
        conversation: conversationResource.toResource(conversation, authId)
      },
      'Conversation retrieved successfully.'
    );
  } catch (err) {
    console.error('[ConversationController.show] Error:', err);
    return errorResponse(res, 'An error occurred while retrieving the conversation', [], 500);
  }
}

/**
 * GET /api/conversations/:conversation/messages
 * Retrieve paginated message history for a conversation.
 */
async function messages(req, res) {
  try {
    const authId = req.user.id;
    const { conversationId } = req.params;

    if (!conversationId || isNaN(parseInt(conversationId, 10))) {
        return errorResponse(res, 'Not found', [], 404);
    }

    // Authorization
    const conversation = await getConversationIfParticipant(conversationId, authId);
    if (conversation === null) {
      return errorResponse(res, 'Not found', [], 404);
    }
    if (conversation === false) {
      return res.status(403).json({ message: 'This action is unauthorized.' });
    }

    // Validation for per_page
    const filters = req.query;
    const errors = {};
    if (filters.per_page !== undefined) {
      const perPage = parseInt(filters.per_page, 10);
      if (isNaN(perPage) || perPage < 1) {
        errors.per_page = ['The per page must be at least 1.'];
      } else if (perPage > 50) {
        errors.per_page = ['The per page must not be greater than 50.'];
      }
    }
    // Note: Laravel pagination assumes 'page' natively.
    if (filters.page !== undefined) {
        const page = parseInt(filters.page, 10);
        if (isNaN(page) || page < 1) {
            errors.page = ['The page must be at least 1.'];
        }
    }

    if (Object.keys(errors).length > 0) {
      return res.status(422).json({
        message: 'The given data was invalid.',
        errors: errors
      });
    }

    const page = Math.max(1, parseInt(filters.page) || 1);
    const perPage = Math.max(1, Math.min(50, parseInt(filters.per_page) || 20));
    const skip = (page - 1) * perPage;

    const whereClause = { conversation_id: BigInt(conversationId) };

    const total = await prisma.messages.count({ where: whereClause });
    const msgs = await prisma.messages.findMany({
      where: whereClause,
      include: {
        users: {
          include: { user_profiles: true }
        }
      },
      orderBy: { created_at: 'desc' },
      skip,
      take: perPage
    });

    const lastPage = Math.max(1, Math.ceil(total / perPage));

    return successResponse(
      res,
      {
        items: messageResource.toCollection(msgs),
        pagination: {
          total,
          per_page: perPage,
          current_page: page,
          last_page: lastPage,
          has_more: page < lastPage
        }
      },
      'Messages retrieved successfully.'
    );

  } catch (err) {
    console.error('[ConversationController.messages] Error:', err);
    return errorResponse(res, 'An error occurred while retrieving messages', [], 500);
  }
}

module.exports = {
  index,
  show,
  messages
};
