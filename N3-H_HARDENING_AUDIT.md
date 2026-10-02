# N3-H HARDENING AUDIT REPORT — VALIDATION & PHOTO STORAGE

## 1. Exact Laravel Validation Rules Verified
- `UpdateProfileRequest.php`:
  - `bio`: nullable, string, max:1000
  - `city`: nullable, string, max:100
  - `country`: nullable, string, max:100
  - `languages`: nullable, array, max:10
  - `languages.*`: string, max:50
  - `travel_style`: nullable, string, `Rule::in(TravelStyle::values())` (adventure, backpacking, budget, luxury, relaxed, road_trip, nature, cultural)
  - `preferred_budget_min`: nullable, numeric, min:0
  - `preferred_budget_max`: nullable, numeric, min:0, and if `preferred_budget_min` filled, `gte:preferred_budget_min`
- `UpdateInterestsRequest.php`:
  - `interest_ids`: required, array, max:20
  - `interest_ids.*`: required, integer, exists:interests,id
- `RegisterDeviceTokenRequest.php`:
  - `fcm_token`: required, string, max:255
  - `platform`: required, string, in:android,ios
- `UnregisterDeviceTokenRequest.php`:
  - `fcm_token`: required, string, max:255
- `UploadPhotoRequest.php`:
  - `photo`: required, image, mimes:jpeg,png,jpg,webp, max:5120

## 2. Exact Node Validation Rules Verified & Fixed
- **CONCRETE N3-H ISSUE FOUND & FIXED**: Node's profile update endpoint lacked string type checks, max-length limits on `bio`/`city`/`country`, and array-item limit checks on `languages.*`.
- **CONCRETE N3-H ISSUE FOUND & FIXED**: The `travel_style` enum array originally had mismatched approximation values (`foodie`, `party`, `solo`). These were strictly corrected to match Laravel (`adventure`, `backpacking`, `budget`, `luxury`, `relaxed`, `road_trip`, `nature`, `cultural`).
- **CONCRETE N3-H ISSUE FOUND & FIXED**: `interest_ids.*` integer enforcement added.
- **CONCRETE N3-H ISSUE FOUND & FIXED**: `preferred_budget_min/max` numeric `min:0` constraint added.
- All device token requests were verified to exactly match Laravel limits and bounds safely.

## 3. Photo Validation/Storage Comparison
- **VERIFIED LIMITATION**: Laravel's `image` and `mimes` rules evaluate MIME types by analyzing the physical file headers (magic numbers via PHP's `finfo`). Node's `multer` configuration relies solely on the HTTP `Content-Type` header supplied by the client and the file extension. Node's validation is thus materially weaker for file signature validation. Deeper binary checking (e.g., using `file-type`) would be required for full parity, but this was excluded to avoid scope creep as directed.
- Size limit is enforced at 5MB (`5120` kilobytes / `5 * 1024 * 1024` bytes) in both.
- Path generation uses secure hex generation.

## 4. Photo Deletion/Replacement Security Audit
- **CONCRETE N3-H ISSUE FOUND & FIXED**: The previous `profileService.js` deletion blindly passed the DB's `profile_photo_path` to `fs.unlinkSync()`. While standard behavior is safe, a malformed DB entry could lead to path traversal.
- **Fix**: Wrapped deletion in `path.resolve` and an explicit `startsWith` check asserting the resolved path remains within the `public/storage` boundary.
- **Parity**: Deletion targets only the authenticated user's profile record. The client never supplies the path, it is exclusively read from the user's secure server-side DB relationship.

## 5. Device-Token Parity Audit
- **PASS**: Laravel's `DeviceTokenService::register` correctly performs an upsert: locating by `fcm_token` and reassigning `user_id` and `platform` if it exists. Node perfectly implements this behavior via Prisma's `upsert` mechanism with the `fcm_token` unique constraint. Tokens safely and idempotently move between users on device switch/login.
- **PASS**: Deletion targets `fcm_token` + `user_id` atomically, matching Laravel `where()` constraints exactly.

## 6. Interest-Sync Parity Audit
- **CONCRETE N3-H ISSUE FOUND & FIXED**: Laravel Eloquent's `sync()` natively handles (ignores) duplicate inputs inside the array. Node Prisma `createMany` would throw unique-key constraint violations on duplicate inputs. 
- **Fix**: Implemented array deduplication using `[...new Set(interestIds)]` and added `skipDuplicates: true` in the Prisma transaction to emulate Eloquent's silent resilience.

## 7. Error-Cleanup Audit
- **PASS**: 
  - If a file write fails (Node/multer or Laravel/storage), the DB is never updated.
  - If the file write succeeds but the DB update fails, both Laravel and Node leave an orphan file on the disk. This matches the legacy Laravel behavior.
  - Delete failures safely abort execution, preventing DB nullification on filesystem errors.

## 8. Actual Test Results
- Ran `npm run test:endpoints:n3h`.
- 12/12 N3-H endpoints mocked DB integration tests passed.

## 9. Regression Results
- `npm run verify:db` passed.
- `npm run test:repositories` passed.
- `npm run test:auth` passed.
- `npm run test:endpoints:n3b` passed.
- `npm run test:endpoints:n3c` passed.
- `npm run test:endpoints:n3d` passed.
- `npm run test:endpoints:n3e` passed.
- `npm run test:endpoints:n3f` passed.
- `npm run test:endpoints:n3g` passed.
- `npm run test:endpoints:n3h` passed.
- `npm audit` verified (0 vulnerabilities).

## 10. Shared DB Mutation Confirmation
- **PASS**: Absolutely no shared DB mutation occurred. N3-H tests were run with mocked repositories exclusively.

## 11. Concrete Issues Found & Fixed
1. **Mismatched TravelStyle enum values**: Fixed in `profileService.js` to strictly match Laravel.
2. **Missing `bio`, `city`, `country` max limits**: Added explicit 1000/100/100 string limits in `profileService.js`.
3. **Missing budget `min:0` constraint**: Added explicit parsed-float `min:0` checks.
4. **Missing array-item size limits**: Added 50-char max logic for `languages.*` array iteration.
5. **Path Traversal Risk**: Added `path.resolve().startsWith()` to `fs.unlinkSync()` logic to lock deletion to the `storage` directory.
6. **Interest Sync Duplication Crash**: Added `new Set()` deduplication mimicking Laravel Eloquent's `sync()` array handling.

## 12. Remaining Verified Limitations
- Node's `multer` file MIME type validation is limited to the HTTP header/extension compared to Laravel's deeper `finfo` magic-number validation (which was not replicated due to scope limits).
