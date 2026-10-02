# N3-E SCOPE

## 1. Selected Endpoint(s)
**Conversation & Message History (Read-Only)**
- `GET /api/conversations` (List authenticated user's conversations)
- `GET /api/conversations/:conversation` (Get a specific conversation)
- `GET /api/conversations/:conversation/messages` (Paginated message history for a conversation)

## 2. Exact Laravel Routes
Defined in `D:\laragon\www\Tripromio\routes\api.php`:
- `Route::get('/conversations', [ConversationController::class, 'index']);`
- `Route::get('/conversations/{conversation}', [ConversationController::class, 'show']);`
- `Route::get('/conversations/{conversation}/messages', [ConversationController::class, 'messages']);`

## 3. Exact Flutter Callers
Defined in `D:\development\tripromio\lib\core\constants\api_constants.dart`:
- `ApiConstants.conversations` (`/conversations`)
- `ApiConstants.conversationMessages(int conversationId)` (`/conversations/$conversationId/messages`)

## 4. Laravel Controller/Service/Resource Involved
- **Controller**: `App\Http\Controllers\ConversationController`
- **Policy**: `App\Policies\ConversationPolicy`
- **Resources**: `App\Http\Resources\ConversationResource`, `App\Http\Resources\MessageResource`

## 5. Authentication Requirements
All endpoints require a valid Sanctum token (protected by `auth:sanctum` middleware group).

## 6. Authorization Rules
Matches `ConversationPolicy`:
- `index`: Inherently scopes queries to `where('requester_id', user_id) OR where('recipient_id', user_id)`.
- `show` / `messages`: Checks `hasParticipant($user)` ensuring only the requester or recipient can access the conversation data. 
- Attempting to view a conversation where the user is not a participant must return 403 Forbidden.
- Nonexistent conversation ID must return 404 Not Found.

## 7. Request Parameters
- `GET /api/conversations/:conversation/messages`: Accepts optional `per_page` (integer, min 1, max 50).

## 8. Validation Rules
- `per_page` validation (min 1, max 50) using standard HTTP 422 Unprocessable Entity format.

## 9. Response Structure
- **Conversations Array**: Returns `ConversationResource` representing the other participant, a preview of the latest message, and an unread count.
- **Messages Array**: Returns `MessageResource` containing sender (id, name, profile_photo_url), body, read status, and timestamps.
- Responses are formatted via the `ApiResponse` trait (`successResponse`).

## 10. Important Relationship/Loading Behavior
- Eager loads `requester.profile` and `recipient.profile`.
- Calculates `unread_count` on the fly using a targeted count query: `messages().where('sender_id', '!=', authId).whereNull('read_at').count()`.
- Fetches `latestMessage` for conversation previews.

## 11. Database Tables/Models Involved
- `conversations` (reads)
- `messages` (reads)
- `users` (reads via participant IDs)
- `user_profiles` (reads via participant nested include)

## 12. Why this is a coherent read-only group
It fulfills the entire read lifecycle for the Chat feature. It enables the Flutter client to render the inbox list, compute unread counts, and display historical chat logs, strictly adhering to N3-E read-only safety rules without modifying shared DB state.

## 13. Explicitly Excluded Write Endpoints
- `POST /api/conversations` (Find or create a conversation)
- `POST /api/conversations/:conversation/messages` (Send a message)
- `POST /api/conversations/:conversation/read` (Mark messages as read)

## 14. Known Compatibility/Deviation Risks
We will use standard Prisma `findMany` / `findUnique` / `count` with BigInt serialization.

## 15. Testing Limitations
Because we cannot write new DB state, we must verify the endpoints via mock authentication (`scripts/test-endpoints-n3e.js`) simulating requests against real (but read-only) DB queries. True 200 HTTP paths cannot be run securely in real-E2E mode if we cannot seed an authenticated user/conversation. We will verify real 401s and 422s with genuine Express HTTP requests.
