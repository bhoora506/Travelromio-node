'use strict';

/**
 * src/services/profileCompletionService.js
 *
 * Replicates Laravel's ProfileCompletionService logic without N+1 queries.
 */

/**
 * Calculates the profile completion percentage based on profile fields and interests count.
 * Weights: Photo (20%), Bio (15%), City (15%), Country (10%), Languages (15%), Travel Style (10%), Interests (15%)
 * 
 * @param {object|null} profile The user_profiles record
 * @param {number} interestsCount The number of interests the user has
 * @returns {number} The completion percentage (0-100)
 */
function calculate(profile, interestsCount) {
  let completion = 0;

  if (profile) {
    if (profile.profile_photo_url || profile.profile_photo_path) {
      // Laravel checks profile_photo_path, but ProfileResource exposes profile_photo_url.
      // We will check for both depending on the database column mapping.
      completion += 20;
    }
    if (profile.bio && profile.bio.trim() !== '') {
      completion += 15;
    }
    if (profile.city && profile.city.trim() !== '') {
      completion += 15;
    }
    if (profile.country && profile.country.trim() !== '') {
      completion += 10;
    }
    if (profile.languages && Array.isArray(profile.languages) && profile.languages.length > 0) {
      completion += 15;
    }
    if (profile.travel_style && profile.travel_style.trim() !== '') {
      completion += 10;
    }
  }

  if (interestsCount > 0) {
    completion += 15;
  }

  return Math.min(100, completion);
}

module.exports = { calculate };
