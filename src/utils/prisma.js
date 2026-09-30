'use strict';

/**
 * src/utils/prisma.js
 *
 * Shared utilities for handling Prisma-specific data-type concerns.
 *
 * Background (from N2-A risk register):
 *   R01 — BigInt ID overflow: JS Number.MAX_SAFE_INTEGER = 2^53 - 1.
 *          BigInt values from Prisma must be serialised to string for
 *          JSON output; never cast to JS Number blindly.
 *   R02 — Decimal precision loss: Prisma.Decimal must be kept as
 *          Decimal or serialised to string; never cast to JS float.
 *
 * These utilities are used by repositories when preparing records for
 * consumption by the service layer or tests.
 */

/**
 * bigIntToString(value)
 *
 * Safely converts a BigInt to a string for display / JSON serialisation.
 * Returns the original value unchanged if it is not a BigInt.
 *
 * @param {BigInt|any} value
 * @returns {string|any}
 */
function bigIntToString(value) {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

/**
 * serialiseRecord(record)
 *
 * Recursively walks a plain object (or array) returned from Prisma and
 * converts all BigInt values to strings, preserving Decimal objects as-is
 * (they serialise naturally via .toString() when JSON.stringify is called,
 * but the Decimal type itself is safe to pass through the service layer).
 *
 * IMPORTANT: This function is intended for console/log output and for
 * preparing records before returning them from service/controller layers.
 * It must NOT be used to store data back into the DB.
 *
 * @param {object|Array|any} value
 * @returns {object|Array|any}
 */
function serialiseRecord(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(serialiseRecord);
  }

  if (typeof value === 'object' && !(value instanceof Date)) {
    const result = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = serialiseRecord(v);
    }
    return result;
  }

  return value;
}

/**
 * decimalToString(value)
 *
 * Converts a Prisma Decimal (or any object with a .toString() method)
 * to a string suitable for JSON output.
 *
 * @param {Prisma.Decimal|null|undefined} value
 * @returns {string|null|undefined}
 */
function decimalToString(value) {
  if (value === null || value === undefined) {
    return value;
  }
  return value.toString();
}

module.exports = {
  bigIntToString,
  decimalToString,
  serialiseRecord,
};
