'use strict';

/**
 * src/controllers/deviceTokenController.js
 *
 * Implements device token registration endpoints for N3-H.
 */

const { successResponse, errorResponse } = require('../utils/response');
const deviceTokenService = require('../services/deviceTokenService');

/**
 * POST /api/profile/device-token
 */
async function registerDeviceToken(req, res) {
  try {
    const { fcm_token, platform } = req.body;
    await deviceTokenService.registerToken(req.user.id, fcm_token, platform);
    return successResponse(res, { registered: true }, 'Device token registered successfully.');
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json(err.payload);
    }
    console.error('[DeviceTokenController.registerDeviceToken] Error:', err);
    return errorResponse(res, 'An error occurred while registering the device token', [], 500);
  }
}

/**
 * DELETE /api/profile/device-token
 */
async function unregisterDeviceToken(req, res) {
  try {
    const { fcm_token } = req.body;
    await deviceTokenService.unregisterToken(req.user.id, fcm_token);
    return successResponse(res, { unregistered: true }, 'Device token removed successfully.');
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json(err.payload);
    }
    console.error('[DeviceTokenController.unregisterDeviceToken] Error:', err);
    return errorResponse(res, 'An error occurred while removing the device token', [], 500);
  }
}

module.exports = { registerDeviceToken, unregisterDeviceToken };
