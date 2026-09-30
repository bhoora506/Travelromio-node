'use strict';

/**
 * src/resources/userResource.js
 *
 * Formats a User record for API output, mirroring Laravel's UserResource.
 */

const { bigIntToString } = require('../utils/prisma');
const profileResource = require('./profileResource');
const interestResource = require('./interestResource');
const profileCompletionService = require('../services/profileCompletionService');

/**
 * Transforms a user object (with optional related profile and interests) into the API contract.
 *
 * @param {object} user 
 * @returns {object|null}
 */
function toResource(user) {
  if (!user) return null;

  // Mimics Laravel's conditional loading. 
  // If undefined, they were not loaded (omitted from resource output).
  // If null/[], they were loaded but empty.
  const hasProfile = user.user_profiles !== undefined;
  const hasInterests = user.user_interests !== undefined;

  const resource = {
    id: bigIntToString(user.id),
    name: user.name,
    email: user.email,
    email_verified_at: user.email_verified_at ? user.email_verified_at.toISOString() : null,
    created_at: user.created_at ? user.created_at.toISOString() : null,
  };

  // Only include profile if loaded
  if (hasProfile) {
    resource.profile = profileResource.toResource(user.user_profiles);
  }

  // Only include interests if loaded. 
  // user.user_interests is a join table. The actual interest is nested in .interests.
  if (hasInterests) {
    const interestsList = user.user_interests 
      ? user.user_interests.map(ui => ui.interests).filter(Boolean)
      : [];
    resource.interests = interestResource.toCollection(interestsList);
  }

  // Calculate completion percentage safely based on what is available
  // In Laravel this lazy loads, but here we require them to be preloaded for me/profile.
  let completionProfile = hasProfile ? user.user_profiles : null;
  let interestsCount = 0;
  if (hasInterests) {
    interestsCount = user.user_interests ? user.user_interests.length : 0;
  } else if (user._count && user._count.user_interests !== undefined) {
    interestsCount = user._count.user_interests;
  }
  
  resource.profile_completion = profileCompletionService.calculate(completionProfile, interestsCount);

  return resource;
}

module.exports = { toResource };
