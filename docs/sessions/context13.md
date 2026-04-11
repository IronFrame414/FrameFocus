# Context — FrameFocus Session 13 (April 10, 2026)

> **Format note:** Following the Session 9/11 pattern — short, decisions-focused. Detailed work history is in `git log`. See `STATE.md` for live repo status.

---

## Session summary

Module 3 file upload service layer built and committed. One new migration (018 — Postgres column defaults on `files`), regenerated types, and two new service files: `files.ts` (server-side reads + signed URLs) and `files-client.ts` (client-side writes). Per the Session 13 B1 decision, end-to-end smoke testing is deferred until Module 5 ships the `projects` table — uploads are blocked without a real `project_id`.

Light Chat-driven session with no Claude Code involvement. All file writes done manually in the Codespace editor after a heredoc paste mangling discovered early on (Lesson 1).

**3 commits pushed to main:**

| Commit  | Description                                                            |
| ------- | ---------------------------------------------------------------------- |
| 59be422 | feat(module-3): Add migration 018 - files column defaults              |
| 8ac8796 | chore(types): Regenerate database types after migration 018            |
| 9a1f508 | feat(module-3): Add files service layer (server reads + client writes) |

Also reverted an accidentally-clobbered `context11.md` (stray prompt fragment from a previous session got pasted into the file). No real work product change.

---

## Decisions made

### 1. Service layer write pattern → Postgres column defaults (files only)

Migration 018 sets `auth.uid()` as the default for `created_by` and `updated_by`, and `get_my_company_id()` as the default for `company_id` on the `files` table. This eliminates the manual auth + profile lookup that `contacts-client.ts` and `subcontractors-client.ts` still do on every insert. RLS still enforces that the resulting row matches the user's company, so security is unchanged — actually slightly improved, because clients can no longer try to spoof those fields.

Scoped to files only this session. Migrating contacts and subs to the same pattern is logged as tech debt for a future polish session.

### 2. Storage path when `project_id` is null → block uploads until Module 5 (B1)

Rather than use a sentinel `_unassigned` folder, the service layer requires a real `project_id` on every upload. Module 3 cannot be smoke-tested end-to-end until Module 5 ships the `projects` table. Service layer is built and committed but sits idle until then.

Trade-off accepted: Module 3 ships untested this session, real testing starts after Module 5. Chosen over the sentinel approach to avoid carrying historical "\_unassigned" files forever.

### 3. Filename collisions → UUID prefix on storage path

Storage path is `{company_id}/{project_id}/{uuid}-{safe_filename}`. The `file_name` column stores the original filename for display. `crypto.randomUUID()` (browser-native, no library) is used for the prefix. `upsert: false` on the upload guarantees no silent overwrite even if the prefix collides.

### 4. Category NOT in storage path → eliminates drift (design correction caught mid-session)

Original plan was `{company_id}/{project_id}/{category}/{filename}`, matching migration 017's header comment. Caught a real bug during the design review: category is mutable (users can recategorize files), but storage paths are immutable. Encoding mutable data into an immutable identifier creates silent drift — the column says one thing, the bucket folder says another, and any future "files-by-folder" logic breaks.

Fix: drop category from the path entirely. Category lives in the column where it belongs, indexed and queryable. Verified migration 017's RLS policies only check `(storage.foldername(name))[1]` (first segment = `company_id`), so they continue to work without the category folder.

Migration 017's header comment is now stale but the policies themselves are correct.

### 5. Empty `mime_type` handling → JS fallback + future CHECK constraint

Some browsers don't populate `file.type` for unusual extensions or files dragged from some apps. The service layer applies `file.type || 'application/octet-stream'` as a fallback. A `CHECK (mime_type <> '')` constraint will be added in a future polish migration as defense in depth — the database constraint protects against any future writer that bypasses the JS fallback.

### 6. Max upload size → 50 MB, client-side check

`uploadFile` rejects files over 50 MB before touching storage. Returns a clean `{ success: false, error }` rather than burning bandwidth on a doomed upload. Server-side enforcement deferred.

---

## What was built

### Migration 018 — files column defaults

Three `ALTER TABLE files ALTER COLUMN ... SET DEFAULT` statements. Verified live via `information_schema.columns` query before commit:

| column_name | column_default      |
| ----------- | ------------------- |
| company_id  | get_my_company_id() |
| created_by  | auth.uid()          |
| updated_by  | auth.uid()          |

### `apps/web/lib/services/files.ts` (server reads)

- `getFiles(filters?)` — list files; defaults to `is_deleted = false`, supports `include_deleted: true` for the future trash view
- `getFile(id)` — single file by id; does NOT filter `is_deleted` (needed for restore-from-trash flows)
- `getSignedUrl(filePath, expiresIn?)` — generates signed URL for the private `project-files` bucket; defaults to 1-hour expiry

Type alias `FileRecord` (not `File` — that name collides with the browser global) and exported `FileCategory` union type.

### `apps/web/lib/services/files-client.ts` (client writes)

- `uploadFile(file, options)` — size check → auth/profile lookup for path → storage upload → row insert with cleanup-on-failure
- `updateFile(id, updates)` — file_name, category, tags, markup_data
- `softDeleteFile(id)` / `restoreFile(id)` — toggle `is_deleted` + `deleted_at`
- `permanentDeleteFile(id)` — storage delete first, then row delete (RLS enforces owner/admin)

### Generated types regenerated

`packages/shared/types/database.ts` regenerated post-migration. Type-check passed all 5 packages.

---

## Tech debt added (must not be forgotten)

### For polish migration 019

1. `BEFORE UPDATE` trigger on `files` to auto-set `updated_by = auth.uid()` — Postgres column defaults only fire on INSERT, so update functions in `files-client.ts` still manually set `updated_by` and call `auth.getUser()`.
2. `CHECK (mime_type <> '')` constraint on `files.mime_type` — defense in depth alongside the JS fallback.

### Follow-up after polish migration 019 lands

3. Clean up `files-client.ts` dead code — drop manual `updated_by` and `auth.getUser()` calls from `updateFile`, `softDeleteFile`, `restoreFile`, `permanentDeleteFile` once the trigger handles it.

### Architectural

4. Service layer pattern drift — `files-client.ts` uses Postgres column defaults; `contacts-client.ts` and `subcontractors-client.ts` still do manual auth + profile lookups. Migrate them in a polish session for consistency.
5. `uploadFile` still does an auth + profile lookup just to build the storage path — unavoidable until `company_id` is cached in JWT custom claims or session context. Bigger architectural change. Defer.

### Tooling / process

6. CLAUDE.md heredoc warning currently covers JSX only. Extend it to cover SQL files too — same paste-mangling failure mode.

---

## Carry-forward from Session 12 (still outstanding)

These were logged in the Session 12 audit but did not land this session:

1. **Trash bin UI** — Service layer supports it; the actual `/dashboard/files/trash` view + restore + permanent-delete buttons are TBD. Will land alongside the file list UI.
2. **`tm_rate` column on `profiles`** — Tracked in context prose only; needs to land as a Module 6 migration.
3. **CLAUDE.md updates with Session 12 patterns** — Two patterns to document: (a) inline subquery pattern for storage RLS, (b) trash bin pattern (no `is_deleted` filter in RLS, service layer enforces). **First task in Session 14.**
4. **Photo markup JSONB data model spec** — Will be designed when the markup component is built.

## Carry-forward to Session 14 (Module 3 build queue)

1. **First task:** CLAUDE.md updates (carry-forward item 3 above)
2. Basic file list UI (web) — design and stub OK; real testing gated on Module 5
3. Photo markup component (8 tools, JSONB storage, shared with Module 6) — needs JSONB shape design first
4. AI auto-tagging via GPT-4o vision
5. `file_favorites` junction table migration (deferred from Session 12)
6. Polish migration 019 (BEFORE UPDATE trigger + mime_type CHECK)
7. Module 5 still gates end-to-end testing of everything built this session

---

## Lessons learned

1. **Shell heredocs for multi-line SQL files mangle on paste.** Same failure mode as the JSX heredoc warning already in CLAUDE.md — the closing `EOF` marker can fuse onto a line of content when pasting into the terminal. Fix: use the Codespace editor for any multi-line file content, not heredocs. Logged as tech debt #49 to update CLAUDE.md.

2. **`cat`-verify after every file save.** Type-check passed for `files-client.ts` but only the cat output confirmed the file was complete and unmangled (auto-formatter had reorganized destructuring patterns — logic identical, format different). Session 12 lesson #2 reaffirmed.

3. **Encoding mutable data in immutable identifiers creates silent drift.** Caught during design review: putting `category` in the storage path would have made every recategorize either silently break or require physical blob movement. Storage paths should only contain things that never change for the lifetime of the file. Always ask: "what in this identifier is mutable?"

4. **One question, one decision, then move on.** The session went smoothly when each design question got isolated and answered before the next one. Bundling multiple open questions creates the same ping-pong problem Session 12 ran into with RLS edits.

---

## How to start Session 14

1. Open the Codespace at `github.com/IronFrame414/FrameFocus`
2. Run:

```bash
   git pull
   bash scripts/session-start.sh
```

3. Paste the snapshot output plus `STATE.md` and `docs/sessions/context13.md` into a new Claude Chat session
4. Say: **"Starting Session 14. Module 3 service layer is live (migration 018 + files.ts + files-client.ts). First task: update CLAUDE.md with the Session 12 carry-forward patterns, then evaluate next Module 3 build target."**
5. Switch to Claude Code once a plan is agreed
6. End the session in Chat with a STATE.md update and context14.md

---

**End of context13.md.**
