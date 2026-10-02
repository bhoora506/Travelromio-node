# N3-E ENDPOINT ARCHITECTURE

## 1. Selected Scope
This phase implements **Conversation and Message History (Read-Only)** based strictly on Flutter's consumption and Laravel's corresponding implementation.

| Endpoint | Purpose | Node Route | Laravel Equivalent |
|---|---|---|---|
| `GET /api/conversations` | List user's conversations | `conversationController.index` | `ConversationController@index` |
| `GET /api/conversations/:conversationId` | View specific conversation | `conversationController.show` | `ConversationController@show` |
| `GET /api/conversations/:conversationId/messages` | Paginated message history | `conversationController.messages` | `ConversationController@messages` |

## 2. Rationale
Flutter explicitly targets these endpoints in `api_constants.dart` (`conversations`, `conversationMessages(id)`). They strictly manage the chat inbox view and the historical conversation read view, complying with the read-only bounds of N3-E.

## 3. Architecture

### Route Layer
- Added to `src/routes/api.js`.
- All routes are protected by the `authenticate` middleware inherited from N3-A.

### Controller Layer
- `src/controllers/conversationController.js` handles all three endpoints.
- Validates the `per_page` query parameter for messages (422 Unprocessable Entity for invalid parameters).
- Injects a targeted SQL `count` query on `messages` where `sender_id != req.user.id` and `read_at IS NULL` to reproduce Laravel's dynamic `unread_count` field without N+1 loading.

### Service Layer / Repository Layer
- Directly utilizes `prisma` within the controllers, adhering to the read-only N3-E scope. 
- A helper function `getConversationIfParticipant` is used to dry up the queries for `show` and `messages`, ensuring the conversation exists and the authenticated user is either the `requester_id` or `recipient_id`.
- The helper eagerly loads profiles and the latest message to prevent N+1 issues.

### Resource Layer
- **ConversationResource (`src/resources/conversationResource.js`)**: Matches Laravel's `ConversationResource`. Dynamically evaluates whether the authenticated user is the requester or recipient to return the "other_participant" mapping. Formats IDs as strings, decimals as strings. Generates the public storage URL for the user's photo safely.
- **MessageResource (`src/resources/messageResource.js`)**: Matches Laravel's `MessageResource`. Represents the message body, read status, and the sender's profile safely.

## 4. Security & Safety
- **IDOR Protection**: `GET /api/conversations` explicitly scopes all searches to `requester_id = user OR recipient_id = user`.
- **Policy Enforcement**: `show` and `messages` strictly verify the authenticated user is a participant. If they are not, it explicitly returns `403 Forbidden` (mimicking Laravel Policy behavior). If the conversation does not exist, it safely returns `404 Not Found`.
- **Safe Serialization**: BigInts are stringified. Unread counts are evaluated database-side instead of pulling all rows into Node memory. Sensitive database rows (passwords) are strictly dropped before reaching JSON responses.
