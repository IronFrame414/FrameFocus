# Session 15 — Module 3 polish, pattern documentation, and future-state planning

**Date:** April 11, 2026
**Predecessor:** Session 14 (session renumbering only, no code)
**Primary interface:** Claude Chat + Claude Code in Codespace terminal

---

## Definition of done (set at session start)

Per STATE.md "Session 14 — Starting Point" (carried forward since Session 14 was renumbering-only):

1. Update CLAUDE.md with Session 12 carry-forward patterns (tech debt #48): inline subquery for storage RLS, trash-bin pattern.
2. Extend heredoc warning to cover SQL (tech debt #49).
3. Evaluate next Module 3 build target and start it.

All three met, plus two bonus comment cleanups (#50, #53) and three new carry-forward items logged.

---

## What was done

### 1. CLAUDE.md pattern documentation (commit `90f35a1`)

Three edits to CLAUDE.md, applied one at a time via Claude Code:

- **Heredoc warning extended to SQL.** The "Instruction Preferences" bullet previously said heredocs eat `<a` tags from JSX only. Rewrote to cover any multi-line file content, explicitly naming JSX and SQL, with a note that a multi-line SQL heredoc was mangled on a migration in Session 12. The other heredoc warning in "Known Codespaces Gotchas" already covered SQL from an earlier edit and was left alone.
- **Storage RLS: inline subquery pattern.** New subsection in Database Conventions, placed immediately after the RLS paragraph that introduces `get_my_company_id()`. Documents that the helper fails on `storage.objects` policies (silently returns NULL), and that the pattern is an inline subquery against `profiles` — e.g. `(storage.foldername(name))[1]::uuid = (SELECT company_id FROM profiles WHERE id = auth.uid())`. References migrations 013 and 017 as canonical.
- **Trash-bin pattern.** Replaced the prior one-line "All queries filter `WHERE is_deleted = false`" rule with a proper subsection. States: soft deletes only; RLS does NOT filter `is_deleted`; the service layer enforces; `getEntities()` filters `is_deleted=false`, `getEntity(id)` does NOT (must return deleted rows for restore flow); `getTrash()` filters `is_deleted=true`. References `files.ts` as the canonical implementation.

Closes tech debt **#48** and **#49**.

### 2. Migration 019 applied (commit `4b769ed`)

Created `packages/supabase/migrations/019_files_updated_by_trigger_and_mime_check.sql`. Two changes:

- `set_files_updated_by()` plpgsql function + `files_set_updated_by` `BEFORE UPDATE` trigger — stamps `NEW.updated_by = auth.uid()` on every row update. Uses default `SECURITY INVOKER` (not DEFINER) so the acting user's `auth.uid()` is captured.
- `files_mime_type_not_empty` CHECK constraint (`CHECK (mime_type <> '')`) on the `files` table.

Pre-check confirmed zero existing rows with empty `mime_type` (verified via SQL Editor), so the constraint applied cleanly.

Applied to production via the Supabase SQL Editor (the CLI `db push` reported "Remote database is up to date" — see section 4 below). Verified post-apply via:

```sql
SELECT 'trigger' AS kind, tgname AS name FROM pg_trigger WHERE tgname = 'files_set_updated_by'
UNION ALL
SELECT 'constraint', conname FROM pg_constraint WHERE conname = 'files_mime_type_not_empty';
```

Returned exactly 2 rows — both objects present.

Closes tech debt **#43**.

### 3. Migration 017 comment + files.ts trash-bin comments (commit `a8de345`)

Two comment-only cleanups bundled as one commit:

- `packages/supabase/migrations/017_project_files_bucket.sql` header comment: changed `Folder structure: {company_id}/{project_id}/{category}/{filename}` to `Folder structure: {company_id}/{project_id}/{filename}` with a note that the category segment was dropped in Session 13. Policies still work (only check the first path segment) but the comment was misleading future readers.
- `apps/web/lib/services/files.ts`: added 1–2 line comments above both `getFiles()` and `getFile()` explaining the trash-bin asymmetry and pointing readers to CLAUDE.md's "Trash-bin pattern" subsection. Added one at a time — Claude Code had a quirk where the second edit overwrote the first, so had to re-prompt to get both in place.

Closes tech debt **#50** and **#53**.

### 4. CLI migration-history investigation (deferred to Session 16)

While applying migration 019, discovered that `supabase migration list` returns empty Local and Remote columns — the CLI has no record of any of the 19 migrations. All migrations 001–019 have been applied via the Supabase dashboard SQL Editor, not via `npx supabase db push`.

Root cause: the CLI expects migrations at `supabase/migrations/` at repo root with 14-digit timestamp filenames. FrameFocus stores them at `packages/supabase/migrations/` with `001_...sql`-style prefixes. Web-search-confirmed that the path is not configurable via `config.toml` (GitHub discussion #33257 is an open feature request, not a shipped feature). The CLI enforces a strict naming scheme and path.

Proper fix is significant: move all 19 files + rename to timestamp format + backfill `supabase_migrations.schema_migrations` on remote with each version marked applied + update CLAUDE.md Monorepo Structure section. Estimated 30–60 minutes of focused work with real risk of a rename typo breaking future pushes.

Decision: defer to Session 16 as first task rather than do it at the tail end of Session 15. Logged as tech debt **#56**.

### 5. STATE.md reorganization (commit `c467c75`)

- "Last updated" header updated.
- Module 3 Build Status row updated to reflect migration 019.
- New "Module 3 sub-status" table added (3A–3I), matching Modules 1 and 2 conventions. Closes tech debt **#54**.
- Tech debt items #43, #48, #49, #50, #53, #54 marked `✅ CLOSED Session 15` inline (preserves history and numbering).
- New subsection "Discovered Session 15" with tech debt items #56 (CLI migration-history), #57 (`**Format` untracked file), #58 (stale CLAUDE.md Migrations Run list).
- Session 14 Starting Point section replaced with "Session 15 — What Happened" + "Pre-Module 9 Decision Gate" + "Session 16 — Starting Point".
- How-to-start-next-session list updated to reference context15.md and Session 16.
- Cleanup: removed duplicated `018` row from the Migrations applied table and added the missing `019` row.
- Cleanup: removed duplicated "Migration 018 ... column defaults" sentence in the `files` table's Notes cell.
- New tech debt #59 logged: CLAUDE.md "Last updated" header is stale and needs a sync sweep alongside #58.

---

## Pre-Module 9 Decision Gate — IMPORTANT

Two product ideas were raised during Session 15 that would significantly reshape Module 9 (Customer Experience Portal). Neither was decided. **Module 9 design and build are now blocked until a resolution.**

### Idea 1 — Outbound webhook system (potential Module 12)

Originally pasted by Josh as a spec for a separate Claude session. Full spec preserved below for reference. Would add a per-company outbound webhook layer to FrameFocus:

- Three new tables: `company_api_keys`, `company_webhook_configs`, `webhook_delivery_log`. All RLS-scoped to `company_id`.
- API key generation: cryptographically secure, format `ff_live_[32 random chars]`, stored as bcrypt hash with 8-char display prefix. Full key shown to Owner once at generation time.
- Webhook dispatcher: standalone TypeScript module. Looks up company's active webhook config, checks event subscription, HMAC-SHA256 signs the payload with the company's signing secret, POSTs with headers `X-FrameFocus-Signature` / `X-FrameFocus-Event` / `X-FrameFocus-Delivery`, logs to `webhook_delivery_log`, retries 3x with exponential backoff (5s, 30s, 5min), fire-and-forget (never blocks the caller).
- Event envelope: `{event, delivered_at, company_id, data}`. Event types: `project.updated`, `project.phase_changed`, `update.created`, `photo.uploaded`, `document.uploaded`, `message.sent`.
- Settings UI: "Website Integration" tab in Company Settings (Owner/Admin only). API Keys panel (list, generate, revoke). Webhook Config panel (URL, signing secret, event checkboxes, active toggle, send-test-event button, last 20 delivery log entries).
- Integration Guide: in-product reference section showing Node.js and PHP verification examples for the receiving company's web developer.

Constraints: uses existing RLS patterns, generated types (Session 9 refactor), lazy-init pattern, Owner/Admin server-action checks, no `any` types.

**Status:** Captured, not designed in detail, not committed to build. If adopted, this becomes Module 12 — probably Phase 4 alongside or after Module 11 — though see Idea 2, which may promote it to load-bearing.

### Idea 2 — Client-experience pivot: no FrameFocus logins

Raised by Josh after hearing the Module 12 idea. The proposed model:

- No client logins to FrameFocus at all. The `client` role largely goes away.
- Client touchpoints become either (a) magic-link emails with signed tokens that open standalone FrameFocus-hosted pages for CO signing or material selection — no account, no password, single-use tokens; or (b) content pushed via webhook to the company's own website, where the client reads updates/timeline/photos/documents as part of browsing the contractor's site.
- FrameFocus never hosts a "client portal" as a logged-in destination — only transactional one-off action pages reached via tokenized email links.

**Cascading impact** (captured in-chat, not yet designed):

- Module 9 is fundamentally reshaped. Most of its current detailed design (client login, messaging thread, photo favorites as logged-in feature, pre-construction checklist visible to client, AI weekly summary in portal) needs reconsidering.
- Module 12 becomes load-bearing, not optional.
- New magic-link token system required: generation, expiry, single-use, revocation, signature verification.
- Photo favorites and Decision Log visibility need new delivery paths (probably webhook-driven).
- Subscription tiers: current "Client Portal" Business-tier gating becomes "Website Integration" gating. Does magic-link signing work on all tiers?
- Client-to-PM messaging doesn't fit email+webhook cleanly. Reply-by-email parsing? Messaging lives on company's website and inbound via webhook?
- Stripe Connect invoice payment: tokenized FrameFocus-hosted Checkout page, email link, or embedded on company site?

### How Josh wants this handled

Josh explicitly does not want to commit tonight. Direct quote: _"I don't want to have to rebuild anything so be sure it is discussed and decided before it would make more work."_ Good instinct — the cost of rebuilding Module 9 is much higher than the cost of a dedicated planning session.

**Hard block:** No design changes, no CLAUDE.md module stub, no decision doc yet. Just a gate flag in STATE.md and this context file. When we approach Module 9, that session opens with a dedicated planning conversation to answer the questions above before any design work.

---

## Tech debt movement

**Closed:** #43, #48, #49, #50, #53, #54 (6 items).
**Added:** #56 (CLI migration-history), #57 (`**Format` file), #58 (stale CLAUDE.md Migrations Run list).
**Net:** −3 open items.

---

## Lessons + misc

- Claude Code has a quirk where sometimes an edit replaces an earlier edit to the same file instead of adding to it. Noticed when adding the two trash-bin comments to `files.ts` — the second edit overwrote the first. Fix: after any Claude Code edit that should add to an existing change, verify with `grep` that both additions survived before moving on. Don't rely on the rendered diff alone if the prompt doesn't explicitly say "do not touch existing X."
- `supabase db push` reporting "Remote database is up to date" was the first clue to the CLI mismatch. If the CLI shows no pending migrations but you have a new file that clearly hasn't been applied, check `supabase migration list` before assuming the DB state.
- Josh's instinct to stop and audit mid-close caught several things that would have been missed — the tech debt #50 and #53 items that hadn't been closed, the fact that the old context file reference would need updating. Worth repeating in future sessions: a pre-close audit pass.

---

## Starting Session 16

**First task:** Fix tech debt #56 (Supabase CLI migration-history). Move migrations, rename, backfill remote `schema_migrations`, verify with `supabase migration list`, update CLAUDE.md Monorepo Structure, commit atomically.

**After that:** Pick next Module 3 build target from sub-status table (3F file list UI stub, 3G photo markup component, 3H AI auto-tagging, 3I file_favorites junction table) — or Josh can open the Pre-Module 9 Decision Gate if he wants to tackle that decision before more Module 3 work.

**Do not start Module 9 design or build without first resolving the Pre-Module 9 Decision Gate.**
