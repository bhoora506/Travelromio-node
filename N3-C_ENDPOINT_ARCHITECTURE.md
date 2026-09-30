# N3-C ENDPOINT ARCHITECTURE

## 1. Selected Scope
This phase targets **Trip Discovery and Details (Read-Only)** based on Flutter's actual consumption patterns and Laravel's corresponding implementation.

| Endpoint | Purpose | Node Route | Laravel Equivalent |
|---|---|---|---|
| `GET /api/trips` | Paginated feed of published trips | `tripController.index` | `TripController@index` |
| `GET /api/trips/:tripId` | Detail view of a trip | `tripController.show` | `TripController@show` |
| `GET /api/my/trips` | Paginated feed of user's own trips | `tripController.myTrips` | `TripController@myTrips` |
| `GET /api/my/joined-trips` | Paginated feed of user's joined trips | `tripController.joinedTrips` | `TripController@joinedTrips` |
| `GET /api/trips/:tripId/members` | List active members of a trip | `tripMemberController.index` | `TripMemberController@index` |

## 2. Rationale
Flutter explicitly targets these endpoints in `api_constants.dart` (`trips`, `myTrips`, `myJoinedTrips`, `tripById`, `tripMembers`). They are strictly read-only, perfectly complying with N3-C safety guidelines. They logically follow N3-B by transitioning from User profiles to the core domain model (Trips).

## 3. Architecture

### Route Layer
- Added to `src/routes/api.js`.
- All routes are protected by the `authenticate` middleware inherited from N3-A.

### Controller Layer
- `src/controllers/tripController.js` handles discovery and fetching individual/my trips.
- `src/controllers/tripMemberController.js` handles fetching trip members.
- Authorization is executed inline inside controllers, mirroring Laravel Policies (e.g., `TripPolicy::view`).

### Service Layer
- `src/services/tripDiscoveryService.js` accurately replicates `App\Services\TripDiscoveryService.php`.
- Evaluates overlapping date rules (via `start_date`/`end_date` boundary math).
- Evaluates overlapping budget rules.
- Manages strict sorting allowlists (`newest`, `updated`, `start_date`) with a stable secondary sort (`id ASC`) to prevent pagination drifting.

### Repository Layer
- `src/repositories/tripRepository.js` implements specific methods for paginated loading with relationships (`findByIdWithRelations`, `findMyTripsPaginated`, `findMyJoinedTripsPaginated`).
- `src/repositories/membershipRepository.js` adds `findActiveByTripIdWithUser` to fetch active members eagerly loaded with user data.
- Eager loads use `take: 1` dynamically bounded by the authenticated `user_id` to replicate Laravel's `currentUserMembership` loading safely.

### Resource Layer
- **TripResource (`src/resources/tripResource.js`)**: Matches Laravel's `TripResource`. Formats IDs as strings, decimals as strings, generates the public storage URL for the trip image, and dynamically injects `membership` state based on `currentUserMembership` and `currentUserJoinRequest`.
- **TripOwnerResource (`src/resources/tripOwnerResource.js`)**: Matches Laravel's lightweight nested representation to prevent deep recursive serialization.
- **TripMemberResource (`src/resources/tripMemberResource.js`)**: Represents member relationships securely.

## 4. Security & Safety
- **IDOR Protection**: `GET /api/my/trips` and `GET /api/my/joined-trips` strictly read `req.user.id` from the middleware token context.
- **Authorization**: `GET /api/trips/:tripId` explicitly executes the three rules from `TripPolicy::view`: (1) is owner, OR (2) is active member, OR (3) trip is published.
- **Safe Serialization**: BigInts are stringified. Prisma's internal representations are filtered securely. Null fields are preserved appropriately. Unsafe/unbound pagination is prevented (`Math.max(1, Math.min(50, ...))`).
