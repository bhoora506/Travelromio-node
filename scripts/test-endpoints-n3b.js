'use strict';

/**
 * scripts/test-endpoints-n3b.js
 *
 * Verifies N3-B endpoints by spinning up the Express app locally and making HTTP requests.
 * Uses monkey-patching to bypass Sanctum token DB lookups, ensuring we don't need
 * to write to the database to test authenticated endpoints.
 */

require('dotenv').config();
const http = require('http');
const assert = require('assert');

// 1. Monkey-patch authService before app is loaded
const authService = require('../src/services/authService');
const originalVerify = authService.verifySanctumToken;

// Fake User ID that exists in the database. N2-A tests showed we have users (e.g. ID 4).
// I will just use ID 4 since we know user_interests exist for user 4 from N2-C tests.
const FAKE_USER_ID = 4n; 

authService.verifySanctumToken = async (bearerHeader) => {
  if (bearerHeader === 'Bearer VALID_MOCK_TOKEN') {
    return {
      id: FAKE_USER_ID,
      name: 'Mock User',
      email: 'mock@example.com'
    };
  }
  throw new authService.UnauthorizedError();
};

// Now load the app
const app = require('../src/app');
const PORT = 3030; // Use a specific port for testing
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
  console.log('  N3-B Endpoint Verification');
  console.log('════════════════════════════════════════════════════\n');

  server = app.listen(PORT);
  
  try {
    // ── 1. GET /health ──
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
      fail('GET /api/interests', '200 OK with interests array', res.status + ' ' + JSON.stringify(res.body));
    }

    // ── 3. GET /api/auth/me (Unauthenticated) ──
    res = await makeRequest('GET', '/api/auth/me');
    if (res.status === 401 && res.body.message === 'Unauthenticated.') {
      pass('GET /api/auth/me without token returns 401');
    } else {
      fail('GET /api/auth/me without token', '401', res.status);
    }

    // ── 4. GET /api/auth/me (Authenticated) ──
    res = await makeRequest('GET', '/api/auth/me', { 'Authorization': 'Bearer VALID_MOCK_TOKEN' });
    if (res.status === 200 && res.body.success === true && res.body.data.user) {
      pass('GET /api/auth/me with valid token returns 200 OK');
      // Validate BigInt ID serialization
      if (typeof res.body.data.user.id === 'string' && res.body.data.user.id === String(FAKE_USER_ID)) {
        pass('GET /api/auth/me user.id is safely stringified BigInt');
      } else {
        fail('GET /api/auth/me user.id type', 'string ' + FAKE_USER_ID, typeof res.body.data.user.id + ' ' + res.body.data.user.id);
      }
      
      // Validate profile exclusion
      if (res.body.data.user.profile === undefined) {
        pass('GET /api/auth/me correctly excludes profile object');
      } else {
        fail('GET /api/auth/me excludes profile', 'undefined', typeof res.body.data.user.profile);
      }
      
      // Validate completion exists
      if (typeof res.body.data.user.profile_completion === 'number') {
        pass('GET /api/auth/me includes profile_completion');
      } else {
        fail('GET /api/auth/me profile_completion', 'number', typeof res.body.data.user.profile_completion);
      }

    } else {
      fail('GET /api/auth/me with valid token', '200 OK with user object', res.status + ' ' + JSON.stringify(res.body));
    }

    // ── 5. GET /api/profile (Authenticated) ──
    res = await makeRequest('GET', '/api/profile', { 'Authorization': 'Bearer VALID_MOCK_TOKEN' });
    if (res.status === 200 && res.body.success === true && res.body.data.user) {
      pass('GET /api/profile with valid token returns 200 OK');
      
      if (res.body.data.user.profile) {
        pass('GET /api/profile includes profile object');
      } else {
        fail('GET /api/profile includes profile object', 'object', typeof res.body.data.user.profile);
      }
      
      // Validate decimal parsing
      if (res.body.data.user.profile && typeof res.body.data.user.profile.preferred_budget_min === 'string') {
         pass('GET /api/profile safely stringifies Decimals');
      } else {
         fail('GET /api/profile Decimal safety', 'string', typeof res.body.data.user.profile?.preferred_budget_min);
      }
      
    } else {
      fail('GET /api/profile with valid token', '200 OK with user object', res.status + ' ' + JSON.stringify(res.body));
    }

    // ── 6. 404 Fallback ──
    res = await makeRequest('GET', '/api/nonexistent');
    if (res.status === 404 && res.body.message === 'Route not found') {
      pass('GET /api/nonexistent returns 404 correctly');
    } else {
      fail('GET /api/nonexistent', '404 Route not found', res.status);
    }

  } catch (err) {
    console.error('Test execution failed:', err);
    failed++;
  } finally {
    server.close();
    authService.verifySanctumToken = originalVerify;
  }

  console.log('\n════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('════════════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

runTests().catch(console.error);
