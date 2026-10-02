'use strict';

/**
 * scripts/test-endpoints-n3i.js
 *
 * Safe integration/unit tests for N3-I mutation endpoints.
 * Calls controller methods directly with mocked req/res to avoid DB writes.
 */

require('dotenv').config();

// Mocks
const connectionRepository = require('../src/repositories/connectionRepository');
const profileRepository = require('../src/repositories/profileRepository');
const prisma = require('../src/config/database');
const controller = require('../src/controllers/connectionRequestController');

// Mock data
const user1 = { id: 1n, name: 'Alice' };
const user2 = { id: 2n, name: 'Bob' };
const user3 = { id: 3n, name: 'Charlie' };
const user4 = { id: 4n, name: 'David' };

const profile2 = { user_id: 2n, is_discoverable: 1, profile_photo_path: null };
const profileHidden = { user_id: 3n, is_discoverable: 0, profile_photo_path: null };

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
  return res;
}

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

async function runTests() {
  console.log('\n════════════════════════════════════════════════════');
  console.log('  N3-I Connection Mutations (Mocked DB, Direct Controller Calls)');
  console.log('════════════════════════════════════════════════════\n');

  // Override Prisma user findUnique for store validation
  const originalUsersFindUnique = prisma.users.findUnique;
  prisma.users.findUnique = async ({ where }) => {
    if (where.id === 2n || where.id === 3n) return { id: where.id };
    return null;
  };

  // Override profile find
  profileRepository.findByUserId = async (id) => {
    if (id === 2 || id === 2n) return profile2;
    if (id === 3 || id === 3n) return profileHidden;
    return null;
  };

  console.log('── CREATE (POST /api/connections) ──');

  await test('missing/invalid recipient payload -> 422', async () => {
    const req = { user: user1, body: {} };
    const res = mockRes();
    await controller.store(req, res);
    if (res.statusCode !== 422) throw new Error(`Expected 422, got ${res.statusCode}`);
    if (!res.body.errors.recipient_id) throw new Error('Expected recipient_id error');

    const req2 = { user: user1, body: { recipient_id: 999 } };
    const res2 = mockRes();
    await controller.store(req2, res2);
    if (res2.statusCode !== 422) throw new Error(`Expected 422 for invalid user, got ${res2.statusCode}`);
  });

  await test('self-request behavior -> 409', async () => {
    prisma.users.findUnique = async () => ({ id: 1n });
    const req = { user: user1, body: { recipient_id: 1 } };
    const res = mockRes();
    await controller.store(req, res);
    if (res.statusCode !== 409) throw new Error(`Expected 409, got ${res.statusCode}`);
    if (!res.body.message.includes('yourself')) throw new Error('Wrong message');
    
    // restore
    prisma.users.findUnique = async ({ where }) => {
      if (where.id === 2n || where.id === 3n) return { id: where.id };
      return null;
    };
  });

  await test('non-discoverable recipient behavior -> 404', async () => {
    const req = { user: user1, body: { recipient_id: 3 } };
    const res = mockRes();
    await controller.store(req, res);
    if (res.statusCode !== 404) throw new Error(`Expected 404, got ${res.statusCode}`);
  });

  await test('duplicate pending request -> 409', async () => {
    connectionRepository.findPendingOrAcceptedBetweenUsers = async () => [
      { id: 100n, requester_id: 1n, recipient_id: 2n, status: 'pending' }
    ];
    const req = { user: user1, body: { recipient_id: 2 } };
    const res = mockRes();
    await controller.store(req, res);
    if (res.statusCode !== 409) throw new Error(`Expected 409, got ${res.statusCode}`);
  });

  await test('reverse-direction pending request -> 409', async () => {
    connectionRepository.findPendingOrAcceptedBetweenUsers = async () => [
      { id: 101n, requester_id: 2n, recipient_id: 1n, status: 'pending' }
    ];
    const req = { user: user1, body: { recipient_id: 2 } };
    const res = mockRes();
    await controller.store(req, res);
    if (res.statusCode !== 409) throw new Error(`Expected 409, got ${res.statusCode}`);
  });

  await test('already accepted behavior -> 409', async () => {
    connectionRepository.findPendingOrAcceptedBetweenUsers = async () => [
      { id: 102n, requester_id: 1n, recipient_id: 2n, status: 'accepted' }
    ];
    const req = { user: user1, body: { recipient_id: 2 } };
    const res = mockRes();
    await controller.store(req, res);
    if (res.statusCode !== 409) throw new Error(`Expected 409, got ${res.statusCode}`);
  });

  await test('valid request (and re-request after rejection/cancel)', async () => {
    connectionRepository.findPendingOrAcceptedBetweenUsers = async () => [];
    connectionRepository.create = async (data) => ({
      id: 200n,
      ...data,
      created_at: new Date(),
      updated_at: new Date()
    });
    
    const originalCRFindUnique = prisma.connection_requests.findUnique;
    prisma.connection_requests.findUnique = async () => ({
      id: 200n, status: 'pending', requester_id: 1n, recipient_id: 2n,
      users_connection_requests_requester_idTousers: { id: 1n, name: 'Alice', user_profiles: null },
      users_connection_requests_recipient_idTousers: { id: 2n, name: 'Bob', user_profiles: null }
    });

    const req = { user: user1, body: { recipient_id: 2 } };
    const res = mockRes();
    await controller.store(req, res);
    
    if (res.statusCode !== 201) throw new Error(`Expected 201, got ${res.statusCode}`);
    if (res.body.data.connection_request.status !== 'pending') throw new Error('Not pending');

    prisma.connection_requests.findUnique = originalCRFindUnique;
  });

  console.log('\n── ACCEPT (POST /api/connections/:id/accept) ──');

  const pendingRequest = { id: 300n, requester_id: 1n, recipient_id: 2n, status: 'pending' };
  
  await test('nonexistent request -> 404', async () => {
    connectionRepository.findById = async () => null;
    const req = { user: user2, params: { connectionRequestId: 999 } };
    const res = mockRes();
    await controller.accept(req, res);
    if (res.statusCode !== 404) throw new Error(`Expected 404, got ${res.statusCode}`);
  });

  await test('unauthorized user (IDOR) -> 403', async () => {
    connectionRepository.findById = async () => pendingRequest;
    
    prisma.$transaction = async (callback) => callback({ isTxMock: true });
    connectionRepository.findByIdForUpdate = async () => pendingRequest;

    const req = { user: user4, params: { connectionRequestId: 300 } };
    const res = mockRes();
    await controller.accept(req, res);
    if (res.statusCode !== 403) throw new Error(`Expected 403, got ${res.statusCode}`);
  });

  await test('wrong current state -> 409', async () => {
    const rejectedReq = { ...pendingRequest, status: 'rejected' };
    connectionRepository.findById = async () => rejectedReq;
    connectionRepository.findByIdForUpdate = async () => rejectedReq;
    
    const req = { user: user2, params: { connectionRequestId: 300 } };
    const res = mockRes();
    await controller.accept(req, res);
    if (res.statusCode !== 409) throw new Error(`Expected 409, got ${res.statusCode}`);
  });

  await test('valid recipient acceptance & concurrency/locking behavior', async () => {
    connectionRepository.findById = async () => pendingRequest;
    let locked = false;
    
    prisma.$transaction = async (callback) => callback({ isTxMock: true });
    connectionRepository.findByIdForUpdate = async (id, tx) => {
      if (tx && tx.isTxMock) locked = true;
      return pendingRequest;
    };
    connectionRepository.updateStatus = async (id, status, tx) => ({ ...pendingRequest, status });

    const originalCRFindUnique = prisma.connection_requests.findUnique;
    prisma.connection_requests.findUnique = async () => ({
      ...pendingRequest, status: 'accepted',
      users_connection_requests_requester_idTousers: { id: 1n, name: 'Alice' },
      users_connection_requests_recipient_idTousers: { id: 2n, name: 'Bob' }
    });

    const req = { user: user2, params: { connectionRequestId: 300 } };
    const res = mockRes();
    await controller.accept(req, res);

    if (res.statusCode !== 200) throw new Error(`Expected 200, got ${res.statusCode}`);
    if (res.body.data.connection_request.status !== 'accepted') throw new Error('Not accepted');
    if (!locked) throw new Error('findByIdForUpdate was not called inside transaction');
    
    prisma.connection_requests.findUnique = originalCRFindUnique;
  });

  console.log('\n── REJECT (POST /api/connections/:id/reject) ──');

  await test('unauthorized requester/other user (IDOR) -> 403', async () => {
    connectionRepository.findById = async () => pendingRequest;
    const req = { user: user1, params: { connectionRequestId: 300 } };
    const res = mockRes();
    await controller.reject(req, res);
    if (res.statusCode !== 403) throw new Error(`Expected 403, got ${res.statusCode}`);
  });

  await test('valid recipient rejection', async () => {
    connectionRepository.findById = async () => pendingRequest;
    connectionRepository.updateStatus = async () => ({ ...pendingRequest, status: 'rejected' });
    
    const originalCRFindUnique = prisma.connection_requests.findUnique;
    prisma.connection_requests.findUnique = async () => ({
      ...pendingRequest, status: 'rejected',
      users_connection_requests_requester_idTousers: { id: 1n, name: 'Alice' },
      users_connection_requests_recipient_idTousers: { id: 2n, name: 'Bob' }
    });

    const req = { user: user2, params: { connectionRequestId: 300 } };
    const res = mockRes();
    await controller.reject(req, res);

    if (res.statusCode !== 200) throw new Error(`Expected 200, got ${res.statusCode}`);
    if (res.body.data.connection_request.status !== 'rejected') throw new Error('Not rejected');
    
    prisma.connection_requests.findUnique = originalCRFindUnique;
  });

  console.log('\n── CANCEL (POST /api/connections/:id/cancel) ──');

  await test('unauthorized recipient/other user (IDOR) -> 403', async () => {
    connectionRepository.findById = async () => pendingRequest;
    const req = { user: user2, params: { connectionRequestId: 300 } };
    const res = mockRes();
    await controller.cancel(req, res);
    if (res.statusCode !== 403) throw new Error(`Expected 403, got ${res.statusCode}`);
  });

  await test('valid requester cancellation', async () => {
    connectionRepository.findById = async () => pendingRequest;
    connectionRepository.updateStatus = async () => ({ ...pendingRequest, status: 'cancelled' });
    
    const originalCRFindUnique = prisma.connection_requests.findUnique;
    prisma.connection_requests.findUnique = async () => ({
      ...pendingRequest, status: 'cancelled',
      users_connection_requests_requester_idTousers: { id: 1n, name: 'Alice' },
      users_connection_requests_recipient_idTousers: { id: 2n, name: 'Bob' }
    });

    const req = { user: user1, params: { connectionRequestId: 300 } };
    const res = mockRes();
    await controller.cancel(req, res);

    if (res.statusCode !== 200) throw new Error(`Expected 200, got ${res.statusCode}`);
    if (res.body.data.connection_request.status !== 'cancelled') throw new Error('Not cancelled');
    
    prisma.connection_requests.findUnique = originalCRFindUnique;
  });

  console.log('\n════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('════════════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

runTests();
