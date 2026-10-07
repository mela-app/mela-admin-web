# Direct messages (friends only)

**Location**: `apps/backend/src/direct-messages` (+ `prisma` models `Conversation`, `DirectMessage`), relays in `apps/backend/src/realtime/realtime.gateway.ts`, the console's reader in `apps/backend/src/admin/messages`; mobile `apps/mobile/lib/features/messages`, the Inbox tab in `lib/features/discovery/discovery_screen.dart`, the Message button in `lib/features/social/presentation/profile_screen.dart`; web player `apps/web/src/messages`; console `apps/admin-web/src/features/messages`
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
| `message:deleted` | `{messageId, senderId, recipientId}` | both people - Mela's safety team removed a reported message (`DirectMessagesService.erase`, from the console's Reports page, docs/features/moderation.md); the recipient also gets a fresh `message:unread_count`. The conversation's order follows its newest remaining message; one left empty is deleted |

Message text never goes into domain-event listeners other than the gateway, and the audit trail doesn't record what anyone wrote. Staff read it only through the console's **Private messages** page (below), and every conversation they open there is audited.

## Mobile (`lib/features/messages`)

- **`MessagesRepository`** (`data/`, `messagesRepositoryProvider`): the five endpoints. Models in `domain/direct_message.dart` (`DirectMessage`, `Conversation`, `ConversationHistory`, and the realtime payloads `NewDirectMessage`/`DirectMessagesRead`; `MessageEvents` names the events).
- **`unreadMessagesCountProvider`** (`application/`): the Inbox badge - re-synced from `unread-count` on every (re)connect of the realtime client, then set by each `message:unread_count`.
- **Inbox tab** (`presentation/inbox_view.dart`): discovery's header gets a third tab, **Inbox**, with a `Badge` (`formatCount`). Selected, it replaces the category chips and lives grid with `InboxView` (the tabs stay on top and scroll with it; For You / Following bring the lives back as they were). Rows: the friend's avatar and name, the last message ("You: ..." for your own), a short time ("now", "5m", "3h", "Mon", "Sep 3" - `message_time.dart`), and an unread count; unread rows are bold. `message:new` moves (or adds) the conversation to the top, `message:read` clears a count read on another device. Pull to refresh; the next page loads near the end. "New message" opens a picker of friends (`new_message_sheet.dart`, `GET /users/me/friends`), and the list reloads on the way back from a conversation.
- **Conversation** (`presentation/conversation_screen.dart`, route `/messages/:userId`, `AppRoutes.conversation`; the caller passes the `UserSummary` as `extra` to show the header at once): newest at the bottom, older messages load when scrolling up, a time label wherever 30 minutes pass between messages. A sent message shows at once (faded, "Sending…"), with a random `clientId`; the answer and the realtime echo are matched by id, so it never shows twice. A failed send stays with the reason and **Try again** (same `clientId` - safe) / **Remove**; `NOT_FRIENDS` also locks the composer. Your last message says **Sent**, then **Seen**. It marks the conversation read when it opens and when a message arrives while it's on screen - not with the app in the background (it does on resume) or under another screen. A reconnect reloads the latest page. The title opens the friend's profile. Holding a friend's message offers **Report message** (docs/features/moderation.md); a report that also blocks goes back to the inbox. `message:deleted` takes a message the safety team removed out of the conversation, and the inbox reloads on it.
- **Profile**: another user's profile shows a round **Message** button next to Follow and the bell while you follow each other (`isFollowing && isFollowedBy`).

## Web player (`apps/web/src/messages`)

Signed in on a computer, the share page's player (docs/features/share.md) has an **Inbox** button beside the account - with the unread count - that opens the same inbox in a drawer at the right edge, over the live chat, so the live keeps playing (`Modal variant="drawer"`). Phones have messaging in the app, so the player shows no Inbox there, and neither does a signed-out visitor.

- **Data**: `messagesApi.ts` - the five endpoints and `GET /users/me/friends`, with the web session's token.
- **Realtime**: the player's own socket - the account's, while signed in and watching - carries `message:new`, `message:read`, `message:unread_count` and `message:deleted`; `useLive` hands them, and each reconnect, to `live.inbox` (`createInboxEvents()`), which the inbox's parts subscribe to. A removed message leaves the open conversation, and the list reloads.
- **Badge**: `useUnreadMessages` - fetched when signed in and on every reconnect, then set by `message:unread_count`.
- **Inbox** (`Inbox.tsx`): the conversation list (updated live, "Show more" for the next page), **New message** (a friend to write to), and a conversation - newest at the bottom, "Show earlier messages", a time label after 30-minute gaps, a message shown at once and matched to its echo by id, Sent/Seen, **Try again** / **Remove** for a failed send, the locked note once they no longer follow each other. It marks the conversation read while the tab is visible, and when it becomes visible again.
- Server refusals reach the page with their code: `ApiError.code` (`lib/api.ts`) reads the API's `{message: {message, code}}` error body - which also gives the web sign-in its real messages.

## Admin console (`apps/admin-web/src/features/messages`)

The **Private messages** page (`/messages`, under Records) - for super admins, and platform moderators given `VIEW_PRIVATE_MESSAGES` ("Private messages: Read"):

- **A day at a time, today by default**: previous/next day, a date picker and "Today"; a person search, and `?userId=` from a user's page (**Private messages**).
- **The list is who, not what**: each conversation active that day, both people, how many messages, the last one's time - latest first, 25 a page. `GET /v1/admin/messages/conversations?from&to[&q&userId&page&pageSize]` (`AdminMessagesService.conversations`, a `groupBy` over the day's messages) returns no text at all.
- **The text shows only in the conversation opened** beside the list - both people, oldest first, when each message was read. `GET /v1/admin/messages/conversations/:id?from&to[&cursor&limit]` records every conversation opened in the audit trail as `admin.private_messages_viewed` (target `CONVERSATION`, labelled `@a and @b`, with the day's range and both user ids); the next pages of the same look aren't recorded again, and the console never refetches an open conversation by itself. The audit entry links back to the same conversation and day.
- A range is at most 31 days (`MAX_RANGE_DAYS`). Read-only: nothing can be edited or deleted there.

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

Remove `DirectMessagesModule` from `app.module.ts`, the two `@OnEvent` relays (`handleDirectMessageSent`, `handleDirectMessagesRead`) from `RealtimeGateway` and the two events from `domain-events.ts`; drop the `conversations` and `direct_messages` tables (and the `User` relations) in a migration. On mobile: `lib/features/messages`, `messagesRepositoryProvider`, the Inbox tab (`_InboxTab`, `_showInbox`) in `discovery_screen.dart`, the `/messages/:userId` route and the Message button (`_CircleAction`) in `profile_screen.dart`. `cleanChatText`'s `maxLength` parameter defaults to chat's, so it can stay. Web player: `src/messages`, `inbox` in `useLive` and the Inbox button in `App.tsx`. Console: `src/admin/messages` (backend), `features/messages`, the route, the nav item and the access area; the `VIEW_PRIVATE_MESSAGES` enum value can stay until a migration removes it.

## Tests

- Backend: `direct-messages.service.spec.ts` (only friends; yourself; empty/too long; the phrase filter; links; pace; resend by `clientId`, reused `clientId`, the resend race; the inbox's partners, unread counts, `canMessage`, the blocked filter and paging; history windows; read receipts and their event; the badge count leaving blocked senders out; `erase`: the conversation reordered or removed when emptied, both apps told, a message already gone), `realtime.gateway.spec.ts` ("direct messages": which room gets which event) and `admin/messages/admin-messages.service.spec.ts` (the list carries no text, the day's range and person filters, bad ranges, the transcript's order and paging, one audit entry per conversation opened, an unknown conversation).
- Mobile: `test/messages_repository_test.dart` (endpoints and parsing, realtime payloads, the badge on connect and on `message:unread_count`), `test/conversation_screen_test.dart` (order, read on open, Seen, the pending bubble and its echo, the locked composer, `NOT_FRIENDS`, retry with the same `clientId`, live arrivals, other conversations ignored, a removed message leaving, Report on a friend's message only) and `test/inbox_test.dart` (the whole app: the tab's badge, rows, a new conversation moving up, a read on another device, back to the lives; the profile's Message button only between friends).
- Web player: `src/messages/Inbox.test.tsx` (rows kept up to date by new messages and reads; opening a conversation reads it, a sent message shows at once and once only, Seen; `NOT_FRIENDS` locks it; a new conversation with a friend; a removed message leaving the open conversation) and `src/App.test.tsx` (the Inbox button and its count for a signed-in computer - none on phones or signed out).
- Console: `search.test.ts` (the page's URL), `format.test.ts` (stepping through days, "Today"/"Yesterday") and `permissions.test.tsx` (the "Private messages" access area).
