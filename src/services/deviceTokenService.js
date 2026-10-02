'use strict';

/**
 * src/services/deviceTokenService.js
 *
 * Handles device token registration and removal.
 */

const deviceRepository = require('../repositories/deviceRepository');

class HttpError extends Error {
  constructor(statusCode, message, payload) {
    super(message);
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

class DeviceTokenService {
  
  async registerToken(userId, fcmToken, platform) {
    if (!fcmToken || typeof fcmToken !== 'string' || fcmToken.length > 255) {
      throw new HttpError(422, 'Validation failed', {
        success: false,
        message: 'The given data was invalid.',
        errors: { fcm_token: ['The fcm token must be a string and not exceed 255 characters.'] }
      });
    }

    if (!['android', 'ios'].includes(platform)) {
      throw new HttpError(422, 'Validation failed', {
        success: false,
        message: 'The given data was invalid.',
        errors: { platform: ['The selected platform is invalid.'] }
      });
    }

    await deviceRepository.upsert(userId, fcmToken, platform);
  }

  async unregisterToken(userId, fcmToken) {
    if (!fcmToken || typeof fcmToken !== 'string' || fcmToken.length > 255) {
      throw new HttpError(422, 'Validation failed', {
        success: false,
        message: 'The given data was invalid.',
        errors: { fcm_token: ['The fcm token must be a string and not exceed 255 characters.'] }
      });
    }

    await deviceRepository.removeByTokenAndUser(userId, fcmToken);
  }
}

module.exports = new DeviceTokenService();
