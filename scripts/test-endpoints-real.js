'use strict';

/**
 * scripts/test-endpoints-real.js
 *
 * Safe integration tests for N3-B endpoints.
 * Tests public endpoints and authentication rejection paths against the real DB.
 * Does NOT mock the authService.
 * Does NOT create or use fake DB data.
 */

require('dotenv').config();
const http = require('http');

const app = require('../src/app');
const PORT = 3031;
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
  console.log('  N3-B Real Integration Verification (No Mocks)');
  console.log('════════════════════════════════════════════════════\n');

  server = app.listen(PORT);
  
  try {
    // ── 1. GET /health (Public) ──
    let res = await makeRequest('GET', '/health');
    if (res.status === 200 && res.body.success === true) {
      pass('GET /health returns 200 OK');
    } else {
      fail('GET /health', '200 OK', res.status);
    }

    // ── 2. GET /api/interests (Public) ──
    res = await makeRequest('GET', '/api/interests');
    if (res.status === 200 && res.body.success === true && Array.isArray(res.body.data.interests)) {
      pass('GET /api/interests returns 200 OK with interests array');
    } else {
      fail('GET /api/interests', '200 OK with interests array', res.status);
    }

    // ── 3. GET /api/auth/me (No Header) ──
    res = await makeRequest('GET', '/api/auth/me');
    if (res.status === 401 && res.body.message === 'Unauthenticated.') {
      pass('GET /api/auth/me without header returns 401 Unauthenticated');
    } else {
      fail('GET /api/auth/me without header', '401', res.status);
    }

    // ── 4. GET /api/profile (Basic Auth) ──
    res = await makeRequest('GET', '/api/profile', { 'Authorization': 'Basic dXNlcjpwYXNz' });
    if (res.status === 401 && res.body.message === 'Unauthenticated.') {
      pass('GET /api/profile with Basic Auth returns 401');
    } else {
      fail('GET /api/profile with Basic Auth', '401', res.status);
    }

    // ── 5. GET /api/auth/me (Malformed Bearer) ──
    res = await makeRequest('GET', '/api/auth/me', { 'Authorization': 'Bearer INVALID_FORMAT' });
    if (res.status === 401 && res.body.message === 'Unauthenticated.') {
      pass('GET /api/auth/me with malformed Bearer returns 401');
    } else {
      fail('GET /api/auth/me with malformed Bearer', '401', res.status);
    }

    // ── 6. GET /api/profile (Valid Format, Invalid ID) ──
    res = await makeRequest('GET', '/api/profile', { 'Authorization': 'Bearer 999999|somerandomtoken' });
    if (res.status === 401 && res.body.message === 'Unauthenticated.') {
      pass('GET /api/profile with non-existent token ID returns 401');
    } else {
      fail('GET /api/profile with non-existent token ID', '401', res.status);
    }

    // ── 7. 404 Fallback ──
    res = await makeRequest('GET', '/api/nonexistent');
    if (res.status === 404 && res.body.message === 'Route not found') {
      pass('GET /api/nonexistent returns 404');
    } else {
      fail('GET /api/nonexistent', '404', res.status);
    }

    // Note: We cannot test a successful authenticated request without mocking 
    // because we do not have a known plaintext token for any DB record.
    console.log('\n  ⚠️  Note: Real authenticated success path skipped.');
    console.log('     Cannot test without a known plaintext token for an existing DB record.');
    console.log('     DB modification is strictly prohibited, so no test token was created.\n');

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
