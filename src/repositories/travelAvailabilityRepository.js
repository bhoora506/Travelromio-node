'use strict';

/**
 * src/repositories/travelAvailabilityRepository.js
 * 
 * Handles database operations for travel_availabilities.
 */

const prisma = require('../config/database');

class TravelAvailabilityRepository {
  async getByUserId(userId) {
    return await prisma.travel_availabilities.findMany({
      where: { user_id: BigInt(userId) },
      orderBy: { start_date: 'asc' }
    });
  }

  async findById(id) {
    return await prisma.travel_availabilities.findUnique({
      where: { id: BigInt(id) }
    });
  }

  async create(userId, data) {
    return await prisma.travel_availabilities.create({
      data: {
        user_id: BigInt(userId),
        start_date: new Date(data.start_date),
        end_date: new Date(data.end_date)
      }
    });
  }

  async update(id, data) {
    return await prisma.travel_availabilities.update({
      where: { id: BigInt(id) },
      data: {
        start_date: new Date(data.start_date),
        end_date: new Date(data.end_date)
      }
    });
  }

  async delete(id) {
    return await prisma.travel_availabilities.delete({
      where: { id: BigInt(id) }
    });
  }
}

module.exports = new TravelAvailabilityRepository();
