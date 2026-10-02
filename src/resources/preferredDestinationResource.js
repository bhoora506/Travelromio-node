'use strict';

/**
 * src/resources/preferredDestinationResource.js
 * 
 * Safely serializes a preferred_destinations database record to JSON,
 * matching Laravel's PreferredDestinationResource exactly.
 */

const { bigIntToString } = require('../utils/prisma');

function preferredDestinationResource(destination) {
  if (!destination) return null;

  return {
    id: bigIntToString(destination.id),
    destination: destination.destination,
    place_id: destination.place_id,
    latitude: destination.latitude ? destination.latitude.toString() : null,
    longitude: destination.longitude ? destination.longitude.toString() : null,
    created_at: destination.created_at
  };
}

function collection(destinations) {
  return destinations.map(preferredDestinationResource);
}

module.exports = {
  preferredDestinationResource,
  collection
};
