# N3-D ENDPOINT ARCHITECTURE

## 1. Selected Scope
This phase targets **Companion Discovery and Connections (Read-Only)** based on Flutter's consumption patterns and Laravel's corresponding implementation.

| Endpoint | Purpose | Node Route | Laravel Equivalent |
|---|---|---|---|
| `GET /api/companions` | Paginated feed of discoverable users | `companionDiscoveryController.index` | `CompanionDiscoveryController@index` |
| `GET /api/connections` | List user's accepted connections | `connectionRequestController.index` | `ConnectionRequestController@index` |
| `GET /api/connections/received` | List connection requests received | `connectionRequestController.received` | `ConnectionRequestController@received` |
| `GET /api/connections/sent` | List connection requests sent | `connectionRequestController.sent` | `ConnectionRequestController@sent` |

## 2. Rationale
Flutter explicitly targets these endpoints in `api_constants.dart` (`companions`, `connections`, `connectionsReceived`, `connectionsSent`). They logically represent the "User Networking" domain. They are strictly read-only, complying with N3-D safety guidelines.

## 3. Architecture

### Route Layer
- Added to `src/routes/api.js`.
- All routes are protected by the `authenticate` middleware inherited from N3-A.

### Controller Layer
- `src/controllers/companionDiscoveryController.js` handles discovery.
- `src/controllers/connectionRequestController.js` handles reading network state.
- Query parameters are validated explicitly in the controllers to ensure compliance with Laravel's `FormRequest` validation contract, rejecting invalid inputs rather than silently clamping them.

### Service Layer
- `src/services/companionDiscoveryService.js` is mapped to `App\Services\CompanionDiscoveryService.php`.
- Executes overlapping date rules (via `start_date`/`end_date`).
- Executes overlapping destination/place_id text search via Prisma `contains`.
- Manages strict sorting (`profile_completion`, `newest`). For `profile_completion` MVP behavior, Node calculates the score dynamically using a pre-fetch step on matching profiles before applying pagination limits, mirroring Laravel's subquery logic while keeping JS-Prisma implementations safe.

### Repository Layer
- Directly utilizes `prisma` within the service and connection controllers, adhering to the read-only N3-D scope (`count`, `findMany`).

### Resource Layer
- **CompanionResource (`src/resources/companionResource.js`)**: Compatible with Laravel's `CompanionResource` structure. Formats IDs as strings, safely omits sensitive fields, dynamically injects eager-loaded profiles, destinations, and interests. Safely handles missing/empty JSON languages arrays.
- **ConnectionRequestResource (`src/resources/connectionRequestResource.js`)**: Compatible with Laravel's `ConnectionRequestResource`. Formats IDs as strings, injects nested requester/recipient representations.

## 4. Security & Safety
- **IDOR Protection**: All `/api/connections` routes strictly read `req.user.id` from the middleware token context.
- **Privacy Controls**: `GET /api/companions` strictly excludes the authenticated user from the feed. It also mandates `is_discoverable = true` and a profile completion gate (at least one bio/city/country/travel_style filled).
- **Safe Serialization**: BigInts are stringified. Passwords and emails are explicitly excluded from resources. Missing relationships are safely omitted from JSON responses. Unsafe/unbound pagination is prevented via 422 validations.
