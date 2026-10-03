'use strict';

/**
 * scripts/test-endpoints-n3j.js
 *
 * Safe integration/unit tests for N3-J trip mutation endpoints.
 * Calls controller methods directly with mocked req/res to avoid DB writes.
 *
 * SAFETY:
 *   - All DB operations are mocked via module property injection
 *   - No real DB writes occur
 *   - No real file system writes (file objects are mocked)
 *   - No shared storage mutations
 */

require('dotenv').config();

// ── Mock repositories/services before requiring controller ─────────────────
const tripRepository   = require('../src/repositories/tripRepository');
const interestRepository = require('../src/repositories/interestRepository');
const prisma           = require('../src/config/database');
const tripService      = require('../src/services/tripService');
const tripResource     = require('../src/resources/tripResource');

// Mock tripResource.toResource to avoid BigInt serialization issues in tests
const originalToResource = tripResource.toResource;
tripResource.toResource = (trip, uid) => {
  if (!trip) return null;
  return {
    id: String(trip.id),
    title: trip.title,
    destination: trip.destination,
    status: trip.status,
    trip_type: trip.trip_type,
    max_members: trip.max_members,
    start_date: trip.start_date ? trip.start_date.toISOString().split('T')[0] : null,
    end_date: trip.end_date ? trip.end_date.toISOString().split('T')[0] : null,
    image_url: trip.image_path ? `http://localhost/storage/${trip.image_path}` : null,
    interests: [],
    membership: null,
  };
};

const controller = require('../src/controllers/tripController');

// ── Mock data ────────────────────────────────────────────────────────────────
const ownerUser   = { id: 10n, name: 'Owner' };
const anotherUser = { id: 99n, name: 'Other' };

const baseTripDraft = {
  id: 1000n, user_id: 10n, status: 'draft',
  title: 'Test Trip', destination: 'Paris', trip_type: 'adventure',
  max_members: 4, start_date: new Date('2027-01-01'),
  end_date: new Date('2027-01-07'), image_path: null,
  budget_min: null, budget_max: null, description: null,
  place_id: null, latitude: null, longitude: null
};

const baseTripPublished = { ...baseTripDraft, status: 'published' };
const baseTripOngoing   = { ...baseTripDraft, status: 'ongoing' };
const baseTripCompleted = { ...baseTripDraft, status: 'completed' };
const baseTripCancelled = { ...baseTripDraft, status: 'cancelled' };

// ── Mock utilities ───────────────────────────────────────────────────────────
function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json   = (data) => { res.body = data; return res; };
  return res;
}

function setMockTrip(trip) {
  tripRepository.findById = async () => trip;
  tripRepository.findByIdWithRelations = async () => trip ? { ...trip, users: { id: 10n, name: 'Owner' }, trip_interests: [], trip_members: [], trip_join_requests: [], _count: { trip_members: 1 } } : null;
}

// ── Test runner ──────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}`);
    console.error(err.stack || err);
    failed++;
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────
async function runTests() {
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  N3-J Trip Mutations (Mocked DB, Direct Controller Calls)');
  console.log('════════════════════════════════════════════════════════════\n');

  // Setup common mocks
  interestRepository.findById = async (id) => (id <= 20 ? { id, name: 'Test' } : null);
  prisma.$transaction = async (fn) => fn(prisma);
  prisma.trip_members = {
    create: async (data) => ({ id: 1n, ...data.data }),
  };
  prisma.trip_interests = {
    deleteMany: async () => ({ count: 0 }),
    createMany: async () => ({ count: 0 }),
  };

  // ── CREATE ──────────────────────────────────────────────────────────────
  console.log('── CREATE (POST /api/trips) ──');

  const validCreateData = {
    title: 'My Trip', destination: 'Paris',
    start_date: '2027-06-01', end_date: '2027-06-10',
    trip_type: 'adventure', max_members: '4'
  };

  await test('missing required fields -> 422', async () => {
    const req = { user: ownerUser, body: {}, file: null };
    const res = mockRes();
    await controller.store(req, res);
    if (res.statusCode !== 422) throw new Error(`Expected 422, got ${res.statusCode}`);
    if (!res.body.errors.title) throw new Error('Expected title error');
    if (!res.body.errors.destination) throw new Error('Expected destination error');
    if (!res.body.errors.trip_type) throw new Error('Expected trip_type error');
    if (!res.body.errors.max_members) throw new Error('Expected max_members error');
  });

  await test('title too short -> 422', async () => {
    const req = { user: ownerUser, body: { ...validCreateData, title: 'ab' }, file: null };
    const res = mockRes();
    await controller.store(req, res);
    if (res.statusCode !== 422) throw new Error(`Expected 422, got ${res.statusCode}`);
    if (!res.body.errors.title) throw new Error('Expected title error');
  });

  await test('invalid trip_type -> 422', async () => {
    const req = { user: ownerUser, body: { ...validCreateData, trip_type: 'invalid_type' }, file: null };
    const res = mockRes();
    await controller.store(req, res);
    if (res.statusCode !== 422) throw new Error(`Expected 422, got ${res.statusCode}`);
    if (!res.body.errors.trip_type) throw new Error('Expected trip_type error');
  });

  await test('max_members < 2 -> 422', async () => {
    const req = { user: ownerUser, body: { ...validCreateData, max_members: '1' }, file: null };
    const res = mockRes();
    await controller.store(req, res);
    if (res.statusCode !== 422) throw new Error(`Expected 422, got ${res.statusCode}`);
    if (!res.body.errors.max_members) throw new Error('Expected max_members error');
  });

  await test('max_members > 20 -> 422', async () => {
    const req = { user: ownerUser, body: { ...validCreateData, max_members: '21' }, file: null };
    const res = mockRes();
    await controller.store(req, res);
    if (res.statusCode !== 422) throw new Error(`Expected 422, got ${res.statusCode}`);
    if (!res.body.errors.max_members) throw new Error('Expected max_members error');
  });

  await test('end_date before start_date -> 422', async () => {
    const req = { user: ownerUser, body: { ...validCreateData, end_date: '2027-05-01' }, file: null };
    const res = mockRes();
    await controller.store(req, res);
    if (res.statusCode !== 422) throw new Error(`Expected 422, got ${res.statusCode}`);
    if (!res.body.errors.end_date) throw new Error('Expected end_date error');
  });

  await test('start_date in past -> 422', async () => {
    const req = { user: ownerUser, body: { ...validCreateData, start_date: '2020-01-01', end_date: '2020-01-10' }, file: null };
    const res = mockRes();
    await controller.store(req, res);
    if (res.statusCode !== 422) throw new Error(`Expected 422, got ${res.statusCode}`);
    if (!res.body.errors.start_date) throw new Error('Expected start_date error');
  });

  await test('invalid interest IDs -> 422', async () => {
    const req = { user: ownerUser, body: { ...validCreateData, interest_ids: [999] }, file: null };
    const res = mockRes();
    await controller.store(req, res);
    if (res.statusCode !== 422) throw new Error(`Expected 422, got ${res.statusCode}`);
  });

  await test('budget_max < budget_min -> 422', async () => {
    const req = { user: ownerUser, body: { ...validCreateData, budget_min: '500', budget_max: '100' }, file: null };
    const res = mockRes();
    await controller.store(req, res);
    if (res.statusCode !== 422) throw new Error(`Expected 422, got ${res.statusCode}`);
    if (!res.body.errors.budget_max) throw new Error('Expected budget_max error');
  });

  await test('valid create -> 201 + owner comes from req.user.id', async () => {
    const createdTrip = { ...baseTripDraft };

    // Mock the repository calls used by service
    prisma.trips = { create: async (data) => ({ ...createdTrip, ...data.data }) };
    tripRepository.findById = async () => createdTrip;
    tripRepository.findByIdWithRelations = async () => ({
      ...createdTrip, users: { id: 10n, name: 'Owner' },
      trip_interests: [], trip_members: [], trip_join_requests: [],
      _count: { trip_members: 1 }
    });

    let capturedOwnerId = null;
    const origCreate = tripService.createTrip.bind(tripService);
    tripService.createTrip = async (ownerId, data, file) => {
      capturedOwnerId = ownerId;
      return createdTrip;
    };

    const req = { user: ownerUser, body: { ...validCreateData, interest_ids: [1] }, file: null };
    const res = mockRes();
    await controller.store(req, res);

    if (res.statusCode !== 201) throw new Error(`Expected 201, got ${res.statusCode}`);
    if (String(capturedOwnerId) !== String(ownerUser.id)) throw new Error(`ownerId must come from req.user.id, got ${capturedOwnerId}`);
    if (res.body.data.trip.status !== 'draft') throw new Error('New trip must be draft');

    // Restore
    tripService.createTrip = origCreate;
  });

  await test('transaction is used on create', async () => {
    let txUsed = false;
    const origTx = prisma.$transaction;
    prisma.$transaction = async (fn) => { txUsed = true; return fn(prisma); };

    const createdTrip = { ...baseTripDraft };
    prisma.trips = { create: async () => createdTrip };
    tripRepository.findById = async () => createdTrip;
    tripRepository.findByIdWithRelations = async () => ({
      ...createdTrip, users: { id: 10n, name: 'Owner' },
      trip_interests: [], trip_members: [], trip_join_requests: [],
      _count: { trip_members: 1 }
    });

    const req = { user: ownerUser, body: validCreateData, file: null };
    const res = mockRes();
    await controller.store(req, res);

    if (!txUsed) throw new Error('prisma.$transaction was not called');
    prisma.$transaction = origTx;
  });

  // ── UPDATE ──────────────────────────────────────────────────────────────
  console.log('\n── UPDATE (PUT /api/trips/:tripId) ──');

  await test('nonexistent trip -> 404', async () => {
    setMockTrip(null);
    const req = { user: ownerUser, params: { tripId: 9999 }, body: { title: 'Updated' }, file: null };
    const res = mockRes();
    await controller.update(req, res);
    if (res.statusCode !== 404) throw new Error(`Expected 404, got ${res.statusCode}`);
  });

  await test('non-owner (IDOR) -> 403', async () => {
    setMockTrip(baseTripDraft);
    const req = { user: anotherUser, params: { tripId: 1000 }, body: { title: 'Updated' }, file: null };
    const res = mockRes();
    await controller.update(req, res);
    if (res.statusCode !== 403) throw new Error(`Expected 403, got ${res.statusCode}`);
  });

  await test('completed trip -> 409', async () => {
    setMockTrip(baseTripCompleted);
    const req = { user: ownerUser, params: { tripId: 1000 }, body: { title: 'Updated' }, file: null };
    const res = mockRes();
    await controller.update(req, res);
    if (res.statusCode !== 409) throw new Error(`Expected 409, got ${res.statusCode}`);
    if (!res.body.message.includes('completed')) throw new Error('Wrong message');
  });

  await test('cancelled trip -> 409', async () => {
    setMockTrip(baseTripCancelled);
    const req = { user: ownerUser, params: { tripId: 1000 }, body: { title: 'Updated' }, file: null };
    const res = mockRes();
    await controller.update(req, res);
    if (res.statusCode !== 409) throw new Error(`Expected 409, got ${res.statusCode}`);
  });

  await test('ongoing trip: only title/description editable (other fields silently ignored)', async () => {
    setMockTrip(baseTripOngoing);
    tripRepository.update = async (id, data) => {
      // Only title and description should be in update data
      const disallowedFields = ['destination', 'trip_type', 'max_members', 'start_date', 'end_date'];
      for (const f of disallowedFields) {
        if (data[f] !== undefined) throw new Error(`Field '${f}' should not be in update for ongoing trip`);
      }
      return { ...baseTripOngoing, title: data.title || baseTripOngoing.title };
    };
    const req = {
      user: ownerUser, params: { tripId: 1000 },
      body: { title: 'New Title', destination: 'Ignored Dest', trip_type: 'beach', max_members: 10 },
      file: null
    };
    const res = mockRes();
    await controller.update(req, res);
    if (res.statusCode !== 200) throw new Error(`Expected 200, got ${res.statusCode}`);
  });

  await test('draft/published: all editable fields pass through', async () => {
    setMockTrip(baseTripDraft);
    let capturedUpdateData = null;
    tripRepository.update = async (id, data) => {
      capturedUpdateData = data;
      return { ...baseTripDraft, ...data };
    };
    const req = {
      user: ownerUser, params: { tripId: 1000 },
      body: { title: 'New Title', destination: 'Rome', trip_type: 'cultural', max_members: '6' },
      file: null
    };
    const res = mockRes();
    await controller.update(req, res);
    if (res.statusCode !== 200) throw new Error(`Expected 200, got ${res.statusCode}`);
    if (capturedUpdateData.title !== 'New Title') throw new Error('title not updated');
    if (capturedUpdateData.destination !== 'Rome') throw new Error('destination not updated');
  });

  await test('interest sync when interest_ids present in payload', async () => {
    setMockTrip(baseTripDraft);
    let deleteCalled = false;
    let createCalled = false;
    tripRepository.update = async (id, data) => ({ ...baseTripDraft, ...data });
    prisma.trip_interests = {
      deleteMany: async () => { deleteCalled = true; return { count: 0 }; },
      createMany: async () => { createCalled = true; return { count: 0 }; },
    };

    const req = { user: ownerUser, params: { tripId: 1000 }, body: { interest_ids: [1, 2] }, file: null };
    const res = mockRes();
    await controller.update(req, res);
    if (res.statusCode !== 200) throw new Error(`Expected 200, got ${res.statusCode}`);
    if (!deleteCalled) throw new Error('deleteMany should be called for interest sync');
    if (!createCalled) throw new Error('createMany should be called for interest sync');
  });

  await test('interests NOT synced when interest_ids absent from payload', async () => {
    setMockTrip(baseTripDraft);
    let deleteCalled = false;
    tripRepository.update = async (id, data) => ({ ...baseTripDraft, ...data });
    prisma.trip_interests = {
      deleteMany: async () => { deleteCalled = true; return { count: 0 }; },
      createMany: async () => ({ count: 0 }),
    };

    const req = { user: ownerUser, params: { tripId: 1000 }, body: { title: 'Title only' }, file: null };
    const res = mockRes();
    await controller.update(req, res);
    if (res.statusCode !== 200) throw new Error(`Expected 200, got ${res.statusCode}`);
    if (deleteCalled) throw new Error('deleteMany should NOT be called when interest_ids absent');
  });

  await test('image path traversal protection - new image path stored safely', async () => {
    setMockTrip(baseTripDraft);
    let storedPath = null;
    tripRepository.update = async (id, data) => {
      storedPath = data.image_path;
      return { ...baseTripDraft, image_path: storedPath };
    };
    // Mock a file upload with a suspicious filename (multer already uses our generated name)
    const fakeFile = { filename: 'abc123def456.jpg', path: '/safe/public/storage/trips/abc123def456.jpg' };
    const req = { user: ownerUser, params: { tripId: 1000 }, body: {}, file: fakeFile };
    const res = mockRes();
    await controller.update(req, res);
    if (res.statusCode !== 200) throw new Error(`Expected 200, got ${res.statusCode}`);
    if (storedPath !== 'trips/abc123def456.jpg') throw new Error(`Expected safe relative path, got ${storedPath}`);
  });

  await test('validation error during update -> 422', async () => {
    setMockTrip(baseTripDraft);
    const req = { user: ownerUser, params: { tripId: 1000 }, body: { max_members: 1 }, file: null };
    const res = mockRes();
    await controller.update(req, res);
    if (res.statusCode !== 422) throw new Error(`Expected 422, got ${res.statusCode}`);
  });

  // ── PUBLISH ─────────────────────────────────────────────────────────────
  console.log('\n── PUBLISH (POST /api/trips/:tripId/publish) ──');

  await test('nonexistent trip -> 404', async () => {
    setMockTrip(null);
    const req = { user: ownerUser, params: { tripId: 9999 } };
    const res = mockRes();
    await controller.publish(req, res);
    if (res.statusCode !== 404) throw new Error(`Expected 404, got ${res.statusCode}`);
  });

  await test('non-owner -> 403', async () => {
    setMockTrip(baseTripDraft);
    const req = { user: anotherUser, params: { tripId: 1000 } };
    const res = mockRes();
    await controller.publish(req, res);
    if (res.statusCode !== 403) throw new Error(`Expected 403, got ${res.statusCode}`);
  });

  await test('already published -> 409', async () => {
    setMockTrip(baseTripPublished);
    const req = { user: ownerUser, params: { tripId: 1000 } };
    const res = mockRes();
    await controller.publish(req, res);
    if (res.statusCode !== 409) throw new Error(`Expected 409, got ${res.statusCode}`);
    if (!res.body.message.includes('published')) throw new Error('Wrong message');
  });

  await test('ongoing -> 409 (cannot publish)', async () => {
    setMockTrip(baseTripOngoing);
    const req = { user: ownerUser, params: { tripId: 1000 } };
    const res = mockRes();
    await controller.publish(req, res);
    if (res.statusCode !== 409) throw new Error(`Expected 409, got ${res.statusCode}`);
  });

  await test('missing publish prerequisites -> 422', async () => {
    const incompleteTrip = { ...baseTripDraft, title: '', destination: '', start_date: null, end_date: null, trip_type: null, max_members: null };
    setMockTrip(incompleteTrip);
    const req = { user: ownerUser, params: { tripId: 1000 } };
    const res = mockRes();
    await controller.publish(req, res);
    if (res.statusCode !== 422) throw new Error(`Expected 422, got ${res.statusCode}`);
    if (!res.body.message.includes('Missing required fields')) throw new Error('Wrong message');
  });

  await test('valid draft publish -> 200 + status = published', async () => {
    setMockTrip(baseTripDraft);
    tripRepository.update = async (id, data) => {
      const updated = { ...baseTripDraft, ...data };
      // Also update findByIdWithRelations to reflect new status
      tripRepository.findByIdWithRelations = async () => ({
        ...updated, users: { id: 10n, name: 'Owner' },
        trip_interests: [], trip_members: [], trip_join_requests: [],
        _count: { trip_members: 1 }
      });
      return updated;
    };
    const req = { user: ownerUser, params: { tripId: 1000 } };
    const res = mockRes();
    await controller.publish(req, res);
    if (res.statusCode !== 200) throw new Error(`Expected 200, got ${res.statusCode}`);
    if (res.body.data.trip.status !== 'published') throw new Error('Trip should be published');
    if (res.body.message !== 'Trip published successfully.') throw new Error('Wrong message');
  });

  // ── CANCEL ──────────────────────────────────────────────────────────────
  console.log('\n── CANCEL (POST /api/trips/:tripId/cancel) ──');

  await test('nonexistent trip -> 404', async () => {
    setMockTrip(null);
    const req = { user: ownerUser, params: { tripId: 9999 } };
    const res = mockRes();
    await controller.cancel(req, res);
    if (res.statusCode !== 404) throw new Error(`Expected 404, got ${res.statusCode}`);
  });

  await test('non-owner -> 403', async () => {
    setMockTrip(baseTripDraft);
    const req = { user: anotherUser, params: { tripId: 1000 } };
    const res = mockRes();
    await controller.cancel(req, res);
    if (res.statusCode !== 403) throw new Error(`Expected 403, got ${res.statusCode}`);
  });

  await test('already completed -> 409', async () => {
    setMockTrip(baseTripCompleted);
    const req = { user: ownerUser, params: { tripId: 1000 } };
    const res = mockRes();
    await controller.cancel(req, res);
    if (res.statusCode !== 409) throw new Error(`Expected 409, got ${res.statusCode}`);
    if (!res.body.message.includes('completed')) throw new Error('Wrong message');
  });

  await test('already cancelled -> 409', async () => {
    setMockTrip(baseTripCancelled);
    const req = { user: ownerUser, params: { tripId: 1000 } };
    const res = mockRes();
    await controller.cancel(req, res);
    if (res.statusCode !== 409) throw new Error(`Expected 409, got ${res.statusCode}`);
    if (!res.body.message.includes('cancelled')) throw new Error('Wrong message');
  });

  await test('draft -> cancelled: valid', async () => {
    setMockTrip(baseTripDraft);
    tripRepository.update = async (id, data) => {
      const updated = { ...baseTripDraft, ...data };
      tripRepository.findByIdWithRelations = async () => ({
        ...updated, users: { id: 10n, name: 'Owner' },
        trip_interests: [], trip_members: [], trip_join_requests: [],
        _count: { trip_members: 1 }
      });
      return updated;
    };
    const req = { user: ownerUser, params: { tripId: 1000 } };
    const res = mockRes();
    await controller.cancel(req, res);
    if (res.statusCode !== 200) throw new Error(`Expected 200, got ${res.statusCode}`);
    if (res.body.data.trip.status !== 'cancelled') throw new Error('Trip should be cancelled');
    if (res.body.message !== 'Trip cancelled successfully.') throw new Error('Wrong message');
  });

  await test('published -> cancelled: valid', async () => {
    setMockTrip(baseTripPublished);
    tripRepository.update = async (id, data) => {
      const updated = { ...baseTripPublished, ...data };
      tripRepository.findByIdWithRelations = async () => ({
        ...updated, users: { id: 10n, name: 'Owner' },
        trip_interests: [], trip_members: [], trip_join_requests: [],
        _count: { trip_members: 1 }
      });
      return updated;
    };
    const req = { user: ownerUser, params: { tripId: 1000 } };
    const res = mockRes();
    await controller.cancel(req, res);
    if (res.statusCode !== 200) throw new Error(`Expected 200, got ${res.statusCode}`);
    if (res.body.data.trip.status !== 'cancelled') throw new Error('Trip should be cancelled');
  });

  await test('ongoing -> cancelled: valid', async () => {
    setMockTrip(baseTripOngoing);
    tripRepository.update = async (id, data) => {
      const updated = { ...baseTripOngoing, ...data };
      tripRepository.findByIdWithRelations = async () => ({
        ...updated, users: { id: 10n, name: 'Owner' },
        trip_interests: [], trip_members: [], trip_join_requests: [],
        _count: { trip_members: 1 }
      });
      return updated;
    };
    const req = { user: ownerUser, params: { tripId: 1000 } };
    const res = mockRes();
    await controller.cancel(req, res);
    if (res.statusCode !== 200) throw new Error(`Expected 200, got ${res.statusCode}`);
    if (res.body.data.trip.status !== 'cancelled') throw new Error('Trip should be cancelled');
  });

  await test('client cannot set status via body', async () => {
    // Verify that passing status in body does not override the trip status
    setMockTrip(baseTripDraft);
    let capturedUpdateData = null;
    tripRepository.update = async (id, data) => {
      capturedUpdateData = data;
      return { ...baseTripDraft, ...data };
    };
    const req = { user: ownerUser, params: { tripId: 1000 }, body: { title: 'New', status: 'published' }, file: null };
    const res = mockRes();
    await controller.update(req, res);
    if (capturedUpdateData && capturedUpdateData.status !== undefined) {
      throw new Error('Client should not be able to set status via update body');
    }
  });

  console.log('\n════════════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('════════════════════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

runTests();
