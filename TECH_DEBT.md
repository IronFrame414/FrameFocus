# TECH_DEBT.md — FrameFocus

> **Last updated:** July 28, 2026 — Session 90 (#96–#99 closed; #80 closure pending this session)
> **Purpose:** Tracks all known tech debt — open and closed. Lives in the repo, not in project knowledge. Read on demand when working on items, planning a polish session, or auditing.

---

## Polish Session Plan — Before Module 4 Build

Complete as of Session 40. All polish items closed. Module 4 build is unblocked.

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

- **#83** Typed contractor signature stored as rendered PNG only — consider also persisting the typed text string (new column) to allow clean re-rendering later. Currently image-only to match uploaded-signature shape.
- **#84** Sent change orders cannot be edited. Correct flow is void → edit → resend, not direct edit of a sent CO — a sent CO is a record the client has seen, so mutating it in place is wrong. Needs a void action that supersedes the sent CO and unlocks a new editable revision. Identified Session 76.
- **#86** Client typed signatures have no typed-name mode — co-data.ts always rasterizes the client's mark to a PNG data-URI whether drawn or typed. The contractor's typed mark renders as native <Text> in Dancing Script (18pt), so the two marks cannot be size-matched: one is point-sized vector text, the other an aspect-fit bitmap. Fix: pass the client's typed text + mode through the signing payload and render as <Text>, mirroring the contractor path. Cross-ref #83. Batch with the typed-name signature UI work. Discovered Session 76.

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
- **#90** Crew-role RLS gates not yet verified end-to-end via UI. Session 79 verified project_manager RLS gates fully (team-detail blocked, billing/settings hidden, projects correctly scoped to assigned-only). Crew (crew_member) tier was NOT tested because no working Crew login could be established: the password-reset email link is broken (#70) and Supabase magic-link/reset hit the email rate limit. Crew is more restricted than PM, so PM passing all gates makes a Crew failure unlikely but not impossible — verify when a Crew login path exists. Blocked on #70. Observed Session 79.

### UX Polish

- **#13** Row click should open read-only detail view (contacts + subcontractors) — currently Edit button is only way in
- **#89** Vendors are mislabeled "(Sub)" in the project-scheduling New Task assignee dropdown. Both subcontractors and vendors from the Subs & Vendors list render with a "(Sub)" suffix, so a vendor (member_type='vendor') shows as "(Sub)" — the label doesn't match the record's type. Assignment itself works correctly; this is a display bug only. Fix: label each assignee by its actual type — "(Sub)" for subcontractors, "(Vendor)" for vendors. Likely a single dropdown-builder that hardcodes the "(Sub)" suffix instead of reading member_type. Observed Session 79 during manual testing.

### Track for Module 4 (Estimating)

- **#18** Add `converted_at` timestamp to contacts — for lead-to-client conversion tracking
- **#19** Add cursor-based pagination to list pages — contacts and subcontractors currently load all records

### Track for Module 5/6

- **#20** Add `insurance_carrier` and `insurance_policy_number` to subcontractors — for Insurance Expiration Alert workflow
- **#21** `tm_rate` column on `profiles` (Module 6 prep) — decided Session 12, needs migration
- **#91** 6A timeclock notifications — 6A emits "still-clocked-in" events at 4:00 PM and 5:00 PM (overtime) for any open clock session; clocking out cancels them. Actual push-notification delivery is deferred to the separate cross-cutting Notifications build. 6A only emits named events, never delivers. Decided Session 83 during 6A UI interview.
- **#92** `companies.week_starts_on` re-bucketing — DOCUMENTED-ACCEPTED BEHAVIOR, not a fix item (Session 86, Company Settings pass, migration 20260721050000). Week windows, derived OT, and the Labor Cost (wk) KPI are all computed at read time from the current setting, so changing week-start re-groups ALL historical sessions into the new weeks and re-derives OT/labor cost for past periods; already-approved sessions keep their per-session `approved` status but their week rollups shift, and a previously whole-approved week can display as partial under the new boundaries. Decision (Josh, S86): accepted as a one-time consequence of a rarely-changed setting — NO effective-dating (deliberately unlike pay rates #snapshot rule). The settings UI carries a caption stating this. If a customer ever needs a clean payroll cutover, the manual procedure is: approve/export everything through the last old-boundary week, then flip the setting.
- **#93** 6D PM-can-reopen-closed-PO edge — DOCUMENTED-ACCEPTED (S87, 6D UI Phase 2 Q8). The live `purchase_orders_update_authorized` `with_check` blocks a PM from writing `status = 'closed'` (Owner/Admin only) but does not block a PM from flipping a closed PO back to `open` via direct API — the new row's status passes the check. The UI offers no reopen control; auto-reopen legitimately exists for auto-closed POs (`recompute_po_status` sentinel match). Tighten the policy only if PM reopens are ever observed in the wild.
- **#94** HEIC photos are stored but never render — no conversion pipeline (found S88, daily-log PDF "regression"). Browsers report an empty `file.type` for iPhone HEIC files; `uploadFile` now infers `image/heic` from the extension so these photos appear in log/incident photo queries and counts, but react-pdf embeds only JPEG/PNG (the PDF caption reports them as "not embedded") and Chrome cannot display HEIC in the photo grids either. Real fix is HEIC→JPEG conversion at upload (e.g. `heic2any` client-side) or server-side (`sharp` + libheif) — a new dependency, so a deliberate decision. Matters because iPhone field crews shoot HEIC by default.
- **#95** — M6B cast escape-hatch cleanup
  Post-S88 type regen, ~60 `as unknown as` casts remain in apps/web (services + delivery/safety/daily-log routes). Some may be redundant now that M6B schema is typed, but type-check is green so none are load-bearing failures. No spec names which to remove. Approach when picked up: remove one at a time, re-run `npx turbo run type-check`, keep only removals that stay green. Do NOT bulk-remove — most are structural join-shape casts that will break.

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
- **#67** `packages/shared/utils/index.ts` contains four functions (`hasPermission`, `formatName`, `generateSlug`, `formatCurrency`) with zero callers anywhere in the codebase. Discovered Session 35 during #12 cleanup. Either delete the file (and remove `export * from './utils'` from `packages/shared/index.ts`) or wire the functions into existing call sites where they would replace inline duplicates. Address during pre-beta cleanup.
- **#68** `getSupabaseAdmin()` was duplicated inline in the Stripe webhook before Session 37. Now extracted to `apps/web/lib/supabase-admin.ts`. CLAUDE.md mentions the lazy-init pattern but does not point to the file path. Add a Service Layer Pattern note in CLAUDE.md pointing to `@/lib/supabase-admin` so future AI features (Module 4 estimating, Module 9 summaries, Module 10 NL queries, Module 11 marketing) don't re-create their own copies. Pre-Module 4.
- **#69** `softDeleteTeamMember` uses `ban_duration: '876000h'` (~100 years) as a stand-in for permanent ban. Supabase has no true permanent-ban API. Verify this duration is honored on auth attempts during Session 38 smoke test. If it's silently ignored or capped, switch to deleting the auth user (with the trade-off documented in Session 37 — restore would require re-invite). Verify and decide before public launch.
- **#70** Sign-in page "Forgot password" flow is broken. Email sends successfully, but the link in the email doesn't allow the user to set a new password. Discovered Session 39 during team member smoke testing (reset triggered from sign-in page, not the new Admin reset button — that path works). Unrelated to Session 39 work; pre-existing. Investigate the `/reset-password` page handler and the email link's token exchange. Likely related to the redirect URL or the Supabase `onAuthStateChange` handling. Pre-beta.
- **#71** Payment method handover not enforced after ownership transfer. Old Owner's card stays attached to the Stripe Customer until new Owner updates it via Customer Portal — could result in old Owner being charged at next billing cycle. Pre-beta: add a banner on the new Owner's billing page ("Update payment method to complete transfer") and consider a force-add-card-before-transfer flow as v2. Discovered Session 40 during #66 build.
- **#72** No email notification to new Owner confirming ownership transfer. Pre-beta polish. Discovered Session 40.
- **#73** No append-only audit log for ownership transfer events. Add `ownership_transfers` table (company_id, from_user_id, to_user_id, performed_at) following the append-only convention. Pre-beta — needed for any company doing real account handoffs. Discovered Session 40.
- **#74** Stripe Customer email drift on Owner profile edit. If the Owner edits their own profile email at any point, the Stripe Customer's email is not updated to match. Pre-existing issue, surfaced during #66 build. Pre-beta. Discovered Session 40.
- **#75** Reusing an email alias for invitations fails silently. When a user is soft-deleted, the underlying `auth.users` row remains (correct for audit), but re-inviting the same email collides with the lingering auth user. Currently the invite flow does not surface an error to the user — the new invite has no visible effect. Either detect collision and surface a clear error ("This email was previously used; choose a different alias"), or design a path to re-invite a soft-deleted email. Discovered Session 40 during #66 testing. Pre-beta.
- **#76** Validation schema naming inconsistency. companySettingsSchema uses camelCase keys (addressLine1) and requires a manual remap somewhere in the company write path. New contactAddressSchema uses snake_case so the parsed object flows straight into the service layer with no remap. Resolves when companies writes get migrated to the standard pattern (related to the existing companies pre-trigger holdover item — but a separate code path).
- **#77** Optional-address vs empty-string-vs-NULL. label and address_line2 use .optional() in Zod, which accepts both undefined and "". An empty form field will insert "" into the DB rather than NULL. Consistent with existing schemas, not blocking, flagged for awareness if data quality matters later.
- **#78** 4B `set_cost_catalog_updated_by()` trigger function omits SECURITY DEFINER, deviating from the CLAUDE.md per-table updated_by template. Functionally harmless (the trigger passed 4B acceptance tests) but a pattern deviation. Fix: add SECURITY DEFINER to match the template. Found during 4B/4C build wrap.
- **#87** MCP `SUPABASE_ACCESS_TOKEN` (sbp\_ personal token) lives only in the current shell env — vanishes on Codespace rebuild, breaking the Supabase MCP server every fresh session. Make it persistent (Codespaces secret or committed-safe mechanism). Discovered Session 77.
- **#88** rebuild-test still uses legacy JWT anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY` = eyJ... format). Migrate to `sb_publishable_` key + update `.env.local`, then click "Disable JWT-based API keys" to kill the leaked legacy service*role key (rotated to sb_secret* in S77, but legacy pair still enabled because anon half is in use). Rebuild-test only; production unaffected. Discovered Session 77.
  ### Track for Module 7

#### #81 — Dormant subcontractor invite path (parked, not dead)

**Status:** Open — reactivate with the subcontractor portal / sub-invite surface
(Module 6+, behind the Pre-M9 external-surface gate).

**Origin:** Module 5 review. Removed `subcontractor` as a _company role value_
(decision B): subs are architecturally outside the role system — identity lives on
`company_members.member_type='subcontractor'`, and the future sub portal will be its
own limited-access mechanism, not a CompanyRole. B intentionally KEPT the partial
sub-invite scaffolding (rather than full removal, "A") to preserve the started
account mechanism to build on later.

**Parked — present, coherent, currently unreachable** (migration
`20260704210000_company_members_foundation.sql`):

- `invitations.member_id` column + FK → `company_members(id)` (§5)
- `handle_new_user()` linking branch: `IF v_invitation.member_id IS NOT NULL THEN
UPDATE company_members SET profile_id = v_profile_id …` (§8)
- `get_invitation_for_signup()` `member_id` return column (§8)
- `create_member_for_new_profile()` §7a skip — the `subcontractor` arm of
  `IF NEW.role IN ('client','subcontractor')`

**Why unreachable:** `member_id` is populated only by an invite with
`role='subcontractor'`, which `invitations_role_check` no longer permits. The
linking branch therefore never fires today. Dormant, NOT dead — reactivates cleanly
when a sub-invite path/role returns. The §7a `subcontractor` skip must stay even
while dormant: without it, a future sub profile would get a crew member row (from the
trigger) AND its linked sub member row — a double member.

**NOT debt — live, correct M2 plumbing, do not touch:**
`member_type='subcontractor'`, `subcontractors_create_member` trigger, the sub
backfill, and `sub_type` on the subcontractors table.

**On reactivation:** re-add `subcontractor` to `invitations_role_check`; decide
whether it re-enters `profiles_role_check` + app role machinery or stays a pure
non-role portal identity; then build the sub-facing surface that issues these invites.

---

**#82** Punch-complete gate has no DB-level backstop. `checkPunchGate` and `updateProject` (`apps/web/lib/services/projects-client.ts`) were hardened in Session 63 (commit `59a696f`): the gate now fails closed on query error or null count, and `updateProject` rejects `status` writes. The invariant is still enforced only in the service layer — CLAUDE.md documents this as "service-layer only by design." Josh chose Option 3 (full robustness) in Session 62; the DB trigger is the remaining piece, **deferred to pre-launch**. Open design question when built: whether the trigger enforces the punch gate alone, or the whole `allowedStatusTransitions` state machine. The latter forces a decision on the currently-unresolved `complete` → reversal path (no legal transition out of `complete` except `archived`, flagged twice as a problem). Building the trigger reverses a documented CLAUDE.md decision — treat as a spec change, migration required.

## Closed Tech Debt

- **#79** contacts/subcontractors had no committed CREATE TABLE baseline (migration ...009 was a 2-line placeholder) — closed Session 56 (commit `c041afa`). Resolved via Option C: squashed all 37 prior migrations to a single prod-verified baseline (`20260101000000_baseline_schema.sql`, pg_dump of prod public schema), old migrations archived to `supabase/migrations_archive/`. Acceptance: clean `db push` to an empty project + prod/throwaway parity (tables 22, policies 64, functions 29, triggers 32).

> One line per closed item: number, brief description, session closed, commit reference (where available). Full context lives in the commit and the matching `docs/sessions/contextN.md`.
>
> **Note:** This list starts at Session 34. Items closed before Session 34 (e.g., #11, #22, #23, #26, #41, #42, #44, #45, #46, #48, #56) lived under the old "delete on close" convention and are not reconstructed here. They can be looked up via `git log --all --grep="#NN"` or by reading the relevant context file.

- **#12** `packages/shared/types/index.ts` barrel anti-pattern — closed Session 35. Inline interfaces (`Profile`, `Company`, `PlatformAdmin`, `BaseEntity`, inline `SubscriptionStatus`, inline `CompanyUserRole`) had zero consumers except `utils/index.ts`, which was repointed to `CompanyRole` from `roles.ts`. Barrel reduced to `export * from './roles'; export * from './markup';`. Type-check clean.
- **#35** `.env.local` doesn't persist across Codespace rebuilds — closed Session 34 (audit). Resolved via GitHub Codespaces secrets, which auto-inject 11 env vars on every new session. Confirmed working across Sessions 26, 28, 30, 31, 32. Documented in CLAUDE.md and STATE.md Environment Variables sections. No code change required.
- **#59** Document the append-only audit log exception in CLAUDE.md — closed Session 31 (commit `bd6657a`). Convention added to CLAUDE.md Database Conventions section, immediately above the Trash-bin pattern block. Lists `ai_tag_logs` and `trial_emails` as current examples.
- **#63** CLAUDE.md doc drift — closed Session 34. Stale sections ("Migrations Run", "Current Session Context") were already removed in earlier cleanup; remaining drift was the header date, Module 3 status line, table row, and OPENAI_API_KEY comment, all corrected this session. STATE.md is the live source of truth for current work.
- **#65** Owner uniqueness not enforced at DB level — closed Session 35. Migration 024 added partial unique index `profiles_one_owner_per_company` on `profiles(company_id) WHERE role='owner' AND is_deleted=false`, and dropped the unmaintained `companies.owner_id` column (verified zero application reads/writes; signup trigger no longer references it). `profiles.role='owner'` is now the unambiguous source of truth.
- **#43** `profiles_update_owner` Owner-only RLS policy — closed Session 36. Migration 025 dropped `profiles_update_own` (no self-updates), kept `profiles_update_owner` with WITH CHECK preventing Owner from demoting self, added `profiles_update_admin` allowing Admin to edit non-Owner/non-Admin/non-self profiles with role-promotion blocked. RLS-only — UI for team edits still depends on #14.
- **#14** Team member edit UI (`/dashboard/team/[id]`) — closed Session 39 (commit `1ec46b5`). Page renders server-side with auth + self-lock + admin-viewing-privileged gates; client form handles all five editable fields (first/last name, phone, role, notes) with caller-scoped role dropdown. Smoke tested against Bishop Contracting: Owner→Crew, Admin→Crew, Owner self-lock, Admin self-lock, Admin→Owner block — all pass.
- **#15** Team member delete UI — closed Session 39 (commit `1ec46b5`). Two-step inline confirmation (click Delete → "Confirm delete"/Cancel). Soft delete via `is_deleted=true` + auth ban. Verified: deleted user cannot log in; team list count drops.
- **#16** Team member password reset UI — closed Session 39 (commit `1ec46b5`). "Send password reset email" button on edit page triggers `auth.resetPasswordForEmail`. Server action ran clean; email delivery blocked by Supabase rate limit during smoke test — infrastructure, not code. Separately discovered pre-existing bug in the sign-in page's Forgot Password link handler (see #70).
- **#17** Team member notes field — closed Session 39 (commit `1ec46b5`). Textarea in edit form, writes to `profiles.notes` column added in Migration 026.
- **#66** Ownership transfer — closed Session 40 (commit pending). Migration 027 + transfer-form on Owner-self team detail page. Spawned #71–#75.---
- **#8** team-page-client.tsx local ROLE_LABELS — closed Session 76 (commit c5ac222). Now imports from @framefocus/shared; shared constant is a superset, all overlapping values identical, behavior unchanged.
- **#10** invite-form.tsx Invitation import missing import type — closed Session 76 as stale. No Invitation import exists in invite-form.tsx; the only one (in team-page-client.tsx) already uses an inline type qualifier. Condition described never existed in current code.
- **#50** Delete markup-test/page.tsx — closed Session 76 (commit e8ca00d). Module 3G complete; no references anywhere in codebase.
- **#85** CO PDF bold line-item row — closed Session 79 (UI verification, no code change — bold row confirmed intentional, it is the line item vs. its detail breakdown, not a bug).
- **#96** `files` company-wide RLS leak (select/insert/update policies project-scoped + category-gated; `client_visible` and gated-category recategorization Owner/Admin-only via trigger) — closed Session 90, commit `9fbcc1c` (migration `20260728000000_security_rls_96_99.sql`). **Applied to rebuild-test only — prod push owed.** The `storage.objects` arm is defense-in-depth (storage cannot see `files.category`); the table policy is the primary gate. Verified by impersonated RLS probe (`SET LOCAL role authenticated` + `request.jwt.claims`), negative and positive controls both pass. Record correction: the S89 probes cited in this item's original entry ran via Supabase MCP as `current_user=postgres` with RLS bypassed and were NOT valid behavioral evidence — the S90 impersonated probes are the evidentiary run.
- **#97** `daily_logs` INSERT author spoofing — WITH CHECK now binds `author_member_id = get_my_member_id()` with Owner/Admin override — closed Session 90, commit `9fbcc1c` (same migration; rebuild-test only, prod push owed with #96).
- **#98** `daily_logs` soft-delete reversal — `is_deleted`/`deleted_at` transitions blocked in both directions for non-Owner/Admin via BEFORE UPDATE column-scope trigger — closed Session 90, commit `9fbcc1c` (same migration; rebuild-test only, prod push owed with #96).
- **#99** `daily_log_crew`/`daily_log_sub_entries` cross-company `member_id` — same-company EXISTS added to INSERT WITH CHECK and new explicit UPDATE WITH CHECK on both tables — closed Session 90, commit `9fbcc1c` (same migration; rebuild-test only, prod push owed with #96).
- **#80** signed-CO deltas → `contract_value` reconciliation — closed by DERIVATION, not write-through: `projects.contract_value` is never mutated; revised = original + Σ(client-signed CO `net_delta`), derived by `apps/web/lib/services/contract-value.ts` (7B-spec §0 rules 1-2). Closed Session 90, commits `e57043c` (service) + `93d41d7` (call sites). Spec: `docs/specs/7B-spec.md`.

## Process notes

When closing an item:

1. Move the entry from `Open Tech Debt` to `Closed Tech Debt` as a one-liner with session + commit reference.
2. Run `grep -rn "#NN" .` (replacing NN with the closed number) to find any references in code comments, docs, or other tech debt items. Update or remove them as appropriate.
3. The number stays in the closed list permanently. Don't reuse it.

When opening a new item:

1. Use the next sequential number after the highest one in the file (open or closed).
2. Add to the appropriate category in `Open Tech Debt`.
3. If the item depends on or relates to other items, reference them by number — those references will resolve correctly forever because numbers are stable.
