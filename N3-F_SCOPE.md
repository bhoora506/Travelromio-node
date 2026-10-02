# N3-F SCOPE DISCOVERY

## 1. Complete Remaining Endpoint Inventory
The following endpoints exist in Laravel (`api.php`) but have not been implemented in Node:
1. `GET /profile/stats`
2. `PUT /profile`
3. `PUT /profile/interests`
4. `POST /profile/photo`
5. `DELETE /profile/photo`
6. `POST /profile/device-token`
7. `DELETE /profile/device-token`
8. `GET /profile/destinations`
9. `POST /profile/destinations`
10. `PUT /profile/destinations/{destination}`
11. `DELETE /profile/destinations/{destination}`
12. `GET /profile/availability`
13. `POST /profile/availability`
14. `PUT /profile/availability/{availability}`
15. `DELETE /profile/availability/{availability}`
16. `POST /trips`
17. `PUT /trips/{trip}`
18. `POST /trips/{trip}/publish`
19. `POST /trips/{trip}/cancel`
20. `POST /trips/{trip}/join-requests`
21. `GET /trips/{trip}/join-requests`
22. `POST /trips/{trip}/join-requests/{joinRequest}/approve`
23. `POST /trips/{trip}/join-requests/{joinRequest}/reject`
24. `POST /trips/{trip}/join-requests/{joinRequest}/cancel`
25. `POST /connections`
26. `POST /connections/{connectionRequest}/accept`
27. `POST /connections/{connectionRequest}/reject`
28. `POST /connections/{connectionRequest}/cancel`
29. `POST /conversations`
30. `POST /conversations/{conversation}/messages`
31. `POST /conversations/{conversation}/read`

## 2. Already-Migrated Endpoint Inventory
(Verified via `src/routes/api.js`)
- `GET /health` (N3-B)
- `GET /auth/me` (N3-B)
- `GET /interests` (N3-B)
- `GET /profile` (N3-B)
- `GET /trips` (N3-C)
- `GET /trips/:tripId` (N3-C)
- `GET /my/trips` (N3-C)
- `GET /my/joined-trips` (N3-C)
- `GET /trips/:tripId/members` (N3-C)
- `GET /companions` (N3-D)
- `GET /connections` (N3-D)
- `GET /connections/received` (N3-D)
- `GET /connections/sent` (N3-D)
- `GET /conversations` (N3-E)
- `GET /conversations/:conversationId` (N3-E)
- `GET /conversations/:conversationId/messages` (N3-E)

## 3. Flutter Caller Evidence
(Verified via codebase grep for `ApiConstants`)
- Every remaining API endpoint corresponds to a configured `ApiConstants` value in `lib/core/constants/api_constants.dart`.
- The `api_client.dart` and `*service.dart` files show active implementation for:
  - `profile_service.dart`: `profileStats`, `profileDestinations`, `profileAvailability`, `profile`, `profilePhoto`, `profileInterests`.
  - `push_notification_service.dart`: `profileDeviceToken`.
  - `trip_service.dart`: `trips`, `tripById`, `tripAction`, `tripJoinRequests`, `tripJoinRequestAction`.
  - `connection_service.dart`: `connections`, `connectionAction`.
  - `chat_service.dart`: `conversations`, `conversationMessages`, `conversationRead`.

## 4. Remaining Bounded Contexts
1. **Profile Extensions (Read-Only)**: `GET /profile/stats`, `GET /profile/destinations`, `GET /profile/availability`
2. **Profile Management (Write)**: `PUT /profile`, `PUT /profile/interests`, `POST/DELETE /profile/photo`, `POST/DELETE /profile/device-token`, `POST/PUT/DELETE /profile/destinations`, `POST/PUT/DELETE /profile/availability`
3. **Trip Management (Write)**: `POST /trips`, `PUT /trips/{trip}`, `POST /trips/{trip}/publish`, `POST /trips/{trip}/cancel`
4. **Trip Join Requests (Mixed)**: `POST/GET /trips/{trip}/join-requests`, `POST /trips/{trip}/join-requests/...`
5. **Connection Management (Write)**: `POST /connections`, `POST /connections/{id}/...`
6. **Chat Management (Write)**: `POST /conversations`, `POST /conversations/{conversation}/messages`, `POST /conversations/{conversation}/read`

## 5. READ/WRITE/MIXED Classification
- `GET /profile/stats` (READ)
- `GET /profile/destinations` (READ)
- `GET /profile/availability` (READ)
- `GET /trips/{trip}/join-requests` (READ)
- All other remaining endpoints are WRITE.

## 6. Risk Classification with Factual Reasons
- **Profile Extensions (Read-Only)**: LOW RISK. Standard `GET` operations scoped to `req.user.id`. No mutations.
- **Profile Management (Write)**: MEDIUM RISK. Formidable validation requirements. Photo upload requires multipart/form-data and filesystem/S3 integration. Device token deals with third-party FCM dependencies.
- **Trip Management (Write)**: HIGH RISK. Complex validation rules for overlapping dates, cascading relations, and geocoding dependencies.
- **Trip Join Requests (Mixed)**: HIGH RISK. Complex authorization logic, push notification side-effects, and state-machine transitions (pending -> approved).
- **Connection Management (Write)**: HIGH RISK. Bidirectional state manipulation (requester/recipient), unique constraint enforcement, and push notifications.
- **Chat Management (Write)**: HIGH RISK. Message broadcasting, push notifications, and unread marker state manipulation.

## 7. Selected N3-F Scope
**Profile Extensions (Read-Only)**

## 8. Exact Endpoints in Selected Scope
- `GET /api/profile/stats`
- `GET /api/profile/destinations`
- `GET /api/profile/availability`

## 9. Laravel Source Files
- `App\Http\Controllers\ProfileStatsController.php`
- `App\Http\Controllers\PreferredDestinationController.php`
- `App\Http\Controllers\TravelAvailabilityController.php`
- `App\Http\Resources\PreferredDestinationResource.php`
- `App\Http\Resources\TravelAvailabilityResource.php`

## 10. Flutter Source Files/Callers
- `lib/data/services/profile_service.dart` (lines 170, 217, 271)

## 11. Node Files Likely Involved
- `src/routes/api.js`
- `src/controllers/profileStatsController.js`
- `src/controllers/preferredDestinationController.js`
- `src/controllers/travelAvailabilityController.js`
- `src/resources/preferredDestinationResource.js`
- `src/resources/travelAvailabilityResource.js`

## 12. DB Models/Tables
- `users`
- `trip_members` (stats)
- `connection_requests` (stats)
- `preferred_destinations`
- `travel_availabilities`

## 13. Authentication Requirements
- Sanctum token via N3-A `authenticate` middleware.

## 14. Authorization Requirements
- Data is inherently restricted to `req.user.id` (users can only fetch their own stats, destinations, and availability).

## 15. Validation Requirements
- None for GET endpoints.

## 16. Response/Resource Requirements
- `stats`: Returns `{ trips_count: Int, connections_count: Int }`.
- `destinations`: Returns `{ destinations: Array<PreferredDestinationResource> }`.
- `availability`: Returns `{ availabilities: Array<TravelAvailabilityResource> }`.

## 17. Whether DB Writes are Involved
- NO. 

## 18. Testing Strategy
- Create `scripts/test-endpoints-n3f.js` to execute real HTTP Express routes with mocked `req.user` token validation, performing real Prisma `count` and `findMany` queries against the DB.

## 19. Explicitly Excluded Endpoints
- ALL write endpoints (POST/PUT/DELETE) for destinations, availability, profile, trips, connections, and chat.
- `GET /trips/{trip}/join-requests` (deferred to the Trip Management/Join Request bounded context for cohesion).

## 20. Reasons Why Excluded Endpoints Are Not Part of N3-F
- Write endpoints violate the safety guidelines of this discovery phase.
- `GET /trips/{trip}/join-requests` logically pairs with the write actions (`POST .../approve`, `POST .../reject`) for Trip owners, rather than User Profile configuration.

==================================================
IMPLEMENTATION STATUS:

A. READY FOR READ-ONLY IMPLEMENTATION
