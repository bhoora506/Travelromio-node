'use strict';

/**
 * src/resources/profileResource.js
 *
 * Formats a UserProfile record for API output, mirroring Laravel's ProfileResource.
 */

const { decimalToString } = require('../utils/prisma');
const { getPublicStorageUrl } = require('../utils/storage');

function toResource(profile) {
  if (!profile) return null;

  return {
    bio: profile.bio,
    city: profile.city,
    country: profile.country,
    // Prisma returns JSON fields as parsed JS objects/arrays
    languages: profile.languages || [],
    travel_style: profile.travel_style,
    profile_photo_url: getPublicStorageUrl(profile.profile_photo_path),
    preferred_budget_min: decimalToString(profile.preferred_budget_min),
    preferred_budget_max: decimalToString(profile.preferred_budget_max),
  };
}

module.exports = { toResource };
