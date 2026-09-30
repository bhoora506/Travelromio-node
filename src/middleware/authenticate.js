'use strict';

/**
 * src/middleware/authenticate.js
 *
 * Express middleware that protects routes using Laravel Sanctum authentication.
 */

const { verifySanctumToken, UnauthorizedError } = require('../services/authService');

/**
 * Ensures the request contains a valid Laravel Sanctum Bearer token.
 * Populates `req.user` on success.
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const user = await verifySanctumToken(authHeader);
    
    // Attach minimal identity object for downstream services
    req.user = user;
    next();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return res.status(401).json({ message: err.message });
    }
    
    // Mask internal DB/Crypto errors as 401 unauthenticated
    return res.status(401).json({ message: 'Unauthenticated.' });
  }
}

module.exports = authenticate;
