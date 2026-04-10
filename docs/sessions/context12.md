# Context — FrameFocus Session 11 (April 10, 2026)

> **Format note:** Following the Session 8 pattern — short, decisions-focused. Detailed work history is in `git log`. See `STATE.md` for live repo status.

---

## Session summary

Module 3 database foundation built and verified in production. Two migrations live: `files` table (016) with full RLS, and `project-files` storage bucket (017) with matching RLS policies. Pre-build decisions resolved (photo markup format, T&M rate structure, projects nested under clients). Multiple Module 5 and Module 9 follow-up items logged.

Heavy Chat-driven session. Claude Code did the file writes but ping-ponged on RLS policy edits — fixing one policy while reverting another. Three rounds of fix-and-revert before forcing a full file overwrite resolved it. Lesson logged below.

**3 commits pushed to main:**

| Commit  | Description                                                 |
|---------|-------------------------------------------------------------|
| e97a7fc | feat(module-3): Add migration 016 - files table with RLS   |
| ea464fa | chore(types): Regenerate database types after migration 016 |
| 30d98a0 | feat(module-3): Add migration 017 - project-files storage bucket |

---

## Decisions made

### 1. Photo markup format → JSON (JSONB column)

`markup_data` is a JSONB column on the `files` table. Original photo is never modified — markup is a data layer rendered on top at display time. Editable, non-destructive, supports undo/redo, supports toggle on/off.

### 2. Photo markup tool set → 8 tools at launch

Arrow, circle, rectangle, freehand draw, text label, color picker, crop, rotate. JSON format means new tools can be added later without schema changes.

### 3. T&M rate structure → per-employee, on team detail page

Each team member gets a `tm_rate` field on their profile, editable only by Owner/Admin. When hours log against a T&M job in Module 6, the rate pulls from the employee's profile. Combines with existing tech debt items 25-28 (team member edit, delete, password reset, notes) — all five fields land on a new `/dashboard/team/[id]` detail page when Module 6 ships, or as a polish session before then.

### 4. Projects nested under clients (Module 5 design note)

One client → many projects, each with its own address. The `projects` table will have `contact_id UUID NOT NULL REFERENCES contacts(id)`. Decided mid-session, doesn't affect Module 3 storage structure.

### 5. Storage bucket → private, signed URLs only

`project-files` bucket created with `public = false`. Different from `company-logos` (public) because contracts/invoices/photos are sensitive.

### 6. Trash bin accessible to all company employees

SELECT policy on `files` table does NOT filter `is_deleted = false`. Application layer decides what to show (live view vs. trash view). Soft delete and restore fall under the UPDATE policy. Permanent delete is owner/admin only.

### 7. Client SELECT gap closed proactively

First draft of the SELECT policy only checked `company_id`. Clients have a `company_id` (pointing at the contractor's company), so this would have given them read access to every internal file once Module 9 ships. Closed by adding `AND get_my_role() != 'client'`. Module 9 will add a separate SELECT policy for explicitly-shared client files.

### 8. Storage policy pattern → match Migration 009 (inline subquery)

Migration 009's storage policies use `(SELECT company_id FROM profiles WHERE user_id = auth.uid() AND is_deleted = false)` instead of `get_my_company_id()`. Both are equivalent in normal contexts, but Supabase storage RLS sometimes evaluates with a different search_path that can trip helper functions. Migration 017 matches the proven 009 pattern. Role checks still use `get_my_role()` because that pattern is proven to work.

---

## What was built

### Migration 016 — `files` table

Standard columns + file identity (project_id nullable, no FK), category CHECK with 9 values including `receipts`, file metadata, tags + ai_tags arrays, version tracking with self-referencing `supersedes_id`, JSONB `markup_data`. Indexes on company_id, project_id, category. updated_at trigger.

4 RLS policies:
- `files_select_non_client` — company members minus clients (no is_deleted filter, trash bin works)
- `files_insert_non_client` — 5 internal roles
- `files_update_non_client` — 5 internal roles (handles soft-delete and restore)
- `files_delete_owner_admin` — owner/admin only (permanent delete)

### Migration 017 — `project-files` storage bucket

Private bucket. Folder structure `{company_id}/{project_id}/{category}/{filename}`. 4 RLS policies on `storage.objects` mirroring the files table policies, scoped to `bucket_id = 'project-files'`. Inline subquery pattern from Migration 009.

### Generated types regenerated

`packages/shared/types/database.ts` updated. New `files` table visible to service layer.

---

## Module 5 follow-up items (must not be forgotten)

When Module 5 builds the `projects` table:

1. Add FK constraint on `files.project_id`:
```sql
   ALTER TABLE files ADD CONSTRAINT files_project_id_fkey
     FOREIGN KEY (project_id) REFERENCES projects(id);
```

2. The `projects` table itself must include `contact_id UUID NOT NULL REFERENCES contacts(id)`. One client, many projects, each with its own address.

## Module 9 follow-up item (must not be forgotten)

Add a SECOND SELECT policy on the `files` table to grant clients read access to specifically-shared files. Likely via a `file_shares` junction table. Module 3 launches with files locked to internal team only.

## Deferred to a follow-up Module 3 migration

`file_favorites` junction table (file_id + user_id). Build when the file list UI lands.

---

## Outstanding items

### Session 12 — Module 3 build continues

1. File upload service layer (server + client), Option C generated types pattern
2. Basic file list UI (web)
3. Photo markup component (8 tools, JSONB storage, shared with Module 6)
4. AI auto-tagging via GPT-4o vision
5. `file_favorites` junction table migration

### Tracked in STATE.md

- Module 5 FK constraints on `files.project_id` and `projects.contact_id`
- Module 9 client SELECT policy on files
- All existing tech debt from Sessions 8-10

---

## Lessons learned

1. **Claude Code regresses on multi-policy RLS edits.** When asked to change 1 of 4 policies in a file, it "helpfully" reverts other policies to the original spec. Fix: force a full file overwrite via the Write tool, then run `cat` to verify actual disk contents — never trust Claude Code's restated summary. Cost ~30 minutes of ping-pong this session.

2. **Always `cat` the file in the regular terminal before running migrations.** Claude Code's Read tool can mismatch disk state if a previous edit half-applied.

3. **Match proven patterns in unusual RLS contexts.** Storage policies, trigger functions, and RLS-on-`auth.users` can trip helper functions in ways regular table queries don't. When in doubt, copy the exact pattern from a migration known to work in production.

4. **Catch security holes during the design pass.** The client SELECT gap would have shipped if not caught during audit. Always think: who has a `company_id`, what does this policy let them see.

---

## How to start Session 12

1. Open the Codespace at `github.com/IronFrame414/FrameFocus`
2. Run:
```bash
   git pull
   bash scripts/session-start.sh
```
3. Paste the snapshot output plus `STATE.md` and `docs/sessions/context12.md` into a new Claude Chat session
4. Say: **"Starting Session 12. Module 3 database is live (migrations 016 and 017). Next is the file upload service layer."**
5. Switch to Claude Code once a plan is agreed
6. End the session in Chat with a STATE.md update and context13.md

---

**End of context12.md.**
