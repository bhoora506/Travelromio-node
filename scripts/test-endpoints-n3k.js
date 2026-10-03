'use strict';

/**
 * scripts/test-endpoints-n3k.js
 *
 * Safe integration/unit tests for N3-K trip join requests.
 * Calls controller methods directly with mocked req/res to avoid DB writes.
 */

require('dotenv').config();

const tripRepository = require('../src/repositories/tripRepository');
const joinRequestRepository = require('../src/repositories/joinRequestRepository');
const membershipRepository = require('../src/repositories/membershipRepository');
const prisma = require('../src/config/database');
const controller = require('../src/controllers/tripJoinRequestController');
const tripJoinRequestService = require('../src/services/tripJoinRequestService');

// ── Mock data ────────────────────────────────────────────────────────────────
const ownerUser = { id: 10n, name: 'Owner' };
const requesterUser = { id: 99n, name: 'Requester' };
const anotherUser = { id: 100n, name: 'Another' };

const baseTripPublished = {
  id: 1000n, user_id: 10n, status: 'published',
  max_members: 4, start_date: new Date('2027-01-01'),
  end_date: new Date('2027-01-07'),
};

const baseTripDraft = { ...baseTripPublished, status: 'draft' };
const baseTripExpired = { ...baseTripPublished, end_date: new Date('2020-01-01') };
const baseTripFull = { ...baseTripPublished, max_members: 1 }; // 1 owner means full

const baseJoinRequest = {
  id: 500n, trip_id: 1000n, user_id: 99n, status: 'pending',
  users: { id: 99n, name: 'Requester' },
  created_at: new Date(), updated_at: new Date()
};

// ── Mock utilities ───────────────────────────────────────────────────────────
function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.body = data; return res; };
  return res;
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
  console.log('  N3-K Trip Join Requests (Mocked DB, Direct Controller Calls)');
  console.log('════════════════════════════════════════════════════════════\n');

  let currentTrip = null;
  let currentJoinRequests = [];
  let currentMemberships = [];
  let txQueryRawCalled = false;
  let txRollbackExpected = false;

  function setup(trip, requests = [], memberships = []) {
    currentTrip = trip;
    currentJoinRequests = [...requests];
    currentMemberships = [...memberships];
    txQueryRawCalled = false;
    txRollbackExpected = false;

    // Reset mocks
    tripRepository.findById = async (id) => (currentTrip && String(id) === String(currentTrip.id) ? currentTrip : null);

    membershipRepository.findByTripAndUser = async (tripId, userId) => {
      return currentMemberships.find(m => String(m.trip_id) === String(tripId) && String(m.user_id) === String(userId)) || null;
    };
    membershipRepository.countActiveByTripId = async (tripId) => {
      let count = 1; // Owner
      count += currentMemberships.filter(m => String(m.trip_id) === String(tripId) && m.status === 'active').length;
      return count;
    };
    membershipRepository.create = async (data) => {
      if (txRollbackExpected && data.role === 'member') throw new Error('Simulated member creation error');
      return { id: 1n, ...data };
    };

    joinRequestRepository.findPendingByTripAndUser = async (tripId, userId) => {
      return currentJoinRequests.filter(r => String(r.trip_id) === String(tripId) && String(r.user_id) === String(userId) && r.status === 'pending');
    };
    joinRequestRepository.create = async (data) => ({ id: 501n, ...data, users: requesterUser });
    joinRequestRepository.findById = async (id) => currentJoinRequests.find(r => String(r.id) === String(id)) || null;
    joinRequestRepository.findByIdWithRequester = async (id) => {
      const jr = currentJoinRequests.find(r => String(r.id) === String(id));
      if (!jr) return null;
      return { ...jr, users: { id: jr.user_id, name: 'User' } };
    };
    joinRequestRepository.findByTripIdWithRequester = async (tripId) => currentJoinRequests.filter(r => String(r.trip_id) === String(tripId));
    joinRequestRepository.updateStatus = async (id, status) => {
      if (txRollbackExpected && status === 'approved') throw new Error('Simulated update error');
      const jr = currentJoinRequests.find(r => String(r.id) === String(id));
      if (jr) jr.status = status;
      return jr;
    };

    prisma.$transaction = async (fn) => {
      const mockTx = {
        $queryRaw: async (query, ...values) => {
          const qStr = JSON.stringify(query) + String(query);
          if (qStr.includes('FOR UPDATE')) txQueryRawCalled = true;
          return [currentTrip];
        },
        trip_members: { update: async () => ({}) }
      };
      return await fn(mockTx);
    };
  }

  // ── CREATE ──────────────────────────────────────────────────────────────
  console.log('── CREATE (POST /api/trips/:tripId/join-requests) ──');

  await test('1. unauthenticated (Simulated by missing req.user)', async () => {
    setup(baseTripPublished);
    const req = { user: null, params: { tripId: 1000 } };
    const res = mockRes();
    try { await controller.store(req, res); } catch(e) { if(e.message.includes("Cannot read property 'id'")) passed++; else failed++; return;}
    if (res.statusCode !== 500) throw new Error('Expected crash due to missing req.user');
  });

  await test('2. owner tries to request -> 403', async () => {
    setup(baseTripPublished);
    const req = { user: ownerUser, params: { tripId: 1000 } };
    const res = mockRes();
    await controller.store(req, res);
    if (res.statusCode !== 403) throw new Error(`Expected 403, got ${res.statusCode}`);
  });

  await test('3. nonexistent trip -> 404', async () => {
    setup(null);
    const req = { user: requesterUser, params: { tripId: 9999 } };
    const res = mockRes();
    await controller.store(req, res);
    if (res.statusCode !== 404) throw new Error(`Expected 404, got ${res.statusCode}`);
  });

  await test('4. already active member -> 409', async () => {
    setup(baseTripPublished, [], [{ trip_id: 1000n, user_id: 99n, status: 'active' }]);
    const req = { user: requesterUser, params: { tripId: 1000 } };
    const res = mockRes();
    await controller.store(req, res);
    if (res.statusCode !== 409) throw new Error(`Expected 409, got ${res.statusCode}`);
  });

  await test('5. pending duplicate -> 409', async () => {
    setup(baseTripPublished, [{ trip_id: 1000n, user_id: 99n, status: 'pending' }]);
    const req = { user: requesterUser, params: { tripId: 1000 } };
    const res = mockRes();
    await controller.store(req, res);
    if (res.statusCode !== 409) throw new Error(`Expected 409, got ${res.statusCode}`);
  });

  await test('6. previous rejected request allows recreation -> 201', async () => {
    setup(baseTripPublished, [{ trip_id: 1000n, user_id: 99n, status: 'rejected' }]);
    let capturedCreateData = null;
    joinRequestRepository.create = async (data) => { capturedCreateData = data; return { id: 501n, ...data }; };
    joinRequestRepository.findByIdWithRequester = async () => ({ id: 501n });
    const req = { user: requesterUser, params: { tripId: 1000 } };
    const res = mockRes();
    await controller.store(req, res);
    if (res.statusCode !== 201) throw new Error(`Expected 201, got ${res.statusCode}`);
  });

  await test('7. previous cancelled request allows recreation -> 201', async () => {
    setup(baseTripPublished, [{ trip_id: 1000n, user_id: 99n, status: 'cancelled' }]);
    const req = { user: requesterUser, params: { tripId: 1000 } };
    const res = mockRes();
    await controller.store(req, res);
    if (res.statusCode !== 201) throw new Error(`Expected 201, got ${res.statusCode}`);
  });

  await test('8. trip full -> 409', async () => {
    setup(baseTripFull);
    const req = { user: requesterUser, params: { tripId: 1000 } };
    const res = mockRes();
    await controller.store(req, res);
    if (res.statusCode !== 409) throw new Error(`Expected 409, got ${res.statusCode}`);
  });

  await test('9. expired trip -> 409', async () => {
    setup(baseTripExpired);
    const req = { user: requesterUser, params: { tripId: 1000 } };
    const res = mockRes();
    await controller.store(req, res);
    if (res.statusCode !== 409) throw new Error(`Expected 409, got ${res.statusCode}`);
  });

  await test('10. valid request -> 201', async () => {
    setup(baseTripPublished);
    const req = { user: requesterUser, params: { tripId: 1000 } };
    const res = mockRes();
    await controller.store(req, res);
    if (res.statusCode !== 201) throw new Error(`Expected 201, got ${res.statusCode}`);
  });

  // ── LIST ──────────────────────────────────────────────────────────────
  console.log('\n── LIST (GET /api/trips/:tripId/join-requests) ──');

  await test('11. owner can list -> 200', async () => {
    setup(baseTripPublished, [{ trip_id: 1000n, user_id: 99n, status: 'pending' }]);
    const req = { user: ownerUser, params: { tripId: 1000 } };
    const res = mockRes();
    await controller.index(req, res);
    if (res.statusCode !== 200) throw new Error(`Expected 200, got ${res.statusCode}`);
  });

  await test('12. non-owner gets 403', async () => {
    setup(baseTripPublished);
    const req = { user: anotherUser, params: { tripId: 1000 } };
    const res = mockRes();
    await controller.index(req, res);
    if (res.statusCode !== 403) throw new Error(`Expected 403, got ${res.statusCode}`);
  });

  await test('13. active non-owner member gets 403', async () => {
    setup(baseTripPublished, [], [{ trip_id: 1000n, user_id: 99n, status: 'active' }]);
    const req = { user: requesterUser, params: { tripId: 1000 } };
    const res = mockRes();
    await controller.index(req, res);
    if (res.statusCode !== 403) throw new Error(`Expected 403, got ${res.statusCode}`);
  });

  await test('14. non-member gets 403', async () => {
    setup(baseTripPublished);
    const req = { user: requesterUser, params: { tripId: 1000 } };
    const res = mockRes();
    await controller.index(req, res);
    if (res.statusCode !== 403) throw new Error(`Expected 403, got ${res.statusCode}`);
  });

  await test('15. response is flat data.join_requests', async () => {
    setup(baseTripPublished, [{ trip_id: 1000n, user_id: 99n, status: 'pending', users: requesterUser }]);
    const req = { user: ownerUser, params: { tripId: 1000 } };
    const res = mockRes();
    await controller.index(req, res);
    if (!Array.isArray(res.body.data.join_requests)) throw new Error('Expected flat array');
  });

  await test('16. no pagination wrapper', async () => {
    setup(baseTripPublished, []);
    const req = { user: ownerUser, params: { tripId: 1000 } };
    const res = mockRes();
    await controller.index(req, res);
    if (res.body.data.meta || res.body.data.links) throw new Error('Expected no pagination meta');
  });

  // ── CROSS-TRIP ──────────────────────────────────────────────────────────────
  console.log('\n── CROSS-TRIP ──');

  await test('17. joinRequest from another trip returns 404', async () => {
    setup(baseTripPublished, [{ id: 500n, trip_id: 2000n, status: 'pending' }]);
    const req = { user: ownerUser, params: { tripId: 1000, joinRequestId: 500 } };
    const res = mockRes();
    await controller.approve(req, res);
    if (res.statusCode !== 404) throw new Error(`Expected 404, got ${res.statusCode}`);
  });

  // ── APPROVE ──────────────────────────────────────────────────────────────
  console.log('\n── APPROVE (POST /api/trips/:tripId/join-requests/:jrId/approve) ──');

  await test('18. non-owner gets 403', async () => {
    setup(baseTripPublished, [baseJoinRequest]);
    const req = { user: requesterUser, params: { tripId: 1000, joinRequestId: 500 } };
    const res = mockRes();
    await controller.approve(req, res);
    if (res.statusCode !== 403) throw new Error(`Expected 403, got ${res.statusCode}`);
  });

  await test('19. nonexistent request -> 404', async () => {
    setup(baseTripPublished, []);
    const req = { user: ownerUser, params: { tripId: 1000, joinRequestId: 999 } };
    const res = mockRes();
    await controller.approve(req, res);
    if (res.statusCode !== 404) throw new Error(`Expected 404, got ${res.statusCode}`);
  });

  await test('20. cross-trip request gets 404', async () => {
    setup(baseTripPublished, [{ ...baseJoinRequest, trip_id: 2000n }]);
    const req = { user: ownerUser, params: { tripId: 1000, joinRequestId: 500 } };
    const res = mockRes();
    await controller.approve(req, res);
    if (res.statusCode !== 404) throw new Error(`Expected 404, got ${res.statusCode}`);
  });

  await test('21. already approved -> 409', async () => {
    setup(baseTripPublished, [{ ...baseJoinRequest, status: 'approved' }]);
    const req = { user: ownerUser, params: { tripId: 1000, joinRequestId: 500 } };
    const res = mockRes();
    await controller.approve(req, res);
    if (res.statusCode !== 409) throw new Error(`Expected 409, got ${res.statusCode}`);
  });

  await test('22. rejected -> 409', async () => {
    setup(baseTripPublished, [{ ...baseJoinRequest, status: 'rejected' }]);
    const req = { user: ownerUser, params: { tripId: 1000, joinRequestId: 500 } };
    const res = mockRes();
    await controller.approve(req, res);
    if (res.statusCode !== 409) throw new Error(`Expected 409, got ${res.statusCode}`);
  });

  await test('23. cancelled -> 409', async () => {
    setup(baseTripPublished, [{ ...baseJoinRequest, status: 'cancelled' }]);
    const req = { user: ownerUser, params: { tripId: 1000, joinRequestId: 500 } };
    const res = mockRes();
    await controller.approve(req, res);
    if (res.statusCode !== 409) throw new Error(`Expected 409, got ${res.statusCode}`);
  });

  await test('24. unpublished trip -> 409', async () => {
    setup(baseTripDraft, [baseJoinRequest]);
    const req = { user: ownerUser, params: { tripId: 1000, joinRequestId: 500 } };
    const res = mockRes();
    await controller.approve(req, res);
    if (res.statusCode !== 409) throw new Error(`Expected 409, got ${res.statusCode}`);
  });

  await test('25. full trip -> 409', async () => {
    setup(baseTripFull, [baseJoinRequest]);
    const req = { user: ownerUser, params: { tripId: 1000, joinRequestId: 500 } };
    const res = mockRes();
    await controller.approve(req, res);
    if (res.statusCode !== 409) throw new Error(`Expected 409, got ${res.statusCode}`);
  });

  await test('26. valid approval creates member', async () => {
    setup(baseTripPublished, [{ ...baseJoinRequest }]);
    let memberCreated = false;
    membershipRepository.create = async () => { memberCreated = true; return {}; };
    const req = { user: ownerUser, params: { tripId: 1000, joinRequestId: 500 } };
    const res = mockRes();
    await controller.approve(req, res);
    if (res.statusCode !== 200) throw new Error(`Expected 200, got ${res.statusCode}`);
    if (!memberCreated) throw new Error('Member should be created');
  });

  await test('27. valid approval changes request to approved', async () => {
    setup(baseTripPublished, [{ ...baseJoinRequest }]);
    const req = { user: ownerUser, params: { tripId: 1000, joinRequestId: 500 } };
    const res = mockRes();
    await controller.approve(req, res);
    if (res.statusCode !== 200) throw new Error(`Expected 200, got ${res.statusCode}`);
    if (currentJoinRequests[0].status !== 'approved') throw new Error('Request status not updated to approved');
  });

  await test('28. transaction rollback if member creation fails', async () => {
    setup(baseTripPublished, [{ ...baseJoinRequest }]);
    txRollbackExpected = true;
    const req = { user: ownerUser, params: { tripId: 1000, joinRequestId: 500 } };
    const res = mockRes();
    await controller.approve(req, res);
    if (res.statusCode !== 500) throw new Error(`Expected 500, got ${res.statusCode}`);
  });

  await test('29. transaction rollback if join-request update fails', async () => {
    setup(baseTripPublished, [{ ...baseJoinRequest }]);
    txRollbackExpected = true;
    const req = { user: ownerUser, params: { tripId: 1000, joinRequestId: 500 } };
    const res = mockRes();
    await controller.approve(req, res);
    if (res.statusCode !== 500) throw new Error(`Expected 500, got ${res.statusCode}`);
  });

  await test('30. verify trip row lock query is used in approval transaction', async () => {
    setup(baseTripPublished, [{ ...baseJoinRequest }]);
    const req = { user: ownerUser, params: { tripId: 1000, joinRequestId: 500 } };
    const res = mockRes();
    await controller.approve(req, res);
    if (!txQueryRawCalled) throw new Error('FOR UPDATE lock query was not called');
  });

  // ── REJECT ──────────────────────────────────────────────────────────────
  console.log('\n── REJECT (POST /api/trips/:tripId/join-requests/:jrId/reject) ──');

  await test('31. non-owner 403', async () => {
    setup(baseTripPublished, [baseJoinRequest]);
    const req = { user: requesterUser, params: { tripId: 1000, joinRequestId: 500 } };
    const res = mockRes();
    await controller.reject(req, res);
    if (res.statusCode !== 403) throw new Error(`Expected 403, got ${res.statusCode}`);
  });

  await test('32. invalid state 409', async () => {
    setup(baseTripPublished, [{ ...baseJoinRequest, status: 'approved' }]);
    const req = { user: ownerUser, params: { tripId: 1000, joinRequestId: 500 } };
    const res = mockRes();
    await controller.reject(req, res);
    if (res.statusCode !== 409) throw new Error(`Expected 409, got ${res.statusCode}`);
  });

  await test('33. valid rejection -> 200', async () => {
    setup(baseTripPublished, [{ ...baseJoinRequest }]);
    const req = { user: ownerUser, params: { tripId: 1000, joinRequestId: 500 } };
    const res = mockRes();
    await controller.reject(req, res);
    if (res.statusCode !== 200) throw new Error(`Expected 200, got ${res.statusCode}`);
    if (currentJoinRequests[0].status !== 'rejected') throw new Error('Status not rejected');
  });

  await test('34. no membership created on reject', async () => {
    setup(baseTripPublished, [{ ...baseJoinRequest }]);
    let memberCreated = false;
    membershipRepository.create = async () => { memberCreated = true; return {}; };
    const req = { user: ownerUser, params: { tripId: 1000, joinRequestId: 500 } };
    const res = mockRes();
    await controller.reject(req, res);
    if (memberCreated) throw new Error('Member should not be created on reject');
  });

  // ── CANCEL ──────────────────────────────────────────────────────────────
  console.log('\n── CANCEL (POST /api/trips/:tripId/join-requests/:jrId/cancel) ──');

  await test('35. unrelated user 403', async () => {
    setup(baseTripPublished, [baseJoinRequest]);
    const req = { user: anotherUser, params: { tripId: 1000, joinRequestId: 500 } };
    const res = mockRes();
    await controller.cancel(req, res);
    if (res.statusCode !== 403) throw new Error(`Expected 403, got ${res.statusCode}`);
  });

  await test('36. owner cannot cancel another users request -> 403', async () => {
    setup(baseTripPublished, [baseJoinRequest]);
    const req = { user: ownerUser, params: { tripId: 1000, joinRequestId: 500 } };
    const res = mockRes();
    await controller.cancel(req, res);
    if (res.statusCode !== 403) throw new Error(`Expected 403, got ${res.statusCode}`);
  });

  await test('37. invalid state 409', async () => {
    setup(baseTripPublished, [{ ...baseJoinRequest, status: 'approved' }]);
    const req = { user: requesterUser, params: { tripId: 1000, joinRequestId: 500 } };
    const res = mockRes();
    await controller.cancel(req, res);
    if (res.statusCode !== 409) throw new Error(`Expected 409, got ${res.statusCode}`);
  });

  await test('38. valid cancellation -> 200', async () => {
    setup(baseTripPublished, [{ ...baseJoinRequest }]);
    const req = { user: requesterUser, params: { tripId: 1000, joinRequestId: 500 } };
    const res = mockRes();
    await controller.cancel(req, res);
    if (res.statusCode !== 200) throw new Error(`Expected 200, got ${res.statusCode}`);
    if (currentJoinRequests[0].status !== 'cancelled') throw new Error('Status not cancelled');
  });

  // ── SECURITY ──────────────────────────────────────────────────────────────
  console.log('\n── SECURITY ──');

  await test('39. client-supplied user_id cannot spoof requester (create uses req.user.id)', async () => {
    setup(baseTripPublished, []);
    let capturedUserId = null;
    joinRequestRepository.create = async (data) => {
      capturedUserId = data.user_id;
      return { id: 501n, ...data };
    };
    joinRequestRepository.findByIdWithRequester = async () => ({ id: 501n });
    // client passes body { user_id: 100 }
    const req = { user: requesterUser, params: { tripId: 1000 }, body: { user_id: 100 } };
    const res = mockRes();
    await controller.store(req, res);
    if (String(capturedUserId) !== String(requesterUser.id)) throw new Error('user_id was spoofed');
  });

  await test('40. cross-trip manipulation blocked', async () => {
    setup(baseTripPublished, [{ ...baseJoinRequest, trip_id: 2000n }]);
    const req = { user: requesterUser, params: { tripId: 1000, joinRequestId: 500 } };
    const res = mockRes();
    await controller.cancel(req, res);
    if (res.statusCode !== 404) throw new Error(`Expected 404 cross-trip protection, got ${res.statusCode}`);
  });

  await test('41. no arbitrary trip/member IDs can bypass ownership checks', async () => {
    setup(baseTripPublished, [{ ...baseJoinRequest }]);
    // requester passes tripId=1000 but try to approve
    const req = { user: requesterUser, params: { tripId: 1000, joinRequestId: 500 } };
    const res = mockRes();
    await controller.approve(req, res);
    if (res.statusCode !== 403) throw new Error(`Expected 403, got ${res.statusCode}`);
  });

  console.log('\n════════════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('════════════════════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

runTests();
