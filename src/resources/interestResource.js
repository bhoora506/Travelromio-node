'use strict';

/**
 * src/resources/interestResource.js
 *
 * Formats an Interest record for API output, mirroring Laravel's InterestResource.
 */

const { bigIntToString } = require('../utils/prisma');

function toResource(interest) {
  if (!interest) return null;
  
  return {
    id: bigIntToString(interest.id),
    name: interest.name,
    slug: interest.slug,
  };
}

function toCollection(interests) {
  if (!Array.isArray(interests)) return [];
  return interests.map(toResource);
}

module.exports = { toResource, toCollection };
