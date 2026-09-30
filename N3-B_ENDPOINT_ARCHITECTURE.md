# N3-B Endpoint Architecture

## 1. Overview
Phase N3-B establishes the first authenticated Node.js API endpoints securely layered on top of the N3-A authentication foundation. The goal is to verify that routes, middleware, controllers, services, repositories, and resources correctly interact while strictly preserving Laravel/Flutter behavioral compatibility.

## 2. Selected Scope
The following read-only endpoints were selected for this proof of concept based on actual Flutter consumption patterns (`api_constants.dart`) and their presence in `routes/api.php`:

1. **`GET /api/interests`** (Public)
2. **`GET /api/auth/me`** (Authenticated)
3. **`GET /api/profile`** (Authenticated)

## 3. Architecture Layering
Requests follow strict separation of concerns matching the approved blueprint:
`HTTP -> Route -> Middleware -> Controller -> Service/Repository -> Response/Resource -> Client`

- **Routes (`src/routes/api.js`)**: Defines route paths and applies `authenticate` middleware explicitly on a per-route basis (avoiding the 404 interception bug).
- **Controllers (`src/controllers/*.js`)**: Handles request execution, error catching, and standardizes output using `src/utils/response.js`.
- **Services (`src/services/*.js`)**: Implements business rules (e.g., `ProfileCompletionService` replicating Laravel's percentage calculation without N+1 query side-effects).
- **Repositories (`src/repositories/*.js`)**: Encapsulates all Prisma database queries. Added `findByIdWithInterestsCount` and `findByIdWithProfileAndInterests` to fetch nested relationships explicitly.
- **Resources (`src/resources/*.js`)**: Maps raw Prisma data into the exact JSON shapes expected by Flutter, safely converting `BigInt` to `String` and formatting `Date` / `Decimal` values.

## 4. Laravel & Flutter Compatibility
- **HTTP Structure**: `successResponse` exactly matches Laravel's `ApiResponse` trait: `{ "success": true, "message": "...", "data": {...} }`.
- **UserResource**: Maps `profile_completion`, `created_at`, `email_verified_at` identical to Laravel's `App\Http\Resources\UserResource`.
- **ProfileResource**: Correctly generates `profile_photo_url` dynamically using `src/utils/storage.js` to replicate `Storage::disk('public')->url()`.
- **Missing Relationship Loading**: `GET /api/auth/me` intentionally omits `profile` from the response (exactly matching Laravel's `$this->whenLoaded('profile')`), while still utilizing it to calculate `profile_completion`. `GET /api/profile` includes the profile explicitly.

## 5. Security & Safety
- **No DB Writes**: No transactions, updates, or inserts are executed.
- **Error Obfuscation**: DB and syntax errors are caught and masked via `errorResponse`, avoiding Prisma stack trace leakage.
- **BigInt Protection**: IDs are stringified recursively via `bigIntToString()` to prevent JavaScript Number precision loss. Decimal limits are stringified securely.

## 6. Testing Strategy
Endpoint tests (`scripts/test-endpoints-n3b.js`) spawn an ephemeral Express listener and send actual HTTP requests. 
To preserve N3-B's "No Database Modification" rule, token existence is monkey-patched in `authService.js` to simulate a valid token without requiring seed data in `personal_access_tokens`. All endpoints assert correct 200 OK outputs and specific Resource shapes.
