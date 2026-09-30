# Direct messages (friends only)

**Location**: `apps/backend/src/direct-messages` (+ `prisma` models `Conversation`, `DirectMessage`), relays in `apps/backend/src/realtime/realtime.gateway.ts`; mobile `apps/mobile/lib/features/messages`, the Inbox tab in `lib/features/discovery/discovery_screen.dart`, the Message button in `lib/features/social/presentation/profile_screen.dart`
**Plan reference**: plan §6.15 (client request, 2026-09-30)
**Depends on**: `social` (`SocialService.isFriend` - who may message whom), `chat` (`cleanChatText`, `BannedPhrasesService`, the link policy - the same text rules as live chat), `common/rate-limit`, `common/events`, `auth` (the JWT guard)
**Depended on by**: `realtime` (relays `direct_message.sent`/`direct_message.read` to the two people's `user:{id}` rooms) - nothing imports `DirectMessagesModule`

## What it does

Two people who **follow each other** (friends, plan §6.10) can send each other private text messages. Home gets a third tab next to For You and Following - **Inbox** - with a badge counting unread messages; it lists conversations, newest first, and a friend's profile has a **Message** button.

**Only friends can send.** `POST .../messages` checks `SocialService.isFriend` (mutual follows) on every send; anyone else gets `403 NOT_FRIENDS`. A conversation isn't deleted when that changes: after an unfollow (or a block, which deletes follows both ways, docs/features/social.md) the history stays readable, and the composer is replaced by "You can message each other again once you both follow each other." Following each other again reopens it.

**Storage**: one `conversations` row per pair of people - the smaller user id always in `userAId`, so whoever writes first finds the same row (`@@unique([userAId, userBId])`) - and its `direct_messages` (`senderId`, `recipientId`, `text`, `clientId`, `readAt`, UUIDv7 ids, so ordering by id is ordering by time). `lastMessageAt` orders the inbox. Deleting a user cascades to their conversations and messages. Migration `20261001090000_direct_messages`.

**Sending** (`DirectMessagesService.send`) runs live chat's pipeline (docs/features/chat.md) on a longer message:
1. `cleanChatText(text, DIRECT_MESSAGE_MAX_LENGTH)` - the same cleaning as chat, up to **1000** characters (`MESSAGE_EMPTY`, `MESSAGE_TOO_LONG`).
2. A resend with the same `clientId` returns the stored message instead of a second one (`@@unique([senderId, clientId])`; two at once: the loser of the race reads the winner's). A `clientId` already used for someone else is `CLIENT_ID_REUSED`.
3. Both people exist (404), and are friends (`NOT_FRIENDS`).
4. The banned-phrase filter: a `REJECT` phrase is `MESSAGE_BLOCKED`, a `MASK` phrase is masked.
5. `DIRECT_MESSAGE_RATE_LIMIT`: 5 at once, then one a second, per sender across all conversations (`429 RATE_LIMITED`, with `retryAfterMs`).
6. The link policy (`CHAT_LINK_DOMAINS`): links to other sites are `LINK_NOT_ALLOWED`.
7. Stored in one transaction with the conversation's upsert, then `direct_message.sent` is emitted.

**Read receipts**: opening a conversation (`POST .../read`) marks everything the other person sent as read (`readAt`) and emits `direct_message.read` - only when something was unread. The sender's app then shows **Seen** under their last message.

**Blocking**: the inbox leaves out conversations with people this user blocked, and the unread count doesn't count their messages (a hidden conversation couldn't be opened to clear it). Unblocking brings them back. Who blocked *you* isn't revealed - that conversation just can't be written to.

**REST** (all `JwtAuthGuard`, the signed-in user's own conversations, each named by the other person's id):

| Endpoint | Answer |
|---|---|
| `GET /v1/me/conversations?cursor=&limit=` | `{items: [{user, lastMessage, unreadCount, canMessage}], hasMore, nextCursor}` - newest first; `canMessage` is "still friends" |
| `GET /v1/me/conversations/unread-count` | `{count}` - every unread message, except from people this user blocked |
| `GET /v1/me/conversations/:userId/messages?before=&limit=` | `{user, canMessage, messages, hasEarlier}` - the latest `limit` (default 50, max 100) or those before a message id, oldest first |
| `POST /v1/me/conversations/:userId/messages` `{text, clientId?}` | the stored message `{id, senderId, recipientId, text, clientId, createdAt, readAt}` |
| `POST /v1/me/conversations/:userId/read` | `{ok, unreadCount}` |

**Realtime** (server → client, over the app's one socket, docs/features/realtime.md):

| Event | Payload | Sent to |
|---|---|---|
| `message:new` | `{message, sender, recipient}` | both people's `user:{id}` rooms - the recipient's inbox, and the sender's other devices |
| `message:read` | `{readerId, partnerId, readAt}` | both - the partner's app shows Seen, the reader's other devices clear the conversation |
| `message:unread_count` | `{count}` | the person whose total changed (a new message to them, or they read). A **total**, unlike `notification:unread_count`'s delta: one COUNT per message is cheap here (one recipient, not a fan-out), and a missed event can't leave the badge wrong |

Message text never goes into domain-event listeners other than the gateway: the audit trail doesn't record direct messages, and the admin console can't read them.

## Mobile (`lib/features/messages`)

- **`MessagesRepository`** (`data/`, `messagesRepositoryProvider`): the five endpoints. Models in `domain/direct_message.dart` (`DirectMessage`, `Conversation`, `ConversationHistory`, and the realtime payloads `NewDirectMessage`/`DirectMessagesRead`; `MessageEvents` names the events).
- **`unreadMessagesCountProvider`** (`application/`): the Inbox badge - re-synced from `unread-count` on every (re)connect of the realtime client, then set by each `message:unread_count`.
- **Inbox tab** (`presentation/inbox_view.dart`): discovery's header gets a third tab, **Inbox**, with a `Badge` (`formatCount`). Selected, it replaces the category chips and lives grid with `InboxView` (the tabs stay on top and scroll with it; For You / Following bring the lives back as they were). Rows: the friend's avatar and name, the last message ("You: ..." for your own), a short time ("now", "5m", "3h", "Mon", "Sep 3" - `message_time.dart`), and an unread count; unread rows are bold. `message:new` moves (or adds) the conversation to the top, `message:read` clears a count read on another device. Pull to refresh; the next page loads near the end. "New message" opens a picker of friends (`new_message_sheet.dart`, `GET /users/me/friends`), and the list reloads on the way back from a conversation.
- **Conversation** (`presentation/conversation_screen.dart`, route `/messages/:userId`, `AppRoutes.conversation`; the caller passes the `UserSummary` as `extra` to show the header at once): newest at the bottom, older messages load when scrolling up, a time label wherever 30 minutes pass between messages. A sent message shows at once (faded, "Sending…"), with a random `clientId`; the answer and the realtime echo are matched by id, so it never shows twice. A failed send stays with the reason and **Try again** (same `clientId` - safe) / **Remove**; `NOT_FRIENDS` also locks the composer. Your last message says **Sent**, then **Seen**. It marks the conversation read when it opens and when a message arrives while it's on screen - not with the app in the background (it does on resume) or under another screen. A reconnect reloads the latest page. The title opens the friend's profile.
- **Profile**: another user's profile shows a round **Message** button next to Follow and the bell while you follow each other (`isFollowing && isFollowedBy`).

## How to add to this feature

- **Push notifications for messages**: listen to `direct_message.sent` in `NotificationsService` and queue a push for the recipient when they have no socket - the same path as other types (docs/features/notifications.md), with a new `NotificationType` and settings key. Messages deliberately don't create inbox *notifications*: the Inbox tab is their inbox.
- **Photos or other message kinds**: add a nullable column (`imageUrl`, like `chat_messages`, docs/features/chat.md) and a presigned upload endpoint; the view and events gain an optional field (additive).
- **Group conversations**: needs a membership table instead of the `userAId`/`userBId` pair - a new model rather than a change to this one.
- **An in-app banner for a new message** while elsewhere in the app: a listener on `MessageEvents.newMessage`, like `NotificationBannerListener`.

## How to modify this feature

- Length and pace: `DIRECT_MESSAGE_MAX_LENGTH` and `DIRECT_MESSAGE_RATE_LIMIT` (`direct-messages.service.ts`); the app's composer limit is `maxDirectMessageLength` (`conversation_screen.dart`) - keep them equal.
- Who may message: the `isFriend` check in `send()` (and `canMessage` in the list and history). Loosening it (e.g. anyone you follow) means also deciding what a block should do, since today "not friends" covers blocks too.
- The text rules are live chat's (`chat-text.ts`, `BannedPhrasesService`, `link-policy.ts`) - a change there changes both.

## How to remove this feature

Remove `DirectMessagesModule` from `app.module.ts`, the two `@OnEvent` relays (`handleDirectMessageSent`, `handleDirectMessagesRead`) from `RealtimeGateway` and the two events from `domain-events.ts`; drop the `conversations` and `direct_messages` tables (and the `User` relations) in a migration. On mobile: `lib/features/messages`, `messagesRepositoryProvider`, the Inbox tab (`_InboxTab`, `_showInbox`) in `discovery_screen.dart`, the `/messages/:userId` route and the Message button (`_CircleAction`) in `profile_screen.dart`. `cleanChatText`'s `maxLength` parameter defaults to chat's, so it can stay.

## Tests

- Backend: `direct-messages.service.spec.ts` (only friends; yourself; empty/too long; the phrase filter; links; pace; resend by `clientId`, reused `clientId`, the resend race; the inbox's partners, unread counts, `canMessage`, the blocked filter and paging; history windows; read receipts and their event; the badge count leaving blocked senders out) and `realtime.gateway.spec.ts` ("direct messages": which room gets which event).
- Mobile: `test/messages_repository_test.dart` (endpoints and parsing, realtime payloads, the badge on connect and on `message:unread_count`), `test/conversation_screen_test.dart` (order, read on open, Seen, the pending bubble and its echo, the locked composer, `NOT_FRIENDS`, retry with the same `clientId`, live arrivals, other conversations ignored) and `test/inbox_test.dart` (the whole app: the tab's badge, rows, a new conversation moving up, a read on another device, back to the lives; the profile's Message button only between friends).
