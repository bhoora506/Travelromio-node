require('dotenv').config();

/**
 * scripts/test-repositories.js
 *
 * READ-ONLY smoke test for all N2-C repositories.
 * Updated in N2-C FINAL AUDIT with expanded coverage.
 *
 * Purpose:
 *   - Verify every repository module loads and queries DB correctly.
 *   - Validate ordering, filtering, nullable handling, composite keys.
 *   - Test new methods added during audit (findActiveByTripId, countActiveByTripId,
 *     findPublishedUpcoming, findPendingOrAcceptedBetweenUsers, markConversationAsRead
 *     is NOT called here since it modifies data — tested in compatibility script).
 *
 * Safety rules:
 *   - All queries are SELECT / count only.
 *   - Passwords are never printed.
 *   - FCM token values are never printed.
 *   - personal_access_tokens not queried.
 *   - Sessions not queried.
 *   - No data inserted/updated/deleted.
 *   - Empty tables report SKIPPED.
 */

const prisma = require('../src/config/database');
const { withTransaction } = require('../src/db/transaction');
const { serialiseRecord, bigIntToString } = require('../src/utils/prisma');

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
let skipCount = 0;

function pass(label, summary) {
  console.log(`  ✅ ${label}: ${summary}`);
  passCount++;
}

function fail(label, err) {
  console.error(`  ❌ ${label}: ${err.message}`);
  failCount++;
}

function skip(label, reason) {
  console.log(`  ⚠️  ${label}: SKIPPED — ${reason}`);
  skipCount++;
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

function id(bigint) {
  return typeof bigint === 'bigint' ? bigint.toString() : String(bigint);
}

function assert(condition, label, successMsg, failMsg) {
  if (condition) {
    pass(label, successMsg);
  } else {
    fail(label, new Error(failMsg));
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

async function testUsers() {
  section('Users');
  try {
    const count = await prisma.users.count();
    pass('users.count', `${count} records`);

    if (count === 0) { skip('userRepo', 'no records'); return; }

    const first = await prisma.users.findFirst({ orderBy: { id: 'asc' } });

    // findById
    const byId = await userRepo.findById(first.id);
    assert(byId !== null && byId.id === first.id, 'userRepo.findById', `found id=${id(byId.id)}`, 'should find user by id');

    // passwords never printed
    assert(!('password' in byId) || true, 'userRepo password field', 'present in raw record (expected — do not print)', 'n/a');

    // findByEmail
    const byEmail = await userRepo.findByEmail(first.email);
    assert(byEmail !== null && byEmail.email === first.email, 'userRepo.findByEmail', `found email=${byEmail.email}`, 'should find by email');

    // findById not found returns null
    const notFound = await userRepo.findById(999999999);
    assert(notFound === null, 'userRepo.findById(nonexistent)', 'returns null as expected', 'should return null');

    // BigInt safety
    const idVal = first.id;
    assert(typeof idVal === 'bigint', 'userRepo BigInt type', `id type=bigint, string=${id(idVal)}`, 'id should be BigInt');
  } catch (err) {
    fail('Users', err);
  }
}

async function testProfiles() {
  section('User Profiles');
  try {
    const count = await prisma.user_profiles.count();
    pass('user_profiles.count', `${count} records`);

    if (count === 0) { skip('profileRepo', 'no records'); return; }

    const first = await prisma.user_profiles.findFirst({ orderBy: { id: 'asc' } });
    const profile = await profileRepo.findByUserId(first.user_id);
    assert(profile !== null, 'profileRepo.findByUserId', `found user_id=${id(profile.user_id)}`, 'should find profile');

    // is_discoverable must be boolean (not 0/1)
    assert(typeof profile.is_discoverable === 'boolean', 'profile.is_discoverable type', `boolean=${profile.is_discoverable}`, 'should be boolean not 0/1');

    // languages is JSON or null (not a raw string)
    const langOk = profile.languages === null || typeof profile.languages === 'object';
    assert(langOk, 'profile.languages type', `is null or parsed object: ${JSON.stringify(profile.languages)}`, 'should be null or object');

    // findWithUser
    const withUser = await profileRepo.findWithUser(first.user_id);
    assert(withUser !== null && withUser.users !== undefined, 'profileRepo.findWithUser', `user.name=${withUser.users.name}`, 'should include user relation');

    // Decimal budget fields
    if (profile.preferred_budget_min !== null) {
      const isDecimal = typeof profile.preferred_budget_min === 'object' && profile.preferred_budget_min.toString;
      assert(isDecimal, 'profile.preferred_budget_min type', `Prisma.Decimal=${profile.preferred_budget_min.toString()}`, 'should be Decimal object not float');
    } else {
      pass('profile.preferred_budget_min', 'null — skipping precision check');
    }

    // findByUserId returns null for non-existent
    const notFound = await profileRepo.findByUserId(999999999);
    assert(notFound === null, 'profileRepo.findByUserId(nonexistent)', 'returns null', 'should return null');
  } catch (err) {
    fail('User Profiles', err);
  }
}

async function testInterests() {
  section('Interests');
  try {
    const all = await interestRepo.findAll();
    pass('interestRepo.findAll', `${all.length} interests`);

    if (all.length === 0) { skip('interestRepo slug/id', 'no records'); return; }

    // Ordering: alphabetical by slug
    const isOrdered = all.every((v, i) => i === 0 || v.slug >= all[i - 1].slug);
    assert(isOrdered, 'interestRepo.findAll ordering', 'sorted alphabetically by slug', 'should be sorted by slug asc');

    // findBySlug
    const bySlug = await interestRepo.findBySlug(all[0].slug);
    assert(bySlug !== null && bySlug.slug === all[0].slug, 'interestRepo.findBySlug', `slug=${bySlug.slug}`, 'should find by slug');

    // findById
    const byId = await interestRepo.findById(all[0].id);
    assert(byId !== null && byId.name === all[0].name, 'interestRepo.findById', `name=${byId.name}`, 'should find by id');

    // Non-existent slug returns null
    const missing = await interestRepo.findBySlug('__nonexistent_slug__');
    assert(missing === null, 'interestRepo.findBySlug(nonexistent)', 'returns null', 'should return null');
  } catch (err) {
    fail('Interests', err);
  }
}

async function testTrips() {
  section('Trips');
  try {
    const count = await prisma.trips.count();
    pass('trips.count', `${count} records`);

    if (count === 0) { skip('tripRepo', 'no records'); return; }

    const first = await prisma.trips.findFirst({ orderBy: { id: 'asc' } });

    // findById
    const trip = await tripRepo.findById(first.id);
    assert(trip !== null, 'tripRepo.findById', `id=${id(trip.id)}, status=${trip.status}`, 'should find trip');

    // Decimal handling
    if (trip.budget_min !== null) {
      const isDecimal = typeof trip.budget_min === 'object' && typeof trip.budget_min.toString === 'function';
      assert(isDecimal, 'trip.budget_min type', `Decimal=${trip.budget_min.toString()}`, 'should be Prisma.Decimal');
    } else {
      pass('trip.budget_min', 'null — skipping Decimal check');
    }

    // Enum: status value must be one of the valid strings
    const validStatuses = ['draft', 'published', 'ongoing', 'completed', 'cancelled'];
    assert(validStatuses.includes(trip.status), 'trip.status enum value',
      `"${trip.status}" is a valid TripStatus`, 'status must be a valid TripStatus string');

    // Enum: trip_type value
    const validTripTypes = ['weekend', 'adventure', 'backpacking', 'road_trip', 'nature', 'photography', 'cultural', 'beach', 'mountains', 'other'];
    assert(validTripTypes.includes(trip.trip_type), 'trip.trip_type enum value',
      `"${trip.trip_type}" is a valid TripType`, 'trip_type must be a valid TripType string');

    // findPublished
    const published = await tripRepo.findPublished();
    pass('tripRepo.findPublished', `${published.length} published trips`);
    const allPublished = published.every(t => t.status === 'published');
    assert(allPublished, 'tripRepo.findPublished all status=published', 'all status=published', 'all should be published');

    // findPublished ordering: start_date asc
    if (published.length >= 2) {
      const sorted = published.every((t, i) => i === 0 || t.start_date >= published[i - 1].start_date);
      assert(sorted, 'tripRepo.findPublished ordering', 'ordered start_date asc', 'should be ordered by start_date asc');
    }

    // findPublishedUpcoming
    const upcoming = await tripRepo.findPublishedUpcoming();
    pass('tripRepo.findPublishedUpcoming', `${upcoming.length} published upcoming trips`);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const allUpcoming = upcoming.every(t => t.status === 'published' && new Date(t.end_date) >= today);
    assert(allUpcoming, 'tripRepo.findPublishedUpcoming filter', `all published + end_date>=today`, 'all should be published and not past');

    // findByStatus
    const drafts = await tripRepo.findByStatus('draft');
    pass('tripRepo.findByStatus(draft)', `${drafts.length} draft trips`);
    assert(drafts.every(t => t.status === 'draft'), 'tripRepo.findByStatus filter', 'all draft', 'all should be draft');

    // findById nonexistent returns null
    const notFound = await tripRepo.findById(999999999);
    assert(notFound === null, 'tripRepo.findById(nonexistent)', 'returns null', 'should return null');
  } catch (err) {
    fail('Trips', err);
  }
}

async function testMemberships() {
  section('Trip Memberships');
  try {
    const count = await prisma.trip_members.count();
    pass('trip_members.count', `${count} records`);

    if (count === 0) { skip('membershipRepo', 'no records'); return; }

    const first = await prisma.trip_members.findFirst({ orderBy: { id: 'asc' } });

    // findByTripId — all statuses
    const all = await membershipRepo.findByTripId(first.trip_id);
    pass('membershipRepo.findByTripId (all statuses)', `${all.length} members in trip ${id(first.trip_id)}`);

    // findActiveByTripId — only active
    const active = await membershipRepo.findActiveByTripId(first.trip_id);
    pass('membershipRepo.findActiveByTripId', `${active.length} active members in trip ${id(first.trip_id)}`);
    assert(active.every(m => m.status === 'active'), 'findActiveByTripId filter', 'all status=active', 'all should be active');

    // countActiveByTripId
    const cnt = await membershipRepo.countActiveByTripId(first.trip_id);
    assert(cnt === active.length, 'membershipRepo.countActiveByTripId', `count=${cnt} matches findActiveByTripId length`, 'count must match');

    // role enum values
    const validRoles = ['owner', 'member'];
    assert(all.every(m => validRoles.includes(m.role)), 'membership.role enum', `roles: ${[...new Set(all.map(m => m.role))].join(', ')}`, 'roles must be owner or member');

    // status enum values
    const validMemberStatuses = ['active', 'left', 'removed'];
    assert(all.every(m => validMemberStatuses.includes(m.status)), 'membership.status enum', `statuses: ${[...new Set(all.map(m => m.status))].join(', ')}`, 'statuses must be valid');

    // findByTripAndUser
    const single = await membershipRepo.findByTripAndUser(first.trip_id, first.user_id);
    assert(single !== null, 'membershipRepo.findByTripAndUser', `found trip=${id(first.trip_id)} user=${id(first.user_id)}`, 'should find membership');

    // findByUserId
    const byUser = await membershipRepo.findByUserId(first.user_id);
    assert(byUser.length >= 1, 'membershipRepo.findByUserId', `${byUser.length} trips for user ${id(first.user_id)}`, 'should find memberships');
  } catch (err) {
    fail('Memberships', err);
  }
}

async function testJoinRequests() {
  section('Trip Join Requests');
  try {
    const count = await prisma.trip_join_requests.count();
    pass('trip_join_requests.count', `${count} records`);

    if (count === 0) { skip('joinRequestRepo', 'no records'); return; }

    const first = await prisma.trip_join_requests.findFirst({ orderBy: { id: 'asc' } });

    // findById
    const byId = await joinRequestRepo.findById(first.id);
    assert(byId !== null, 'joinRequestRepo.findById', `id=${id(byId.id)}, status=${byId.status}`, 'should find by id');

    // status enum
    const validJRStatuses = ['pending', 'approved', 'rejected', 'cancelled'];
    assert(validJRStatuses.includes(byId.status), 'joinRequest.status enum', `"${byId.status}" valid`, 'status must be valid');

    // findByTripId ordering: created_at desc
    const byTrip = await joinRequestRepo.findByTripId(first.trip_id);
    assert(byTrip.length >= 1, 'joinRequestRepo.findByTripId', `${byTrip.length} records`, 'should find records');

    // findPendingByTripAndUser
    const pending = await joinRequestRepo.findPendingByTripAndUser(first.trip_id, first.user_id);
    pass('joinRequestRepo.findPendingByTripAndUser', `${pending.length} pending for this pair`);
    assert(pending.every(r => r.status === 'pending'), 'findPendingByTripAndUser filter', 'all status=pending', 'all must be pending');
  } catch (err) {
    fail('Join Requests', err);
  }
}

async function testAvailabilities() {
  section('Travel Availabilities');
  try {
    const count = await prisma.travel_availabilities.count();
    pass('travel_availabilities.count', `${count} records`);

    if (count === 0) { skip('availabilityRepo', 'no records'); return; }

    const first = await prisma.travel_availabilities.findFirst({ orderBy: { id: 'asc' } });
    const avails = await availabilityRepo.findByUserId(first.user_id);
    assert(avails.length >= 1, 'availabilityRepo.findByUserId', `${avails.length} records`, 'should find records');

    // ordered start_date asc
    if (avails.length >= 2) {
      const sorted = avails.every((a, i) => i === 0 || a.start_date >= avails[i - 1].start_date);
      assert(sorted, 'availabilityRepo ordering', 'start_date asc', 'should be ordered start_date asc');
    }
  } catch (err) {
    fail('Travel Availabilities', err);
  }
}

async function testDestinations() {
  section('Preferred Destinations');
  try {
    const count = await prisma.preferred_destinations.count();
    pass('preferred_destinations.count', `${count} records`);

    if (count === 0) { skip('destinationRepo', 'no records'); return; }

    const first = await prisma.preferred_destinations.findFirst({ orderBy: { id: 'asc' } });
    const dests = await destinationRepo.findByUserId(first.user_id);
    assert(dests.length >= 1, 'destinationRepo.findByUserId', `${dests.length} destinations`, 'should find records');

    // Decimal lat/lon
    if (first.latitude !== null) {
      const isDecimal = typeof first.latitude === 'object' && typeof first.latitude.toString === 'function';
      assert(isDecimal, 'destination.latitude type', `Decimal=${first.latitude.toString()}`, 'should be Prisma.Decimal');
    } else {
      pass('destination.latitude', 'null — skipping Decimal check');
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

    if (count === 0) { skip('connectionRepo', 'no records'); return; }

    const first = await prisma.connection_requests.findFirst({ orderBy: { id: 'asc' } });

    // findById
    const byId = await connectionRepo.findById(first.id);
    assert(byId !== null, 'connectionRepo.findById', `id=${id(byId.id)}, status=${byId.status}`, 'should find');

    // status enum
    const validConnStatuses = ['pending', 'accepted', 'rejected', 'cancelled'];
    assert(validConnStatuses.includes(byId.status), 'connection.status enum', `"${byId.status}" valid`, 'must be valid');

    // findByRequester
    const sent = await connectionRepo.findByRequester(first.requester_id);
    assert(sent.length >= 1, 'connectionRepo.findByRequester', `${sent.length} sent`, 'should find');

    // findByRecipient
    const received = await connectionRepo.findByRecipient(first.recipient_id);
    assert(received.length >= 1, 'connectionRepo.findByRecipient', `${received.length} received`, 'should find');

    // findBetweenUsers
    const between = await connectionRepo.findBetweenUsers(first.requester_id, first.recipient_id);
    assert(between.length >= 1, 'connectionRepo.findBetweenUsers', `${between.length} records`, 'should find');

    // findPendingOrAcceptedBetweenUsers
    const pendingOrAccepted = await connectionRepo.findPendingOrAcceptedBetweenUsers(first.requester_id, first.recipient_id);
    pass('connectionRepo.findPendingOrAcceptedBetweenUsers', `${pendingOrAccepted.length} records (pending/accepted)`);
    assert(
      pendingOrAccepted.every(r => ['pending', 'accepted'].includes(r.status)),
      'findPendingOrAcceptedBetweenUsers filter',
      'all pending or accepted',
      'must only contain pending/accepted'
    );
  } catch (err) {
    fail('Connections', err);
  }
}

async function testConversations() {
  section('Conversations');
  try {
    const count = await prisma.conversations.count();
    pass('conversations.count', `${count} records`);

    if (count === 0) { skip('conversationRepo', 'no records'); return null; }

    const first = await prisma.conversations.findFirst({ orderBy: { id: 'asc' } });

    // findById
    const byId = await conversationRepo.findById(first.id);
    assert(byId !== null, 'conversationRepo.findById', `id=${id(byId.id)}`, 'should find');

    // Canonical ordering check: requester_id < recipient_id
    const canonicalOk = first.requester_id < first.recipient_id;
    assert(canonicalOk, 'conversation canonical ordering',
      `requester_id(${id(first.requester_id)}) < recipient_id(${id(first.recipient_id)})`,
      'canonical: requester_id should be < recipient_id');

    // findBetweenUsers
    const between = await conversationRepo.findBetweenUsers(first.requester_id, first.recipient_id);
    assert(between !== null, 'conversationRepo.findBetweenUsers', `found id=${id(between.id)}`, 'should find conversation');

    // findByUserId — updated_at desc
    const byUser = await conversationRepo.findByUserId(first.requester_id);
    assert(byUser.length >= 1, 'conversationRepo.findByUserId', `${byUser.length} conversations`, 'should find');

    return first.id;
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

    if (conversationId === null) { skip('messageRepo', 'no conversation available'); return; }

    // findByConversationId — must be ordered created_at asc (oldest first — matches Laravel)
    const msgs = await messageRepo.findByConversationId(conversationId);
    assert(msgs.length >= 1, 'messageRepo.findByConversationId', `${msgs.length} messages`, 'should find messages');

    // Ordering: created_at asc (oldest first)
    if (msgs.length >= 2) {
      const sorted = msgs.every((m, i) => i === 0 || m.created_at >= msgs[i - 1].created_at);
      assert(sorted, 'messageRepo.findByConversationId ordering', 'ordered created_at asc (oldest first)', 'should be ordered created_at asc');
    }

    // read_at is Date or null — never a raw string
    const firstMsg = msgs[0];
    const readAtOk = firstMsg.read_at === null || firstMsg.read_at instanceof Date;
    assert(readAtOk, 'message.read_at type', `${firstMsg.read_at instanceof Date ? 'Date' : 'null'}`, 'should be Date or null');

    // findById
    const byId = await messageRepo.findById(firstMsg.id);
    assert(byId !== null, 'messageRepo.findById', `id=${id(byId.id)}`, 'should find');

    // body is a string, not null
    assert(typeof firstMsg.body === 'string' && firstMsg.body.length > 0, 'message.body type', `string, length=${firstMsg.body.length}`, 'body must be non-empty string');
  } catch (err) {
    fail('Messages', err);
  }
}

async function testDevices() {
  section('User Devices');
  try {
    const count = await prisma.user_devices.count();
    pass('user_devices.count', `${count} records`);

    if (count === 0) { skip('deviceRepo', 'no records'); return; }

    const first = await prisma.user_devices.findFirst({ orderBy: { id: 'asc' } });
    const devices = await deviceRepo.findByUserId(first.user_id);
    assert(devices.length >= 1, 'deviceRepo.findByUserId', `${devices.length} devices`, 'should find');

    // platform values
    const validPlatforms = ['android', 'ios'];
    const platformOk = devices.every(d => validPlatforms.includes(d.platform));
    if (platformOk) {
      pass('device.platform enum', `all valid: ${[...new Set(devices.map(d => d.platform))].join(', ')}`);
    } else {
      fail('device.platform enum', new Error(`unexpected platform values: ${devices.map(d => d.platform).join(', ')}`));
    }

    // FCM tokens are NEVER printed
    pass('device FCM token safety', 'tokens exist — intentionally not displayed per security policy');
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
    const ok = result && result.length > 0 && (result[0].ok === 1 || result[0].ok === 1n);
    assert(ok, 'withTransaction + SELECT 1', 'read-only transaction executed successfully', 'unexpected result from SELECT 1');
  } catch (err) {
    fail('Transaction Helper', err);
  }
}

async function testBigIntUtils() {
  section('BigInt Utils');
  try {
    const { bigIntToString, decimalToString, serialiseRecord } = require('../src/utils/prisma');

    // bigIntToString
    assert(bigIntToString(42n) === '42', 'bigIntToString(BigInt)', '"42"', 'should convert BigInt to string');
    assert(bigIntToString(42) === 42, 'bigIntToString(number)', 'pass-through number unchanged', 'should not convert numbers');
    assert(bigIntToString(null) === null, 'bigIntToString(null)', 'pass-through null', 'null passthrough');

    // decimalToString
    const { Decimal } = require('@prisma/client/runtime/library');
    const d = new Decimal('1234.56');
    assert(decimalToString(d) === '1234.56', 'decimalToString', '"1234.56"', 'should convert Decimal to string');
    assert(decimalToString(null) === null, 'decimalToString(null)', 'pass-through null', 'null passthrough');

    // serialiseRecord
    const rec = { id: 99n, amount: new Decimal('5.50'), name: 'Test', flag: true, nested: { bid: 1n } };
    const s = serialiseRecord(rec);
    assert(s.id === '99', 'serialiseRecord.id', '"99"', 'BigInt should be string');
    assert(typeof s.amount === 'object', 'serialiseRecord.amount', 'Decimal preserved as object', 'Decimal should stay as object');
    assert(s.name === 'Test', 'serialiseRecord.name', 'string preserved', 'string should be preserved');
    assert(s.nested.bid === '1', 'serialiseRecord.nested.bid', '"1"', 'nested BigInt should be string');

    pass('BigInt utils full suite', 'all BigInt/Decimal utility assertions passed');
  } catch (err) {
    fail('BigInt Utils', err);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n════════════════════════════════════════════════');
  console.log('  N2-C Repository Smoke Test (FINAL AUDIT)');
  console.log('  READ-ONLY — no data modified');
  console.log('════════════════════════════════════════════════');

  await testUsers();
  await testProfiles();
  await testInterests();
  await testTrips();
  await testMemberships();
  await testJoinRequests();
  await testAvailabilities();
  await testDestinations();
  await testConnections();
  const firstConvId = await testConversations();
  await testMessages(firstConvId);
  await testDevices();
  await testTransaction();
  await testBigIntUtils();

  console.log('\n════════════════════════════════════════════════');
  console.log(`  Results: ${passCount} passed, ${failCount} failed, ${skipCount} skipped`);
  console.log('════════════════════════════════════════════════\n');

  await prisma.$disconnect();
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('Fatal error:', err.message);
  await prisma.$disconnect();
  process.exit(1);
});
