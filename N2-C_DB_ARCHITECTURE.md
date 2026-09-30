# N2-C — DATABASE ARCHITECTURE & REPOSITORY FOUNDATION

**Project:** `D:\development\travelromio-node`
**Phase:** N2-C — Architecture only, no API migration
**Date:** 2026-09-30
**Status:** COMPLETE

---

## 1. N2-C Objective

Establish the Node.js database architecture that will support gradual Laravel API migration. N2-C builds the repository layer on top of the Prisma DB foundation created in N2-B, without implementing any auth, API endpoints, business services, or controllers.

---

## 2. Prisma Version

| Package | Version |
|---------|---------|
| prisma | 5.22.0 |
| @prisma/client | 5.22.0 |

---

## 3. Database Architecture

```
CONTROLLER      (future — N4+)
    ↓
SERVICE         (future — N3+)
    ↓
REPOSITORY      ← N2-C implements this layer
    ↓
PRISMA CLIENT   ← N2-B established this
    ↓
MYSQL           ← existing Laravel DB, read-only governance
```

**N2-C only implements the REPOSITORY → PRISMA → MYSQL path.**  
Services, controllers, routes, and auth are all future phases.

---

## 4. Prisma Client Ownership

**Single shared client:** `src/config/database.js`

```js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
module.exports = prisma;
```

- All repositories import this singleton.
- Transaction helper uses this same singleton.
- No repository creates its own `PrismaClient`.
- Hot-reload safety: a single client is sufficient for a Node.js process; nodemon restarts the process cleanly.

---

## 5. Transaction Helper

**File:** `src/db/transaction.js`

```js
async function withTransaction(fn, options) { ... }
```

- Wraps `prisma.$transaction(fn, options)`.
- Passes a scoped `tx` client to `fn`; all repository methods accept an optional `client` arg for this.
- Errors are normalised through `normaliseError()` before propagating.
- Does NOT contain business logic.

**Usage pattern (future services):**
```js
await withTransaction(async (tx) => {
  await membershipRepository.create(tx, { trip_id, user_id, role: 'member' });
  await joinRequestRepository.updateStatus(tx, requestId, 'approved');
});
```

**Smoke test result:** `SELECT 1` inside `$transaction` → PASS

---

## 6. Database Error Handling

**File:** `src/db/errors.js`

| Class | Prisma Code | When Used |
|-------|------------|-----------|
| `DatabaseError` | (base) | Generic fallback |
| `NotFoundError` | P2025 | Record expected to exist but doesn't |
| `UniqueConstraintError` | P2002 | Unique index violated |
| `ForeignKeyConstraintError` | P2003 | FK violated |

**`normaliseError(error)`** — called in every repository `catch` block. Converts raw Prisma errors to typed `DatabaseError` subclasses. Internal Prisma/MySQL details never escape the repository layer.

HTTP translation (status codes, response bodies) is NOT done here — that belongs to future controller/middleware layers.

---

## 7. Repository Structure

```
src/repositories/
  userRepository.js          users table
  profileRepository.js       user_profiles table
  interestRepository.js      interests table
  tripRepository.js          trips table
  membershipRepository.js    trip_members table
  joinRequestRepository.js   trip_join_requests table
  availabilityRepository.js  travel_availabilities table
  destinationRepository.js   preferred_destinations table
  connectionRepository.js    connection_requests table
  conversationRepository.js  conversations table
  messageRepository.js       messages table
  deviceRepository.js        user_devices table
```

---

## 8. Repository Responsibilities

**What repositories DO:**
- Accept explicit typed arguments (IDs, data objects, optional `tx` client).
- Query the database via the shared Prisma client.
- Return raw Prisma records or null/array.
- Catch raw Prisma errors and re-throw as typed `DatabaseError` subclasses.

**What repositories do NOT do:**
- Read or write `req` / `res`.
- Know about HTTP status codes.
- Contain authentication or authorization logic.
- Contain FCM/push logic.
- Contain business workflow decisions.
- Format API response payloads.
- Enforce application-level invariants (that is the Service layer).

---

## 9. Repository Methods

| Repository | Methods |
|-----------|---------|
| userRepository | `findById`, `findByEmail`, `create` |
| profileRepository | `findByUserId`, `findWithUser`, `update` |
| interestRepository | `findAll`, `findBySlug`, `findById` |
| tripRepository | `findById`, `findByOwnerId`, `findPublished`, `findByStatus`, `create`, `update` |
| membershipRepository | `findByTripAndUser`, `findByTripId`, `findByUserId`, `create`, `updateStatus` |
| joinRequestRepository | `findById`, `findByTripId`, `findByUserId`, `findPendingByTripAndUser`, `create`, `updateStatus` |
| availabilityRepository | `findByUserId`, `create`, `update`, `remove` |
| destinationRepository | `findByUserId`, `create`, `update`, `remove` |
| connectionRepository | `findById`, `findByRequester`, `findByRecipient`, `findBetweenUsers`, `create`, `updateStatus` |
| conversationRepository | `findById`, `findBetweenUsers`, `findByUserId`, `create` |
| messageRepository | `findByConversationId`, `findById`, `create`, `markAsRead` |
| deviceRepository | `findByUserId`, `findByToken`, `create`, `updateLastUsed`, `remove` |

Each method accepts an optional final `client` argument (for transaction support).

---

## 10. Read-Only Smoke Test Results

`npm run test:repositories` — **27 passed, 0 failed**

```
── Users ──
  ✅ users.count: 13 records
  ✅ userRepo.findById: id=1, email=test@example.com
  ✅ userRepo.findByEmail: found=true

── User Profiles ──
  ✅ user_profiles.count: 4 records
  ✅ profileRepo.findByUserId: found=true, is_discoverable=true, has_languages=false

── Interests ──
  ✅ interestRepo.findAll: 14 interests
  ✅ interestRepo.findBySlug: slug=adventure
  ✅ interestRepo.findById: name=Adventure

── Trips ──
  ✅ trips.count: 8 records
  ✅ tripRepo.findPublished: 5 published trips
  ✅ tripRepo.findById: id=1, status=draft, budget_min=4555

── Trip Memberships ──
  ✅ trip_members.count: 12 records
  ✅ membershipRepo.findByTripId: 1 members in trip 1

── Trip Join Requests ──
  ✅ trip_join_requests.count: 4 records
  ✅ joinRequestRepo.findByTripId: 1 requests for trip 4

── Travel Availabilities ──
  ✅ travel_availabilities.count: 1 records

── Preferred Destinations ──
  ✅ preferred_destinations.count: 3 records
  ✅ destinationRepo.findByUserId: 1 destinations for user 5

── Connection Requests ──
  ✅ connection_requests.count: 1 records
  ✅ connectionRepo.findByRequester: 1 sent by user 13

── Conversations ──
  ✅ conversations.count: 1 records
  ✅ conversationRepo.findByUserId: 1 conversations for user 12

── Messages ──
  ✅ messages.count: 6 records
  ✅ messageRepo.findByConversationId: 6 messages in conversation 1

── User Devices ──
  ✅ user_devices.count: 2 records
  ✅ deviceRepo.findByUserId: records exist — FCM tokens intentionally not displayed

── Transaction Helper ──
  ✅ withTransaction + SELECT 1: read-only transaction executed successfully
```

---

## 11. BigInt Handling

- All IDs are `BigInt` in Prisma (MySQL `bigint unsigned`).
- Repositories accept `BigInt | string | number` and convert internally with `BigInt(id)`.
- `src/utils/prisma.js` provides `bigIntToString()` and `serialiseRecord()` for safe output.
- **Never cast a BigInt to `Number`** — values above 2^53-1 will be silently corrupted.
- Smoke test displays IDs with `displayId(bigint)` → `.toString()`.
- Future API responses must serialise IDs as strings to protect Flutter clients (N2-A R01).

---

## 12. Decimal Handling

- `latitude`, `longitude`, `budget_min`, `budget_max`, `preferred_budget_min/max` are `Decimal` objects.
- Prisma returns `Prisma.Decimal` instances — NOT JS floats.
- `decimalToString()` in `src/utils/prisma.js` safely serialises them for output.
- **Never cast to `Number` / `parseFloat`** — N2-A R02 documents 7-decimal precision loss.
- The smoke test displays `budget_min` as `.toString()`.

---

## 13. Composite Key Handling

`user_interests` uses a composite primary key with no synthetic `id`:
```prisma
@@id([user_id, interest_id])
```

Prisma exposes this as `user_interests.findUnique({ where: { user_id_interest_id: { ... } } })`.
`trip_members` has a DB UNIQUE `(trip_id, user_id)` but retains a synthetic `id`; Prisma exposes this as `trip_id_user_id: { ... }` compound name.
`conversations` has a DB UNIQUE `(requester_id, recipient_id)` exposed as `requester_id_recipient_id: { ... }`.

---

## 14. Unique Constraint Handling

| Table | DB-level UNIQUE | App-level only |
|-------|----------------|----------------|
| users | email | — |
| user_profiles | user_id (1:1) | — |
| interests | name, slug | — |
| user_interests | (user_id, interest_id) composite PK | — |
| trip_members | (trip_id, user_id) | — |
| trip_interests | (trip_id, interest_id) | — |
| conversations | (requester_id, recipient_id) | — |
| user_devices | fcm_token | — |
| trip_join_requests | — | only one pending per (trip, user) |
| connection_requests | — | only one pending per (user pair) |

App-level invariants are noted in repository JSDoc but NOT enforced here.

---

## 15. Foreign Key Behavior

| Type | Tables | Implication for Node |
|------|--------|---------------------|
| CASCADE | user_profiles, user_interests, trip_members (trip FK), trip_interests, travel_availabilities, preferred_destinations, user_devices, messages (conversation FK) | Deleting parent auto-deletes children |
| RESTRICT | trips.user_id, trip_members.user_id, trip_join_requests.user_id, connection_requests.requester/recipient, conversations.requester/recipient, messages.sender_id | Must delete children first; FK violation = P2003 |

`ForeignKeyConstraintError` normalises P2003 for future service-layer handling.

---

## 16. Security Considerations

| Risk | Repository mitigation |
|------|----------------------|
| FCM token exposure | deviceRepository never logs tokens; smoke test explicitly notes "FCM tokens intentionally not displayed" |
| Password exposure | userRepository.create() comment explicitly states hashing is the caller's responsibility; smoke test excludes password field from output |
| personal_access_tokens | Not queried, not used; Prisma model exists in schema but Node never touches it (N3 will use independent JWT) |
| sessions / password_reset_tokens | Not queried from Node |
| BigInt precision | Converted to string for display; never cast to Number |
| Decimal precision | Preserved as Prisma.Decimal; serialised via .toString() for output |

---

## 17. What Is Intentionally NOT Implemented in N2-C

- ❌ Authentication (JWT, Sanctum replacement) — N3
- ❌ Controllers — N4+
- ❌ Routes/endpoints — N4+
- ❌ Business services — N3+
- ❌ Input validation middleware — N4+
- ❌ Canonical conversation ordering enforcement — ConversationService (N3+)
- ❌ "Only one pending" join request enforcement — JoinRequestService (N3+)
- ❌ "Only one pending" connection enforcement — ConnectionService (N3+)
- ❌ FCM push notifications — later phase
- ❌ File upload / storage (profile photos, trip images) — later phase
- ❌ Travel matching / discovery algorithm — later phase

---

## 18. N2-A / N2-B Compatibility

| N2-A Risk | N2-C Status |
|-----------|-------------|
| R01 BigInt overflow | Handled: displayId() / bigIntToString() in utils |
| R02 Decimal precision | Handled: Prisma.Decimal preserved, toString() for output |
| R03 Enum string mismatch | Documented per-repository; enums are VARCHAR strings |
| R05 is_discoverable as 0/1 | Handled: Prisma Boolean maps it correctly |
| R06 languages not parsed | Handled: Prisma Json maps it correctly |
| R11 FK cascade | Verified: schema matches N2-A Section 4 |
| R12 user_interests vs trip_interests PK | Handled: membershipRepository uses compound name correctly |
| R13 FCM token exposure | Handled: deviceRepository never logs token values |
| R16 personal_access_tokens | Not touched: confirmed unused |

---

## 19. N2-C Validation Results

| Check | Result |
|-------|--------|
| `npx prisma validate` | ✅ PASS — schema valid |
| `npm run verify:db` | ✅ PASS — DB reachable, users table verified |
| `npm run test:repositories` | ✅ PASS — 27/27 checks passed |
| Transaction helper (SELECT 1) | ✅ PASS |
| MySQL schema modified | ✅ NO |
| Laravel modified | ✅ NO |
| Flutter modified | ✅ NO |

---

## 20. N2-D Recommended Next Step

**N2-D: Authentication Foundation (JWT)**

Implement Node-native JWT authentication without touching Laravel Sanctum:

- `authService.js`: register, login (password hash verify), logout.
- `src/middleware/auth.js`: JWT verify middleware for protected routes.
- `src/routes/auth.js` + `src/controllers/authController.js`.
- `/api/auth/register`, `/api/auth/login`, `/api/auth/logout` endpoints.
- Environment variables: `JWT_SECRET`, `JWT_EXPIRY`.
- Node manages its own tokens — `personal_access_tokens` table is NEVER used.
- Laravel Sanctum continues to serve Flutter unmodified.
- Flutter switches to Node auth endpoint only after full verification.

DO NOT START N2-D until N2-C is approved.
