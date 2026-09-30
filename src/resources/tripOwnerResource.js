'use strict';

/**
 * src/resources/tripOwnerResource.js
 *
 * Minimal owner representation for a Trip card.
 */

const { bigIntToString } = require('../utils/prisma');

function toResource(user) {
  if (!user) return null;

  return {
    id: bigIntToString(user.id),
    name: user.name,
  };
}

module.exports = { toResource };
