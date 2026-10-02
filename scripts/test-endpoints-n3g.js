'use strict';

/**
 * scripts/test-endpoints-n3g.js
 *
 * Safe integration/unit tests for N3-G mutation endpoints (Destinations & Availability).
 * Mocks authentication and the repositories to prevent shared DB mutations.
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

// MOCK REPOSITORIES
const preferredDestinationRepository = require('../src/repositories/preferredDestinationRepository');
const travelAvailabilityRepository = require('../src/repositories/travelAvailabilityRepository');

// State for mocks
let destStore = [];
let destNextId = 1;

let availStore = [];
let availNextId = 1;

// Override Destination repo
preferredDestinationRepository.getByUserId = async (userId) => {
  return destStore.filter(d => d.user_id.toString() === userId.toString());
};
preferredDestinationRepository.countByUserId = async (userId) => {
  return destStore.filter(d => d.user_id.toString() === userId.toString()).length;
};
preferredDestinationRepository.findById = async (id) => {
  return destStore.find(d => d.id.toString() === id.toString()) || null;
};
preferredDestinationRepository.create = async (userId, data) => {
  const newDest = {
    id: BigInt(destNextId++),
    user_id: BigInt(userId),
    destination: data.destination,
    place_id: data.place_id,
    latitude: data.latitude,
    longitude: data.longitude,
    created_at: new Date()
  };
  destStore.push(newDest);
  return newDest;
};
preferredDestinationRepository.update = async (id, data) => {
  const index = destStore.findIndex(d => d.id.toString() === id.toString());
  destStore[index] = {
    ...destStore[index],
    destination: data.destination,
    place_id: data.place_id,
    latitude: data.latitude,
    longitude: data.longitude
  };
  return destStore[index];
};
preferredDestinationRepository.delete = async (id) => {
  destStore = destStore.filter(d => d.id.toString() !== id.toString());
};

// Override Availability repo
travelAvailabilityRepository.getByUserId = async (userId) => {
  return availStore.filter(a => a.user_id.toString() === userId.toString());
};
travelAvailabilityRepository.findById = async (id) => {
  return availStore.find(a => a.id.toString() === id.toString()) || null;
};
travelAvailabilityRepository.create = async (userId, data) => {
  const newAvail = {
    id: BigInt(availNextId++),
    user_id: BigInt(userId),
    start_date: new Date(data.start_date),
    end_date: new Date(data.end_date),
    created_at: new Date()
  };
  availStore.push(newAvail);
  return newAvail;
};
travelAvailabilityRepository.update = async (id, data) => {
  const index = availStore.findIndex(a => a.id.toString() === id.toString());
  availStore[index] = {
    ...availStore[index],
    start_date: new Date(data.start_date),
    end_date: new Date(data.end_date)
  };
  return availStore[index];
};
travelAvailabilityRepository.delete = async (id) => {
  availStore = availStore.filter(a => a.id.toString() !== id.toString());
};


const app = require('../src/app');
const PORT = 3036;
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

function makeRequest(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: PORT,
      path,
      method,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : null;
          resolve({ status: res.statusCode, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

const defaultAuth = { 'Authorization': 'Bearer VALID_TOKEN_USER_1' };

async function runTests() {
  console.log('\n════════════════════════════════════════════════════');
  console.log('  N3-G Mutation Endpoints Verification (Mocked DB)');
  console.log('════════════════════════════════════════════════════\n');

  server = app.listen(PORT);
  
  try {
    // DESTINATIONS
    console.log('── Destinations ──');
    
    // 1. Authenticated create
    let res = await makeRequest('POST', '/api/profile/destinations', defaultAuth, {
      destination: 'Tokyo',
      place_id: 'place123',
      latitude: 35.6762,
      longitude: 139.6503
    });
    if (res.status === 201 && res.body.data.destination.destination === 'Tokyo') {
      pass('Authenticated create (returns 201 & correct data)');
    } else fail('Authenticated create', '201', res.status);

    let createdId = res.body?.data?.destination?.id;

    // 2. Validation failure
    res = await makeRequest('POST', '/api/profile/destinations', defaultAuth, {});
    if (res.status === 422) pass('Validation failure on missing destination (returns 422)');
    else fail('Validation failure', '422', res.status);

    // 3. Duplicate destination
    res = await makeRequest('POST', '/api/profile/destinations', defaultAuth, {
      destination: 'Tokyo' // duplicate string
    });
    if (res.status === 422) pass('Duplicate destination string prevented (returns 422)');
    else fail('Duplicate string', '422', res.status);

    res = await makeRequest('POST', '/api/profile/destinations', defaultAuth, {
      destination: 'Different',
      place_id: 'place123' // duplicate place_id
    });
    if (res.status === 422) pass('Duplicate place_id prevented (returns 422)');
    else fail('Duplicate place_id', '422', res.status);

    // 4. 50-destination limit
    // populate mock with 49 more (total 50)
    for (let i = 0; i < 49; i++) {
      destStore.push({ id: BigInt(destNextId++), user_id: BigInt(1), destination: `Place ${i}` });
    }
    res = await makeRequest('POST', '/api/profile/destinations', defaultAuth, { destination: 'Limit Test' });
    if (res.status === 422) pass('Max 50 destinations limit enforced (returns 422)');
    else fail('50-destination limit', '422', res.status);

    // 5. Update owned destination
    res = await makeRequest('PUT', `/api/profile/destinations/${createdId}`, defaultAuth, {
      destination: 'Tokyo Updated'
    });
    if (res.status === 200 && res.body.data.destination.destination === 'Tokyo Updated') {
      pass('Update owned destination (returns 200)');
    } else fail('Update owned', '200', res.status);

    // 6. Update another user's destination
    // create a destination owned by user 2
    let destUser2 = { id: BigInt(destNextId++), user_id: BigInt(2), destination: 'Paris' };
    destStore.push(destUser2);
    res = await makeRequest('PUT', `/api/profile/destinations/${destUser2.id}`, defaultAuth, {
      destination: 'Hacked'
    });
    if (res.status === 403) pass('Update another user\'s destination (returns 403 IDOR protection)');
    else fail('Update another user', '403', res.status);

    // 9. Nonexistent destination
    res = await makeRequest('PUT', '/api/profile/destinations/999', defaultAuth, { destination: 'Nowhere' });
    if (res.status === 404) pass('Update nonexistent destination (returns 404)');
    else fail('Update nonexistent', '404', res.status);

    // 7. Delete owned destination
    res = await makeRequest('DELETE', `/api/profile/destinations/${createdId}`, defaultAuth);
    if (res.status === 200) pass('Delete owned destination (returns 200)');
    else fail('Delete owned', '200', res.status);

    // 8. Delete another user's destination
    res = await makeRequest('DELETE', `/api/profile/destinations/${destUser2.id}`, defaultAuth);
    if (res.status === 403) pass('Delete another user\'s destination (returns 403 IDOR protection)');
    else fail('Delete another user', '403', res.status);

    // AVAILABILITY
    console.log('\n── Availability ──');
    
    // 10. Authenticated create
    res = await makeRequest('POST', '/api/profile/availability', defaultAuth, {
      start_date: '2027-01-01',
      end_date: '2027-01-15'
    });
    if (res.status === 201 && res.body.data.availability.start_date === '2027-01-01') {
      pass('Authenticated create (returns 201 & correct data)');
    } else fail('Authenticated create', '201', res.status);

    let createdAvailId = res.body?.data?.availability?.id;

    // 11. Invalid date range
    res = await makeRequest('POST', '/api/profile/availability', defaultAuth, {
      start_date: '2027-01-15',
      end_date: '2027-01-01' // before start
    });
    if (res.status === 422) pass('Invalid date range (end_date < start_date returns 422)');
    else fail('Invalid date range', '422', res.status);

    // 12. Update owned availability
    res = await makeRequest('PUT', `/api/profile/availability/${createdAvailId}`, defaultAuth, {
      start_date: '2027-02-01',
      end_date: '2027-02-15'
    });
    if (res.status === 200 && res.body.data.availability.start_date === '2027-02-01') {
      pass('Update owned availability (returns 200)');
    } else fail('Update owned', '200', res.status);

    // 13. Update another user's availability
    let availUser2 = { id: BigInt(availNextId++), user_id: BigInt(2), start_date: new Date('2027-03-01'), end_date: new Date('2027-03-15') };
    availStore.push(availUser2);
    res = await makeRequest('PUT', `/api/profile/availability/${availUser2.id}`, defaultAuth, {
      start_date: '2027-04-01',
      end_date: '2027-04-15'
    });
    if (res.status === 403) pass('Update another user\'s availability (returns 403 IDOR protection)');
    else fail('Update another user', '403', res.status);

    // 16. Nonexistent availability
    res = await makeRequest('PUT', '/api/profile/availability/999', defaultAuth, { start_date: '2027-05-01', end_date: '2027-05-15' });
    if (res.status === 404) pass('Update nonexistent availability (returns 404)');
    else fail('Update nonexistent', '404', res.status);

    // 14. Delete owned availability
    res = await makeRequest('DELETE', `/api/profile/availability/${createdAvailId}`, defaultAuth);
    if (res.status === 200) pass('Delete owned availability (returns 200)');
    else fail('Delete owned', '200', res.status);

    // 15. Delete another user's availability
    res = await makeRequest('DELETE', `/api/profile/availability/${availUser2.id}`, defaultAuth);
    if (res.status === 403) pass('Delete another user\'s availability (returns 403 IDOR protection)');
    else fail('Delete another user', '403', res.status);

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
