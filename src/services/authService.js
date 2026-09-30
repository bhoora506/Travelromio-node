'use strict';

/**
 * src/services/authService.js
 *
 * Verifies Laravel Sanctum personal access tokens.
 */

const crypto = require('crypto');
const tokenRepository = require('../repositories/tokenRepository');
const userRepository = require('../repositories/userRepository');

class UnauthorizedError extends Error {
  constructor(message = 'Unauthenticated.') {
    super(message);
    this.name = 'UnauthorizedError';
    this.status = 401;
  }
}

/**
 * Validates a Bearer token matching Laravel Sanctum behavior.
 * 
 * @param {string} bearerHeader - The full "Bearer <token>" header
 * @returns {Promise<object>} The safe req.user object
 * @throws {UnauthorizedError} On any verification failure
 */
async function verifySanctumToken(bearerHeader) {
  if (!bearerHeader || !bearerHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError();
  }

  const rawToken = bearerHeader.substring(7).trim();
  if (!rawToken) {
    throw new UnauthorizedError();
  }

  // Sanctum tokens are formatted as "id|plainTextToken"
  const pipeIndex = rawToken.indexOf('|');
  if (pipeIndex === -1) {
    throw new UnauthorizedError();
  }

  const tokenId = rawToken.substring(0, pipeIndex);
  const plainTextToken = rawToken.substring(pipeIndex + 1);

  if (!tokenId || !plainTextToken) {
    throw new UnauthorizedError();
  }

  let tokenRecord;
  try {
    tokenRecord = await tokenRepository.findById(tokenId);
  } catch (err) {
    // DB error during lookup (e.g., malformed BigInt ID)
    throw new UnauthorizedError();
  }

  if (!tokenRecord) {
    throw new UnauthorizedError();
  }

  // Verify expiration
  if (tokenRecord.expires_at && new Date() > tokenRecord.expires_at) {
    throw new UnauthorizedError();
  }

  // Hash plain text token and perform constant-time comparison
  const hashedInput = crypto.createHash('sha256').update(plainTextToken).digest('hex');
  const storedHash = tokenRecord.token;

  const inputBuffer = Buffer.from(hashedInput, 'utf8');
  const storedBuffer = Buffer.from(storedHash, 'utf8');

  if (inputBuffer.length !== storedBuffer.length || !crypto.timingSafeEqual(inputBuffer, storedBuffer)) {
    throw new UnauthorizedError();
  }

  // Enforce correct model type (Laravel polymorphism)
  if (tokenRecord.tokenable_type !== 'App\\Models\\User') {
    throw new UnauthorizedError();
  }

  // Fetch application user
  const user = await userRepository.findById(tokenRecord.tokenable_id);
  
  // User deleted but token still existed
  if (!user) {
    throw new UnauthorizedError();
  }

  // Return minimal safe identity for req.user
  return {
    id: user.id, // Preserved as BigInt
    name: user.name,
    email: user.email
  };
}

module.exports = {
  verifySanctumToken,
  UnauthorizedError
};
