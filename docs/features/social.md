# Social (profiles & connections)

**Location**: `apps/backend/src/social` (follow graph, personal block), `apps/backend/src/users` (profile, search route, avatar upload, block routes)
**Plan reference**: plan §6.10, §6.4 (block); task-breakdown Phase 3 & 4
**Depends on**: `common/prisma`; `users` depends on `social` (not the other way around) and `common/storage`
**Depended on by**: `streams` (the `feed=following` discovery tab, blocked-host exclusion, and `isFollowingHost` on join - see docs/features/streams.md); Phase 5 notifications will consume `user.followed`

## What it does

**Follow graph**: asymmetric follow, like TikTok/Twitch - `Follow` rows
(`followerId`, `followeeId`, unique pair) with a `status` column
(`ACTIVE` today; `PENDING` is reserved for a future private-account mode
where a follow needs approval - nothing reads it yet). Two people who
follow each other are **Friends**, computed on the fly (`SocialService.listFriends`
via a nested Prisma filter - "the people I follow, who also follow me
back") rather than stored as their own row, so there's exactly one
source of truth for the relationship.

- `POST/DELETE /users/:id/follow` - both idempotent (following twice, or
  unfollowing someone you don't follow, just succeeds).
- `PATCH /users/:id/follow {notifyOnLive}` - the bell icon on a profile;
  404s if you're not following them (toggling a relationship that doesn't
  exist doesn't make sense).
- `GET /users/:id/followers`, `GET /users/:id/following`,
  `GET /users/me/friends` - cursor-paginated (`CursorQueryDto`: `cursor` is
  the last `Follow.id` seen, `limit` up to 50), newest first. `Follow.id`
  is a `uuid(7)` (time-ordered, like `chat_messages.id`), so ordering by id
  is ordering by when the follow happened.
- `GET /users/search?q=` - prefix match (case-insensitive) on username or
  display name, excludes suspended accounts and (when signed in) yourself;
  cursor is the last `username` seen, since results are ordered
  alphabetically, not by id.
- A `user.followed` domain event fires on every successful follow - Phase 5
  notifications will `@OnEvent` it for the new-follower alert; nothing
  consumes it yet.

**Personal block** (`POST/DELETE /users/:id/block`, plan §6.4 - distinct
from a host's room ban, see docs/features/streams.md): `SocialService.block()`
upserts a `Block` row (idempotent, like follow) and, in the same
`$transaction`, deletes any `Follow` between the two of you in both
directions - blocking someone you follow (or who follows you) ends that
relationship, it doesn't just sit alongside it. `isBlockedEitherWay()` is
checked by `follow()` (you can't follow, or be followed by, someone
blocked either way - a `ForbiddenException`, checked after the
followee-exists check) and enforced client-side for hiding messages.
`blockedEitherWayUserIds()` (every id blocking, or blocked by, this user -
deriving the "other side" from whichever column isn't this user's own id)
feeds `search()`'s exclusion list and `StreamsService.listLive()`'s
discovery filter, so a blocked relationship also hides that person's
lives and search results both ways, not just their chat/profile.
`isBlockedByViewer()` is the one-directional check (unlike
`isBlockedEitherWay`) behind `getRelationshipSummary`'s `isBlocked` flag -
whether *this viewer specifically* has blocked the profile they're
looking at, so the mobile profile screen can show Block or Unblock
correctly. Deliberately one-directional: whether the *other side* has
blocked you isn't surfaced (following/joining are refused either way
regardless, without revealing which side did it).

**Personal chat mute** (plan §6.7, Phase 7): `POST/DELETE
/v1/users/:id/chat-mute` (`muteInChat()`/`unmuteInChat()`, both idempotent;
can't mute yourself; 404 for an unknown user) - one `personal_chat_mutes`
row per `(userId, mutedUserId)`. Lighter than a block: following and
watching are unaffected, and the muted person isn't told - it only hides
their chat messages for the muter, on every device of that account. `GET
/v1/users/me/chat-filter` (`chatFilter()`) returns `{mutedUserIds,
blockedUserIds}` - this user's own choices only (never who blocked them) -
which the app filters chat with; profiles gain `isMutedInChat` (this
viewer's own choice, `isMutedInChatByViewer()`). The server never filters
chat for this: enforcement is the client's, by design (plan §6.4).

**Profile enrichment** (`UsersService.findPublicProfile`, used by both
`GET /users/me` and `GET /users/:id`): adds `followerCount`,
`followingCount`, `isFollowing`, `isFollowedBy`, `isFriend`, `notifyOnLive`
(this viewer's own bell state for that profile - always `false` unless
`isFollowing`), and `liveStreamId` (their current live's id, or `null`) on
top of the Phase 0 fields. The relationship flags need to know *who's asking* - but a public
profile must stay viewable while signed out, so `GET /users/:id` (and
`/followers`, `/following`) use `OptionalJwtAuthGuard` instead of
`JwtAuthGuard`: it populates `request.user` when a valid token is sent and
simply leaves it undefined otherwise, rather than rejecting the request.
`SocialService.getRelationshipSummary` skips its relationship query
entirely (no wasted read) when there's no requester, or the requester is
the profile itself.

**Profile visibility** (client feedback, 2026-09-28): `User.profileVisibility`
- `EVERYONE` (the default) | `FOLLOWERS` | `FRIENDS` | `ONLY_ME`, set with
`PATCH /users/me {profileVisibility}` - decides who sees a profile's
**details**: bio, join date, follower/following counts and the two follow
lists. Name, username, picture, the LIVE ring and the relationship flags
stay public - they show in every chat and viewer list anyway, and
following or blocking someone needs them. The rule lives in one place,
`social/profile-visibility.ts` (`canViewProfileDetails`: the owner always;
followers under `FOLLOWERS`; mutual follows under `FRIENDS`; never someone
the owner blocked). `findPublicProfile` adds `profileVisibility` and
`canViewProfile` and returns the details as `null` when they're hidden;
someone the owner blocked is told `ONLY_ME` (`visibilityShownTo` - never
that they were blocked) and gets no `liveStreamId`. `GET
/users/:id/followers` and `/following` refuse with 403 `{code:
'PROFILE_PRIVATE'}` (`SocialService.assertCanViewDetails`). Deliberately
not covered: the person's lives (a live is public by choice) and their
chat messages.

**Following feed**: `GET /streams?feed=following` reuses the existing
discovery endpoint (`StreamsService.listLive`) - `feed=following` requires
a signed-in caller (`OptionalJwtAuthGuard` again; the *service* throws
`UnauthorizedException` specifically for this one query shape, not the
whole endpoint) and filters to streams whose `hostId` is someone the
caller follows. Everything else about ranking/pagination/category
filtering is identical to the "All" tab.

## Mobile (`apps/mobile/lib/features/social`)

`SocialRepository` wraps every endpoint above. `ProfileScreen` (own and
others') shows the avatar (with a pulsing LIVE ring - tap it to join, via
`liveStreamId`), counts, and a `FollowButton` (Follow / Following / Friends,
optimistic with rollback on failure) - hidden on your own profile, replaced
by an Edit button. A bell `IconButton` next to it (shown only while
following) toggles `notifyOnLive`, same optimistic-with-rollback pattern.
Next to it, a `_MoreMenuButton` overflow menu (plan §6.4) offers
**Block**/**Unblock**, optimistic
the same way as Follow: blocking locally clears `isFollowing` too (a block
also unfollows both ways server-side) and a confirm dialog warns what it
does before sending the request. The same menu offers **Hide their chat
messages** / **Show their chat messages** (personal chat mute, not shown
while blocked - a block already hides them), optimistic with a snack bar.
`chatFilterProvider` (`features/chat/application/chat_filter.dart`) holds
who this account hides - loaded on sign-in and again as each live opens,
updated at once by a mute here or in the chat action sheet, and by a
block (`noteBlocked`) - and both live screens feed it to
`LiveChatController.hiddenSenderIds` (docs/features/chat.md). A settings
row (Data Saver, notification settings - `features/settings/`) sits under
Friends on your own profile. `EditProfileScreen` covers display name, bio, and the
avatar picker (`image_picker`, resized/compressed to ≤ 720 px on-device via
its own `maxWidth`/`maxHeight`/`imageQuality`, then uploaded straight to the
presigned URL from `POST /users/me/avatar/upload-url` before `PATCH /users/me
{avatarUrl}` finalizes it). `UserListScreen` is shared by
followers/following/friends (parameterized by which repository call and
title to use) - each row just opens that person's profile rather than
carrying its own Follow button, since these list endpoints don't return
per-row relationship flags (only a full profile fetch does). `UserSearchScreen`
debounces input before calling `GET /users/search`. Discovery gained a
**For You | Following** tab switcher in place of the old static "Live now"
headline. The viewer screen's host pill (avatar, name, Follow) sits
top-left next to the status badges, and `LiveEndedView` grew an optional
Follow CTA - the highest-intent moment to follow someone (plan §6.10).

**Profile card** (`presentation/profile_card_sheet.dart`,
`showProfileCard(context, userId:, name:, avatarUrl:, actions:)`): a bottom
sheet with someone's picture (LIVE ring), name, username, bio and counts, a
`FollowButton` (not on your own card, nor while blocked) and **View
profile** - opened from a live without leaving it: a chat sender's name or
picture, a mention, the host pill, a guest's tile and the viewer list. It
shows the name it was opened with while the profile loads, and asks again
after a follow change when the details were hidden (following may be what
unlocks them). Where the details are hidden, the card and `ProfileScreen`
show `ProfilePrivateNote` instead ("Follow Sara to see their profile." -
`ProfileVisibility.hiddenFrom`), and `UserListScreen` shows "This list is
private" on `PROFILE_PRIVATE`. `ProfileStat` and `ProfilePrivateNote`
(`profile_parts.dart`) are shared by the card and the screen. Settings →
**Profile privacy** (`profile_privacy_screen.dart`, `/settings/privacy`)
sets it: one radio list, saved on tap, put back with a snack bar if the
save fails.

**The card's "..." menu** (client feedback, 2026-09-29), top-right on
anyone's card but your own: first whatever `actions` (`ProfileCardActions`
- `(userId, name) => Future<List<ProfileCardAction>>`) offers where it was
opened - in a live, the role-based person menu from the moderation feature
(`liveMemberActions`, docs/features/moderators.md) - then, divided off, the
card's own **Block/Unblock**, since that's personal and works anywhere.
Social never imports moderation: a `ProfileCardAction` is just a label, a
`destructive` flag (red) and `run(BuildContext)`. Choosing one closes the
card with it, and `showProfileCard` runs it on the opener's context -
confirm dialogs and snack bars land on the live, not a sheet about to go -
returning true when one ran. Blocking goes through `setUserBlocked`
(`block_user.dart`, shared with `ProfileScreen`): asks first, blocks or
unblocks, updates `chatFilterProvider` so their messages hide at once, and
reads providers through the context, so it still works after the card that
offered it is gone.

## How to add to this feature

- **Private accounts** (follow requests needing approval): `Follow.status`
  already has `PENDING` reserved - a new account flag would gate `follow()`
  between inserting `ACTIVE` (today) and `PENDING` (needs the target's
  approval), plus accept/reject endpoints. Nothing else in this module
  needs to change.
- **A block reason, or a temporary/expiring block**: `Block` currently has
  no `reason`/`expiresAt` - add the column(s) via a migration and read them
  in `isBlockedEitherWay()`/`blockedEitherWayUserIds()` if a block should
  ever stop applying on its own.

## How to modify this feature

Page sizes (`CursorQueryDto`'s default `limit`, `SearchUsersQueryDto`'s) and
the search prefix-match behavior are single, small pieces of
`social.service.ts` / the DTOs - not spread across call sites.

## How to remove this feature

Remove `SocialModule` from `UsersModule`'s imports, delete the
follow/search/friends/block routes from `UsersController`, drop `bio` from
`UpdateProfileDto` and `PUBLIC_PROFILE_SELECT`, and remove the
`feed=following` branch and blocked-host filter from `StreamsService.listLive`.
The `follows`/`blocks` tables and `users.bio` column are additive - safe to
leave until a migration drops them. Mobile: remove `features/social`, the
For You/Following discovery tabs, and the host pill/Follow CTA from the
live screens.

## Tests

`social.service.spec.ts` covers follow (self-follow rejected, unknown
target 404s, idempotent upsert, emits `user.followed`, refused when
blocked either way), block/unblock (self-block rejected, unknown target
404s, idempotent upsert, deletes follows both ways, `isBlockedEitherWay`
and `blockedEitherWayUserIds`), unfollow
(idempotent), the notify toggle (404 when not following), relationship
summary (mutual = friend, one-way isn't, skipped for a signed-out/self
viewer, `notifyOnLive` reflects this viewer's own bell state - not the
other side's), cursor pagination on all three lists (including the friends
"follows back" filter), and search (blank query short-circuits, excludes
the requester, pages by username, also excludes anyone blocked either way).
`users.service.spec.ts` covers profile
enrichment (counts/flags/`liveStreamId` merged in) and the avatar-upload-url
key shape. `streams.service.spec.ts` covers `isFollowingHost` on join and
the blocked-host discovery exclusion (alone, and combined with `feed=following`).
Personal chat mute (Phase 7): `social.service.spec.ts` `muteInChat`
(self refused, unknown 404s, idempotent upsert), `unmuteInChat`
(idempotent), `chatFilter` (own mutes and blocks only) and
`isMutedInChat`; mobile `social_repository_test.dart` (method + path per
call, the filter and the profile flag) and `chat_filter_test.dart`.
Mobile: `social_repository_test.dart` and a `FollowButton`
optimistic-toggle widget test.
