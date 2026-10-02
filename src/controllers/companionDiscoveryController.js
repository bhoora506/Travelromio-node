'use strict';

/**
 * src/controllers/companionDiscoveryController.js
 *
 * Implements N3-D Companion discovery feed.
 */

const { successResponse, errorResponse } = require('../utils/response');
const companionDiscoveryService = require('../services/companionDiscoveryService');
const companionResource = require('../resources/companionResource');

/**
 * GET /api/companions
 * Companion discovery feed - paginated feed of discoverable users.
 */
async function index(req, res) {
  try {
    const filters = req.query;
    
    // --- EXACT LARAVEL VALIDATION PARITY ---
    const errors = {};
    
    // page
    if (filters.page !== undefined) {
      const page = parseInt(filters.page, 10);
      if (isNaN(page) || page < 1) {
        errors.page = ['The page must be at least 1.'];
      }
    }
    
    // per_page
    if (filters.per_page !== undefined) {
      const perPage = parseInt(filters.per_page, 10);
      if (isNaN(perPage) || perPage < 1) {
        errors.per_page = ['The per page must be at least 1.'];
      } else if (perPage > 50) {
        errors.per_page = ['The per page must not be greater than 50.'];
      }
    }
    
    // destination
    if (filters.destination !== undefined && typeof filters.destination !== 'string') {
        errors.destination = ['The destination must be a string.'];
    }

    // place_id
    if (filters.place_id !== undefined && typeof filters.place_id !== 'string') {
        errors.place_id = ['The place id must be a string.'];
    }
    
    // sort
    if (filters.sort !== undefined) {
      if (!['profile_completion', 'newest'].includes(filters.sort)) {
        errors.sort = ['Invalid sort value. Supported: profile_completion, newest.'];
      }
    }
    
    // travel_style
    if (filters.travel_style !== undefined) {
      const validTypes = ['weekend', 'adventure', 'backpacking', 'road_trip', 'nature', 'photography', 'cultural', 'beach', 'mountains', 'other'];
      if (!validTypes.includes(filters.travel_style)) {
        errors.travel_style = ['Invalid travel style. Supported: ' + validTypes.join(', ') + '.'];
      }
    }

    // interest_ids
    if (filters.interest_ids !== undefined) {
        if (!Array.isArray(filters.interest_ids)) {
            errors.interest_ids = ['The interest ids must be an array.'];
        } else {
            for (let i = 0; i < filters.interest_ids.length; i++) {
                const id = parseInt(filters.interest_ids[i], 10);
                if (isNaN(id) || id < 1) {
                    errors[`interest_ids.${i}`] = ['One or more interest IDs do not exist.'];
                }
            }
        }
    }

    // dates
    let startDate = null;
    let endDate = null;
    
    if (filters.start_date !== undefined && filters.start_date !== '') {
      startDate = new Date(filters.start_date);
      if (isNaN(startDate.getTime())) {
        errors.start_date = ['The start date is not a valid date.'];
      }
    }
    
    if (filters.end_date !== undefined && filters.end_date !== '') {
      endDate = new Date(filters.end_date);
      if (isNaN(endDate.getTime())) {
        errors.end_date = ['The end date is not a valid date.'];
      }
      if (startDate !== null && !isNaN(startDate.getTime()) && !isNaN(endDate.getTime()) && endDate < startDate) {
        errors.end_date = ['The end date must be on or after the start date.'];
      }
    }
    
    if (Object.keys(errors).length > 0) {
      return res.status(422).json({
        message: 'The given data was invalid.',
        errors: errors
      });
    }

    // Prepare for validation (trim) matching Laravel prepareForValidation
    if (filters.destination && typeof filters.destination === 'string') {
        filters.destination = filters.destination.trim();
    }
    
    const authId = req.user.id;

    const companionsPage = await companionDiscoveryService.discover(authId, filters);

    return successResponse(
      res,
      {
        items: companionResource.toCollection(companionsPage.items),
        pagination: companionsPage.pagination
      },
      'Companions retrieved successfully.'
    );
  } catch (err) {
    console.error('[CompanionDiscoveryController.index] Error:', err);
    return errorResponse(res, 'An error occurred while retrieving companions', [], 500);
  }
}

module.exports = { index };
