'use strict';

/**
 * src/controllers/connectionRequestController.js
 *
 * Implements N3-D Connection Request reading endpoints.
 */

const { successResponse, errorResponse } = require('../utils/response');
const prisma = require('../config/database');
const companionResource = require('../resources/companionResource');
const connectionRequestResource = require('../resources/connectionRequestResource');

function parsePagination(req) {
  const filters = req.query;
  const errors = {};
  
  if (filters.page !== undefined) {
    const page = parseInt(filters.page, 10);
    if (isNaN(page) || page < 1) {
      errors.page = ['The page must be at least 1.'];
    }
  }
  
  if (filters.per_page !== undefined) {
    const perPage = parseInt(filters.per_page, 10);
    if (isNaN(perPage) || perPage < 1) {
      errors.per_page = ['The per page must be at least 1.'];
    } else if (perPage > 50) {
      errors.per_page = ['The per page must not be greater than 50.'];
    }
  }
  
  return errors;
}

/**
 * GET /api/connections
 * List accepted connections for the authenticated user.
 */
async function index(req, res) {
  try {
    const errors = parsePagination(req);
    if (Object.keys(errors).length > 0) {
      return res.status(422).json({
        message: 'The given data was invalid.',
        errors: errors
      });
    }

    const authId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const perPage = Math.max(1, Math.min(50, parseInt(req.query.per_page) || 20));
    const skip = (page - 1) * perPage;

    // Accepted connections where auth user is requester OR recipient
    const whereClause = {
      status: 'accepted',
      OR: [
        { requester_id: BigInt(authId) },
        { recipient_id: BigInt(authId) }
      ]
    };

    const total = await prisma.connection_requests.count({ where: whereClause });
    const requests = await prisma.connection_requests.findMany({
      where: whereClause,
      include: {
        users_connection_requests_requester_idTousers: {
          include: {
            user_profiles: true,
            user_interests: { include: { interests: true } },
            preferred_destinations: true
          }
        },
        users_connection_requests_recipient_idTousers: {
          include: {
            user_profiles: true,
            user_interests: { include: { interests: true } },
            preferred_destinations: true
          }
        }
      },
      orderBy: { created_at: 'desc' },
      skip,
      take: perPage
    });

    const connectedUsers = requests.map(cr => {
      return cr.requester_id === BigInt(authId) 
        ? cr.users_connection_requests_recipient_idTousers 
        : cr.users_connection_requests_requester_idTousers;
    });

    const lastPage = Math.max(1, Math.ceil(total / perPage));

    return successResponse(
      res,
      {
        items: companionResource.toCollection(connectedUsers),
        pagination: {
          total,
          per_page: perPage,
          current_page: page,
          last_page: lastPage,
          has_more: page < lastPage
        }
      },
      'Connections retrieved successfully.'
    );

  } catch (err) {
    console.error('[ConnectionRequestController.index] Error:', err);
    return errorResponse(res, 'An error occurred while retrieving connections', [], 500);
  }
}

/**
 * GET /api/connections/received
 * List connection requests received by the authenticated user.
 */
async function received(req, res) {
  try {
    const errors = parsePagination(req);
    if (Object.keys(errors).length > 0) {
      return res.status(422).json({
        message: 'The given data was invalid.',
        errors: errors
      });
    }

    const authId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const perPage = Math.max(1, Math.min(50, parseInt(req.query.per_page) || 20));
    const skip = (page - 1) * perPage;

    const whereClause = { recipient_id: BigInt(authId) };

    const total = await prisma.connection_requests.count({ where: whereClause });
    const requests = await prisma.connection_requests.findMany({
      where: whereClause,
      include: {
        users_connection_requests_requester_idTousers: {
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
        items: connectionRequestResource.toCollection(requests),
        pagination: {
          total,
          per_page: perPage,
          current_page: page,
          last_page: lastPage,
          has_more: page < lastPage
        }
      },
      'Received connection requests retrieved successfully.'
    );

  } catch (err) {
    console.error('[ConnectionRequestController.received] Error:', err);
    return errorResponse(res, 'An error occurred while retrieving received requests', [], 500);
  }
}

/**
 * GET /api/connections/sent
 * List connection requests sent by the authenticated user.
 */
async function sent(req, res) {
  try {
    const errors = parsePagination(req);
    if (Object.keys(errors).length > 0) {
      return res.status(422).json({
        message: 'The given data was invalid.',
        errors: errors
      });
    }

    const authId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const perPage = Math.max(1, Math.min(50, parseInt(req.query.per_page) || 20));
    const skip = (page - 1) * perPage;

    const whereClause = { requester_id: BigInt(authId) };

    const total = await prisma.connection_requests.count({ where: whereClause });
    const requests = await prisma.connection_requests.findMany({
      where: whereClause,
      include: {
        users_connection_requests_recipient_idTousers: {
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
        items: connectionRequestResource.toCollection(requests),
        pagination: {
          total,
          per_page: perPage,
          current_page: page,
          last_page: lastPage,
          has_more: page < lastPage
        }
      },
      'Sent connection requests retrieved successfully.'
    );

  } catch (err) {
    console.error('[ConnectionRequestController.sent] Error:', err);
    return errorResponse(res, 'An error occurred while retrieving sent requests', [], 500);
  }
}

module.exports = {
  index,
  received,
  sent
};
