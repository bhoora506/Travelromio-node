'use strict';

/**
 * scripts/test-endpoints-n3f.js
 *
 * Safe integration tests for N3-F endpoints (Profile Extensions).
 * Uses a mocked authentication service.
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
  throw new UnauthorizedError('Unauthenticated.');
};

const app = require('../src/app');
const PORT = 3035;
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
  console.log('  N3-F Profile Extensions Verification');
  console.log('════════════════════════════════════════════════════\n');

  server = app.listen(PORT);
  
  try {
    // ── 1. Unauthenticated Checks ──
    let res = await makeRequest('GET', '/api/profile/stats');
    if (res.status === 401) pass('GET /api/profile/stats (unauth) returns 401');
    else fail('GET /api/profile/stats (unauth)', '401', res.status);

    res = await makeRequest('GET', '/api/profile/destinations');
    if (res.status === 401) pass('GET /api/profile/destinations (unauth) returns 401');
    else fail('GET /api/profile/destinations (unauth)', '401', res.status);

    res = await makeRequest('GET', '/api/profile/availability');
    if (res.status === 401) pass('GET /api/profile/availability (unauth) returns 401');
    else fail('GET /api/profile/availability (unauth)', '401', res.status);

    // ── 2. Authenticated Checks ──
    res = await makeRequest('GET', '/api/profile/stats', { 'Authorization': 'Bearer VALID_TOKEN_USER_1' });
    if (res.status === 200 && typeof res.body.trips_count === 'number' && typeof res.body.connections_count === 'number') {
      pass('GET /api/profile/stats returns 200 with stats counts');
    } else {
      fail('GET /api/profile/stats', '200 with stats', res.status);
    }

    res = await makeRequest('GET', '/api/profile/destinations', { 'Authorization': 'Bearer VALID_TOKEN_USER_1' });
    if (res.status === 200 && res.body.success === true && Array.isArray(res.body.data.destinations)) {
      pass('GET /api/profile/destinations returns 200 with destinations array');
      
      // Test serialization if data exists
      if (res.body.data.destinations.length > 0) {
         const dest = res.body.data.destinations[0];
         if (typeof dest.id === 'string' && typeof dest.latitude === 'string') {
            pass('GET /api/profile/destinations serializes BigInts and Decimals correctly');
         } else {
            fail('GET /api/profile/destinations BigInt serialization', 'string id/latitude', `${typeof dest.id} ${typeof dest.latitude}`);
         }
      }
    } else {
      fail('GET /api/profile/destinations', '200 with array', res.status);
    }

    res = await makeRequest('GET', '/api/profile/availability', { 'Authorization': 'Bearer VALID_TOKEN_USER_1' });
    if (res.status === 200 && res.body.success === true && Array.isArray(res.body.data.availabilities)) {
      pass('GET /api/profile/availability returns 200 with availabilities array');
    } else {
      fail('GET /api/profile/availability', '200 with array', res.status);
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
