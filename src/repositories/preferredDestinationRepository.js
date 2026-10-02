'use strict';

/**
 * src/repositories/preferredDestinationRepository.js
 * 
 * Handles database operations for preferred_destinations.
 */

const prisma = require('../config/database');

class PreferredDestinationRepository {
  async getByUserId(userId) {
    return await prisma.preferred_destinations.findMany({
      where: { user_id: BigInt(userId) },
      orderBy: { created_at: 'desc' }
    });
  }

  async countByUserId(userId) {
    return await prisma.preferred_destinations.count({
      where: { user_id: BigInt(userId) }
    });
  }

  async findById(id) {
    return await prisma.preferred_destinations.findUnique({
      where: { id: BigInt(id) }
    });
  }

  async create(userId, data) {
    return await prisma.preferred_destinations.create({
      data: {
        user_id: BigInt(userId),
        destination: data.destination,
        place_id: data.place_id || null,
        latitude: data.latitude !== undefined ? data.latitude : null,
        longitude: data.longitude !== undefined ? data.longitude : null,
      }
    });
  }

  async update(id, data) {
    return await prisma.preferred_destinations.update({
      where: { id: BigInt(id) },
      data: {
        destination: data.destination,
        place_id: data.place_id || null,
        latitude: data.latitude !== undefined ? data.latitude : null,
        longitude: data.longitude !== undefined ? data.longitude : null,
      }
    });
  }

  async delete(id) {
    return await prisma.preferred_destinations.delete({
      where: { id: BigInt(id) }
    });
  }
}

module.exports = new PreferredDestinationRepository();
