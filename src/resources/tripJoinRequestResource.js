'use strict';

/**
 * src/resources/tripJoinRequestResource.js
 *
 * Formats a trip_join_requests row + loaded users relation into the Laravel API shape.
 */
function toResource(joinRequest) {
  if (!joinRequest) return null;

  return {
    id: Number(joinRequest.id),
    trip_id: Number(joinRequest.trip_id),
    status: joinRequest.status,
    requester: joinRequest.users ? {
      id: Number(joinRequest.users.id),
      name: joinRequest.users.name,
    } : undefined,
    created_at: joinRequest.created_at ? joinRequest.created_at.toISOString() : null,
    updated_at: joinRequest.updated_at ? joinRequest.updated_at.toISOString() : null,
  };
}

module.exports = {
  toResource,
};
