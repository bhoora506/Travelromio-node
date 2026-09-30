'use strict';

/**
 * src/resources/tripResource.js
 *
 * Formats a Trip record for API output, mirroring Laravel's TripResource.
 */

const { bigIntToString, decimalToString } = require('../utils/prisma');
const tripOwnerResource = require('./tripOwnerResource');
const interestResource = require('./interestResource');
const { getPublicStorageUrl } = require('../utils/storage');

/**
 * Helper to safely extract the first item from a relation array
 * (used for currentUserMembership and currentUserJoinRequest which are fetched with take: 1).
 */
function getFirst(relation) {
  if (Array.isArray(relation) && relation.length > 0) return relation[0];
  return null;
}

/**
 * Formats a single Trip record.
 * @param {object} trip
 * @param {BigInt|string|number} [authenticatedUserId] Optional current user ID to generate membership data
 * @returns {object|null}
 */
function toResource(trip, authenticatedUserId = null) {
  if (!trip) return null;

  // Active member count
  let activeMemberCount = 0;
  if (trip._count && trip._count.trip_members !== undefined) {
    activeMemberCount = trip._count.trip_members;
  }

  const remainingSlots = Math.max(0, trip.max_members - activeMemberCount);

  // Membership Data logic exactly matching Laravel
  let membershipData = undefined; // Will be completely stripped from JSON if left undefined

  if (authenticatedUserId) {
    const isOwner = bigIntToString(trip.user_id) === bigIntToString(authenticatedUserId);

    if (isOwner) {
      membershipData = {
        is_owner: true,
        is_member: false,
        role: 'owner',
        status: 'active',
        joined_at: null,
        join_request_status: null
      };
    } else {
      const membership = getFirst(trip.trip_members);
      const joinRequest = getFirst(trip.trip_join_requests);
      
      const isMember = membership !== null && membership.status === 'active';
      
      membershipData = {
        is_owner: false,
        is_member: isMember,
        role: membership ? membership.role : null,
        status: membership ? membership.status : null,
        joined_at: (membership && membership.joined_at) ? membership.joined_at.toISOString() : null,
        join_request_status: joinRequest ? joinRequest.status : null
      };
    }
  }

  // Extract nested interests safely (trip_interests join table)
  const interestsList = trip.trip_interests 
    ? trip.trip_interests.map(ti => ti.interests).filter(Boolean)
    : undefined;

  const resource = {
    id: bigIntToString(trip.id),
    title: trip.title,
    destination: trip.destination,
    place_id: trip.place_id,
    latitude: decimalToString(trip.latitude),
    longitude: decimalToString(trip.longitude),
    start_date: trip.start_date ? trip.start_date.toISOString().split('T')[0] : null,
    end_date: trip.end_date ? trip.end_date.toISOString().split('T')[0] : null,
    budget_min: decimalToString(trip.budget_min),
    budget_max: decimalToString(trip.budget_max),
    trip_type: trip.trip_type,
    description: trip.description,
    max_members: trip.max_members,
    status: trip.status,
    image_url: trip.image_path ? getPublicStorageUrl(trip.image_path) : null,
    member_count: activeMemberCount,
    remaining_slots: remainingSlots,
    created_at: trip.created_at ? trip.created_at.toISOString() : null,
    updated_at: trip.updated_at ? trip.updated_at.toISOString() : null,
  };

  // Only include owner/interests if loaded
  if (trip.users !== undefined) {
    resource.owner = tripOwnerResource.toResource(trip.users);
  }
  
  if (interestsList !== undefined) {
    resource.interests = interestResource.toCollection(interestsList);
  }

  if (membershipData !== undefined) {
    resource.membership = membershipData;
  }

  return resource;
}

function toCollection(trips, authenticatedUserId = null) {
  if (!Array.isArray(trips)) return [];
  return trips.map(trip => toResource(trip, authenticatedUserId));
}

module.exports = { toResource, toCollection };
