'use strict';

/**
 * src/repositories/deviceRepository.js
 *
 * Data-access methods for the `user_devices` table.
 *
 * Notable schema facts (N2-A §3.22, §9.6):
 *   - fcm_token has a UNIQUE constraint (one row per device token).
 *   - user_id FK → users.id CASCADE DELETE.
 *   - platform: VARCHAR(10), values 'android' or 'ios' — app-validated only.
 *   - last_used_at: nullable timestamp, updated on upsert.
 *
 * CRITICAL SECURITY RULE (N2-A R13):
 *   FCM tokens must NEVER appear in any API response.
 *   This repository does NOT log or print FCM tokens.
 *   Smoke tests must NOT print token values.
 *
 * Business rules NOT here:
 *   - Token reassignment on new login → DeviceService (future).
 *   - FCM push sending → FCM service (future).
 *   - Platform validation → service/controller (future).
 */

const prisma = require('../config/database');
const { normaliseError } = require('../db/errors');

/**
 * findByUserId(userId, client?)
 *
 * Returns all device rows for a user.
 * SECURITY: fcm_token is included in the returned objects.
 * Callers must NOT forward these to API responses.
 *
 * @param {BigInt|string|number} userId
 * @param {PrismaClient} [client]
 * @returns {Promise<object[]>}
 */
async function findByUserId(userId, client) {
  const db = client || prisma;
  try {
    return await db.user_devices.findMany({
      where: { user_id: BigInt(userId) },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * findByToken(fcmToken, client?)
 *
 * Returns the device row matching the given FCM token, or null.
 *
 * @param {string} fcmToken
 * @param {PrismaClient} [client]
 * @returns {Promise<object|null>}
 */
async function findByToken(fcmToken, client) {
  const db = client || prisma;
  try {
    return await db.user_devices.findUnique({
      where: { fcm_token: fcmToken },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * create(data, client?)
 *
 * @param {{ user_id: BigInt, fcm_token: string, platform: string }} data
 * @param {PrismaClient} [client]
 * @returns {Promise<object>}
 */
async function create(data, client) {
  const db = client || prisma;
  try {
    return await db.user_devices.create({ data });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * updateLastUsed(id, client?)
 *
 * Sets last_used_at to now() for the given device record.
 *
 * @param {BigInt|string|number} id
 * @param {PrismaClient} [client]
 * @returns {Promise<object>}
 */
async function updateLastUsed(id, client) {
  const db = client || prisma;
  try {
    return await db.user_devices.update({
      where: { id: BigInt(id) },
      data: { last_used_at: new Date() },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * remove(id, client?)
 *
 * Deletes a device record by ID (e.g. on logout).
 *
 * @param {BigInt|string|number} id
 * @param {PrismaClient} [client]
 * @returns {Promise<object>}
 */
async function remove(id, client) {
  const db = client || prisma;
  try {
    return await db.user_devices.delete({
      where: { id: BigInt(id) },
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * upsert(userId, fcmToken, platform, client?)
 *
 * Creates or updates a device record.
 *
 * @param {BigInt|string|number} userId
 * @param {string} fcmToken
 * @param {string} platform
 * @param {PrismaClient} [client]
 */
async function upsert(userId, fcmToken, platform, client) {
  const db = client || prisma;
  try {
    return await db.user_devices.upsert({
      where: { fcm_token: fcmToken },
      update: {
        user_id: BigInt(userId),
        platform,
        last_used_at: new Date()
      },
      create: {
        user_id: BigInt(userId),
        fcm_token: fcmToken,
        platform,
        last_used_at: new Date()
      }
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * removeByTokenAndUser(userId, fcmToken, client?)
 *
 * Deletes a device record by FCM token and User ID.
 *
 * @param {BigInt|string|number} userId
 * @param {string} fcmToken
 * @param {PrismaClient} [client]
 */
async function removeByTokenAndUser(userId, fcmToken, client) {
  const db = client || prisma;
  try {
    return await db.user_devices.deleteMany({
      where: {
        fcm_token: fcmToken,
        user_id: BigInt(userId)
      }
    });
  } catch (err) {
    throw normaliseError(err);
  }
}

module.exports = { findByUserId, findByToken, create, updateLastUsed, remove, upsert, removeByTokenAndUser };
