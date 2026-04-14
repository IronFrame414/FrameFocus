# Session 25 — Module 3F (File List UI + Upload + Actions)

**Date:** April 13, 2026
**Goal:** Ship Module 3F — the web UI shell for project files, knowing it can't be exercised end-to-end until Module 5 ships the `projects` table.
**Outcome:** ✅ 3F complete. List page, upload form, download, and soft-delete all shipped and type-checking clean.

---

## What shipped

- **`apps/web/app/dashboard/projects/[id]/files/page.tsx`** — server component. Calls `getFiles({ project_id })` and renders a table with name, category, size, uploaded date, and actions. Empty state when no files.
- **`apps/web/app/dashboard/projects/[id]/files/upload/page.tsx`** — server wrapper for the upload form.
- **`apps/web/app/dashboard/projects/[id]/files/upload/upload-form.tsx`** — client component. File input + category dropdown, calls `uploadFile` from `files-client.ts`, redirects back to the list on success.
- **`apps/web/app/dashboard/projects/[id]/files/file-row-actions.tsx`** — client component with Download and Delete buttons per row. Download fetches a signed URL via the new API route and opens in a new tab. Delete calls `softDeleteFile` with a confirm dialog.
- **`apps/web/app/api/files/signed-url/route.ts`** — GET route that wraps `getSignedUrl` so the client can fetch signed URLs without importing server-only code.

## Commits

1. `feat(files): Module 3F — file list page + upload form shell`
2. `feat(files): Module 3F — download + soft-delete actions on file list`

## Decisions

- **Separate `/upload` sub-route over inline form.** Cleaner separation if upload grows (drag-drop, multi-file, AI preview). Matches option 2 from the mockup comparison.
- **Soft delete only on the main list.** Permanent delete + restore will live in a future trash UI (owner/admin only). Matches the trash-bin pattern in CLAUDE.md.
- **Signed URL via API route, not server action.** Keeps client component simple — one `fetch` call — and the route is reusable if other parts of the app need signed URLs later.
- **No sidebar nav link to `/dashboard/projects`.** There's no project index page and no project IDs to navigate to until Module 5. The route is only reachable by typing a URL with a made-up UUID. Matches "shell that can't be tested."

## Smoke tests

**Not run.** The route requires a valid `project_id` and the `projects` table doesn't exist yet (Module 5). Type-checking passed clean (`npx tsc --noEmit` with no output) twice — once after the list page and once after the actions. Full end-to-end testing deferred until Module 5 ships.

## Lessons / gotchas

- **`database.ts` types `created_at` as nullable** even though Postgres has a default. The generated types don't know about defaults, only nullability. Had to guard with `f.created_at ? new Date(...) : '—'`. Will come up again on every table that has a similar timestamp default. Not worth logging as tech debt — it's a one-line guard.
- **VS Code Problems panel caches stale errors.** After creating `upload-form.tsx`, the "Cannot find module" error on `page.tsx` didn't clear until a window reload. Source of truth is `npx tsc --noEmit` in the terminal, not the Problems panel. Worth remembering — don't chase phantom errors the build doesn't see.
- **Next.js 15 params are Promises.** Both page components use `params: Promise<{ id: string }>` and `await params`. Easy to forget coming from older Next versions.

## Tech debt opened

- **#48** Trash UI for files — soft-deleted files have no UI to view or restore; owner/admin permanent-delete lives here too. Sub-module 3J.
- **#49** Inline styles on Module 3F pages — same pattern as tech debt #40. Clean up with shadcn/ui migration.

## Tech debt closed

None this session.

## Next session candidates

- **Module 3G** — photo markup component (shared with Module 6). Forward progress.
- **Module 3H** — AI auto-tagging via GPT-4o vision. Requires OpenAI key (already configured per STATE.md).
- **Module 3I** — `file_favorites` junction table. Small, easy.
- **Module 3J (new)** — trash UI. Small, finishes the Module 3 UI story.
- **Pre-Module 9 Decision Gate** — webhook system + client-portal pivot. Strategic, blocks Module 9.
- **Tech debt cluster #14–#17** — team member detail page (edit/delete/notes/password reset).

Choose at session start.
