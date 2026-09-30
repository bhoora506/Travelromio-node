'use strict';

/**
 * src/controllers/profileController.js
 *
 * Implements profile-related endpoints for N3-B.
 */

const { successResponse, errorResponse } = require('../utils/response');
const userRepository = require('../repositories/userRepository');
const userResource = require('../resources/userResource');

/**
 * GET /api/profile
 * 
 * Returns the authenticated user's profile and interests.
 */
async function show(req, res) {
  try {
    // Fetch full user with profile and interests included
    const user = await userRepository.findByIdWithProfileAndInterests(req.user.id);

    if (!user) {
      return res.status(401).json({ message: 'Unauthenticated.' });
    }

    const resourceOutput = userResource.toResource(user);

    return successResponse(res, { user: resourceOutput }, 'Profile retrieved successfully');
  } catch (err) {
    console.error('[ProfileController.show] Error:', err);
    return errorResponse(res, 'An error occurred while retrieving the profile', [], 500);
  }
}

module.exports = { show };
