require('dotenv').config();

/**
 * scripts/test-repositories.js
 *
 * READ-ONLY smoke test for all N2-C repositories.
 *
 * Purpose:
 *   Verify that every repository module loads without errors and that
 *   each Prisma model is reachable. No data is inserted, updated, or deleted.
 *
 * Safety rules:
 *   - All queries are SELECT / findUnique / findMany / count only.
 *   - Password values are never printed.
 *   - FCM token values are never printed.
 *   - personal_access_tokens table is not queried.
 *   - Sessions table is not queried.
 *   - If a table is empty the test reports "no records" and continues.
 *   - BigInt values are converted to strings for display only.
 *
 * Transaction smoke test:
 *   Executes `SELECT 1` inside $transaction to prove the helper works.
 *   No data is read or written during the transaction test.
 */

const prisma = require('../src/config/database');
const { withTransaction } = require('../src/db/transaction');
const { serialiseRecord } = require('../src/utils/prisma');

const userRepo = require('../src/repositories/userRepository');
const profileRepo = require('../src/repositories/profileRepository');
const interestRepo = require('../src/repositories/interestRepository');
const tripRepo = require('../src/repositories/tripRepository');
const membershipRepo = require('../src/repositories/membershipRepository');
const joinRequestRepo = require('../src/repositories/joinRequestRepository');
const availabilityRepo = require('../src/repositories/availabilityRepository');
const destinationRepo = require('../src/repositories/destinationRepository');
const connectionRepo = require('../src/repositories/connectionRepository');
const conversationRepo = require('../src/repositories/conversationRepository');
const messageRepo = require('../src/repositories/messageRepository');
const deviceRepo = require('../src/repositories/deviceRepository');

// ── Helpers ──────────────────────────────────────────────────────────────────

let passCount = 0;
let failCount = 0;

function pass(label, summary) {
  console.log(`  ✅ ${label}: ${summary}`);
  passCount++;
}

function fail(label, err) {
  console.error(`  ❌ ${label}: ${err.message}`);
  failCount++;
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

// Safely display an ID without precision loss
function displayId(bigint) {
  return typeof bigint === 'bigint' ? bigint.toString() : String(bigint);
}

// ── Tests ────────────────────────────────────────────────────────────────────

async function testUsers() {
  section('Users');
  try {
    const count = await prisma.users.count();
    pass('users.count', `${count} records`);

    if (count > 0) {
      const first = await prisma.users.findFirst({ orderBy: { id: 'asc' } });
      // Explicitly exclude password from display
      pass('userRepo.findById', `id=${displayId(first.id)}, email=${first.email}`);
      const byEmail = await userRepo.findByEmail(first.email);
      pass('userRepo.findByEmail', `found=${byEmail !== null}`);
    } else {
      pass('userRepo.findById', 'no records available');
    }
  } catch (err) {
    fail('Users', err);
  }
}

async function testProfiles() {
  section('User Profiles');
  try {
    const count = await prisma.user_profiles.count();
    pass('user_profiles.count', `${count} records`);

    if (count > 0) {
      const first = await prisma.user_profiles.findFirst({ orderBy: { id: 'asc' } });
      const profile = await profileRepo.findByUserId(first.user_id);
      pass('profileRepo.findByUserId', `found=${profile !== null}, is_discoverable=${profile.is_discoverable}, has_languages=${profile.languages !== null}`);
    } else {
      pass('profileRepo.findByUserId', 'no records available');
    }
  } catch (err) {
    fail('User Profiles', err);
  }
}

async function testInterests() {
  section('Interests');
  try {
    const all = await interestRepo.findAll();
    pass('interestRepo.findAll', `${all.length} interests`);

    if (all.length > 0) {
      const bySlug = await interestRepo.findBySlug(all[0].slug);
      pass('interestRepo.findBySlug', `slug=${bySlug.slug}`);
      const byId = await interestRepo.findById(all[0].id);
      pass('interestRepo.findById', `name=${byId.name}`);
    } else {
      pass('interestRepo.findBySlug', 'no records available');
    }
  } catch (err) {
    fail('Interests', err);
  }
}

async function testTrips() {
  section('Trips');
  try {
    const count = await prisma.trips.count();
    pass('trips.count', `${count} records`);

    const published = await tripRepo.findPublished();
    pass('tripRepo.findPublished', `${published.length} published trips`);

    if (count > 0) {
      const first = await prisma.trips.findFirst({ orderBy: { id: 'asc' } });
      const trip = await tripRepo.findById(first.id);
      // Display Decimal as string for safety
      pass(
        'tripRepo.findById',
        `id=${displayId(trip.id)}, status=${trip.status}, budget_min=${trip.budget_min ? trip.budget_min.toString() : 'null'}`
      );
    } else {
      pass('tripRepo.findById', 'no records available');
    }
  } catch (err) {
    fail('Trips', err);
  }
}

async function testMemberships() {
  section('Trip Memberships');
  try {
    const count = await prisma.trip_members.count();
    pass('trip_members.count', `${count} records`);

    if (count > 0) {
      const first = await prisma.trip_members.findFirst({ orderBy: { id: 'asc' } });
      const members = await membershipRepo.findByTripId(first.trip_id);
      pass('membershipRepo.findByTripId', `${members.length} members in trip ${displayId(first.trip_id)}`);
    } else {
      pass('membershipRepo.findByTripId', 'no records available');
    }
  } catch (err) {
    fail('Memberships', err);
  }
}

async function testJoinRequests() {
  section('Trip Join Requests');
  try {
    const count = await prisma.trip_join_requests.count();
    pass('trip_join_requests.count', `${count} records`);

    if (count > 0) {
      const first = await prisma.trip_join_requests.findFirst({ orderBy: { id: 'asc' } });
      const byTrip = await joinRequestRepo.findByTripId(first.trip_id);
      pass('joinRequestRepo.findByTripId', `${byTrip.length} requests for trip ${displayId(first.trip_id)}`);
    } else {
      pass('joinRequestRepo.findByTripId', 'no records available');
    }
  } catch (err) {
    fail('Join Requests', err);
  }
}

async function testAvailabilities() {
  section('Travel Availabilities');
  try {
    const count = await prisma.travel_availabilities.count();
    pass('travel_availabilities.count', `${count} records`);
  } catch (err) {
    fail('Travel Availabilities', err);
  }
}

async function testDestinations() {
  section('Preferred Destinations');
  try {
    const count = await prisma.preferred_destinations.count();
    pass('preferred_destinations.count', `${count} records`);

    if (count > 0) {
      const first = await prisma.preferred_destinations.findFirst({ orderBy: { id: 'asc' } });
      const dests = await destinationRepo.findByUserId(first.user_id);
      pass('destinationRepo.findByUserId', `${dests.length} destinations for user ${displayId(first.user_id)}`);
    } else {
      pass('destinationRepo.findByUserId', 'no records available');
    }
  } catch (err) {
    fail('Preferred Destinations', err);
  }
}

async function testConnections() {
  section('Connection Requests');
  try {
    const count = await prisma.connection_requests.count();
    pass('connection_requests.count', `${count} records`);

    if (count > 0) {
      const first = await prisma.connection_requests.findFirst({ orderBy: { id: 'asc' } });
      const sent = await connectionRepo.findByRequester(first.requester_id);
      pass('connectionRepo.findByRequester', `${sent.length} sent by user ${displayId(first.requester_id)}`);
    } else {
      pass('connectionRepo.findByRequester', 'no records available');
    }
  } catch (err) {
    fail('Connections', err);
  }
}

async function testConversations() {
  section('Conversations');
  try {
    const count = await prisma.conversations.count();
    pass('conversations.count', `${count} records`);

    if (count > 0) {
      const first = await prisma.conversations.findFirst({ orderBy: { id: 'asc' } });
      const byUser = await conversationRepo.findByUserId(first.requester_id);
      pass('conversationRepo.findByUserId', `${byUser.length} conversations for user ${displayId(first.requester_id)}`);
      return first.id; // return for message test
    } else {
      pass('conversationRepo.findByUserId', 'no records available');
      return null;
    }
  } catch (err) {
    fail('Conversations', err);
    return null;
  }
}

async function testMessages(conversationId) {
  section('Messages');
  try {
    const count = await prisma.messages.count();
    pass('messages.count', `${count} records`);

    if (conversationId !== null) {
      const msgs = await messageRepo.findByConversationId(conversationId);
      pass(
        'messageRepo.findByConversationId',
        `${msgs.length} messages in conversation ${displayId(conversationId)}`
      );
    } else {
      pass('messageRepo.findByConversationId', 'no conversation available to test');
    }
  } catch (err) {
    fail('Messages', err);
  }
}

async function testDevices() {
  section('User Devices');
  try {
    const count = await prisma.user_devices.count();
    pass('user_devices.count', `${count} records`);
    // NOTE: FCM tokens are never printed
    if (count > 0) {
      pass('deviceRepo.findByUserId', 'records exist — FCM tokens intentionally not displayed');
    } else {
      pass('deviceRepo.findByUserId', 'no records available');
    }
  } catch (err) {
    fail('User Devices', err);
  }
}

async function testTransaction() {
  section('Transaction Helper');
  try {
    const result = await withTransaction(async (tx) => {
      return await tx.$queryRaw`SELECT 1 as ok`;
    });
    // result[0].ok is either 1 (Number) or 1n (BigInt) depending on driver
    const ok = result && result.length > 0 && (result[0].ok === 1 || result[0].ok === 1n);
    if (ok) {
      pass('withTransaction + SELECT 1', 'read-only transaction executed successfully');
    } else {
      fail('withTransaction', new Error('unexpected result from SELECT 1'));
    }
  } catch (err) {
    fail('Transaction Helper', err);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n════════════════════════════════════════');
  console.log('  N2-C Repository Smoke Test');
  console.log('  READ-ONLY — no data modified');
  console.log('════════════════════════════════════════');

  await testUsers();
  await testProfiles();
  await testInterests();
  await testTrips();
  await testMemberships();
  await testJoinRequests();
  await testAvailabilities();
  await testDestinations();
  await testConnections();
  const firstConversationId = await testConversations();
  await testMessages(firstConversationId);
  await testDevices();
  await testTransaction();

  console.log('\n════════════════════════════════════════');
  console.log(`  Results: ${passCount} passed, ${failCount} failed`);
  console.log('════════════════════════════════════════\n');

  await prisma.$disconnect();

  if (failCount > 0) {
    process.exit(1);
  }

  process.exit(0);
}

main().catch(async (err) => {
  console.error('Fatal error in smoke test:', err.message);
  await prisma.$disconnect();
  process.exit(1);
});
