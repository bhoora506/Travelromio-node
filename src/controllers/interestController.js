'use strict';

/**
 * src/controllers/interestController.js
 *
 * Implements interest-related public endpoints for N3-B.
 */

const { successResponse, errorResponse } = require('../utils/response');
const interestRepository = require('../repositories/interestRepository');
const interestResource = require('../resources/interestResource');

/**
 * GET /api/interests
 * 
 * Returns a list of all available interests, ordered alphabetically.
 * Public endpoint.
 */
async function index(req, res) {
  try {
    const interests = await interestRepository.findAll();
    
    return successResponse(
      res, 
      { interests: interestResource.toCollection(interests) }, 
      'Interests retrieved successfully'
    );
  } catch (err) {
    console.error('[InterestController.index] Error:', err);
    return errorResponse(res, 'An error occurred while retrieving interests', [], 500);
  }
}

module.exports = { index };
