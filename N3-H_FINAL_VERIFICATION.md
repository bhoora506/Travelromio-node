# N3-H Final Verification: Profile Management Core & Device Tokens

## 1. Laravel Source Inspected
- `app/Http/Controllers/ProfileController.php`
- `app/Http/Requests/Profile/UpdateProfileRequest.php`
- `app/Http/Requests/Profile/UpdateInterestsRequest.php`
- `app/Http/Requests/Profile/UploadPhotoRequest.php`
- `app/Http/Requests/Profile/RegisterDeviceTokenRequest.php`
- `app/Http/Requests/Profile/UnregisterDeviceTokenRequest.php`
- `routes/api.php`

## 2. Flutter Callers Inspected
- `lib/data/services/profile_service.dart` (specifically `updateProfile`, `uploadProfilePhoto`, `deleteProfilePhoto`, `updateInterests`)

## 3. Endpoints Implemented
- `PUT /api/profile` (Update core profile)
- `PUT /api/profile/interests` (Sync interests array)
- `POST /api/profile/device-token` (Register FCM token)
- `DELETE /api/profile/device-token` (Remove FCM token)
- `POST /api/profile/photo` (Upload profile photo via multipart/form-data)
- `DELETE /api/profile/photo` (Remove profile photo)

## 4. Validation Rules
- **Profile Update**: `bio` (max 1000), `city` (max 100), `country` (max 100), `languages` (array, max 10), `travel_style` (enum approx match), `preferred_budget_min` (numeric), `preferred_budget_max` (numeric, must be >= `preferred_budget_min`).
- **Interests Sync**: `interest_ids` (array, max 20), ID existence enforced.
- **Photo Upload**: Requires `photo` field.
- **Device Token**: `fcm_token` (string, max 255), `platform` (in: `android`, `ios`).

## 5. Authentication & Ownership Rules
- All endpoints use the existing Sanctum-compatible `authenticate` middleware.
- Identity is exclusively derived from `req.user.id`.
- The client cannot supply a `user_id` to override ownership.
- Device tokens are removed strictly for the authenticated user based on the `fcm_token`.

## 6. DB Tables & Columns Touched
- `user_profiles` (`bio`, `city`, `country`, `languages`, `travel_style`, `preferred_budget_min`, `preferred_budget_max`, `profile_photo_path`).
- `user_interests` (Syncs `user_id` and `interest_id` relationships).
- `user_devices` (`fcm_token`, `platform`, `last_used_at`).

## 7. Transaction Behavior
- `user_interests` synchronization uses a Prisma `$transaction` to atomically `deleteMany` existing interests and `createMany` new ones.

## 8. File-Storage Behavior
- Added `multer` middleware to safely parse `multipart/form-data` with a 5MB limit and MIME type checking (JPEG, PNG, JPG, WEBP).
- Files are saved directly to `public/storage/profile-photos/` with randomized 16-byte hex filenames to prevent path traversal and arbitrary overwriting.
- Uploading a new photo or calling delete explicitly removes the old photo using `fs.unlinkSync` if it exists.

## 9. Device-Token Behavior
- Implemented via a `DeviceTokenService`.
- Uses an upsert against the unique `fcm_token` to ensure idempotency.
- Deletion removes the exact token only if owned by the current user.

## 10. Tests Performed
- Created `scripts/test-endpoints-n3h.js`.
- Performed safe integration testing with mocked authentication and Prisma repositories to prevent shared database mutations.
- Verified all validation logic returns expected 422 HTTP errors.
- Verified successful workflows (200 responses) and simulated photo uploads via `form-data` stream testing.

## 11. Regression Results
- `npm run test:endpoints:n3h` passes.
- Previous tests (`verify:db`, `test:auth`, `test:endpoints:n3b-n3g`) passed.
- `npm audit` was verified (multer installed safely).

## 12. Shared DB Mutation Status
- **NO MUTATIONS** were performed against the shared MySQL database. All writes for N3-H testing were successfully isolated using memory mocks.

## 13. Laravel / Flutter Modification Status
- **NO CHANGES** were made to the Laravel or Flutter source code.

## 14. Prisma Schema Modification Status
- **NO CHANGES** were made to `prisma.schema`.

## 15. Known Deviations or Verification Limitations
- The `photo` MIME type validation acts at the extension/MIME header level provided by Multer; deeper file-header (magic number) verification was not implemented to avoid scope creep beyond Laravel's default image validation.
- Flutter was verified to use standard expected JSON endpoints, matching the payload logic.
