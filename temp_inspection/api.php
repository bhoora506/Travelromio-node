<?php

use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\Auth\EmailVerificationController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\PreferredDestinationController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| All routes here carry the /api prefix automatically.
|
*/

// --- Public ---
Route::get('/health', HealthController::class);

// --- Authentication ---
Route::prefix('auth')->group(function () {

    // Public auth endpoints — rate-limited to protect against brute force.
    Route::post('/register', [AuthController::class, 'register'])
        ->middleware('throttle:10,1');

    Route::post('/login', [AuthController::class, 'login'])
        ->middleware('throttle:5,1');

    Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])
        ->middleware('throttle:5,1')
        ->name('password.email');

    Route::post('/reset-password', [AuthController::class, 'resetPassword'])
        ->name('password.reset');

    // Protected auth endpoints — require valid Sanctum token.
    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/me', [AuthController::class, 'me']);
        Route::post('/logout', [AuthController::class, 'logout']);
    });
});

// --- Email Verification ---
// These routes require authentication (user must be logged in to verify/resend).
Route::middleware('auth:sanctum')->prefix('email')->group(function () {
    Route::get('/verify/{id}/{hash}', [EmailVerificationController::class, 'verify'])
        ->middleware('signed')
        ->name('verification.verify');

    Route::post('/verification-notification', [EmailVerificationController::class, 'resend'])
        ->middleware('throttle:6,1')
        ->name('verification.send');
});

// --- Profile & Interests ---
Route::get('/interests', [\App\Http\Controllers\InterestController::class, 'index']);

Route::middleware('auth:sanctum')->group(function () {
    // Profile Management
    Route::get('/profile', [ProfileController::class, 'show']);
    Route::put('/profile', [ProfileController::class, 'update']);
    Route::get('/profile/stats', [\App\Http\Controllers\ProfileStatsController::class, 'show']);
    Route::put('/profile/interests', [ProfileController::class, 'updateInterests']);
    Route::post('/profile/photo', [ProfileController::class, 'uploadPhoto']);
    Route::delete('/profile/photo', [ProfileController::class, 'deletePhoto']);

    // Preferred Destinations
    Route::apiResource('profile/destinations', PreferredDestinationController::class)
         ->parameter('destinations', 'destination')
         ->except(['show']);

    // Travel Availability — user's own windows only
    Route::get('/profile/availability', [\App\Http\Controllers\TravelAvailabilityController::class, 'index']);
    Route::post('/profile/availability', [\App\Http\Controllers\TravelAvailabilityController::class, 'store']);
    Route::put('/profile/availability/{availability}', [\App\Http\Controllers\TravelAvailabilityController::class, 'update']);
    Route::delete('/profile/availability/{availability}', [\App\Http\Controllers\TravelAvailabilityController::class, 'destroy']);

    // Device Token (FCM) — Phase H1-B
    // POST   /api/profile/device-token  — register or upsert an FCM token for this device
    // DELETE /api/profile/device-token  — remove the FCM token for this device on logout
    Route::post('/profile/device-token', [ProfileController::class, 'registerDeviceToken']);
    Route::delete('/profile/device-token', [ProfileController::class, 'unregisterDeviceToken']);
});

// --- Trips ---
Route::middleware('auth:sanctum')->group(function () {
    // My trips list (paginated, owner's trips only)
    Route::get('/my/trips', [\App\Http\Controllers\TripController::class, 'myTrips']);
    
    // My joined trips (paginated, member role only)
    Route::get('/my/joined-trips', [\App\Http\Controllers\TripController::class, 'joinedTrips']);

    // Trip discovery (published trips from other users, paginated + filtered)
    Route::get('/trips', [\App\Http\Controllers\TripController::class, 'index']);

    // Trip CRUD
    Route::post('/trips', [\App\Http\Controllers\TripController::class, 'store']);
    Route::get('/trips/{trip}', [\App\Http\Controllers\TripController::class, 'show']);
    Route::put('/trips/{trip}', [\App\Http\Controllers\TripController::class, 'update']);

    // Trip lifecycle
    Route::post('/trips/{trip}/publish', [\App\Http\Controllers\TripController::class, 'publish']);
    Route::post('/trips/{trip}/cancel', [\App\Http\Controllers\TripController::class, 'cancel']);

    // Trip members
    Route::get('/trips/{trip}/members', [\App\Http\Controllers\TripMemberController::class, 'index']);

    // --- D.1: Trip Join Requests ---
    // Submit a join request (authenticated user → published trip)
    Route::post('/trips/{trip}/join-requests', [\App\Http\Controllers\TripJoinRequestController::class, 'store']);

    // View incoming join requests (trip owner only)
    Route::get('/trips/{trip}/join-requests', [\App\Http\Controllers\TripJoinRequestController::class, 'index']);

    // Approve a pending request (trip owner only)
    Route::post('/trips/{trip}/join-requests/{joinRequest}/approve', [\App\Http\Controllers\TripJoinRequestController::class, 'approve']);

    // Reject a pending request (trip owner only)
    Route::post('/trips/{trip}/join-requests/{joinRequest}/reject', [\App\Http\Controllers\TripJoinRequestController::class, 'reject']);

    // Cancel a pending request (requester only)
    Route::post('/trips/{trip}/join-requests/{joinRequest}/cancel', [\App\Http\Controllers\TripJoinRequestController::class, 'cancel']);

    // --- F2: Connection Requests ---
    // List authenticated user's accepted connections
    Route::get('/connections', [\App\Http\Controllers\ConnectionRequestController::class, 'index']);

    // Send a connection request (authenticated user → discoverable user)
    Route::post('/connections', [\App\Http\Controllers\ConnectionRequestController::class, 'store']);

    // List received requests (authenticated user's inbox)
    Route::get('/connections/received', [\App\Http\Controllers\ConnectionRequestController::class, 'received']);

    // List sent requests (authenticated user's outbox)
    Route::get('/connections/sent', [\App\Http\Controllers\ConnectionRequestController::class, 'sent']);

    // Accept a received pending request (recipient only)
    Route::post('/connections/{connectionRequest}/accept', [\App\Http\Controllers\ConnectionRequestController::class, 'accept']);

    // Reject a received pending request (recipient only)
    Route::post('/connections/{connectionRequest}/reject', [\App\Http\Controllers\ConnectionRequestController::class, 'reject']);

    // Cancel a sent pending request (requester only)
    Route::post('/connections/{connectionRequest}/cancel', [\App\Http\Controllers\ConnectionRequestController::class, 'cancel']);

    // --- F3: Companion Discovery ---
    // Paginated feed of discoverable companion profiles
    Route::get('/companions', [\App\Http\Controllers\CompanionDiscoveryController::class, 'index']);

    // --- G3: Chat / Messaging ---
    // List authenticated user's conversations
    Route::get('/conversations', [\App\Http\Controllers\ConversationController::class, 'index']);

    // Find or create a conversation with an accepted connection
    Route::post('/conversations', [\App\Http\Controllers\ConversationController::class, 'store']);

    // Get a specific conversation
    Route::get('/conversations/{conversation}', [\App\Http\Controllers\ConversationController::class, 'show']);

    // Retrieve paginated message history for a conversation (participants only)
    Route::get('/conversations/{conversation}/messages', [\App\Http\Controllers\ConversationController::class, 'messages']);

    // Send a message in a conversation (participants only)
    Route::post('/conversations/{conversation}/messages', [\App\Http\Controllers\ConversationController::class, 'sendMessage']);

    // Mark messages in a conversation as read (participants only)
    Route::post('/conversations/{conversation}/read', [\App\Http\Controllers\ConversationController::class, 'markAsRead']);
});
