'use strict';

/**
 * scripts/test-endpoints-n3c.js
 *
 * Safe integration tests for N3-C endpoints (Trips & Members).
 * Uses a mocked authentication service so we don't need real tokens.
 * All DB queries run in read-only mode against the real DB.
 */

require('dotenv').config();
const http = require('http');

// MOCK AUTHENTICATION TO PREVENT DB WRITES
const authService = require('../src/services/authService');
const { UnauthorizedError } = authService;
authService.verifySanctumToken = async (authHeader) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Unauthenticated.');
  }
  const tokenStr = authHeader.split(' ')[1];
  if (tokenStr === 'VALID_TOKEN_USER_1') {
    return { id: BigInt(1), name: 'Test User 1', email: 'test1@example.com' };
  }
  if (tokenStr === 'VALID_TOKEN_USER_2') {
    return { id: BigInt(2), name: 'Test User 2', email: 'test2@example.com' };
  }
  throw new UnauthorizedError('Unauthenticated.');
};

const app = require('../src/app');
const PORT = 3032;
let server;

let passed = 0;
let failed = 0;

function pass(name) {
  console.log(`  ✅ ${name}`);
  passed++;
}

function fail(name, expected, actual) {
  console.log(`  ❌ ${name}`);
  console.log(`     Expected: ${expected}`);
  console.log(`     Actual:   ${actual}`);
  failed++;
}

function makeRequest(method, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: PORT,
      path,
      method,
      headers
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = body ? JSON.parse(body) : null;
          resolve({ status: res.statusCode, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('\n════════════════════════════════════════════════════');
  console.log('  N3-C Trip Endpoints Verification');
  console.log('════════════════════════════════════════════════════\n');

  server = app.listen(PORT);
  
  try {
    // ── 1. GET /api/trips (Discovery) Unauthenticated ──
    let res = await makeRequest('GET', '/api/trips');
    if (res.status === 401) {
      pass('GET /api/trips (unauth) returns 401');
    } else {
      fail('GET /api/trips (unauth)', '401', res.status);
    }

    // ── 2. GET /api/trips (Discovery) Authenticated ──
    res = await makeRequest('GET', '/api/trips?page=1&per_page=5', { 'Authorization': 'Bearer VALID_TOKEN_USER_1' });
    if (res.status === 200 && res.body.success === true && res.body.data.pagination) {
      pass('GET /api/trips returns 200 and pagination data');
    } else {
      fail('GET /api/trips', '200 with pagination', res.status);
    }

    // ── 3. GET /api/my/trips ──
    res = await makeRequest('GET', '/api/my/trips', { 'Authorization': 'Bearer VALID_TOKEN_USER_1' });
    if (res.status === 200 && Array.isArray(res.body.data.items)) {
      pass('GET /api/my/trips returns 200 and items array');
    } else {
      fail('GET /api/my/trips', '200 with items', res.status);
    }

    // ── 4. GET /api/my/joined-trips ──
    res = await makeRequest('GET', '/api/my/joined-trips', { 'Authorization': 'Bearer VALID_TOKEN_USER_1' });
    if (res.status === 200 && Array.isArray(res.body.data.items)) {
      pass('GET /api/my/joined-trips returns 200 and items array');
    } else {
      fail('GET /api/my/joined-trips', '200 with items', res.status);
    }

    // ── 5. GET /api/trips/:id ──
    // Get a trip ID from discovery to test details
    let tripId = '99999999999';
    if (res.body.data.items.length > 0) {
      tripId = res.body.data.items[0].id;
    } else {
      // Try discovery
      const disc = await makeRequest('GET', '/api/trips', { 'Authorization': 'Bearer VALID_TOKEN_USER_1' });
      if (disc.body.data.items.length > 0) {
        tripId = disc.body.data.items[0].id;
      }
    }

    res = await makeRequest('GET', `/api/trips/${tripId}`, { 'Authorization': 'Bearer VALID_TOKEN_USER_1' });
    // Note: status could be 200 or 403 or 404 depending on the exact DB state (whether trip 999999 exists or we found one).
    // The important part is it doesn't crash 500.
    if ([200, 403, 404].includes(res.status)) {
      pass(`GET /api/trips/${tripId} handled safely (Status: ${res.status})`);
    } else {
      fail(`GET /api/trips/${tripId}`, '200, 403, or 404', res.status);
    }

    // ── 6. GET /api/trips/:id/members ──
    res = await makeRequest('GET', `/api/trips/${tripId}/members`, { 'Authorization': 'Bearer VALID_TOKEN_USER_1' });
    if ([200, 403, 404].includes(res.status)) {
      pass(`GET /api/trips/${tripId}/members handled safely (Status: ${res.status})`);
    } else {
      fail(`GET /api/trips/${tripId}/members`, '200, 403, or 404', res.status);
    }

    // ── 7. VALIDATION REJECTIONS (422) ──
    res = await makeRequest('GET', '/api/trips?page=-1', { 'Authorization': 'Bearer VALID_TOKEN_USER_1' });
    if (res.status === 422 && res.body.errors.page) {
      pass('GET /api/trips?page=-1 returns 422 validation error');
    } else {
      fail('GET /api/trips?page=-1', '422', res.status);
    }
    
    res = await makeRequest('GET', '/api/trips?sort=invalid_column', { 'Authorization': 'Bearer VALID_TOKEN_USER_1' });
    if (res.status === 422 && res.body.errors.sort) {
      pass('GET /api/trips?sort=invalid_column returns 422 validation error');
    } else {
      fail('GET /api/trips?sort=invalid_column', '422', res.status);
    }

  } catch (err) {
    console.error('Test execution failed:', err);
    failed++;
  } finally {
    server.close();
  }

  console.log('\n════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('════════════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

runTests().catch(console.error);
