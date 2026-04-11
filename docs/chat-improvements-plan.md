# hackchat Feature Plan

## Current State

Text-only WebSocket chat (PartyKit + CF Worker + D1). No moderation, no multimedia, no profile display. Messages are plain text (2000 char limit) with basic markdown (`**bold**`, `*italic*`, `` `code` ``). Auth via Tezos wallet signature → JWT (24h). Domain = identity.

---

## Phase 1 — Admin Control & Moderation

Admin identity: `admin.hack.tez` (mainnet) / `admin.hack.gho` (ghostnet). Detected from JWT `domains[]` array — no special config needed.

### 1a. Schema Migration

New D1 tables:

```sql
-- Soft-delete support for messages
ALTER TABLE chat_messages ADD COLUMN deleted_at TEXT;
ALTER TABLE chat_messages ADD COLUMN deleted_by TEXT;

-- Ban records (active state)
CREATE TABLE chat_bans (
  domain        TEXT PRIMARY KEY,
  type          TEXT NOT NULL CHECK(type IN ('soft','hard')),
  scope         TEXT NOT NULL DEFAULT 'global' CHECK(scope IN ('global','platform')),
  reason        TEXT NOT NULL,
  admin_domain  TEXT NOT NULL,
  address       TEXT,           -- wallet address (set when "ban all wallet domains" checked)
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT,           -- NULL = permanent (hard ban)
  notes         TEXT,           -- internal admin notes (stripped from public API)
  visible       INTEGER NOT NULL DEFAULT 1  -- 1 = show stub, 0 = hide entirely (for message deletions context)
);
CREATE INDEX idx_bans_expires ON chat_bans(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_bans_address ON chat_bans(address) WHERE address IS NOT NULL;

-- Public audit log (append-only, never deleted)
CREATE TABLE chat_audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  action        TEXT NOT NULL CHECK(action IN (
                  'message_delete','ban_soft','ban_hard','unban','ban_update'
                )),
  target_domain TEXT NOT NULL,
  admin_domain  TEXT NOT NULL,
  reason        TEXT,
  details       TEXT,  -- JSON blob: { messageId, messageContent, duration, ... }
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_target ON chat_audit_log(target_domain);
CREATE INDEX idx_audit_time   ON chat_audit_log(created_at DESC);
```

### 1b. Worker Admin Endpoints

All require JWT with admin domain. Middleware: `requireAdmin(jwt)` → 403 if not admin.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `DELETE /admin/message/:id` | DELETE | Soft-delete a message. Body: `{reason}`. Logs to audit. |
| `POST /admin/ban` | POST | Ban a domain. Body: `{domain, type, reason, duration?, notes?}`. Duration in seconds for soft bans. |
| `DELETE /admin/ban/:domain` | DELETE | Lift a ban. Body: `{reason}`. Logs unban to audit. |
| `GET /admin/bans` | GET | List active bans (paginated). Public-safe (no internal notes). |
| `GET /admin/audit-log` | GET | Public audit trail (paginated, filterable by target/action). |
| `PATCH /admin/ban/:domain` | PATCH | Update ban (change type, extend duration, add notes). Logs to audit. |

### 1c. PartyKit Changes (global.ts)

**On connect:**
- Check `chat_bans` via worker internal endpoint (`/internal/ban-check/:domain`)
- If active ban → reject with close code 4010 + ban details (type, reason, expires_at)
- Expired soft bans auto-cleaned (or ignored)

**New inbound message types (admin only):**
- `admin:delete-message` → `{messageId, reason}` → broadcast `message-deleted` to all
- `admin:ban-user` → `{domain, type, reason, duration?}` → broadcast `user-banned`, force-disconnect target
- `admin:unban-user` → `{domain, reason}` → broadcast `user-unbanned`

**New outbound message types:**
- `message-deleted` → `{messageId, deletedBy, reason, timestamp}`
- `user-banned` → `{domain, type, reason, expiresAt, adminDomain}`
- `user-unbanned` → `{domain, reason, adminDomain}`

**Message send validation:**
- Before broadcasting, check ban status (in-memory cache refreshed periodically)

### 1d. Frontend Admin UI

**MessageBubble.tsx changes:**
- Admin sees a "⋮" menu on every message → Delete option
- Delete triggers confirmation modal with reason input (required)
- Deleted messages render as "[Message removed by moderator]" with timestamp

**Admin panel (new component or sidebar section):**
- Ban management: list active bans, ban/unban controls
- Quick-ban from message context menu: "Ban user" → modal with type selector, duration picker, reason
- Soft ban duration presets: 1h, 24h, 7d, 30d, custom
- Audit log viewer (optional — could also just be a public API)

**User-facing ban experience:**
- Banned user sees banner: "You have been banned from global chat. Reason: {reason}. Expires: {time/never}."
- Input disabled, messages read-only
- DMs remain functional (bans are global-chat only, unless we want global bans)

### 1e. Banned User UX Polish

When a user is soft-banned, the ban banner must provide a **live countdown timer** that ticks down to expiry, along with the reason:

- **Countdown**: "Banned for 4m 32s remaining — Reason: Spam". Updates every second.
- **Auto-reconnect**: When the countdown reaches 0, automatically attempt to reconnect (trigger the WebSocket reconnect flow). No manual refresh needed.
- **Hard ban display**: "You are permanently banned — Reason: Harassment". No countdown, no auto-reconnect.
- **Ban type indicator**: Clearly distinguish soft vs hard bans visually (countdown = soft, "permanent" label = hard).

This is purely a frontend change — the backend already sends `expiresAt` in the ban payload.

### 1f. Decisions (Confirmed)

- **Ban scope:** Admin chooses per ban — global-chat-only or full platform ban (includes DMs)
- **Deleted message visibility:** Admin chooses per deletion — show "[removed]" stub with reason, or hide entirely
- **Ban evasion:** Optional "ban all wallet domains" checkbox — records wallet address when checked, blocks all domains on that wallet
- **Audit log:** Fully public API (strip internal `notes` field from public responses)
- **GIF provider:** Tenor (free, no watermarks, Google-backed)

---

## Phase 2 — GIF Search & Multimedia

### 2a. GIF Search Integration

**Provider options:**
- **Tenor API** (Google) — free tier generous, well-documented, widely used. Requires API key (env var).
- **GIPHY** — also free tier, slightly more restrictive branding requirements.
- Recommend: **Tenor** — simpler integration, no mandatory branding watermarks.

**Architecture:**
- New env var: `TENOR_API_KEY` (CF Worker secret)
- New worker endpoint: `GET /media/gif-search?q=...&limit=20&pos=...` (proxied through worker to avoid exposing API key to frontend)
- Frontend: GIF picker component (search input + grid of results + click-to-send)

**Message format evolution:**
```typescript
// Current
{ type: "message", content: string, id, sender, timestamp }

// New: structured content
{ type: "message", content: string, id, sender, timestamp,
  media?: {
    type: "gif" | "image",
    url: string,
    width?: number,
    height?: number,
    alt?: string,           // accessibility
    thumbnailUrl?: string,  // for lazy loading
    provider?: string,      // "tenor" | "ipfs"
  }
}
```

Content field remains the text caption (can be empty for media-only messages). Media is metadata alongside text, not a replacement.

### 2b. Image Upload

**Architecture:**
- Reuse existing Pinata IPFS infrastructure (already have `POST /api/v1/pin` in Netlify)
- Frontend: image picker button in MessageInput → file select → upload to IPFS → send message with IPFS URL
- Accepted types: image/jpeg, image/png, image/gif, image/webp
- Size limit: 5MB (configurable)
- Client-side image compression before upload (optional, nice-to-have)

**Upload flow:**
1. User selects image or pastes from clipboard
2. Show preview thumbnail in compose area with cancel option
3. On send: upload to `/api/v1/pin` → get IPFS hash
4. Send message with `media: { type: "image", url: "ipfs://Qm..." }`
5. Frontend renders via IPFS gateway URL

**Security:**
- Existing wallet-signature auth on pin endpoint handles authorization
- Content-type validation server-side
- Consider: NSFW detection? (future, not Phase 2)

### 2c. Reactions

**Schema:**
```sql
CREATE TABLE chat_reactions (
  message_id  TEXT NOT NULL,
  domain      TEXT NOT NULL,
  emoji       TEXT NOT NULL,   -- Unicode emoji or short code
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (message_id, domain, emoji),
  FOREIGN KEY (message_id) REFERENCES chat_messages(id)
);
CREATE INDEX idx_reactions_message ON chat_reactions(message_id);
```

**PartyKit message types:**
- Inbound: `react` → `{messageId, emoji}` (toggle — add if absent, remove if present)
- Outbound: `reaction-update` → `{messageId, emoji, domain, action: "add"|"remove"}`

**Worker internal endpoints:**
- `POST /internal/react` → toggle reaction, return updated counts
- `GET /internal/reactions/:messageId` → all reactions for a message

**Frontend:**
- Hover/long-press message → emoji picker (small, curated set + full picker)
- Reaction pills under message: `😂 3  ❤️ 1  🚀 2`
- Click existing reaction to toggle (add/remove your own)
- Quick-react bar: 5-6 most common emojis for one-tap access

### 2d. D1 Content Limit

- Increase `chat_messages.content` limit from 2000 → 4000 chars (accommodate media JSON)
- Or: add separate `media` TEXT column (JSON) to keep content clean
- Recommend: separate `media` column — cleaner queries, no content parsing

```sql
ALTER TABLE chat_messages ADD COLUMN media TEXT;  -- JSON: {type, url, width, height, ...}
```

### 2e. MessageBubble Rendering Updates

- Detect media in message → render inline
- GIFs: `<img>` with lazy loading, click to expand
- Images: thumbnail with lightbox on click
- Reactions bar below message content
- Link previews (stretch goal — URL unfurling via worker)

---

## Phase 3 — Profile Integration

### 3a. Hackatar PFP in Chat

**Implementation:**
- Add `<Hackatar>` component (already exists: `src/components/Hackatar.tsx`) to MessageBubble
- Small avatar (24-32px) next to sender domain name
- Use `/api/v1/hackatar/:label?static=1` for static thumbnails (performance)
- Lazy load with intersection observer for scroll performance
- Cache: browser cache handles this (hackatars are immutable, cached by Netlify Blobs)

**Message grouping optimization:**
- Consecutive messages from same sender: show avatar only on first message
- Subsequent messages get indented under the avatar (compact mode)

### 3b. Profile Popout

**Trigger:** Click sender domain name or avatar in MessageBubble

**Popout content:**
- Hackatar (larger, animated)
- Domain name (`alice.hack.tez`)
- Bio (from TED profile data)
- Links (website, GitHub, Twitter/X — from profile data)
- "View full profile" link → `/u/alice`
- "Send DM" button (if not already in DM)
- Admin: "Ban user" option in popout

**Data source:** `GET /api/v1/profile/:label` (already exists)

**UX:**
- Popover/card anchored to the clicked name (not a full modal)
- Dismiss on click-outside or Escape
- Cache profile data (5-min TTL) to avoid re-fetching on repeat clicks
- Loading skeleton while fetching

### 3c. Online User Avatars

- Add hackatars to the online users list in ChatSidebar
- Small (20px) static hackatars next to each domain name
- Already have the component, just need to wire it in

---

## Additional Features (folded into phases)

### Message Editing (Phase 2)
- `edited_at` column already exists in D1 schema — just unused
- Worker internal endpoint: `POST /internal/edit-message` (sender must match)
- PartyKit inbound: `edit-message` → `{messageId, content}` (only own messages)
- PartyKit outbound: `message-edited` → `{messageId, content, editedAt}`
- Frontend: "Edit" option in message context menu (own messages only), inline editing in MessageInput
- Show "(edited)" label on edited messages

### Reply/Quoting (Phase 2)
- Add `reply_to` TEXT column to `chat_messages` (nullable, references message ID)
- Message format: `{ ...message, replyTo?: { id, sender, content (truncated) } }`
- Frontend: swipe-to-reply or click "Reply" in message menu
- Quoted message preview above compose input
- Quoted message snippet rendered above reply content in MessageBubble
- Click quoted snippet to scroll to original message

### @Mentions (Phase 3)
- Pattern: `@label` in message content (e.g., `@alice`)
- Frontend: autocomplete dropdown when typing `@` (from online users + recent participants)
- Render: highlighted with accent color, clickable (opens profile popout)
- Notification: mentioned user gets browser notification even if muted
- Add `mentions` field to stored message metadata for efficient notification targeting

## Future Considerations (out of scope)

- **Pinned messages** — admin pins important messages to top
- **Message search** — full-text search across history
- **Link previews** — URL unfurling with OpenGraph meta
- **End-to-end encryption for DMs** — stretch goal
- **Channel system** — multiple topic channels beyond global (e.g., #dev, #art)
- **Custom emoji / stickers** — community-uploaded

---

## Implementation Order

```
Phase 1a: Schema migration (bans, audit log, soft-delete columns)
Phase 1b: Worker admin endpoints + middleware
Phase 1c: PartyKit admin message handling + ban enforcement
Phase 1d: Frontend admin UI (delete, ban, audit log viewer)
  └── Phase 1 complete — ship & test

Phase 2a: Message format evolution (media column, reply_to column, structured content)
Phase 2b: Message editing (use existing edited_at column)
Phase 2c: Reply/quoting (reply_to reference, quoted preview)
Phase 2d: Tenor GIF search (worker proxy + frontend picker)
Phase 2e: Image upload (IPFS reuse + frontend picker)
Phase 2f: Reactions (schema + PartyKit + frontend)
Phase 2g: MessageBubble multimedia rendering (GIF, images, reactions, edits, replies)
  └── Phase 2 complete — ship & test

Phase 3a: Hackatar PFP in message bubbles + message grouping
Phase 3b: Profile popout card
Phase 3c: Online user avatars in sidebar
Phase 3d: @mentions with autocomplete + notification override
  └── Phase 3 complete — ship & test

Phase 4a: Mobile responsiveness audit + fixes
Phase 4b: WCAG 2.2 AA compliance audit + fixes
  └── Phase 4 complete — ship & test
```

---

## Phase 4 — Mobile & Accessibility Review

Final pass after all features are implemented. Audit everything added in Phases 1–3.

### 4a. Mobile Responsiveness Audit

**Scope:** All new chat UI — moderation modals, ban banner, reactions, GIF picker, image preview, reply preview, message editing, profile popout, @mention autocomplete.

**Checklist:**
- Touch targets ≥ 44×44px (WCAG 2.5.8) — reaction pills, quick-react emoji, context menu items, modal buttons
- Swipe-to-reply gesture (if added) works reliably on iOS Safari + Chrome Android
- GIF picker / image picker is usable on small viewports (≤375px wide)
- Reply preview bar doesn't overflow or obscure the compose area
- Modals (delete, ban) are full-screen or bottom-sheet on mobile, not floating cards that get clipped
- Ban banner doesn't push content off-screen; countdown is legible
- Profile popout repositions or converts to bottom sheet on mobile
- Emoji picker is reachable without horizontal scroll
- Sidebar toggle + active view transitions feel smooth on mobile
- Safe area insets respected (notch, home indicator) — already handled in MessageInput

### 4b. WCAG 2.2 AA Compliance Audit

**Scope:** All hackchat UI (Phases 1–3 additions + existing chat components).

**Focus areas:**

**Perceivable (1.x):**
- Color contrast ≥ 4.5:1 for text, ≥ 3:1 for large text and UI components
- Reaction pills, "(edited)" labels, timestamps, reply previews all meet contrast minimums
- Media has alt text (already done for `<img>` in MediaRenderer)
- Deleted message stubs are perceivable by screen readers (already using `role="article"` + `aria-label`)
- Ban banner conveys urgency without relying solely on color (icon + text)

**Operable (2.x):**
- All interactive elements keyboard-accessible: reaction pills, quick-react bar, context menus, modals, GIF search, emoji picker
- Focus trapping in modals (delete, ban, profile popout)
- Focus returns to trigger element on modal/popover dismiss
- No keyboard traps — Escape dismisses all overlays
- Skip links or focus management for chat message list (long-scroll)
- Visible focus indicators on all interactive elements (`:focus-visible` outlines)

**Understandable (3.x):**
- Error messages (ban, failed upload, failed react) are descriptive and announced to screen readers (`role="alert"` or `aria-live="assertive"`)
- Consistent navigation — context menu items in same order across message types
- Labels on all form controls (textarea, search input in GIF picker)

**Robust (4.x):**
- Semantic HTML: buttons are `<button>`, links are `<a>`, lists use `<ul>`/`<li>`
- ARIA roles/states where needed: `aria-expanded` on menus, `aria-pressed` on reaction toggles, `aria-live` regions for new messages and typing indicators (already done)
- Screen reader announces: new messages, typing indicators, ban/unban events, reaction updates

**Testing approach:**
- Manual keyboard-only navigation through all flows
- Screen reader testing (VoiceOver on macOS/iOS, TalkBack on Android if available)
- axe DevTools or Lighthouse accessibility audit on `/chat` route
- Contrast check with browser dev tools or WebAIM contrast checker
- Verify on iOS Safari + Chrome Android with VoiceOver/TalkBack

## Technical Notes

- PartyKit does NOT support D1 bindings — all D1 access goes through Worker internal API (`/internal/*` endpoints with `X-Internal-Secret`)
- Tailwind spacing utilities don't work in lazy-loaded chat components — use inline styles
- Admin domain detection is purely from JWT domains array — no hardcoded admin list needed beyond recognizing the `admin.hack.{tld}` pattern
- GIF/image messages must degrade gracefully: if media fails to load, the text content (caption) remains visible
- All new D1 migrations should be additive (ALTER TABLE, new tables) — no destructive changes
