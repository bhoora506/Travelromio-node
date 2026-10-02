'use strict';

/**
 * src/controllers/profileController.js
 *
 * Implements profile-related endpoints for N3-B.
 */

const { successResponse, errorResponse } = require('../utils/response');
const userRepository = require('../repositories/userRepository');
const userResource = require('../resources/userResource');
const profileService = require('../services/profileService');
const interestResource = require('../resources/interestResource');

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

/**
 * PUT /api/profile
 */
async function update(req, res) {
  try {
    const user = await profileService.updateProfile(req.user.id, req.body);
    const resourceOutput = userResource.toResource(user);
    return successResponse(res, { user: resourceOutput }, 'Profile updated successfully');
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json(err.payload);
    }
    console.error('[ProfileController.update] Error:', err);
    return errorResponse(res, 'An error occurred while updating the profile', [], 500);
  }
}

/**
 * PUT /api/profile/interests
 */
async function updateInterests(req, res) {
  try {
    const user = await profileService.updateInterests(req.user.id, req.body.interest_ids);
    const resourceOutput = userResource.toResource(user);
    
    // Convert to interestResource format (assuming interestResource is similar to N2/Laravel)
    // Wait, N3-B should have already setup user interests inside userResource or not.
    // Let's return just what Laravel returns.
    
    // Laravel returns user and interests array
    const interestsData = user.user_interests ? user.user_interests.map(ui => {
      // format using interestResource if it exists, otherwise manual
      if (interestResource.toResource) {
        return interestResource.toResource(ui.interests);
      }
      return ui.interests;
    }) : [];

    return successResponse(res, { user: resourceOutput, interests: interestsData }, 'Interests updated successfully');
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json(err.payload);
    }
    console.error('[ProfileController.updateInterests] Error:', err);
    return errorResponse(res, 'An error occurred while updating interests', [], 500);
  }
}

/**
 * POST /api/profile/photo
 */
async function uploadPhoto(req, res) {
  try {
    // multer stores the uploaded file in req.file
    const user = await profileService.uploadPhoto(req.user.id, req.file);
    const resourceOutput = userResource.toResource(user);
    return successResponse(res, { user: resourceOutput }, 'Profile photo uploaded successfully');
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json(err.payload);
    }
    console.error('[ProfileController.uploadPhoto] Error:', err);
    return errorResponse(res, 'An error occurred while uploading photo', [], 500);
  }
}

/**
 * DELETE /api/profile/photo
 */
async function deletePhoto(req, res) {
  try {
    const user = await profileService.deletePhoto(req.user.id);
    const resourceOutput = userResource.toResource(user);
    return successResponse(res, { user: resourceOutput }, 'Profile photo deleted successfully');
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json(err.payload);
    }
    console.error('[ProfileController.deletePhoto] Error:', err);
    return errorResponse(res, 'An error occurred while deleting photo', [], 500);
  }
}

module.exports = { show, update, updateInterests, uploadPhoto, deletePhoto };
