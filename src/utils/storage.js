'use strict';

/**
 * src/utils/storage.js
 *
 * Simulates Laravel's Storage::disk('public')->url() behavior.
 */

function getPublicStorageUrl(path) {
  if (!path) return null;

  const appUrl = process.env.APP_URL || 'http://localhost:8000';
  // If the path already has a leading slash, avoid double slash
  const cleanPath = path.startsWith('/') ? path.substring(1) : path;
  
  // By default, Laravel links the storage directory to public/storage
  return `${appUrl}/storage/${cleanPath}`;
}

module.exports = { getPublicStorageUrl };
