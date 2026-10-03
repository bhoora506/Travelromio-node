# N3-K: Trip Join Requests — Audit Report

## 1. N3-K Endpoint Inventory
The following endpoints implement the Trip Join Request lifecycle:
- **`POST /api/trips/{tripId}/join-requests`**: Submit a new join request.
- **`GET /api/trips/{tripId}/join-requests`**: List all incoming join requests (owner only).
- **`POST /api/trips/{tripId}/join-requests/{joinRequestId}/approve`**: Approve a pending request (owner only).
- **`POST /api/trips/{tripId}/join-requests/{joinRequestId}/reject`**: Reject a pending request (owner only).
- **`POST /api/trips/{tripId}/join-requests/{joinRequestId}/cancel`**: Cancel a pending request (requester only).

## 2. Laravel Source Files Inspected
- `routes/api.php`
- `app/Http/Controllers/TripJoinRequestController.php`
- `app/Services/TripJoinRequestService.php`
- `app/Models/TripJoinRequest.php`
- `app/Models/Trip.php`
- `app/Models/TripMember.php`
- `app/Policies/TripJoinRequestPolicy.php`
- `app/Http/Resources/TripJoinRequestResource.php`
- `app/Enums/JoinRequestStatus.php`

## 3. Flutter Callers Inspected
File: `lib/data/services/trip_service.dart`
- **`createJoinRequest(tripId)`**: Calls POST `/api/trips/{tripId}/join-requests`
- **`getJoinRequests(tripId)`**: Calls GET `/api/trips/{tripId}/join-requests`. No pagination arguments are passed; expects a flat list array under `data.join_requests`.
- **`approveJoinRequest(tripId, jrId)`**: Calls POST `.../approve`
- **`rejectJoinRequest(tripId, jrId)`**: Calls POST `.../reject`
- **`cancelJoinRequest(tripId, jrId)`**: Calls POST `.../cancel`
None of the endpoints send a JSON body or multipart payload. They strictly use the URL parameters.

## 4. Exact Validation Rules
There is no `FormRequest` validation for payloads since these endpoints do not accept a request body. However, the business logic validates state constraints:
- **Create**:
  - `end_date` must not be in the past.
  - User must not already be an `active` member.
  - User must not have a currently `pending` join request.
  - Trip must have open slots (`max_members - active_members > 0`).
- **Approve/Reject/Cancel**:
  - Request must belong to the specified `tripId` (404 otherwise).
  - Request status must be `pending`.
- **Approve Additional**:
  - Trip must be `published`.
  - Trip must still have open slots (re-checked within a transaction).

## 5. Exact State Machine
**Initial State**: `pending`
**Transitions**:
- `pending` → `approved` (Terminal, triggers `TripMember` creation)
- `pending` → `rejected` (Terminal)
- `pending` → `cancelled` (Terminal)
**Re-creation**: A user may submit a *new* request (creating a new row) if their previous requests for the trip are all in terminal states (`rejected` or `cancelled`).

## 6. Authorization Matrix
| Endpoint | Requester (Non-Owner) | Trip Owner | Active Member | Non-Member |
| :--- | :--- | :--- | :--- | :--- |
| **POST (Submit)** | **Allowed** | 403 Forbidden | 409 Conflict | **Allowed** |
| **GET (List)** | 403 Forbidden | **Allowed** | 403 Forbidden | 403 Forbidden |
| **POST (Approve)**| 403 Forbidden | **Allowed** | 403 Forbidden | 403 Forbidden |
| **POST (Reject)** | 403 Forbidden | **Allowed** | 403 Forbidden | 403 Forbidden |
| **POST (Cancel)** | **Allowed** (own only)| 403 Forbidden | N/A | 403 Forbidden |

## 7. Capacity / Concurrency Behavior
**Critical Sequence in Laravel**:
1. Initiates `DB::transaction(...)`.
2. Locks the trip row: `Trip::where('id', ...)->lockForUpdate()->firstOrFail()`.
3. Re-validates the join request is `pending`.
4. Re-validates the trip status is `published`.
5. Re-calculates capacity: `trip->max_members - trip->activeMembers()->count() > 0`.
6. Creates a `TripMember` row with role `member` and status `active`.
7. Updates the `TripJoinRequest` to `approved`.
**Result**: If two approvals happen simultaneously for the last slot, the database lock ensures the second transaction waits. Once the first commits, the second re-checks capacity and correctly fails with a 409 Conflict: `"This trip is full. No more members can be approved."`

## 8. Database Schema / Constraints
**`trip_join_requests` table**:
- `id` (BigInt PK), `trip_id`, `user_id`, `status` (default: 'pending'), `created_at`, `updated_at`.
- **Foreign Keys**: `trip_id` (Cascade), `user_id` (NoAction).
- **Constraints**: No unique constraints exist. Application logic ensures only one `pending` request per user per trip.
**`trip_members` table**:
- **Constraints**: `@@unique([trip_id, user_id])`. Enforces a user can only have one membership row (active, left, or removed).
The Prisma schema perfectly matches this setup.

## 9. Response Contract
**Success Response**: 200/201 HTTP Status.
```json
{
  "success": true,
  "message": "...",
  "data": {
    "join_request": {
      "id": 1,
      "trip_id": 123,
      "status": "pending",
      "requester": { "id": 456, "name": "Jane" },
      "created_at": "...",
      "updated_at": "..."
    }
  }
}
```
**List Response**: 200 HTTP Status. `data.join_requests` contains an array of the above objects (not paginated).
**Errors**:
- 403 Forbidden: "This action is unauthorized."
- 404 Not Found: "Join request not found for this trip."
- 409 Conflict: Returns exact strings like "You are already a member of this trip.", "This trip is full and is not accepting more members.", or "Cannot approve a request that is already approved."

## 10. Notifications / Side Effects
The Laravel `TripJoinRequestService` does **not** dispatch any events, jobs, or push notifications during creation, approval, rejection, or cancellation. Side effects are strictly database state changes.

## 11. Node Reuse Opportunities
- `TripRepository`: Reuse `findById` and `getActiveMemberCount`.
- Error classes: Use existing `HttpError(409, message)`.
- Transaction: Use existing Prisma `$transaction` support for atomic approval.
- Repositories: We will need a new `JoinRequestRepository` and potentially a method in `TripMemberRepository` to create members safely.

## 12. Security / IDOR Findings
- **Cross-Trip Manipulation**: Laravel strictly enforces `ensureRequestBelongsToTrip`, checking that the `trip_id` in the URL matches the `join_request->trip_id`. If they mismatch, it aborts with 404. We must replicate this in Node.
- **Spoofing**: Requester ID is always drawn securely from `auth()->user()`. Trip Owner permissions are checked against `trip->user_id`.
- **Duplicate Requests**: Enforced at the application level via an `exists()` query for `status = 'pending'`.

## 13. Laravel vs Existing Node Prisma Differences
No differences found. The Prisma schema fully encapsulates the required `trip_join_requests` and `trip_members` models with identical foreign keys and indexes.

## 14. Risks / Compatibility Concerns
- **Pessimistic Locking**: Node's Prisma doesn't have a direct equivalent to `lockForUpdate()` that operates exactly like Eloquent. We must simulate this using `$queryRaw` with `SELECT ... FOR UPDATE` inside an interactive Prisma `$transaction`, or use an optimistic check / atomic insertion strategy to prevent concurrency bypasses.
- **Flat Array List**: Ensure the index endpoint returns a flat array in `data.join_requests` rather than wrapping it in a paginator, as Flutter expects the flat list.

## 15. Recommended N3-K Implementation Sequence
1. Create `tripJoinRequestRepository.js`.
2. Create `tripJoinRequestService.js` focusing heavily on the concurrency-safe `approve` transaction and strictly matching all 409 text messages.
3. Create `tripJoinRequestController.js` and `tripJoinRequestPolicy.js`.
4. Register routes in `api.js` utilizing the IDOR/relationship check (`ensureRequestBelongsToTrip`).
5. Write N3-K mock tests verifying the exact 403, 404, and 409 edge cases.

## 16. Explicit Read-Only Verification
- 0 Laravel files modified.
- 0 Flutter files modified.
- 0 Node source files created or modified.
- 0 Prisma schema changes made.
- 0 Migrations / Seeders run.
- 0 Shared database rows altered.
