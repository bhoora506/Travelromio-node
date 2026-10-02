'use strict';

/**
 * src/resources/companionResource.js
 *
 * API representation of a Companion (User).
 * Strictly filters out sensitive user fields.
 */

const { bigIntToString } = require('../utils/prisma');

/**
 * Transforms a User model (with eagerly loaded relations) into a Companion resource.
 *
 * @param {object} user - The Prisma user record.
 * @returns {object}
 */
function toResource(user) {
  if (!user) return null;

  const profile = user.user_profiles || null;

  // Determine profile_photo_url matching Laravel's getter
  let profilePhotoUrl = null;
  if (profile && profile.profile_photo_path) {
    profilePhotoUrl = `${process.env.APP_URL}/storage/${profile.profile_photo_path}`;
  }

  // Parse languages safely (Prisma JSON)
  let languages = [];
  if (profile && profile.languages) {
    try {
      languages = typeof profile.languages === 'string' ? JSON.parse(profile.languages) : profile.languages;
    } catch (e) {
      languages = [];
    }
  }
  if (!Array.isArray(languages)) {
    languages = [];
  }

  const resource = {
    id: bigIntToString(user.id),
    name: user.name,
    profile_photo_url: profilePhotoUrl,
    bio: profile ? profile.bio : null,
    city: profile ? profile.city : null,
    country: profile ? profile.country : null,
    languages: languages,
    travel_style: profile ? profile.travel_style : null
  };

  // Eager loaded interests (via user_interests)
  if (user.user_interests !== undefined) {
    resource.interests = user.user_interests.map(ui => ({
      id: bigIntToString(ui.interests.id),
      name: ui.interests.name,
      slug: ui.interests.slug
    }));
  }

  // Eager loaded preferred_destinations
  if (user.preferred_destinations !== undefined) {
    resource.preferred_destinations = user.preferred_destinations.map(dest => ({
      id: bigIntToString(dest.id),
      destination: dest.destination,
      place_id: dest.place_id
    }));
  }

  return resource;
}

/**
 * Transforms an array of User models into Companion resources.
 *
 * @param {Array} users
 * @returns {Array}
 */
function toCollection(users) {
  if (!Array.isArray(users)) return [];
  return users.map(user => toResource(user));
}

module.exports = {
  toResource,
  toCollection
};
