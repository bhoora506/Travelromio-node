const prisma = require('../config/database');

async function databaseHealthCheck() {
  try {
    // A simple, harmless, read-only query to test DB connectivity
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'up' };
  } catch (error) {
    console.error('Database health check failed:', error);
    return { status: 'down', error: error.message };
  }
}

module.exports = {
  databaseHealthCheck
};
