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

// --- Public Routes ---
router.get('/interests', interestController.index);

// --- Authenticated Routes ---
// Authentication / Identity
router.get('/auth/me', authenticate, authController.me);

// Profile
router.get('/profile', authenticate, profileController.show);

module.exports = router;
