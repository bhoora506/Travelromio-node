# N3-D SCOPE

## 1. Candidate Remaining Endpoints Discovered
Based on `routes/api.php` and `api_constants.dart`, the remaining primary API domains are:
- **Profile Extensions**: `/profile/destinations`, `/profile/availability` (CRUD)
- **Join Requests**: `/trips/{trip}/join-requests` (Read list, plus writes for accept/reject/cancel)
- **Companion Discovery**: `/companions` (Read-only paginated feed of users)
- **Connections**: `/connections`, `/connections/received`, `/connections/sent` (Read-only lists, plus writes for accept/reject/cancel)
- **Conversations/Messages**: `/conversations`, `/conversations/{id}/messages` (Read lists, plus writes to send)

## 2. Selected N3-D Endpoint Group
**Companion Discovery & Connection Lists (Read-Only)**
- `GET /api/companions`
- `GET /api/connections`
- `GET /api/connections/received`
- `GET /api/connections/sent`

## 3. Reason for Selection
These endpoints form a coherent logical group: "User Networking". They allow users to discover companions and view their network state (pending/accepted connections) without mutating data. They strictly satisfy the N3-D safety requirement to prefer read-only operations. They follow the N3-C phase perfectly by transitioning from discovering "Trips" to discovering "People". 

## 4. Flutter Callers
- `ApiConstants.companions`
- `ApiConstants.connections`
- `ApiConstants.connectionsReceived`
- `ApiConstants.connectionsSent`
Flutter uses these to populate the "Companions Feed" tab and the "My Network / Requests" inboxes.

## 5. Laravel Sources
- `App\Http\Controllers\CompanionDiscoveryController`
- `App\Http\Controllers\ConnectionRequestController`
- `App\Services\CompanionDiscoveryService`
- `App\Http\Resources\CompanionResource`
- `App\Http\Resources\ConnectionRequestResource`

## 6. Dependencies on Previous Phases
- Requires N3-A `authenticate` middleware.
- Requires N3-B `bigIntToString` and generic response formatters.
- Will leverage Prisma's `include` patterns established in N3-C for fetching user profiles, interests, and destinations eagerly.

## 7. Read/Write Classification
Strictly Read-Only.

## 8. Explicitly Excluded Endpoints
- `POST /api/connections` (Creates a connection request - requires write approval).
- `POST /api/connections/{id}/accept` (Updates status - requires write approval).
- `POST /api/connections/{id}/reject` (Updates status - requires write approval).
- `POST /api/connections/{id}/cancel` (Updates status - requires write approval).
- `GET /api/conversations/*` (Separate bounded context - Chat).
- `GET /api/trips/{trip}/join-requests` (Separate bounded context - Trip Management).

## 9. Reason for Exclusions
The excluded endpoints either require DB writes (forbidden in N3-D without explicit approval) or belong to a different domain context (Chat / Trip Management). Grouping Companion Discovery with Connection Lists creates a tightly focused, read-only phase.

## 10. Expected DB Operations
- `findMany` on `users` with relational eager loading (`user_profiles`, `preferred_destinations`, `user_interests`).
- `findMany` on `connection_requests`.
- `count` for pagination metadata.
No `create`, `update`, or `delete` operations.

## 11. Expected Verification Strategy
- Map Laravel's validation exactly to Node.js using 422 rejection.
- Write mocked HTTP integration tests (`scripts/test-endpoints-n3d.js`) for success and validation paths.
- Run the full verification suite to ensure zero regression.
