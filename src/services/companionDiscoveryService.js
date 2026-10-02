'use strict';

/**
 * src/services/companionDiscoveryService.js
 *
 * Implements companion discovery logic.
 */

const prisma = require('../config/database');
const { normaliseError } = require('../db/errors');

/**
 * Executes the companion discovery query.
 *
 * @param {BigInt|string|number} authenticatedUserId
 * @param {object} filters Validated query parameters
 * @returns {Promise<object>} Paginated result { items, pagination }
 */
async function discover(authenticatedUserId, filters) {
  try {
    const perPage = Math.max(1, Math.min(50, parseInt(filters.per_page) || 20));
    const page = Math.max(1, parseInt(filters.page) || 1);
    const skip = (page - 1) * perPage;

    // Build the WHERE clause
    // Base rules:
    // 1. Not the authenticated user
    // 2. Profile is_discoverable = true
    // 3. Profile completion gate: at least one of bio, city, country, travel_style is NOT NULL
    const whereClause = {
      id: { not: BigInt(authenticatedUserId) },
      user_profiles: {
        is: {
          is_discoverable: true,
          OR: [
            { bio: { not: null } },
            { city: { not: null } },
            { country: { not: null } },
            { travel_style: { not: null } }
          ]
        }
      }
    };

    // Filter: destination
    if (filters.destination) {
      whereClause.preferred_destinations = whereClause.preferred_destinations || {};
      whereClause.preferred_destinations.some = {
        ...whereClause.preferred_destinations.some,
        destination: { contains: filters.destination }
      };
    }

    // Filter: place_id
    if (filters.place_id) {
      whereClause.preferred_destinations = whereClause.preferred_destinations || {};
      whereClause.preferred_destinations.some = {
        ...whereClause.preferred_destinations.some,
        place_id: filters.place_id
      };
    }

    // Filter: travel_style
    if (filters.travel_style) {
      whereClause.user_profiles.is.travel_style = filters.travel_style;
    }

    // Filter: interest_ids
    if (filters.interest_ids && Array.isArray(filters.interest_ids) && filters.interest_ids.length > 0) {
      whereClause.user_interests = {
        some: {
          interest_id: { in: filters.interest_ids.map(id => BigInt(id)) }
        }
      };
    }

    // Filter: dates (travel_availabilities)
    if (filters.start_date || filters.end_date) {
      const availabilityWhere = {};
      if (filters.end_date) {
        // companion start <= our end
        availabilityWhere.start_date = { lte: new Date(filters.end_date) };
      }
      if (filters.start_date) {
        // companion end >= our start
        availabilityWhere.end_date = { gte: new Date(filters.start_date) };
      }
      whereClause.travel_availabilities = {
        some: availabilityWhere
      };
    }

    // Determine sort
    let orderBy = [];
    const sort = filters.sort || 'profile_completion';

    if (sort === 'newest') {
      orderBy = [{ created_at: 'desc' }, { id: 'desc' }];
    } else {
      // profile_completion (default).
      // Prisma doesn't natively support ordering by a calculated CASE score across relations
      // without raw queries.
      // For Node MVP, we will query raw IDs sorted by completion, then fetch records, 
      // OR we can fetch without order and sort in JS if we limit, but that breaks pagination.
      // We will perform a raw query to fetch sorted IDs and counts, then fetch records.
    }

    let items = [];
    let total = 0;

    if (sort === 'newest') {
      total = await prisma.users.count({ where: whereClause });
      items = await prisma.users.findMany({
        where: whereClause,
        include: {
          user_profiles: true,
          user_interests: { include: { interests: true } },
          preferred_destinations: true
        },
        orderBy: orderBy,
        skip: skip,
        take: perPage
      });
    } else {
      // profile_completion raw query
      // Build conditions dynamically for the raw query, or just use Prisma to get ALL matching IDs,
      // sort them in memory? If there are 10,000 users, loading 10,000 IDs is fine in Node (few MBs).
      // Better: Use a Prisma query to get id and user_profiles (just the fields needed for scoring)
      
      const allMatching = await prisma.users.findMany({
        where: whereClause,
        select: {
          id: true,
          user_profiles: {
            select: {
              profile_photo_path: true,
              bio: true,
              city: true,
              country: true,
              languages: true,
              travel_style: true
            }
          }
        },
        orderBy: { id: 'desc' } // tie breaker
      });
      
      total = allMatching.length;
      
      // Calculate score for each
      const scored = allMatching.map(u => {
        let score = 0;
        if (u.user_profiles && u.user_profiles.length > 0) {
          const p = u.user_profiles[0];
          if (p.profile_photo_path) score += 20;
          if (p.bio) score += 15;
          if (p.city) score += 15;
          if (p.country) score += 10;
          if (p.languages && p.languages !== 'null' && p.languages !== '[]' && JSON.stringify(p.languages) !== '[]') score += 15;
          if (p.travel_style) score += 10;
        }
        return { id: u.id, score };
      });
      
      scored.sort((a, b) => b.score - a.score || (b.id > a.id ? 1 : -1));
      
      const pagedIds = scored.slice(skip, skip + perPage).map(u => u.id);
      
      if (pagedIds.length > 0) {
        const rawItems = await prisma.users.findMany({
          where: { id: { in: pagedIds } },
          include: {
            user_profiles: true,
            user_interests: { include: { interests: true } },
            preferred_destinations: true
          }
        });
        // Restore order
        items = pagedIds.map(id => rawItems.find(r => r.id === id)).filter(Boolean);
      }
    }

    const lastPage = Math.max(1, Math.ceil(total / perPage));

    return {
      items,
      pagination: {
        total,
        per_page: perPage,
        current_page: page,
        last_page: lastPage,
        has_more: page < lastPage
      }
    };
  } catch (err) {
    throw normaliseError(err);
  }
}

module.exports = {
  discover
};
