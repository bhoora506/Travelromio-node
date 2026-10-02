# WRITE WORKFLOW DISCOVERY & SAFETY AUDIT

## 1. Executive Summary
This document is a purely discovery-driven safety audit of the remaining Laravel API write workflows. No implementations or database modifications were performed. The audit maps all remaining mutation endpoints across 6 bounded contexts, documenting their validation, authorization, database mutations, transaction boundaries, and side effects.

## 2. Remaining Endpoint Matrix

| Method | Path | Controller@Method | Middleware | Primary Service/Request |
|---|---|---|---|---|
| `PUT` | `/api/profile` | `ProfileController@update` | `auth:sanctum` | `UpdateProfileRequest` |
| `PUT` | `/api/profile/interests` | `ProfileController@updateInterests` | `auth:sanctum` | `UpdateInterestsRequest` |
| `POST` | `/api/profile/photo` | `ProfileController@uploadPhoto` | `auth:sanctum` | `UploadPhotoRequest` |
| `DELETE` | `/api/profile/photo` | `ProfileController@deletePhoto` | `auth:sanctum` | N/A |
| `POST` | `/api/profile/device-token` | `ProfileController@registerDeviceToken` | `auth:sanctum` | `RegisterDeviceTokenRequest`, `DeviceTokenService` |
| `DELETE` | `/api/profile/device-token` | `ProfileController@unregisterDeviceToken` | `auth:sanctum` | `UnregisterDeviceTokenRequest`, `DeviceTokenService` |
| `POST` | `/api/profile/destinations` | `PreferredDestinationController@store` | `auth:sanctum` | `SavePreferredDestinationRequest` |
| `PUT` | `/api/profile/destinations/{id}`| `PreferredDestinationController@update` | `auth:sanctum` | `SavePreferredDestinationRequest` |
| `DELETE`| `/api/profile/destinations/{id}`| `PreferredDestinationController@destroy` | `auth:sanctum` | N/A |
| `POST` | `/api/profile/availability` | `TravelAvailabilityController@store` | `auth:sanctum` | `CreateAvailabilityRequest` |
| `PUT` | `/api/profile/availability/{id}`| `TravelAvailabilityController@update` | `auth:sanctum` | `UpdateAvailabilityRequest` |
| `DELETE`| `/api/profile/availability/{id}`| `TravelAvailabilityController@destroy` | `auth:sanctum` | N/A |
| `POST` | `/api/trips` | `TripController@store` | `auth:sanctum` | `CreateTripRequest`, `TripService` |
| `PUT` | `/api/trips/{trip}` | `TripController@update` | `auth:sanctum` | `UpdateTripRequest`, `TripService` |
| `POST` | `/api/trips/{trip}/publish` | `TripController@publish` | `auth:sanctum` | `TripService` |
| `POST` | `/api/trips/{trip}/cancel` | `TripController@cancel` | `auth:sanctum` | `TripService` |
| `POST` | `/api/trips/{trip}/join-requests` | `TripJoinRequestController@store` | `auth:sanctum` | `TripJoinRequestService` |
| `POST` | `/api/trips/{trip}/join-requests/{jr}/approve` | `TripJoinRequestController@approve`| `auth:sanctum` | `TripJoinRequestService` |
| `POST` | `.../{jr}/reject`, `.../{jr}/cancel`| `TripJoinRequestController` | `auth:sanctum` | `TripJoinRequestService` |
| `POST` | `/api/connections` | `ConnectionRequestController@store` | `auth:sanctum` | `ConnectionRequestService` |
| `POST` | `/api/connections/{cr}/accept` | `ConnectionRequestController@accept` | `auth:sanctum` | `ConnectionRequestService` |
| `POST` | `.../{cr}/reject`, `.../{cr}/cancel`| `ConnectionRequestController` | `auth:sanctum` | `ConnectionRequestService` |
| `POST` | `/api/conversations` | `ConversationController@store` | `auth:sanctum` | `ConversationService` |
| `POST` | `/api/conversations/{c}/messages` | `ConversationController@sendMessage` | `auth:sanctum` | `ConversationService` |
| `POST` | `/api/conversations/{c}/read` | `ConversationController@markAsRead` | `auth:sanctum` | `ConversationService` |

## 3. Profile Management Audit
- **Validation**: Enforces types (bio max 1000, max 10 languages), enum values (travel_style), conditional constraints (budget_max >= budget_min), arrays (interest_ids), and files (`mimes:jpeg,png,jpg,webp`, 5MB max).
- **Auth**: Always derives user from `req->user()`.
- **DB Mutations**: `user_profiles` (`updateOrCreate`, `update`), `user_interests` (`sync`), `user_devices` (create/update/delete via upsert logic on `fcm_token`).
- **Transactions**: None.
- **Side Effects**: `Storage::disk('public')` for profile photo uploads/deletions. Device token registration strictly writes to DB (FCM is not pinged).
- **Errors**: Standard 422 for validation.

## 4. Destination & Availability Mutation Audit
- **Validation**: 
  - *Destinations*: Limit of 50 per user, enforced dynamically inside `withValidator`. Prevents duplicates manually checking against `place_id` and normalized `destination` strings against existing DB rows.
  - *Availability*: `end_date` must be after/equal `start_date`.
- **Auth**: IDOR protection is manual: `abort_if($destination->user_id !== $request->user()->id, 403)`.
- **DB Mutations**: Direct `create`, `update`, `delete` on `preferred_destinations` and `travel_availabilities`.
- **Transactions**: None.
- **Side Effects**: None.

## 5. Trip Management Audit
- **Workflow**: `TripService` handles creation and updates.
- **Transactions**: `createTrip` runs inside `DB::transaction`. It creates a `Trip`, creates a `TripMember` (Role: Owner, Status: Active), syncs `interests`, and uploads an image. If it fails, the image is physically deleted from storage.
- **Lifecycle Constraints**: 
  - Draft/Published: Fully editable.
  - Ongoing: Only `title` and `description` editable.
  - Completed/Cancelled: Immutable (throws 409).
- **Validation**: Publishing requires specific fields (title, destination, dates, type, max_members). 
- **Side Effects**: Filesystem (`Storage::disk('public')`) for trip image uploads/deletions.

## 6. Join Request State Machine
- **Service**: `TripJoinRequestService`.
- **States**: `Pending` -> `Approved` / `Rejected` / `Cancelled`.
- **Transactions & Concurrency**: The `approve` method uses `DB::transaction` AND pessimistic locking (`lockForUpdate()`) on the `Trip` row to prevent concurrent race conditions from exceeding `max_members`. Approval inserts a `TripMember` row.
- **Side Effects**: None configured currently.

## 7. Connection State Machine
- **Service**: `ConnectionRequestService`.
- **States**: `Pending` -> `Accepted` / `Rejected` / `Cancelled`.
- **Concurrency/Rules**: Re-requesting is allowed after rejection/cancellation. Only one pending request per pair. A recipient must have `is_discoverable=true` (or returns 404 to avoid leaking existence).
- **Transactions**: The `accept` method uses `DB::transaction` with `lockForUpdate()` on the `connection_requests` row.
- **Side Effects**: None configured currently.

## 8. Chat Mutation Audit
- **Service**: `ConversationService`.
- **Constraints**: Bidirectional `requester_id`/`recipient_id` canonical storage (`[min(a,b), max(a,b)]`). `findOrCreate` uses `DB::transaction`.
- **Authorization**: Sender and recipient must have an accepted connection OR share an active trip (`canChat`).
- **Side Effects**: 
  - `sendMessage` triggers an asynchronous Laravel Job: `SendChatMessageNotification::dispatchAfterResponse`.
  - The Job uses `FCMService` to hit the `fcm.googleapis.com` API to dispatch push notifications to offline devices (`user_devices` table).

## 9. Cross-Cutting Side Effects
| Endpoint | Side Effect | Where Triggered | Sync/Async | External Dependency | Migration Concern |
|---|---|---|---|---|---|
| `POST/DELETE /profile/photo` | Local File Storage | `ProfileController` | Sync | File System (`public` disk) | Requires `multer` + static file serving setup in Express. |
| `POST/PUT /trips` | Local File Storage | `TripService` | Sync | File System (`public` disk) | Same as above. |
| `POST /conversations/.../messages` | FCM Push Notification | `ConversationController` | Async | `fcm.googleapis.com` | Requires Firebase Admin Node SDK + Job Queue (e.g., BullMQ). |

## 10. Database Mutation Map
- `user_profiles`: UPDATE/INSERT (no deletes).
- `user_interests`: SYNC (delete/insert).
- `user_devices`: UPSERT/DELETE.
- `preferred_destinations`: INSERT/UPDATE/DELETE.
- `travel_availabilities`: INSERT/UPDATE/DELETE.
- `trips`: INSERT/UPDATE.
- `trip_members`: INSERT.
- `trip_interests`: SYNC.
- `trip_join_requests`: INSERT/UPDATE.
- `connection_requests`: INSERT/UPDATE.
- `conversations`: INSERT.
- `messages`: INSERT/UPDATE (`read_at`).

## 11. Flutter Caller/Contract Map
- Found across `lib/data/services/profile_service.dart` and `trip_service.dart`. 
- `profile_service.dart` calls `/api/profile/photo` as `multipart/form-data` with the file attached to the `photo` field.
- `trip_service.dart` calls `/api/trips` as `multipart/form-data` with the file attached to the `image` field.
- Flutter correctly expects Laravel HTTP 409 and 422 error shapes and uses standard JSON body serialization for all other endpoints.

## 12. Existing Node Infrastructure
- **Ready**: Prisma `find/create/update/delete`, `$transaction` support, error handling structure, authentication middleware.
- **Missing / Needs Implementation**:
  1. `multer` middleware for `multipart/form-data` parsing (Photos, Trips).
  2. File storage handlers (delete old files, generate unique names).
  3. Firebase Admin SDK integration (`FCMService` equivalent).
  4. Asynchronous job processing (or a safe non-blocking Node equivalent) for Push Notifications.

## 13. Risk Classification
- **LOW**: Profile Extensions (Destinations/Availability). Simple CRUD, no transactions, no files, no side effects.
- **MEDIUM**: Profile Management. Introduces basic file uploading and FCM token DB writes.
- **MEDIUM**: Connection Requests & Join Requests. Introduces Prisma `$transaction` and pessimistic locking requirements (`SELECT ... FOR UPDATE` via Prisma `$queryRaw` or similar).
- **HIGH**: Trip Management. File uploads combined with multi-table transactions, rollback-on-failure logic, and complex state machine validation.
- **HIGH**: Chat Mutations. Requires FCM API integration and asynchronous job queuing.

## 14. Dependency-Aware Migration Sequence
1. **Phase N3-G**: Profile Destinations & Availability (LOW risk, isolated).
2. **Phase N3-H**: Profile Management Core & Device Tokens (MEDIUM risk, introduces `multer`).
3. **Phase N3-I**: Connection Requests (MEDIUM risk, introduces `$transaction` logic).
4. **Phase N3-J**: Trip Management Core (HIGH risk, combines `multer` + `$transaction` + `sync`).
5. **Phase N3-K**: Join Requests (MEDIUM risk, depends on Trip Management).
6. **Phase N3-L**: Chat & Notifications (HIGH risk, introduces Firebase/Push + async tasks).

## 15. Proposed N3-G Scope
**Profile Destination & Availability Mutations**
- `POST /api/profile/destinations`
- `PUT /api/profile/destinations/{id}`
- `DELETE /api/profile/destinations/{id}`
- `POST /api/profile/availability`
- `PUT /api/profile/availability/{id}`
- `DELETE /api/profile/availability/{id}`

*Reasoning*: This scope is completely bounded to the `req.user.id`. It avoids file uploads, Firebase, asynchronous tasks, and complex database transactions. It provides a safe environment to establish the Node pattern for mutation controllers, request validation (e.g., max 50 destinations rule), and simple IDOR protection (`abort_if(user_id !== req.user.id)`) before tackling complex state machines.

## 16. Security / IDOR Findings
Laravel manually validates ownership inside the controller using `abort_if($model->user_id !== $request->user()->id, 403)`. Node must enforce this identically for PUT/DELETE operations. 

## 17. Verification / No-Mutation Confirmation
- **Laravel files changed:** NO
- **Flutter files changed:** NO
- **Node implementation files changed:** NO
- **Shared MySQL data changed:** NO
- **Migrations executed:** NO
- **Seeders executed:** NO
