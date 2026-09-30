'use strict';

/**
 * src/utils/response.js
 *
 * Standardised API response format matching Laravel's ApiResponse trait.
 */

function successResponse(res, data = {}, message = 'Operation successful', status = 200) {
  return res.status(status).json({
    success: true,
    message,
    data
  });
}

function errorResponse(res, message = 'An error occurred', errors = [], status = 400) {
  const payload = {
    success: false,
    message
  };

  if (errors && errors.length > 0) {
    payload.errors = errors;
  }

  return res.status(status).json(payload);
}

module.exports = {
  successResponse,
  errorResponse
};
