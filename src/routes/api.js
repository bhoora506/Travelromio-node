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
const deviceTokenController = require('../controllers/deviceTokenController');
const upload = require('../middleware/upload');
const profileStatsController = require('../controllers/profileStatsController');
const preferredDestinationController = require('../controllers/preferredDestinationController');
const travelAvailabilityController = require('../controllers/travelAvailabilityController');
const interestController = require('../controllers/interestController');
const tripController = require('../controllers/tripController');
const tripMemberController = require('../controllers/tripMemberController');
const companionDiscoveryController = require('../controllers/companionDiscoveryController');
const connectionRequestController = require('../controllers/connectionRequestController');
const conversationController = require('../controllers/conversationController');

// --- Public Routes ---
router.get('/interests', interestController.index);

// --- Authenticated Routes ---
// Authentication / Identity
router.get('/auth/me', authenticate, authController.me);

// Profile
router.get('/profile', authenticate, profileController.show);
router.put('/profile', authenticate, profileController.update);
router.put('/profile/interests', authenticate, profileController.updateInterests);
router.post('/profile/photo', authenticate, upload.single('photo'), profileController.uploadPhoto);
router.delete('/profile/photo', authenticate, profileController.deletePhoto);

router.get('/profile/stats', authenticate, profileStatsController.show);

// Device Tokens
router.post('/profile/device-token', authenticate, deviceTokenController.registerDeviceToken);
router.delete('/profile/device-token', authenticate, deviceTokenController.unregisterDeviceToken);

// Profile Destinations
router.get('/profile/destinations', authenticate, preferredDestinationController.index);
router.post('/profile/destinations', authenticate, preferredDestinationController.store);
router.put('/profile/destinations/:id', authenticate, preferredDestinationController.update);
router.delete('/profile/destinations/:id', authenticate, preferredDestinationController.destroy);

// Profile Availability
router.get('/profile/availability', authenticate, travelAvailabilityController.index);
router.post('/profile/availability', authenticate, travelAvailabilityController.store);
router.put('/profile/availability/:id', authenticate, travelAvailabilityController.update);
router.delete('/profile/availability/:id', authenticate, travelAvailabilityController.destroy);

// Trips
router.get('/trips', authenticate, tripController.index);
router.get('/trips/:tripId', authenticate, tripController.show);
router.get('/my/trips', authenticate, tripController.myTrips);
router.get('/my/joined-trips', authenticate, tripController.joinedTrips);
router.get('/trips/:tripId/members', authenticate, tripMemberController.index);

// Companions
router.get('/companions', authenticate, companionDiscoveryController.index);

// Connections
router.get('/connections', authenticate, connectionRequestController.index);
router.get('/connections/received', authenticate, connectionRequestController.received);
router.get('/connections/sent', authenticate, connectionRequestController.sent);
router.post('/connections', authenticate, connectionRequestController.store);
router.post('/connections/:connectionRequestId/accept', authenticate, connectionRequestController.accept);
router.post('/connections/:connectionRequestId/reject', authenticate, connectionRequestController.reject);
router.post('/connections/:connectionRequestId/cancel', authenticate, connectionRequestController.cancel);

// Conversations
router.get('/conversations', authenticate, conversationController.index);
router.get('/conversations/:conversationId', authenticate, conversationController.show);
router.get('/conversations/:conversationId/messages', authenticate, conversationController.messages);

module.exports = router;
