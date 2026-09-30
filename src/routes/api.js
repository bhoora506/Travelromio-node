'use strict';

/**
 * src/routes/api.js
 *
 * Defines the main API routes for the Travelromio Node backend.
 */

const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/authenticate');
const authController = require('../controllers/authController');
const profileController = require('../controllers/profileController');
const interestController = require('../controllers/interestController');
const tripController = require('../controllers/tripController');
const tripMemberController = require('../controllers/tripMemberController');

// --- Public Routes ---
router.get('/interests', interestController.index);

// --- Authenticated Routes ---
// Authentication / Identity
router.get('/auth/me', authenticate, authController.me);

// Profile
router.get('/profile', authenticate, profileController.show);

// Trips
router.get('/trips', authenticate, tripController.index);
router.get('/trips/:tripId', authenticate, tripController.show);
router.get('/my/trips', authenticate, tripController.myTrips);
router.get('/my/joined-trips', authenticate, tripController.joinedTrips);
router.get('/trips/:tripId/members', authenticate, tripMemberController.index);

module.exports = router;
