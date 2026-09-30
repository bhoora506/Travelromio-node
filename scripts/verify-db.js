require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Connecting to database...');
    await prisma.$connect();
    
    // Read-only harmless query
    const result = await prisma.$queryRaw`SELECT 1 as result`;
    
    if (result && result.length > 0 && result[0].result === 1n || result[0].result === 1) {
      console.log('✅ Database verification successful: connection established and read query executed.');
      
      // Optionally inspect metadata/counts without printing sensitive data
      const userCount = await prisma.users.count();
      console.log(`Verified existence of users table. Total records: ${userCount}`);
      
      process.exit(0);
    } else {
      console.error('❌ Database verification failed: unexpected query result.');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Database verification failed with error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
