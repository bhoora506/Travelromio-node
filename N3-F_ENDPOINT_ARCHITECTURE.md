# N3-F ENDPOINT ARCHITECTURE

## 1. Selected Scope
This phase implements **Profile Extensions (Read-Only)** based strictly on Flutter's consumption and Laravel's corresponding implementation.

| Endpoint | Purpose | Node Route | Laravel Equivalent |
|---|---|---|---|
| `GET /api/profile/stats` | View profile aggregated stats | `profileStatsController.show` | `ProfileStatsController@show` |
| `GET /api/profile/destinations` | View preferred destinations | `preferredDestinationController.index` | `PreferredDestinationController@index` |
| `GET /api/profile/availability` | View travel availability | `travelAvailabilityController.index` | `TravelAvailabilityController@index` |

## 2. Architecture

### Route Layer
- Added to `src/routes/api.js`.
- All routes are protected by the `authenticate` middleware inherited from N3-A.

### Controller Layer
- **`profileStatsController.js`**: Replicates Laravel's raw database aggregation logic using Prisma's `count` aggregate. It scopes active trips (where `status = 'active'`) and accepted connections (`status = 'accepted'` where the user is either the requester or recipient).
- **`preferredDestinationController.js`**: Fetches `preferred_destinations` for the authenticated user, ordered by `created_at` descending.
- **`travelAvailabilityController.js`**: Fetches `travel_availabilities` for the authenticated user, ordered by `start_date` ascending.

### Service Layer / Repository Layer
- Adhering to the read-only N3-F scope, the controllers directly utilize `prisma` instances to replicate the straightforward logic from Laravel.

### Resource Layer
- **PreferredDestinationResource (`src/resources/preferredDestinationResource.js`)**: Matches Laravel's `PreferredDestinationResource`. Coerces the `id` field from BigInt to a string. Stringifies `latitude` and `longitude` decimals if they exist.
- **TravelAvailabilityResource (`src/resources/travelAvailabilityResource.js`)**: Matches Laravel's `TravelAvailabilityResource`. Formats Date objects consistently to `YYYY-MM-DD` strings (`toDateString()` equivalent).

## 3. Security & Safety
- **IDOR Protection**: All endpoints inherently scope queries explicitly to `req.user.id`. The query payload cannot be modified via client parameters.
- **Safe Serialization**: BigInts are stringified. Decimals are converted to strings, matching the format emitted by Laravel responses.
- **Response Shape**: Conforms identically to the `ApiResponse` wrapper used across the application.
