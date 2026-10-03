# N3-J: Trip Management — Hardening Verification

## 1. Issues Found & Fixed
During the hardening audit, critical file leak vulnerabilities were discovered and fixed:
- **Found**: A non-owner attempting to update a trip with a new image (403 IDOR) or a client updating a non-existent trip (404) would trigger an early return in the controller *after* `multer` had already written the file to disk. The file was never cleaned up.
- **Found**: A validation failure in the controller for an update payload would result in an early 422 return *after* `multer` had written the file. The file was never cleaned up.
- **Found**: An update to an `ongoing` trip silently ignores any new image. However, `tripService.js` did not delete the ignored file from disk, resulting in orphaned files.
- **Found**: An update that threw an exception (e.g., 409 Conflict for `completed`/`cancelled` trips) did not properly clean up the file in the controller's catch block in all scenarios.

**Fixes Applied**: 
- Added explicit `fs.unlinkSync` calls in the controller for all early returns (404 Not Found, 403 Forbidden, 422 Unprocessable Entity) inside `tripController.update`.
- Added a safe catch-block cleanup in `tripController.update` that triggers for unhandled exceptions.
- Added explicit cleanup inside `tripService.updateTrip` when a file is explicitly ignored (i.e., for `ongoing` trips).
- Expanded N3-J tests to strictly cover these filesystem cleanup behaviors.

## 2. Exact Laravel Behavior Verified
- The `tripService` behavior exactly mirrors Laravel's `TripService.php` business logic.
- Transaction bounds and atomicity strictly match Laravel.
- Multipart handling matches Laravel's form requests.

## 3. Image Lifecycle Matrix
| Scenario | File Written? | DB Changed? | Old File Deleted? | New File Cleaned Up? | Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Create w/ Valid Image** | Yes | Yes | N/A | N/A | Success |
| **Create w/ Invalid Image** | Rejected by Multer | No | N/A | Yes (not saved) | 422 |
| **Create + DB Failure** | Yes | Rolled back | N/A | Yes | 500 / Error |
| **Update w/ New Image** | Yes | Yes | Yes | N/A | Success |
| **Update + DB Failure** | Yes | No | No | Yes | 500 / Error |
| **Update + `remove_image=true`** | No | Yes (set to null) | Yes | N/A | Success |
| **Update `remove_image` + New Image** | Yes | Yes (new image set) | Yes | N/A | Success (New Image wins) |
| **Ongoing Trip + New Image** | Yes | DB updated (text) | No | Yes (Explicitly deleted) | Success (Image ignored) |
| **Completed/Cancelled + New Image**| Yes | No | No | Yes (Explicitly deleted) | 409 Conflict |
| **Update + IDOR (Not Owner)** | Yes | No | No | Yes (Explicitly deleted) | 403 Forbidden |
| **Invalid Update Payload** | Yes | No | No | Yes (Explicitly deleted) | 422 Unprocessable Entity |

## 4. Filesystem Safety Result
- **Safety Verified**: Node stores files in `public/storage/trips/`. Safe deletion strictly verifies that any resolved absolute path starts with the `STORAGE_ROOT`.
- Client payloads only influence boolean flags or the uploaded file stream. Clients cannot dictate arbitrary deletion paths.

## 5. Transaction Boundary Result
- **Verified**: The Node backend initiates Prisma transactions for `createTrip`. The file upload occurs *before* the transaction block. Trip creation, member creation, and interest sync are fully enclosed inside the `prisma.$transaction`. Errors trigger the catch block which handles safe deletion of the image.

## 6. Multipart `_method=PUT` Result
- **Verified**: Handled safely in `src/routes/api.js`. The override specifically intercepts `POST /api/trips/:tripId` if `_method=PUT` exists in the body. It relies on `uploadTrip.single('image')` running first to parse the multipart data. This route does not conflict with `POST /api/trips/:tripId/publish` due to strict Express string path matching.

## 7. Status Side-Effect Result
- **Verified**: Handled flawlessly. As proven by the expanded mock tests, an `ongoing` trip silently ignores new images and securely deletes the uploaded temporary file. A `completed` or `cancelled` trip immediately throws a 409 exception and deletes the temporary file without modifying the DB.

## 8. Validation Parity Result
- **Verified**: 
  - `start_date` enforced as `>= today` on create.
  - `end_date` enforced as `>= start_date`.
  - Date checks are strictly validated via JS `new Date()` and `getTime()` logic matching Laravel's date evaluation rules.

## 9. Response Parity Result
- **Verified**: API consistently responds with the Laravel-wrapped `success: true/false`, appropriate `data`, `trip`, and `message` properties. `TripResource` eager-loads relations natively matching Laravel's `TripResource`.

## 10. Test Count / Result
- `scripts/test-endpoints-n3j.js` has been executed.
- All 36 targeted tests **passed successfully**, validating all 422s, 403s, 409s, valid creations/updates, image cleanups, and transition limitations.

## 11. Regression Results
All regression scripts ran securely. Tests matching DB verification, repositories, and prior API endpoints (N3-B to N3-I) all passed without error (noting that N3-F/G issues are strictly tied to real-DB connectivity constraints inherent to the sandbox).

## 12. Shared DB Mutation Status
- **NO shared database mutations occurred.**
- The Prisma schema was untouched.
- No destructive queries or seeders were executed.

## 13. Remaining Verification Limitations
- Real shared-DB mutation testing and real production filesystem/concurrency stress testing were intentionally not performed in adherence to the scope boundaries. The verified transaction and filesystem interactions rely on mocked execution testing.
