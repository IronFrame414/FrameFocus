# TECH_DEBT.md — FrameFocus

> **Last updated:** April 20, 2026 — Session 34 (split from STATE.md)
> **Purpose:** Tracks all known tech debt — open and closed. Lives in the repo, not in project knowledge. Read on demand when working on items, planning a polish session, or auditing.

---

## Polish Session Plan — Before Module 4 Build

Locked Session 34. Items must be addressed in this order due to dependencies. Multiple sessions expected; scope each at session start.

2. **#65** — owner uniqueness DB constraint (partial unique index). Pure migration. Has to land before any UI that could create a second owner.
3. **#43** — `profiles_update_owner` RLS policy update (allow Admin writes except setting `role='admin'`). Pure migration. Unblocks #14.
4. **#14, #15, #16, #17** — team detail page (`/dashboard/team/[id]`): edit, delete, password reset, notes field. One coherent UI build.
5. **#66** — ownership transfer UI. Builds on the team detail page (#14) and the constraint (#65).

Module 4 build does not begin until all six items are closed.

---

## Conventions

**Tech debt numbers are immutable.** Once assigned, a number is never reused, never reassigned, never compacted. If #44 is closed, it stays #44 forever and nothing else can ever be #44.

**Closures move, they don't disappear.** When an item is closed, it moves from `Open Tech Debt` to `Closed Tech Debt` as a one-line entry: number, brief description, session closed, commit reference. The full description is preserved in git history (the commit that closed it) and in the relevant context file.

**Why this matters:** Old context files, code comments, and commit messages reference items by number. Deleting a number breaks every reference to it. Marking it closed in place preserves the audit trail without bloating the open list.

**Cross-references in code/docs:** Comments like `// TODO(#44):` or `Tech debt #21` in markdown should be updated when the underlying item closes — but the number itself stays stable so old references still resolve when looked up here.

---

## Open Tech Debt

### Pre-Beta

- **#1** No tags UI on contacts/subs forms (columns exist as TEXT[], no input component yet)
- **#2** No loading.tsx or error.tsx boundary files for any routes
- **#3** No CSV import for contacts or subcontractors
- **#4** No active page highlighting in sidebar nav
- **#5** No phone format enforcement in any forms
- **#6** Source CHECK constraint may be too restrictive (real contractors may want yard sign, trade show, Angi, HomeAdvisor, etc.)
- **#7** Optional cleanup of Session 7 debugging artifacts — orphaned test users

### Code Quality

- **#8** `team-page-client.tsx` has local `ROLE_LABELS` — should import from `@framefocus/shared`
- **#9** `invite-form.tsx` has local `INVITABLE_ROLES` — should import from `@framefocus/shared`
- **#10** `invite-form.tsx` imports `Invitation` without `import type` — cross-boundary type import should use `import type`
- **#12** **PRIORITY — fix before Module 4 build (scheduled Session 35).** `packages/shared/types/index.ts` is the same barrel anti-pattern that old #11 was for constants, now for types. Verified Session 34 (F3). Multiple drift issues:
  - `CompanyUserRole` inline string union missing `admin` role — same bug pattern as old #11. Compounded by `export * from './roles'` at the file's bottom, which re-exports a different `CompanyUserRole` from `roles.ts`. Consumers get whichever wins by import order.
  - `Profile` interface inline, uses `id` instead of actual DB column `user_id` (see #32), and missing standard audit columns (`created_by`, `updated_by`, `is_deleted`, `deleted_at`).
  - `Company` interface inline, missing `website`, `license_number`, and `ai_tagging_enabled` (added Session 30, Migration 023). Also has `owner_id` and `stripe_subscription_id` fields that may not exist in the actual schema — verify against `database.ts` before trusting them.
  - `Company` forward-references `SubscriptionStatus` before it's declared. Works via TS hoisting but fragile.
  - Fix: delete all inline interfaces. Consumers import from `database.ts` (auto-generated, source of truth) or per-entity service files using the existing Pick/Omit patterns. Same fix shape as old #11.

### UX Polish

- **#13** Row click should open read-only detail view (contacts + subcontractors) — currently Edit button is only way in
- **#14** Team member edit UI — no `/dashboard/team/[id]` page yet
- **#15** Team member delete UI
- **#16** Team member password reset (Owner/Admin action)
- **#17** Team member notes field

Items #14–#17 share the same fix pattern: build `/dashboard/team/[id]` detail page with edit/delete/notes/reset-password actions.

### Track for Module 4 (Estimating)

- **#18** Add `converted_at` timestamp to contacts — for lead-to-client conversion tracking
- **#19** Add cursor-based pagination to list pages — contacts and subcontractors currently load all records

### Track for Module 5/6

- **#20** Add `insurance_carrier` and `insurance_policy_number` to subcontractors — for Insurance Expiration Alert workflow
- **#21** `tm_rate` column on `profiles` (Module 6 prep) — decided Session 12, needs migration

### Module 3 Follow-Ups

- **#24** `uploadFile` still does auth + profile lookup for storage path — unavoidable until `company_id` is in JWT custom claims. Defer.
- **#25** Verify Postgres column defaults fire correctly on first real `files` INSERT — confirmed via `information_schema`, but no INSERT has run against `files` yet
- **#50** Delete `apps/web/app/dashboard/markup-test/page.tsx` once Module 3G editor is complete — throwaway visual test for MarkupViewer
- **#51** Add `.claude/` to `.gitignore` — Claude Code local config showing up as untracked

### Lower Priority / Existing

- **#27** Invite emails not automated — Owner copies invite link manually. Resend integration deferred.
- **#29** No shared UI components — `apps/web/components/` and `packages/ui/` empty. shadcn/ui not yet installed.
- **#30** Mobile app is a placeholder. Phase 2 work.
- **#31** No tests. Test infrastructure not set up.
- **#32** `profiles` table uses `user_id` column — all queries use `.eq('user_id', user.id)`
- **#33** Promote-to-admin UI not built
- **#34** Per-seat overage billing not implemented
- **#36** Legacy `subscription_tier`/`subscription_status` columns on companies table (unused but redundant)
- **#37** TypeScript `any` workaround in webhook
- **#38** Bishop Contracting may need manual subscription row — predates Migration 007
- **#39** Role-check patterns repeated across page.tsx files — would benefit from `isOwnerOrAdmin()` / `canManageProjects()` helpers
- **#40** Inline style objects duplicated across forms — cleanup with shadcn/ui migration
- **#43** `profiles_update_owner` RLS policy is Owner-only. Per Admin Role Principle (Owner minus billing minus Admin promotion), Admin should be able to edit other users' profiles EXCEPT promoting them to Admin. No live impact today because no `/dashboard/team/[id]` edit UI exists yet (see #14). When #14 ships, the RLS policy needs to be updated to allow Admin writes while still preventing Admin from setting `role='admin'`. Likely a column-level grant or a CHECK in a new policy. Discovered Session 21 during tech debt #41 audit.
- **#47** Customize Supabase auth emails (recovery, invite, signup confirmation) to use FrameFocus branding and copy. Currently using Supabase defaults. Set in Supabase Dashboard → Authentication → Email Templates.
- **#49** Inline styles across Module 3 pages (3F, 3G, 3I, 3J: page.tsx, upload-form.tsx, file-row.tsx, file-row-actions.tsx, favorite-toggle.tsx, markup-editor.tsx, markup/page.tsx, trash/page.tsx, trash-row.tsx) — same pattern as tech debt #40. Clean up with shadcn/ui migration in one focused pass.
- **#52** Polished markup text editor — replace `window.prompt()` in `markup-editor.tsx` with inline text input: positioned at click location, multi-line, per-shape font size control, click-to-edit existing text in select mode. Functional but unpolished in v1.
- **#53** Flattened markup image export — currently markup is JSON-only (rendered as SVG overlay). Need a flattened PNG/JPEG export when markup needs to leave the app: email attachments (Module 6 daily logs), client downloads, printed daily-log PDFs. Render via canvas (client-side) or Puppeteer (server-side). Decide when first email-sending feature ships.
- **#54** `getFiles()` returns all files and the trash page filters client-side to `is_deleted = true`. For small projects this is fine; for projects with thousands of files, add a dedicated `getTrash()` server function (or an `only_deleted: true` flag) that filters in the DB. Discovered Session 28.
- **#55** Image-aware file browsing for the files page. Two coupled pieces: (a) **thumbnail grid view** for images (likely when category = Photos, or for any image mixed in the table) — investigate Supabase image transformations vs. upload-time thumbnail generation; (b) **in-app fullscreen viewer** opened by clicking a thumbnail — same window, left/right arrow navigation across the project's images (keyboard + on-screen buttons), Open Markup button, Download button, close returns to grid. Non-image files keep current behavior (table row, Download opens new tab). Estimated 400-600 lines, dedicated session.
- **#56** SQL/TS tag list drift risk. `seed_default_tags()` in migration 021 and `DEFAULT_TAGS` in `packages/shared/constants/default-tags.ts` must be kept in sync manually. Add automated diff check before public launch. Both files have header warnings. Discovered Session 29.
- **#57** Empty migration file `20260415182317_add_tag_options_table.sql` — kept in repo intentionally because it was applied to remote (accidental double-create during Session 29). Won't fix; documented for clarity.
- **#58** `npm audit` reports 4 high-severity vulnerabilities in the web app's dependency tree (surfaced during `openai` install in Session 30, but pre-existing). Run `npm audit` to inspect, address before public launch. Pre-launch.-
- **#60** AI photo auto-tagging add-on pricing structure undecided. Placeholder boolean `companies.ai_tagging_enabled` exists (default false). Needs Stripe product/price wiring + per-image quota or MB limit before paid launch. Decide pricing model (flat monthly / per-image / per-MB), then build billing path. Real cost data from Session 31: ~$0.00382 per call (GPT-4o). Anchor pricing against this.
- **#61** Platform admin dashboard not built. Foundation exists: `platform_admins` table (Migration 001) and `is_platform_admin()` helper. Build when 2nd paying customer signs up. Estimated 2–3 sessions for useful set of views (companies list, AI cost per company, subscription/MRR overview, support tools). Defer.
- **#62** AI tag suggestion review (post-launch). When GPT-4o suggests a tag NOT in a company's active list, the API route discards it. Capture these discards instead — they are signals that the company's tag list has gaps. Add an `ai_tag_suggestions` table (company_id, suggested_tag, occurrence_count, status: pending/added/dismissed, first_seen_at, last_seen_at) and a platform-admin view to review aggregated suggestions across all companies. Strong product signal for default tag list improvements. Address after public launch — depends on platform admin (#61) being built first.
- **#64** GPT-4o pricing constants (`INPUT_COST_PER_M`, `OUTPUT_COST_PER_M`) are hard-coded in `apps/web/lib/services/ai-tagging.ts`. Values correct as of Session 31 per OpenAI published pricing. Needs re-verification before public launch and on any OpenAI price change. Consider moving to env vars or a pricing config file before multiple AI features ship (Module 4, 6, 9, 10, 11 will all call OpenAI). Tracked so this isn't forgotten at launch.
- **#65** Owner uniqueness not enforced at DB level. Verified Session 34 (F14). `companies.owner_id` has no UNIQUE constraint and no FK; `profiles.role='owner'` has no partial unique index preventing multiple owners per company. The signup trigger hardcodes `role='owner'`, so the only currently-active write path is safe — but any future ownership transfer (#66 if filed), promote-to-owner UI, or manual write could silently create a multi-owner company. RLS policies that assume "the owner" become "any owner," including billing-restricted actions. Two layers to fix: (a) add `CREATE UNIQUE INDEX profiles_one_owner_per_company ON profiles (company_id) WHERE role = 'owner' AND is_deleted = false;` as a partial unique index, (b) decide whether `companies.owner_id` is the source of truth or `profiles.role` is — and either drop the redundant column or add a trigger keeping them in sync. Fix before any Module 1 ownership-transfer work ships.
- **#66** Ownership transfer unbuilt. Verified Session 34 (F15) — no matches for `transferOwnership` / `transfer ownership` / `transfer_ownership` anywhere in `apps/web`, `packages/`, or `supabase/`. CLAUDE.md "The Admin Role Principle" lists ownership transfer as Owner-only action #3, but no migration, service, UI, or RLS policy exists. Cluster with team detail page work (#14–#17) — likely lives at `/dashboard/team/[id]` as an Owner-only action. Depends on #65 being fixed first (transfer to a new owner means the old owner stops being one — needs DB-level uniqueness to keep the invariant). Fix order: #65 first, then #66, then any UI work.
- **#67** `packages/shared/utils/index.ts` contains four functions (`hasPermission`, `formatName`, `generateSlug`, `formatCurrency`) with zero callers anywhere in the codebase. Discovered Session 35 during #12 cleanup. Either delete the file (and remove `export * from './utils'` from `packages/shared/index.ts`) or wire the functions into existing call sites where they would replace inline duplicates. Address during pre-beta cleanup.

---

## Closed Tech Debt

> One line per closed item: number, brief description, session closed, commit reference (where available). Full context lives in the commit and the matching `docs/sessions/contextN.md`.
>
> **Note:** This list starts at Session 34. Items closed before Session 34 (e.g., #11, #22, #23, #26, #41, #42, #44, #45, #46, #48, #56) lived under the old "delete on close" convention and are not reconstructed here. They can be looked up via `git log --all --grep="#NN"` or by reading the relevant context file.

- **#12** `packages/shared/types/index.ts` barrel anti-pattern — closed Session 35. Inline interfaces (`Profile`, `Company`, `PlatformAdmin`, `BaseEntity`, inline `SubscriptionStatus`, inline `CompanyUserRole`) had zero consumers except `utils/index.ts`, which was repointed to `CompanyRole` from `roles.ts`. Barrel reduced to `export * from './roles'; export * from './markup';`. Type-check clean.
- **#35** `.env.local` doesn't persist across Codespace rebuilds — closed Session 34 (audit). Resolved via GitHub Codespaces secrets, which auto-inject 11 env vars on every new session. Confirmed working across Sessions 26, 28, 30, 31, 32. Documented in CLAUDE.md and STATE.md Environment Variables sections. No code change required.
- **#59** Document the append-only audit log exception in CLAUDE.md — closed Session 31 (commit `bd6657a`). Convention added to CLAUDE.md Database Conventions section, immediately above the Trash-bin pattern block. Lists `ai_tag_logs` and `trial_emails` as current examples.
- **#63** CLAUDE.md doc drift — closed Session 34. Stale sections ("Migrations Run", "Current Session Context") were already removed in earlier cleanup; remaining drift was the header date, Module 3 status line, table row, and OPENAI_API_KEY comment, all corrected this session. STATE.md is the live source of truth for current work.

---

## Process notes

When closing an item:

1. Move the entry from `Open Tech Debt` to `Closed Tech Debt` as a one-liner with session + commit reference.
2. Run `grep -rn "#NN" .` (replacing NN with the closed number) to find any references in code comments, docs, or other tech debt items. Update or remove them as appropriate.
3. The number stays in the closed list permanently. Don't reuse it.

When opening a new item:

1. Use the next sequential number after the highest one in the file (open or closed).
2. Add to the appropriate category in `Open Tech Debt`.
3. If the item depends on or relates to other items, reference them by number — those references will resolve correctly forever because numbers are stable.
