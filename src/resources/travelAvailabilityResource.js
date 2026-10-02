'use strict';

/**
 * src/resources/travelAvailabilityResource.js
 * 
 * Safely serializes a travel_availabilities database record to JSON,
 * matching Laravel's TravelAvailabilityResource exactly.
 */

const { bigIntToString } = require('../utils/prisma');

function formatDate(dateString) {
  if (!dateString) return null;
  // Convert JS Date to YYYY-MM-DD
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return null;
  return date.toISOString().split('T')[0];
}

function travelAvailabilityResource(availability) {
  if (!availability) return null;

  return {
    id: bigIntToString(availability.id),
    start_date: formatDate(availability.start_date),
    end_date: formatDate(availability.end_date),
    created_at: availability.created_at
  };
}

function collection(availabilities) {
  return availabilities.map(travelAvailabilityResource);
}

module.exports = {
  travelAvailabilityResource,
  collection
};
