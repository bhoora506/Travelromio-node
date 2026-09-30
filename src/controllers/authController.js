'use strict';

/**
 * src/controllers/authController.js
 *
 * Implements authentication-related endpoints for N3-B.
 */

const { successResponse, errorResponse } = require('../utils/response');
const userRepository = require('../repositories/userRepository');
const userResource = require('../resources/userResource');

/**
 * GET /api/auth/me
 * 
 * Returns the currently authenticated user.
 */
async function me(req, res) {
  try {
    // req.user is set by the authenticate middleware, but it only contains { id, name, email }.
    // We need to fetch the full user model with the interests count for profile_completion.
    const user = await userRepository.findByIdWithInterestsCount(req.user.id);
    
    if (!user) {
      return res.status(401).json({ message: 'Unauthenticated.' });
    }

    // In Laravel, me() doesn't lazy load profile or interests explicitly for output,
    // so we delete user_profiles from the object after completion calculation 
    // to prevent it from being included in the resource output if it mimics Laravel.
    // userResource conditionally includes profile if user_profiles is defined.
    // To match Laravel strictly (profile not loaded in output, but used for completion):
    
    const resourceOutput = userResource.toResource(user);
    // Explicitly remove profile if we want to mimic whenLoaded('profile') exclusion.
    // In our resource, if we don't want it, we can just delete it from output.
    delete resourceOutput.profile;

    return successResponse(res, { user: resourceOutput }, 'Authenticated user');
  } catch (err) {
    console.error('[AuthController.me] Error:', err);
    return errorResponse(res, 'An error occurred while retrieving user details', [], 500);
  }
}

module.exports = { me };
