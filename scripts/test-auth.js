'use strict';

/**
 * scripts/test-auth.js
 * 
 * Verifies N3-A Authentication flows deterministically without modifying 
 * the database. Uses monkey-patching to mock DB lookups.
 */

require('dotenv').config();
const crypto = require('crypto');
const authService = require('../src/services/authService');
const tokenRepository = require('../src/repositories/tokenRepository');
const userRepository = require('../src/repositories/userRepository');
const { bigIntToString } = require('../src/utils/prisma');

// Counters
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

async function assertThrows(fn, ExpectedError, name) {
  try {
    await fn();
    fail(name, ExpectedError.name, 'No error thrown');
  } catch (err) {
    if (err instanceof ExpectedError || err.name === ExpectedError.name) {
      pass(name);
    } else {
      fail(name, ExpectedError.name, err.name || err.message);
    }
  }
}

async function runTests() {
  console.log('\n════════════════════════════════════════════════════');
  console.log('  N3-A Authentication Service Verification');
  console.log('════════════════════════════════════════════════════\n');

  // MOCK SETUP
  const originalTokenFind = tokenRepository.findById;
  const originalUserFind = userRepository.findById;

  // We create a fake valid token scenario
  const fakeTokenId = '999';
  const fakePlainText = 'super_secret_token_123';
  const fakeHashed = crypto.createHash('sha256').update(fakePlainText).digest('hex');
  const fakeUserId = 42n;

  const mockTokenRecord = {
    id: BigInt(999),
    tokenable_type: 'App\\Models\\User',
    tokenable_id: fakeUserId,
    name: 'test-token',
    token: fakeHashed, // Hashed equivalent
    expires_at: null,
  };

  const mockUserRecord = {
    id: fakeUserId,
    name: 'Test Auth User',
    email: 'test@travelromio.com',
  };

  // ── 1. Malformed / Missing Header ──
  console.log('── Header Parsing ──');
  await assertThrows(() => authService.verifySanctumToken(null), authService.UnauthorizedError, 'Rejects null header');
  await assertThrows(() => authService.verifySanctumToken(''), authService.UnauthorizedError, 'Rejects empty header');
  await assertThrows(() => authService.verifySanctumToken('Bearer'), authService.UnauthorizedError, 'Rejects Bearer without token');
  await assertThrows(() => authService.verifySanctumToken('Basic dXNlcjpwYXNz'), authService.UnauthorizedError, 'Rejects non-Bearer scheme');
  await assertThrows(() => authService.verifySanctumToken('Bearer just-a-string-no-pipe'), authService.UnauthorizedError, 'Rejects token without pipe ID separator');
  await assertThrows(() => authService.verifySanctumToken('Bearer |'), authService.UnauthorizedError, 'Rejects empty token parts');
  await assertThrows(() => authService.verifySanctumToken('Bearer 999|'), authService.UnauthorizedError, 'Rejects missing plain text token');

  // ── 2. Database Mocks for Token Logic ──
  console.log('\n── Token Verification Logic ──');
  
  // Inject Mocks
  tokenRepository.findById = async (id) => {
    if (String(id) === fakeTokenId) return { ...mockTokenRecord };
    return null;
  };
  userRepository.findById = async (id) => {
    if (String(id) === String(fakeUserId)) return { ...mockUserRecord };
    return null;
  };

  await assertThrows(() => authService.verifySanctumToken('Bearer 888|sometoken'), authService.UnauthorizedError, 'Rejects nonexistent token ID');
  await assertThrows(() => authService.verifySanctumToken(`Bearer ${fakeTokenId}|wrong_secret`), authService.UnauthorizedError, 'Rejects valid ID with incorrect secret');

  // Expiration test
  tokenRepository.findById = async (id) => {
    const record = { ...mockTokenRecord };
    record.expires_at = new Date(Date.now() - 10000); // Expired 10s ago
    return record;
  };
  await assertThrows(() => authService.verifySanctumToken(`Bearer ${fakeTokenId}|${fakePlainText}`), authService.UnauthorizedError, 'Rejects expired token');

  // Tokenable Type mismatch
  tokenRepository.findById = async (id) => {
    const record = { ...mockTokenRecord };
    record.tokenable_type = 'App\\Models\\Admin'; // Wrong type
    return record;
  };
  await assertThrows(() => authService.verifySanctumToken(`Bearer ${fakeTokenId}|${fakePlainText}`), authService.UnauthorizedError, 'Rejects token for wrong polymorphic type');

  // Deleted user test
  tokenRepository.findById = async (id) => ({ ...mockTokenRecord });
  userRepository.findById = async (id) => null; // User deleted
  await assertThrows(() => authService.verifySanctumToken(`Bearer ${fakeTokenId}|${fakePlainText}`), authService.UnauthorizedError, 'Rejects valid token for deleted user');

  // ── 3. Successful Verification ──
  console.log('\n── Successful Authentication ──');
  userRepository.findById = async (id) => ({ ...mockUserRecord });
  try {
    const reqUser = await authService.verifySanctumToken(`Bearer ${fakeTokenId}|${fakePlainText}`);
    if (reqUser && reqUser.id === fakeUserId && reqUser.email === 'test@travelromio.com') {
      pass('Valid token resolves to correct user');
      if (reqUser.password === undefined && reqUser.token === undefined) {
        pass('req.user safely excludes credentials');
      } else {
        fail('req.user safety', 'No credentials', 'Exposed credentials');
      }
    } else {
      fail('Valid token resolves user', 'User object', JSON.stringify(reqUser));
    }
  } catch (err) {
    fail('Valid token verification', 'Success', err.message);
  }

  // Restore mocks
  tokenRepository.findById = originalTokenFind;
  userRepository.findById = originalUserFind;

  console.log('\n════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('════════════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

runTests().catch(console.error);
