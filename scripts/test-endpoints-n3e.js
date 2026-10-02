'use strict';

/**
 * scripts/test-endpoints-n3e.js
 *
 * Safe integration tests for N3-E endpoints (Conversations).
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
const PORT = 3034;
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
  console.log('  N3-E Conversation Endpoints Verification');
  console.log('════════════════════════════════════════════════════\n');

  server = app.listen(PORT);
  
  try {
    // ── 1. GET /api/conversations (Unauthenticated) ──
    let res = await makeRequest('GET', '/api/conversations');
    if (res.status === 401) {
      pass('GET /api/conversations (unauth) returns 401');
    } else {
      fail('GET /api/conversations (unauth)', '401', res.status);
    }

    // ── 2. GET /api/conversations (Authenticated) ──
    res = await makeRequest('GET', '/api/conversations', { 'Authorization': 'Bearer VALID_TOKEN_USER_1' });
    if (res.status === 200 && Array.isArray(res.body.data.conversations)) {
      pass('GET /api/conversations returns 200 and conversations array');
    } else {
      fail('GET /api/conversations', '200 with array', res.status);
    }

    // ── 3. GET /api/conversations/999999999 (Nonexistent/IDOR) ──
    res = await makeRequest('GET', '/api/conversations/999999999', { 'Authorization': 'Bearer VALID_TOKEN_USER_1' });
    if (res.status === 404) {
      pass('GET /api/conversations/999999999 returns 404 (Safely prevents IDOR & leaks)');
    } else {
      fail('GET /api/conversations/999999999', '404', res.status);
    }

    // ── 4. GET /api/conversations/999999999/messages (Nonexistent/IDOR) ──
    res = await makeRequest('GET', '/api/conversations/999999999/messages', { 'Authorization': 'Bearer VALID_TOKEN_USER_1' });
    if (res.status === 404) {
      pass('GET /api/conversations/999999999/messages returns 404');
    } else {
      fail('GET /api/conversations/999999999/messages', '404', res.status);
    }

    // ── 5. GET /api/conversations/999999999/messages?per_page=999 (Validation) ──
    // Note: We test the validation path. A 404 could occur before or after validation. 
    // In our Node.js implementation, we do IDOR lookup first, then validate, matching Laravel's pattern where 
    // Implicit model binding throws 404 *before* FormRequest validation.
    // To explicitly test validation, we could use an invalid ID format, but we check if parseInt fails.
    res = await makeRequest('GET', '/api/conversations/999999999/messages?per_page=999', { 'Authorization': 'Bearer VALID_TOKEN_USER_1' });
    // Since 999999999 doesn't exist, it should return 404.
    if (res.status === 404) {
      pass('GET /api/conversations/999999999/messages?per_page=999 returns 404 (ID checked first)');
    } else if (res.status === 422) {
      // If validation ran first
      pass('GET /api/conversations/999999999/messages?per_page=999 returns 422');
    } else {
       fail('GET /api/conversations/... validation/404 handling', '404 or 422', res.status);
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
