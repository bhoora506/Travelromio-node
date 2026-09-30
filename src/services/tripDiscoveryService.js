'use strict';

/**
 * src/services/tripDiscoveryService.js
 *
 * Replicates Laravel's TripDiscoveryService.
 */

const prisma = require('../config/database');
const { normaliseError } = require('../db/errors');

/**
 * Discover published trips with filtering, sorting, and pagination.
 *
 * @param {BigInt|number|string} authenticatedUserId 
 * @param {object} filters Query parameters from the request
 * @returns {Promise<object>} Paginated result
 */
async function discover(authenticatedUserId, filters = {}) {
  try {
    const page = Math.max(1, parseInt(filters.page) || 1);
    const perPage = Math.max(1, Math.min(50, parseInt(filters.per_page) || 20));
    const skip = (page - 1) * perPage;

    // Base conditions
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today

    const where = {
      status: 'published',
      user_id: { not: BigInt(authenticatedUserId) },
      end_date: { gte: today }
    };

    // destination filter
    if (filters.destination && filters.destination.trim() !== '') {
      where.destination = { contains: filters.destination.trim() };
    }

    // trip_type filter
    if (filters.trip_type && filters.trip_type.trim() !== '') {
      where.trip_type = filters.trip_type;
    }

    // Date overlap
    if (filters.start_date) {
      where.end_date = { ...where.end_date, gte: new Date(filters.start_date) };
    }
    if (filters.end_date) {
      where.start_date = { lte: new Date(filters.end_date) };
    }

    // Budget overlap logic
    // Prisma OR conditions must be built carefully.
    const AND = [];

    if (filters.budget_min !== undefined && filters.budget_min !== null) {
      AND.push({
        OR: [
          { budget_max: null },
          { budget_max: { gte: parseFloat(filters.budget_min) } }
        ]
      });
    }

    if (filters.budget_max !== undefined && filters.budget_max !== null) {
      AND.push({
        OR: [
          { budget_min: null },
          { budget_min: { lte: parseFloat(filters.budget_max) } }
        ]
      });
    }

    if (AND.length > 0) {
      where.AND = AND;
    }

    // Sorting
    let orderBy = [];
    const sort = filters.sort || 'start_date';
    if (sort === 'newest') {
      orderBy = [{ created_at: 'desc' }, { id: 'asc' }];
    } else if (sort === 'updated') {
      orderBy = [{ updated_at: 'desc' }, { id: 'asc' }];
    } else {
      orderBy = [{ start_date: 'asc' }, { id: 'asc' }];
    }

    // Execution (Parallel count and fetch)
    const [total, items] = await Promise.all([
      prisma.trips.count({ where }),
      prisma.trips.findMany({
        where,
        orderBy,
        skip,
        take: perPage,
        include: {
          users: true, // owner
          trip_interests: {
            include: { interests: true }
          },
          // currentUserMembership (trip_members where user_id = authId)
          trip_members: {
            where: { user_id: BigInt(authenticatedUserId) },
            take: 1
          },
          // currentUserJoinRequest (trip_join_requests where user_id = authId)
          trip_join_requests: {
            where: { user_id: BigInt(authenticatedUserId) },
            take: 1
          },
          // Active members count
          _count: {
            select: {
              trip_members: {
                where: { status: 'active' }
              }
            }
          }
        }
      })
    ]);

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

module.exports = { discover };
