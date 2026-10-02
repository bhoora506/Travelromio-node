'use strict';

/**
 * scripts/test-endpoints-n3h.js
 *
 * Safe integration/unit tests for N3-H mutation endpoints.
 * Mocks authentication and the repositories to prevent shared DB mutations.
 */

require('dotenv').config();
const http = require('http');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

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

// MOCK REPOSITORIES
const profileRepository = require('../src/repositories/profileRepository');
const userInterestRepository = require('../src/repositories/userInterestRepository');
const interestRepository = require('../src/repositories/interestRepository');
const userRepository = require('../src/repositories/userRepository');
const deviceRepository = require('../src/repositories/deviceRepository');

let user1Profile = { user_id: BigInt(1), bio: 'initial bio' };
let user1Interests = [];
let user1Devices = [];

profileRepository.upsert = async (userId, data) => {
  user1Profile = { ...user1Profile, ...data };
};

profileRepository.findByUserId = async (userId) => {
  return user1Profile;
};

userInterestRepository.sync = async (userId, interestIds) => {
  user1Interests = interestIds;
};

interestRepository.findById = async (id) => {
  if (id === 999) return null; // simulate invalid
  return { id: BigInt(id), name: 'Test Interest', slug: 'test-interest' };
};

userRepository.findByIdWithProfileAndInterests = async (userId) => {
  return {
    id: BigInt(userId),
    name: 'Test User 1',
    user_profiles: user1Profile,
    user_interests: user1Interests.map(id => ({ interests: { id: BigInt(id), name: 'Test Interest', slug: 'test-interest' } }))
  };
};

deviceRepository.upsert = async (userId, fcmToken, platform) => {
  const existing = user1Devices.find(d => d.fcm_token === fcmToken);
  if (existing) {
    existing.platform = platform;
  } else {
    user1Devices.push({ user_id: BigInt(userId), fcm_token: fcmToken, platform });
  }
};

deviceRepository.removeByTokenAndUser = async (userId, fcmToken) => {
  user1Devices = user1Devices.filter(d => d.fcm_token !== fcmToken);
};

// Boot the server
const app = require('../src/app');
const PORT = 3001;
const server = http.createServer(app);

// Simple test framework
let passed = 0;
let failed = 0;

function pass(msg) {
  console.log(`  ✅ ${msg}`);
  passed++;
}

function fail(msg, expected, actual) {
  console.log(`  ❌ ${msg}`);
  console.log(`     Expected: ${expected}`);
  console.log(`     Actual:   ${actual}`);
  failed++;
}

function makeRequest(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(body ? { 'Content-Length': Buffer.byteLength(typeof body === 'string' ? body : JSON.stringify(body)) } : {}),
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

function makeMultipartRequest(method, reqPath, headers = {}, formData) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: PORT,
      path: reqPath,
      method: method,
      headers: {
        ...headers,
        ...formData.getHeaders(),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    formData.pipe(req);
  });
}

// Run tests
async function runTests() {
  server.listen(PORT, async () => {
    console.log(`\n════════════════════════════════════════════════════`);
    console.log(`  N3-H Profile Core Endpoints Verification (Mocked DB)`);
    console.log(`════════════════════════════════════════════════════\n`);

    try {
      console.log(`── Profile Update ──`);
      
      let res = await makeRequest('PUT', '/api/profile');
      if (res.status === 401) pass('Unauthenticated PUT /api/profile returns 401');
      else fail('Unauthenticated PUT /api/profile', '401', res.status);

      res = await makeRequest('PUT', '/api/profile', { 'Authorization': 'Bearer VALID_TOKEN_USER_1' }, { bio: 'new bio', invalid_field: 'hack' });
      if (res.status === 200 && user1Profile.bio === 'new bio' && user1Profile.invalid_field === undefined) pass('Authenticated profile update ignores unexpected fields');
      else fail('Authenticated profile update', '200 and unexpected field ignored', res.status + ' bio: ' + user1Profile.bio + ' invalid_field: ' + user1Profile.invalid_field);

      res = await makeRequest('PUT', '/api/profile', { 'Authorization': 'Bearer VALID_TOKEN_USER_1' }, { languages: 'not-array' });
      if (res.status === 422) pass('Profile update validation failure on invalid languages');
      else fail('Profile update validation on languages', '422', res.status);

      console.log(`\n── Profile Interests ──`);
      res = await makeRequest('PUT', '/api/profile/interests');
      if (res.status === 401) pass('Unauthenticated PUT /api/profile/interests returns 401');
      else fail('Unauthenticated PUT /api/profile/interests', '401', res.status);

      res = await makeRequest('PUT', '/api/profile/interests', { 'Authorization': 'Bearer VALID_TOKEN_USER_1' }, { interest_ids: [1, 2] });
      if (res.status === 200 && user1Interests.length === 2) pass('Authenticated interests sync works');
      else fail('Authenticated interests sync', '200', res.status);

      res = await makeRequest('PUT', '/api/profile/interests', { 'Authorization': 'Bearer VALID_TOKEN_USER_1' }, { interest_ids: [999] });
      if (res.status === 422) pass('Profile interests validation failure on invalid ID');
      else fail('Profile interests validation on invalid ID', '422', res.status);

      console.log(`\n── Device Token ──`);
      res = await makeRequest('POST', '/api/profile/device-token');
      if (res.status === 401) pass('Unauthenticated POST /api/profile/device-token returns 401');
      else fail('Unauthenticated POST /api/profile/device-token', '401', res.status);

      res = await makeRequest('POST', '/api/profile/device-token', { 'Authorization': 'Bearer VALID_TOKEN_USER_1' }, { fcm_token: 'test_token', platform: 'android' });
      if (res.status === 200 && user1Devices.length === 1) pass('Authenticated device token registration works');
      else fail('Authenticated device token registration', '200', res.status);

      res = await makeRequest('DELETE', '/api/profile/device-token', { 'Authorization': 'Bearer VALID_TOKEN_USER_1' }, { fcm_token: 'test_token' });
      if (res.status === 200 && user1Devices.length === 0) pass('Authenticated device token deletion works');
      else fail('Authenticated device token deletion', '200', res.status);

      console.log(`\n── Profile Photo ──`);
      res = await makeRequest('POST', '/api/profile/photo');
      if (res.status === 401) pass('Unauthenticated POST /api/profile/photo returns 401');
      else fail('Unauthenticated POST /api/profile/photo', '401', res.status);

      // We won't simulate actual file upload easily with form-data module right now without writing to disk
      // Actually we can create a dummy file for testing
      const dummyFilePath = path.join(__dirname, 'dummy.jpg');
      fs.writeFileSync(dummyFilePath, 'dummy content');
      
      const form = new FormData();
      form.append('photo', fs.createReadStream(dummyFilePath));
      
      res = await makeMultipartRequest('POST', '/api/profile/photo', { 'Authorization': 'Bearer VALID_TOKEN_USER_1' }, form);
      if (res.status === 200 && user1Profile.profile_photo_path && user1Profile.profile_photo_path.startsWith('profile-photos/')) pass('Authenticated profile photo upload works');
      else fail('Authenticated profile photo upload', '200 with path', res.status);

      res = await makeRequest('DELETE', '/api/profile/photo', { 'Authorization': 'Bearer VALID_TOKEN_USER_1' });
      if (res.status === 200 && user1Profile.profile_photo_path === null) pass('Authenticated profile photo deletion works');
      else fail('Authenticated profile photo deletion', '200 with path null', res.status);

      // Clean up uploaded files in dummy test
      if (fs.existsSync(dummyFilePath)) fs.unlinkSync(dummyFilePath);

    } catch (err) {
      console.error('Test execution failed:', err);
    } finally {
      server.close();
      console.log(`\n════════════════════════════════════════════════════`);
      console.log(`  Results: ${passed} passed, ${failed} failed`);
      console.log(`════════════════════════════════════════════════════\n`);
      process.exit(failed > 0 ? 1 : 0);
    }
  });
}

runTests();
