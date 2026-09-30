'use strict';

/**
 * src/resources/tripMemberResource.js
 *
 * Formats a trip_members record for API output.
 */

const { bigIntToString } = require('../utils/prisma');

function toResource(member) {
  if (!member) return null;

  return {
    id: bigIntToString(member.id),
    user: member.users ? {
      id: bigIntToString(member.users.id),
      name: member.users.name,
    } : null,
    role: member.role,
    status: member.status,
    joined_at: member.joined_at ? member.joined_at.toISOString() : null,
  };
}

function toCollection(members) {
  if (!Array.isArray(members)) return [];
  return members.map(toResource);
}

module.exports = { toResource, toCollection };
