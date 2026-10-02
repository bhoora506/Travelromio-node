'use strict';

/**
 * scripts/test-endpoints-n3d.js
 *
 * Safe integration tests for N3-D endpoints (Companions & Connections).
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
  throw new UnauthorizedError('Unauthenticated.');
};

const app = require('../src/app');
const PORT = 3033;
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
  console.log('  N3-D Companion & Connection Endpoints Verification');
  console.log('════════════════════════════════════════════════════\n');

  server = app.listen(PORT);
  
  try {
    // ── 1. GET /api/companions (Unauthenticated) ──
    let res = await makeRequest('GET', '/api/companions');
    if (res.status === 401) {
      pass('GET /api/companions (unauth) returns 401');
    } else {
      fail('GET /api/companions (unauth)', '401', res.status);
    }

    // ── 2. GET /api/companions (Authenticated) ──
    res = await makeRequest('GET', '/api/companions?page=1', { 'Authorization': 'Bearer VALID_TOKEN_USER_1' });
    if (res.status === 200 && res.body.success === true && res.body.data.pagination) {
      pass('GET /api/companions returns 200 and pagination data');
    } else {
      fail('GET /api/companions', '200 with pagination', res.status);
    }

    // ── 3. GET /api/companions (Validation Failure) ──
    res = await makeRequest('GET', '/api/companions?page=-1', { 'Authorization': 'Bearer VALID_TOKEN_USER_1' });
    if (res.status === 422 && res.body.errors.page) {
      pass('GET /api/companions?page=-1 returns 422 validation error');
    } else {
      fail('GET /api/companions?page=-1', '422', res.status);
    }

    // ── 4. GET /api/connections ──
    res = await makeRequest('GET', '/api/connections', { 'Authorization': 'Bearer VALID_TOKEN_USER_1' });
    if (res.status === 200 && Array.isArray(res.body.data.items)) {
      pass('GET /api/connections returns 200 and items array');
    } else {
      fail('GET /api/connections', '200 with items', res.status);
    }

    // ── 5. GET /api/connections/received ──
    res = await makeRequest('GET', '/api/connections/received', { 'Authorization': 'Bearer VALID_TOKEN_USER_1' });
    if (res.status === 200 && Array.isArray(res.body.data.items)) {
      pass('GET /api/connections/received returns 200 and items array');
    } else {
      fail('GET /api/connections/received', '200 with items', res.status);
    }

    // ── 6. GET /api/connections/sent ──
    res = await makeRequest('GET', '/api/connections/sent', { 'Authorization': 'Bearer VALID_TOKEN_USER_1' });
    if (res.status === 200 && Array.isArray(res.body.data.items)) {
      pass('GET /api/connections/sent returns 200 and items array');
    } else {
      fail('GET /api/connections/sent', '200 with items', res.status);
    }

    // ── 7. Connections Validation Failure ──
    res = await makeRequest('GET', '/api/connections/sent?per_page=999', { 'Authorization': 'Bearer VALID_TOKEN_USER_1' });
    if (res.status === 422 && res.body.errors.per_page) {
      pass('GET /api/connections/sent?per_page=999 returns 422 validation error');
    } else {
      fail('GET /api/connections/sent?per_page=999', '422', res.status);
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
