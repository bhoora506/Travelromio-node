# N2-A — DATABASE SCHEMA AUDIT & NODE.JS MAPPING DESIGN

**Project:** D:\development\travelromio-node
**Source of Truth:** D:\laragon\www\Tripromio (READ-ONLY)
**Phase:** N2-A — Design only, no implementation
**Date:** 2026-09-29
**Status:** COMPLETE

---

## 1. Executive Summary

21 migration files inspected. 22 tables, 12 models, 7 PHP backed enums audited. No migration executed or modified.

**Critical findings:**
1. BigInt IDs — JS number safe only below 2^53; use Prisma BigInt or string serialization.
2. Decimal columns — float imprecision; use Prisma Decimal type.
3. languages column — MySQL JSON; must JSON.parse on read in Node.
4. is_discoverable — tinyint(1); mysql2 returns 0/1; must cast to boolean.
5. Canonical conversation ordering — requester_id = MIN(A,B); must be enforced in Node service layer.
6. trip_join_requests — NO unique(trip_id,user_id) at DB level; app-enforced only.
7. connection_requests — NO unique(requester_id,recipient_id) at DB level; app-enforced only.
8. personal_access_tokens — Sanctum table; Node must NOT write here; use own JWT strategy.
9. user_interests pivot has NO id column (composite PK); trip_interests HAS an id column.

---

## 2. Actual Database Table Inventory (22 tables)

| # | Table | Type |
|---|-------|------|
| 1 | users | Application |
| 2 | password_reset_tokens | Framework |
| 3 | sessions | Framework |
| 4 | cache | Framework |
| 5 | cache_locks | Framework |
| 6 | jobs | Framework |
| 7 | job_batches | Framework |
| 8 | failed_jobs | Framework |
| 9 | personal_access_tokens | Framework/Sanctum |
| 10 | user_profiles | Application (3 migrations) |
| 11 | interests | Application — reference data |
| 12 | user_interests | Application — pivot, NO id column |
| 13 | trips | Application (2 migrations) |
| 14 | trip_members | Application |
| 15 | trip_interests | Application — pivot, HAS id column |
| 16 | travel_availabilities | Application |
| 17 | preferred_destinations | Application |
| 18 | trip_join_requests | Application |
| 19 | connection_requests | Application |
| 20 | conversations | Application |
| 21 | messages | Application |
| 22 | user_devices | Application |

---

## 3. Column-Level Schema

### users
id bigint unsigned PK AUTO_INCREMENT | name varchar(255) NOT NULL | email varchar(255) NOT NULL UNIQUE | email_verified_at timestamp NULL | password varchar(255) NOT NULL bcrypt | remember_token varchar(100) NULL | created_at timestamp NULL | updated_at timestamp NULL

### password_reset_tokens
email varchar(255) PK | token varchar(255) NOT NULL | created_at timestamp NULL
Note: Node will NOT use this table.

### sessions
id varchar(255) PK (string, not bigint) | user_id bigint unsigned NULL FK users indexed | ip_address varchar(45) NULL | user_agent text NULL | payload longtext NOT NULL | last_activity int NOT NULL
Note: Laravel-managed. Node will NOT use this table.

### cache
key varchar(255) PK | value mediumtext NOT NULL | expiration bigint NOT NULL indexed

### cache_locks
key varchar(255) PK | owner varchar(255) NOT NULL | expiration bigint NOT NULL indexed

### jobs
id bigint unsigned PK AUTO_INCREMENT | queue varchar(255) NOT NULL indexed | payload longtext NOT NULL | attempts smallint unsigned NOT NULL | reserved_at int unsigned NULL | available_at int unsigned NOT NULL | created_at int unsigned NOT NULL (Unix timestamp, NOT Laravel timestamps())

### job_batches
id varchar(255) PK (UUID string) | name varchar(255) NOT NULL | total_jobs int NOT NULL | pending_jobs int NOT NULL | failed_jobs int NOT NULL | failed_job_ids longtext NOT NULL | options mediumtext NULL | cancelled_at int NULL | created_at int NOT NULL | finished_at int NULL

### failed_jobs
id bigint unsigned PK AUTO_INCREMENT | uuid varchar(255) NOT NULL UNIQUE | connection varchar(255) NOT NULL | queue varchar(255) NOT NULL | payload longtext NOT NULL | exception longtext NOT NULL | failed_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
Composite index: (connection, queue, failed_at)

### personal_access_tokens
id bigint unsigned PK AUTO_INCREMENT | tokenable_type varchar(255) NOT NULL | tokenable_id bigint unsigned NOT NULL | name text NOT NULL | token varchar(64) NOT NULL UNIQUE (SHA-256) | abilities text NULL JSON | last_used_at timestamp NULL | expires_at timestamp NULL indexed | created_at timestamp NULL | updated_at timestamp NULL
Morph index: (tokenable_type, tokenable_id). Node must NOT write to this table.

### user_profiles (3 migration files combined)
id bigint unsigned PK AUTO_INCREMENT | user_id bigint unsigned NOT NULL FK users CASCADE UNIQUE | profile_photo_path varchar(255) NULL | bio text NULL | city varchar(100) NULL | country varchar(100) NULL indexed | languages json NULL cast-to-array | travel_style varchar(50) NULL TravelStyle-enum indexed | preferred_budget_min decimal(12,2) NULL | preferred_budget_max decimal(12,2) NULL | is_discoverable tinyint(1) NOT NULL DEFAULT 1 boolean | created_at timestamp NULL | updated_at timestamp NULL

### interests
id bigint unsigned PK AUTO_INCREMENT | name varchar(100) NOT NULL UNIQUE | slug varchar(100) NOT NULL UNIQUE | created_at timestamp NULL | updated_at timestamp NULL

### user_interests (pivot — NO separate id column)
user_id bigint unsigned NOT NULL FK users CASCADE | interest_id bigint unsigned NOT NULL FK interests CASCADE | created_at timestamp NULL | updated_at timestamp NULL
PK: composite (user_id, interest_id). CRITICAL: No auto-increment id. Differs from trip_interests.

### trips (2 migration files combined)
id bigint unsigned PK AUTO_INCREMENT | user_id bigint unsigned NOT NULL FK users RESTRICT indexed | title varchar(200) NOT NULL | destination varchar(200) NOT NULL indexed | place_id varchar(100) NULL indexed | latitude decimal(10,7) NULL | longitude decimal(10,7) NULL | start_date date NOT NULL indexed | end_date date NOT NULL indexed | budget_min decimal(12,2) NULL | budget_max decimal(12,2) NULL | trip_type varchar(50) NOT NULL TripType-enum indexed | description text NULL | image_path varchar(255) NULL (added by _192412 after description) | max_members tinyint unsigned NOT NULL DEFAULT 2 | status varchar(20) NOT NULL DEFAULT 'draft' TripStatus-enum indexed | created_at timestamp NULL | updated_at timestamp NULL
Composite index: (status, start_date, end_date)

### trip_members
id bigint unsigned PK AUTO_INCREMENT | trip_id bigint unsigned NOT NULL FK trips CASCADE indexed | user_id bigint unsigned NOT NULL FK users RESTRICT indexed | role varchar(20) NOT NULL DEFAULT 'member' MemberRole-enum indexed | status varchar(20) NOT NULL DEFAULT 'active' MemberStatus-enum indexed | joined_at timestamp NULL (nullable for owner row) | created_at timestamp NULL | updated_at timestamp NULL
UNIQUE: (trip_id, user_id)

### trip_interests (pivot — HAS id column, differs from user_interests)
id bigint unsigned PK AUTO_INCREMENT | trip_id bigint unsigned NOT NULL FK trips CASCADE | interest_id bigint unsigned NOT NULL FK interests CASCADE | created_at timestamp NULL | updated_at timestamp NULL
UNIQUE: (trip_id, interest_id)

### travel_availabilities
id bigint unsigned PK AUTO_INCREMENT | user_id bigint unsigned NOT NULL FK users CASCADE indexed | start_date date NOT NULL indexed | end_date date NOT NULL indexed | created_at timestamp NULL | updated_at timestamp NULL

### preferred_destinations
id bigint unsigned PK AUTO_INCREMENT | user_id bigint unsigned NOT NULL FK users CASCADE indexed | destination varchar(200) NOT NULL | place_id varchar(100) NULL indexed | latitude decimal(10,7) NULL | longitude decimal(10,7) NULL | created_at timestamp NULL | updated_at timestamp NULL

### trip_join_requests
id bigint unsigned PK AUTO_INCREMENT | trip_id bigint unsigned NOT NULL FK trips CASCADE indexed | user_id bigint unsigned NOT NULL FK users RESTRICT indexed | status varchar(20) NOT NULL DEFAULT 'pending' JoinRequestStatus-enum indexed | created_at timestamp NULL | updated_at timestamp NULL
WARNING: NO unique(trip_id, user_id). App enforces single-pending invariant.
Composite index: (trip_id, status)

### connection_requests
id bigint unsigned PK AUTO_INCREMENT | requester_id bigint unsigned NOT NULL FK users RESTRICT indexed | recipient_id bigint unsigned NOT NULL FK users RESTRICT indexed | status varchar(20) NOT NULL DEFAULT 'pending' ConnectionStatus-enum indexed | created_at timestamp NULL | updated_at timestamp NULL
WARNING: NO unique(requester_id, recipient_id). App enforces single-pending invariant.
WARNING: No DB CHECK for self-request. App enforced only.
Composite indexes: (requester_id, status), (recipient_id, status)

### conversations
id bigint unsigned PK AUTO_INCREMENT | requester_id bigint unsigned NOT NULL FK users RESTRICT indexed | recipient_id bigint unsigned NOT NULL FK users RESTRICT indexed | created_at timestamp NULL | updated_at timestamp NULL
UNIQUE: (requester_id, recipient_id)
CRITICAL: requester_id = MIN(userA_id, userB_id) enforced at service layer.

### messages
id bigint unsigned PK AUTO_INCREMENT | conversation_id bigint unsigned NOT NULL FK conversations CASCADE | sender_id bigint unsigned NOT NULL FK users RESTRICT indexed | body text NOT NULL | read_at timestamp NULL (NULL=unread) | created_at timestamp NULL | updated_at timestamp NULL
Composite index: (conversation_id, created_at)

### user_devices
id bigint unsigned PK AUTO_INCREMENT | user_id bigint unsigned NOT NULL FK users CASCADE indexed | fcm_token varchar(255) NOT NULL UNIQUE | platform varchar(10) NOT NULL | last_used_at timestamp NULL | created_at timestamp NULL | updated_at timestamp NULL

---

## 4. Foreign Keys

| Table | Column | References | On Delete |
|-------|--------|-----------|-----------|
| user_profiles | user_id | users.id | CASCADE |
| user_interests | user_id | users.id | CASCADE |
| user_interests | interest_id | interests.id | CASCADE |
| trips | user_id | users.id | RESTRICT |
| trip_members | trip_id | trips.id | CASCADE |
| trip_members | user_id | users.id | RESTRICT |
| trip_interests | trip_id | trips.id | CASCADE |
| trip_interests | interest_id | interests.id | CASCADE |
| travel_availabilities | user_id | users.id | CASCADE |
| preferred_destinations | user_id | users.id | CASCADE |
| trip_join_requests | trip_id | trips.id | CASCADE |
| trip_join_requests | user_id | users.id | RESTRICT |
| connection_requests | requester_id | users.id | RESTRICT |
| connection_requests | recipient_id | users.id | RESTRICT |
| conversations | requester_id | users.id | RESTRICT |
| conversations | recipient_id | users.id | RESTRICT |
| messages | conversation_id | conversations.id | CASCADE |
| messages | sender_id | users.id | RESTRICT |
| user_devices | user_id | users.id | CASCADE |

Pattern: Operational/child data = CASCADE. Audit-trail data = RESTRICT.

---

## 5. Unique Constraints

| Table | Columns | Purpose |
|-------|---------|---------|
| users | email | One account per email |
| user_profiles | user_id | One profile per user (1:1) |
| interests | name | No duplicate names |
| interests | slug | No duplicate slugs |
| user_interests | (user_id, interest_id) — composite PK | No duplicate user-interest pair |
| trip_members | (trip_id, user_id) | No duplicate membership |
| trip_interests | (trip_id, interest_id) | No duplicate trip-interest pair |
| conversations | (requester_id, recipient_id) | One conversation per user pair |
| user_devices | fcm_token | One device row per FCM token |
| failed_jobs | uuid | Unique job failure record |
| personal_access_tokens | token | Unique 64-char SHA-256 hash |

---

## 6. Indexes

| Table | Columns | Type | Purpose |
|-------|---------|------|---------|
| users | email | UNIQUE | Login lookup |
| users | email_verified_at | INDEX | Discovery filter |
| user_profiles | user_id | UNIQUE | 1:1 profile lookup |
| user_profiles | travel_style | INDEX | Discovery filter |
| user_profiles | country | INDEX | Discovery filter |
| preferred_destinations | place_id | INDEX | Place lookup |
| preferred_destinations | user_id | INDEX | Join in discovery |
| trips | user_id | INDEX | Owner trips |
| trips | destination | INDEX | Text filter |
| trips | start_date | INDEX | Date filter |
| trips | end_date | INDEX | Date filter |
| trips | status | INDEX | Status filter |
| trips | trip_type | INDEX | Type filter |
| trips | (status, start_date, end_date) | COMPOSITE | Date-range discovery |
| travel_availabilities | user_id | INDEX | User availability |
| travel_availabilities | start_date | INDEX | Matching |
| travel_availabilities | end_date | INDEX | Matching |
| trip_members | (trip_id, user_id) | UNIQUE | Membership uniqueness |
| trip_members | trip_id | INDEX | Member list |
| trip_members | user_id | INDEX | User membership |
| trip_members | status | INDEX | Active filter |
| trip_members | role | INDEX | Owner filter |
| trip_join_requests | trip_id | INDEX | Trip inbox |
| trip_join_requests | user_id | INDEX | User requests |
| trip_join_requests | status | INDEX | Status filter |
| trip_join_requests | (trip_id, status) | COMPOSITE | Owner inbox |
| connection_requests | requester_id | INDEX | Sent requests |
| connection_requests | recipient_id | INDEX | Received requests |
| connection_requests | status | INDEX | Status filter |
| connection_requests | (requester_id, status) | COMPOSITE | Sent inbox |
| connection_requests | (recipient_id, status) | COMPOSITE | Received inbox |
| conversations | (requester_id, recipient_id) | UNIQUE | Pair uniqueness |
| conversations | requester_id | INDEX | Participant lookup |
| conversations | recipient_id | INDEX | Participant lookup |
| messages | sender_id | INDEX | Sender lookup |
| messages | (conversation_id, created_at) | COMPOSITE | Paginated history |
| user_devices | fcm_token | UNIQUE | Token lookup |
| user_devices | user_id | INDEX | Logout cleanup |

---

## 7. Eloquent Relationships

### User model
- profile() — hasOne UserProfile via user_profiles.user_id
- interests() — belongsToMany Interest via user_interests; withTimestamps()
- trips() — hasMany Trip via trips.user_id (owned trips only)
- tripMembers() — hasMany TripMember via trip_members.user_id (all statuses)
- tripsJoined() — belongsToMany Trip via trip_members; withPivot(role,status,joined_at); withTimestamps()
- travelAvailabilities() — hasMany TravelAvailability
- preferredDestinations() — hasMany PreferredDestination
- sentConnectionRequests() — hasMany ConnectionRequest via requester_id (all statuses)
- receivedConnectionRequests() — hasMany ConnectionRequest via recipient_id (all statuses)
- sentConversations() — hasMany Conversation via requester_id (canonical lower-id participant)
- receivedConversations() — hasMany Conversation via recipient_id (canonical higher-id participant)
- userDevices() — hasMany UserDevice — NEVER expose in API responses

Casts: email_verified_at->datetime, password->hashed
Hidden: password, remember_token
Fillable: name, email, password

### UserProfile model
- user() — belongsTo User
Fillable: user_id,profile_photo_path,bio,city,country,languages,travel_style,preferred_budget_min,preferred_budget_max,is_discoverable
Casts: languages->array, travel_style->TravelStyle::class, preferred_budget_min->decimal:2, preferred_budget_max->decimal:2, is_discoverable->boolean
Accessor: getProfilePhotoUrlAttribute() returns Storage URL or null

### Interest model
- users() — belongsToMany User via user_interests; withTimestamps()
- trips() — belongsToMany Trip via trip_interests; withTimestamps()
Fillable: name, slug

### Trip model
- owner() — belongsTo User via user_id
- tripMembers() — hasMany TripMember (all statuses)
- activeMembers() — hasMany TripMember filtered status=active
- members() — hasManyThrough User via TripMember
- interests() — belongsToMany Interest via trip_interests; withTimestamps()
- joinRequests() — hasMany TripJoinRequest (all statuses)
- pendingJoinRequests() — hasMany TripJoinRequest filtered status=pending
- currentUserMembership() — hasOne TripMember filtered auth user_id
- currentUserJoinRequest() — hasOne TripJoinRequest filtered auth user_id; latestOfMany
Fillable: user_id,title,destination,place_id,latitude,longitude,start_date,end_date,budget_min,budget_max,trip_type,description,max_members,status,image_path
Casts: start_date->date, end_date->date, budget_min->decimal:2, budget_max->decimal:2, latitude->decimal:7, longitude->decimal:7, trip_type->TripType::class, status->TripStatus::class, max_members->integer
Helpers: remainingSlots(), hasOpenSlots()

### TripMember model
- trip() — belongsTo Trip
- user() — belongsTo User
Fillable: trip_id,user_id,role,status,joined_at
Casts: role->MemberRole::class, status->MemberStatus::class, joined_at->datetime
Helpers: isOwner(), isActive()

### TripJoinRequest model
- trip() — belongsTo Trip
- user() — belongsTo User
Fillable: trip_id,user_id,status
Casts: status->JoinRequestStatus::class

### ConnectionRequest model
- requester() — belongsTo User via requester_id
- recipient() — belongsTo User via recipient_id
Fillable: requester_id,recipient_id,status
Casts: status->ConnectionStatus::class
Helpers: isPending(), isAccepted(), isRejected(), isCancelled()

### Conversation model
- requester() — belongsTo User via requester_id (canonical lower id)
- recipient() — belongsTo User via recipient_id (canonical higher id)
- messages() — hasMany Message ordered by created_at ASC
- latestMessage() — hasOne Message latestOfMany(created_at)
Fillable: requester_id, recipient_id
Helpers: hasParticipant(User), otherParticipant(User)

### Message model
- conversation() — belongsTo Conversation
- sender() — belongsTo User via sender_id
Fillable: conversation_id,sender_id,body,read_at
Casts: read_at->datetime
Helpers: isRead()

### UserDevice model
- user() — belongsTo User
Fillable: user_id,fcm_token,platform,last_used_at
Casts: last_used_at->datetime

### PreferredDestination model
- user() — belongsTo User
Fillable: user_id,destination,place_id,latitude,longitude
Casts: latitude->decimal:7, longitude->decimal:7

### TravelAvailability model
- user() — belongsTo User
Fillable: user_id,start_date,end_date
Casts: start_date->date, end_date->date

---

## 8. Enums (all backed string enums — values stored verbatim in VARCHAR columns)

### TravelStyle (user_profiles.travel_style)
Values: adventure, backpacking, budget, luxury, relaxed, road_trip, nature, cultural

### TripType (trips.trip_type)
Values: weekend, adventure, backpacking, road_trip, nature, photography, cultural, beach, mountains, other

### TripStatus (trips.status) — default: draft
Values: draft, published, ongoing, completed(terminal), cancelled(terminal)
Transitions: draft->published|cancelled, published->ongoing|cancelled, ongoing->completed|cancelled

### MemberRole (trip_members.role) — default: member
Values: owner, member

### MemberStatus (trip_members.status) — default: active
Values: active, left, removed

### JoinRequestStatus (trip_join_requests.status) — default: pending
Values: pending, approved(terminal), rejected(terminal), cancelled(terminal)

### ConnectionStatus (connection_requests.status) — default: pending
Values: pending, accepted(terminal), rejected(terminal), cancelled(terminal)

CRITICAL: Node MUST preserve exact string values including underscores (road_trip not roadTrip).

---

## 9. Critical Business Invariants

### 9.1 Trip Membership
- ONE owner per trip: APP-LAYER only — no DB partial-unique; TripService must enforce.
- Owner counts toward max_members: max_members = owner + additional members.
- No duplicate (trip_id, user_id): DB UNIQUE enforces.
- trip_id CASCADE: member rows deleted when trip deleted.
- user_id RESTRICT: user cannot be deleted while a member exists.
- Owner joined_at nullable: set at trip creation time, not a join event.

### 9.2 Trip Join Requests
- Only one PENDING per (trip_id, user_id): APP-LAYER only; service must SELECT before INSERT.
- Re-request after rejected/cancelled: allowed — multiple rows per pair OK if prior is terminal.
- trip_id CASCADE: requests deleted when trip deleted.
- user_id RESTRICT: user cannot be deleted with pending requests.

### 9.3 Connection Requests
- Only one PENDING per (requester_id, recipient_id): APP-LAYER only.
- Reverse-direction: no DB enforcement; app must check both directions.
- Self-request prevention: APP-LAYER only — no DB CHECK (MySQL/SQLite portability).
- Re-request after rejected/cancelled: allowed.
- Accepted uniqueness: APP-LAYER only.

### 9.4 Conversations
- Canonical ordering (requester_id = MIN(A,B)): APP-LAYER service must sort before any query.
- One conversation per pair: DB UNIQUE(requester_id, recipient_id).
- Accepted connection requirement: APP-LAYER only — no DB FK to connection_requests.
- Messages CASCADE when conversation deleted.

### 9.5 Messages
- read_at = NULL means unread.
- Only OTHER participant marks messages as read — sender's own messages never touched.
- sender_id RESTRICT: sender cannot be deleted while messages exist.

### 9.6 User Devices / FCM
- Unique FCM token: DB UNIQUE(fcm_token).
- Token reassignment on new login: APP-LAYER upsert.
- platform values (android|ios): APP-LAYER validation only — no DB ENUM.
- NEVER expose fcm_token in any API response.

---

## 10. Serialization / Data-Type Risks

| Column | MySQL | Laravel | Node Risk | Severity | Mitigation |
|--------|-------|---------|-----------|----------|------------|
| *.id | bigint unsigned | int | JS number overflow | HIGH | Prisma BigInt; string serialize if > 2^53 |
| trips.latitude | decimal(10,7) | string | float imprecision | HIGH | Prisma Decimal; string serialize |
| trips.longitude | decimal(10,7) | string | float imprecision | HIGH | Same |
| trips.budget_min/max | decimal(12,2) | string | float imprecision | HIGH | Same |
| user_profiles.preferred_budget_* | decimal(12,2) | string | float imprecision | HIGH | Same |
| preferred_destinations.lat/lon | decimal(10,7) | string | float imprecision | HIGH | Same |
| user_profiles.languages | json | PHP array | raw string | HIGH | Prisma Json; auto-parsed |
| user_profiles.is_discoverable | tinyint(1) | boolean | 0/1 int | HIGH | Prisma Boolean auto-cast |
| trips.status | varchar(20) | TripStatus | any string | HIGH | Enum constants file; validate |
| trips.trip_type | varchar(50) | TripType | any string | HIGH | Same |
| trip_members.role | varchar(20) | MemberRole | any string | HIGH | Same |
| trip_members.status | varchar(20) | MemberStatus | any string | HIGH | Same |
| trip_join_requests.status | varchar(20) | JoinRequestStatus | any string | HIGH | Same |
| connection_requests.status | varchar(20) | ConnectionStatus | any string | HIGH | Same |
| user_profiles.travel_style | varchar(50) | TravelStyle | any string | HIGH | Same |
| messages.read_at | timestamp | Carbon|null | Date|null | MEDIUM | ISO 8601 consistent serialize |
| trip_members.joined_at | timestamp | Carbon|null | Date|null | MEDIUM | Same |
| users.email_verified_at | timestamp | Carbon|null | Date|null | MEDIUM | Same |
| user_profiles.profile_photo_url | computed | storage URL | missing | MEDIUM | Implement accessor in Node |
| personal_access_tokens.token | varchar(64) | string | — | HIGH | Node must NOT use this table |

---

## 11. Seed / Reference Data Audit

### Interest Reference Data — 14 records required for application to function

| Slug | Name |
|------|------|
| trekking | Trekking |
| backpacking | Backpacking |
| photography | Photography |
| adventure | Adventure |
| camping | Camping |
| nature | Nature |
| road-trip | Road Trip |
| food | Food |
| culture | Culture |
| beach | Beach |
| mountains | Mountains |
| wildlife | Wildlife |
| history | History |
| spiritual | Spiritual |

Seeder uses firstOrCreate by slug. IDs are auto-increment — NOT stable across environments.
CRITICAL: Never hard-code interest IDs. Always look up by slug.

### DatabaseSeeder
Calls InterestSeeder only. Also creates one test user test@example.com (test-only).

### Factories (test-only)
UserFactory, InterestFactory, TripFactory, TripMemberFactory, TripJoinRequestFactory, TravelAvailabilityFactory, ConnectionRequestFactory.
No factory exists for: UserProfile, PreferredDestination, UserDevice, Conversation, Message.

---

## 12. Query / Index Audit

| Query Pattern | Supporting Index | N+1 Risk |
|---------------|-----------------|----------|
| Login by email | users_email_unique | No |
| User + profile | user_profiles_user_id_unique | YES if not eager-loaded |
| Discovery: travel_style | user_profiles_travel_style_index | No |
| Discovery: country | user_profiles_country_index | No |
| Discovery: verified users | users_email_verified_at_index | No |
| Preferred destinations by user | preferred_destinations_user_id_index | YES |
| Availabilities by user | travel_availabilities_user_id_index | YES |
| Trip list by owner | trips_user_id_index | No |
| Trip date-range discovery | (status, start_date, end_date) composite | No |
| Trip members with user data | trip_members_trip_id_index | YES — must JOIN users |
| Active member count | trip_members_status_index | No (COUNT) |
| Join request owner inbox | (trip_id, status) composite | YES — must JOIN users |
| Join requests by user | trip_join_requests_user_id_index | No |
| Connection sent inbox | (requester_id, status) composite | YES — recipient profile |
| Connection received inbox | (recipient_id, status) composite | YES — requester profile |
| Conversation lookup | (requester_id, recipient_id) unique | No — must apply canonical order first |
| Message history paginated | (conversation_id, created_at) composite | No |
| Unread message count | (conversation_id, created_at) composite | No (COUNT) |
| FCM devices by user | user_devices_user_id_index | No |
| FCM token lookup | user_devices_fcm_token_unique | No |

---

## 13. ORM Comparison

| Criterion | Prisma | Knex | Sequelize | raw mysql2 |
|-----------|--------|------|-----------|-----------|
| Existing DB introspection | YES (db pull) | No | No | No |
| Decimal precision | YES (Prisma.Decimal) | Returns string | Loses precision | Returns string |
| Composite PK | YES (@@id) | YES | Limited | YES |
| Enum support | YES (native) | Manual strings | Limited | Manual |
| Transactions | YES () | YES (trx) | YES | YES (manual) |
| SELECT FOR UPDATE | Via  | YES (.forUpdate()) | YES (.lock()) | YES |
| Auto-generated types | YES | No | Partial | No |
| N+1 prevention | YES (include) | Manual joins | complex | Manual joins |
| Long-term maintainability | High | Medium | Medium | Low |

---

## 14. Recommended Node DB Layer: PRISMA

Reasons:
1. prisma db pull introspects existing Laravel MySQL schema — no manual re-typing.
2. Prisma.Decimal for all decimal fields — no float precision loss.
3. Composite PK on user_interests via @@id([user_id, interest_id]).
4. Native enum blocks map to VARCHAR-backed PHP enums.
5. Auto-generated types prevent string-typo bugs.
6. ([...]) for atomic operations (approve join request + create member row).
7. prisma migrate diff for schema comparison without touching DB.

Trade-offs to manage:
- currentUserMembership()-style relations become explicit WHERE clauses in repositories.
- SELECT FOR UPDATE requires .
- user_interests composite PK handled by introspection automatically.

---

## 15. Proposed Node DB Architecture

`
src/
  config/
    database.js          <- Prisma client singleton
  db/
    schema.prisma        <- Introspected and maintained schema
    healthCheck.js       <- DB connectivity for /health endpoint
  enums/
    index.js             <- Frozen JS constants mirroring all 7 PHP enums exactly
  repositories/
    userRepository.js
    userProfileRepository.js
    interestRepository.js
    tripRepository.js
    tripMemberRepository.js
    tripJoinRequestRepository.js
    connectionRequestRepository.js
    conversationRepository.js
    messageRepository.js
    userDeviceRepository.js
  services/
    authService.js
    profileService.js
    tripService.js
    tripMemberService.js
    joinRequestService.js
    connectionService.js
    conversationService.js
    deviceService.js
  middleware/
    auth.js
  routes/
    auth.js
    profile.js
    trips.js
    connections.js
    conversations.js
    devices.js
  controllers/
    (one per domain)
  app.js
  server.js
`

Key decisions:
- Repository layer wraps all Prisma queries. Services never call prisma directly.
- src/enums/index.js exports frozen JS constants for all 7 enum sets.
- src/config/database.js exports Prisma singleton with connection pooling.
- No Eloquent-style magic — all relationships are explicit repository methods.

---

## 16. Migration Strategy

RECOMMENDED: Option C — Node introspects existing Laravel DB and gradually takes ownership.

Steps:
1. N2-B: Install Prisma, run prisma db pull against existing DB (READ-ONLY).
2. N2-C: Validate schema.prisma against this document; fix gaps.
3. N3: Node auth (JWT independent from Sanctum). Laravel Sanctum tokens untouched.
4. N4+: Port domain endpoints one by one. Flutter switches progressively.

Rejected:
- Option A (fresh DB): Incompatible with existing production data.
- Option B (read-only): Too limiting for any write endpoint migration.

Safety principle: Laravel remains primary backend until each Node endpoint is fully tested.

---

## 17. Flutter / API Compatibility Risks

| Field | Laravel Response | Node Risk | Severity |
|-------|-----------------|-----------|----------|
| *.id | integer | JS number overflow | HIGH |
| trips.latitude/longitude | string decimal | float | HIGH |
| trips.budget_min/max | string decimal | float | HIGH |
| user_profiles.languages | JSON array | raw string | HIGH |
| user_profiles.is_discoverable | boolean | 0/1 int | HIGH |
| trips.status/trip_type | exact enum string | wrong case/value | HIGH |
| trip_members.role/status | exact enum string | wrong case/value | HIGH |
| connection_requests.status | exact enum string | wrong case/value | HIGH |
| messages.read_at | ISO 8601 or null | wrong format/type | MEDIUM |
| trip_members.joined_at | ISO 8601 or null | wrong format | MEDIUM |
| user_profiles.profile_photo_url | computed storage URL | missing | MEDIUM |
| trips.image_path | relative path string | must match pattern | MEDIUM |
| fcm_token | NEVER in response | security leak | HIGH (security) |
| users.email_verified_at | ISO 8601 or null | wrong format | MEDIUM |

---

## 18. Risk Register

| # | Risk | Severity | Why | Detection | Mitigation | Phase |
|---|------|---------|-----|-----------|------------|-------|
| R01 | BigInt ID overflow | HIGH | JS max safe int = 2^53 | Integration test large IDs | Prisma BigInt + string serialize | N2-B |
| R02 | Decimal precision loss | HIGH | JS float imprecision | Unit test stored vs retrieved | Prisma.Decimal + string serialize | N2-B |
| R03 | Enum string mismatch | HIGH | Wrong case silently stores bad state | Enum constant tests | src/enums/index.js frozen constants | N2-B |
| R04 | Timestamp timezone drift | MEDIUM | Node UTC vs PHP Carbon | Save/read compare | MySQL UTC; Prisma UTC Date objects | N2-B |
| R05 | is_discoverable as 0/1 | HIGH | mysql2 returns tinyint(1) as number | Boolean field test | Prisma Boolean type | N2-B |
| R06 | languages not parsed | HIGH | Raw JSON string instead of array | Field type test | Prisma Json type | N2-B |
| R07 | Duplicate pending join request | MEDIUM | No DB unique; race condition | Concurrent request test | SELECT FOR UPDATE in joinRequestService | N3+ |
| R08 | Duplicate pending connection | MEDIUM | No DB unique; race condition | Concurrent request test | Same pattern as R07 | N3+ |
| R09 | Duplicate conversation | LOW | DB UNIQUE exists but canonical order must apply | Test both orderings | Service enforces MIN/MAX before query | N3+ |
| R10 | Missing composite index | LOW | Query planner misses multi-column queries | EXPLAIN output | All composite indexes in Prisma schema | N2-B |
| R11 | Incorrect FK cascade | CRITICAL | Wrong ON DELETE destroys or blocks prod data | Schema diff test | Verify prisma db pull vs Section 4 | N2-B |
| R12 | user_interests vs trip_interests PK | MEDIUM | Different pivot patterns | Schema inspection | Prisma introspect; verify in schema file | N2-B |
| R13 | FCM token in API response | HIGH | Security — enables push access | Response audit | Never include userDevices in API includes | N3+ |
| R14 | Laravel migration drift | MEDIUM | Future Laravel schema changes undetected | CI schema diff | Re-run prisma db pull after Laravel migrations | Ongoing |
| R15 | Seed data mismatch | MEDIUM | interests table empty or slugs differ | Slug lookup test | Verify 14 interest slugs on startup | N2-B |
| R16 | personal_access_tokens shared | HIGH | Node writes break Sanctum auth | Code review | Node uses JWT only; never touch this table | N3 |

---

## 19. Exact N2-B Implementation Plan

DO NOT START UNTIL N2-A IS APPROVED.

### Packages
Production: @prisma/client
Dev: prisma (CLI)

### Steps
1. npm install prisma @prisma/client --save-exact
2. npx prisma init --datasource-provider mysql
3. Add DATABASE_URL to .env (MySQL connection string for existing Laravel DB)
4. npx prisma db pull  <- READ-ONLY introspection; does NOT modify DB
5. Validate schema.prisma against this audit document (22 tables, all FKs, all indexes)
6. Fix introspection gaps: add missing @@index, enum blocks, @@id for user_interests
7. npx prisma generate <- generates Prisma Client
8. Create src/config/database.js with Prisma singleton and connection pooling
9. Create src/enums/index.js with all 7 enum value sets as frozen JS objects
10. Create src/db/healthCheck.js and integrate into /health endpoint
11. Create one repository file per domain entity with named, documented methods
12. Write integration tests: decimal precision, boolean cast, JSON parse, enum values
13. Verify all 16 risks in Section 18 addressed before N3

### package.json scripts (N2-B only — no other changes)
"db:pull": "prisma db pull"
"db:generate": "prisma generate"
"db:studio": "prisma studio"

### Do NOT in N2-B
- Do NOT run prisma migrate dev (DB already has correct schema from Laravel)
- Do NOT run prisma migrate reset
- Do NOT modify the MySQL database schema in any way
- Do NOT touch personal_access_tokens, sessions, password_reset_tokens
- Do NOT implement auth endpoints (that is N3)
- Do NOT implement business domain endpoints (those are N4+)

---

## 20. Verification Checklist

- [x] All 21 migration files inspected
- [x] All 22 tables documented (Section 3)
- [x] All 12 Eloquent models audited (Section 7)
- [x] All 7 PHP enums with exact string values (Section 8)
- [x] All FK behaviors verified (Section 4)
- [x] All unique constraints documented (Section 5)
- [x] All indexes documented (Section 6)
- [x] All critical business invariants mapped (Section 9)
- [x] All serialization risks identified (Section 10)
- [x] Seed/reference data audited (Section 11)
- [x] ORM comparison complete (Section 13)
- [x] Node DB layer recommended: PRISMA (Section 14)
- [x] Node DB architecture designed (Section 15)
- [x] Migration strategy selected: Option C (Section 16)
- [x] Flutter compatibility risks mapped (Section 17)
- [x] Risk register complete with 16 risks (Section 18)
- [x] N2-B plan documented (Section 19)

---

## Absolute Safety Confirmation

| Item | Status |
|------|--------|
| Laravel source files modified | 0 |
| Flutter files modified | 0 |
| Laravel migrations modified | 0 |
| Laravel database modified | 0 |
| MySQL data modified | 0 |
| Node database created | NO |
| Node packages installed | NO |
| Firebase modified | 0 |
| Production configuration modified | 0 |
| API behavior modified | 0 |

All reads performed via PowerShell Get-Content on Laravel source files (read-only).
No write operations performed outside D:\development\travelromio-node.
