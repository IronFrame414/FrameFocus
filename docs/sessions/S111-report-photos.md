# S111 — Part Two report (photos, camera roll, subscriptions fix) — appended after every step

> Kept apart from `S111-report.md` (Part One's branch) so the two branches do not conflict on one
> append-only file. Rulings: `docs/specs/S111-SPEC-project-scoped-role.md` → "RULED — Phase 2".

## Step P0 — branch [2026-09-25]

- `feature/s111-photos` cut from `feature/s111-project-role` at its spec/rulings commit — that
  branch carries **no code**, only the spec, rulings and report, so Part Two does not depend on
  Part One. Merging Part Two first (Q20) brings the spec to `main`.
- CI run 36083667540 (`feature/s111-project-role`) was **in progress** when this branch was cut.
  Held until it completes: pushing this branch, `supabase db push` to rebuild-test, and local e2e.

## Step P1 — Q19 (`subscriptions_select_owner_admin`) — ⛔ STOPPED, measurement contradicts the ruling's premise

The ruling was "fix it" on the premise that the missing role check is a leak. **The code depends on
every role reading this row**, so a plain owner/admin floor would break billing enforcement:

- `apps/web/middleware.ts:233-240` — subscription enforcement runs for **every** dashboard user
  (`enforceBilling && profile`), reading `status, trial_end, trial_start, stripe_subscription_id`
  under the user's session. Floored, crew/foreman/PM would read `null`; the block is
  `if (subscription) {…}`, so the expired-trial and trial-limit redirects would **silently stop
  applying to every non-owner/admin** — fail-open on a lapsed company.
- `apps/web/lib/services/storage-status-client.ts:8-11,31` — explicit: *"its SELECT policy is
  company-scoped with no role arm, so crew and foremen read it too — the cap must not silently
  not-apply to non-admins"* (`plan_tier`).
- `app/trial-limit/page.tsx:45` — any signed-in user.
- Owner/admin-only or service-role readers (unaffected): `billing.ts:33`, `seats.ts:43`,
  onboarding, Stripe webhook/checkout, `lib/trial/lifecycle.ts` (admin client).

**What the row exposes** (columns, live): `id, company_id, stripe_subscription_id, plan_tier,
status, seat_limit, trial_start, trial_end, current_period_start, current_period_end,
cancel_at_period_end, created_at, updated_at`. **No price, no card, no amount** — billing *state*.
The only arguably sensitive value is `stripe_subscription_id`, an opaque id unusable without the
Stripe secret key.

**Not built. No migration written.** Options for Josh, stated in the final report:
(A) floor the table to owner/admin **and** give every role a SECURITY DEFINER SQL function returning
only `status, trial_start, trial_end, plan_tier, seat_limit` for its own company, switching the three
readers to it — a real change, with tests; (B) leave the policy, correct its misleading name in a
comment/migration, and record that every role reading billing state is intended.

## Step P2 — ⚠️ FINDING: conversion likely ABORTS for any sent/accepted estimate with pre-send site-visit photos (unproven — test owed)

Found while reading the two BEFORE-UPDATE triggers on `files` before changing the write path:

- `enforce_site_visit_file_freeze` (`20261730000000_site_visit_access_widen.sql:228-262`) raises on a
  frozen captured file if **`estimate_id`** (or `markup_data`, `file_path`, …) changes. It does
  **not** check `auth.uid()` for that branch and has **no conversion exemption**.
- `stamp_site_visit_frozen_at` sets `frozen_at` at SEND and moves it to `now()` at any outcome
  **including `accepted`** — so after acceptance every captured photo is frozen.
- `convert_estimate_to_project` (`20261550000000…:184-187`) does `UPDATE files SET project_id = …,
  estimate_id = NULL WHERE estimate_id = …` — which changes `estimate_id` on those frozen rows.
- Conversion is offered at **any status** (`convert-to-project.tsx:26-28`), and the normal flow is
  visit → send → accepted → convert.

**Inference:** since S110 A reached production, converting a sent or accepted estimate that carries
site-visit photos taken before the send raises *"This site-visit photo is frozen…"* and the whole
conversion rolls back. A draft converted without sending is unaffected (`frozen_at` NULL). Josh's
report ("photos under Files when converted") describes a conversion that SUCCEEDED, so it predates
S110 A or was a never-sent draft. **To be proven on rebuild-test with a real session before and
after the fix** (held while CI run 36083667540 uses rebuild-test).

After conversion `estimate_id` is NULL, the trigger finds no visit, and the freeze no longer
applies — so **markup on a converted photo is not blocked by the freeze**, and there is no conflict
with S110's freeze ruling on that point.

Production count Josh can run to size exposure (read-only):
```sql
SELECT e.status, count(DISTINCT e.id) AS estimates, count(f.id) AS frozen_captures
FROM files f
JOIN estimates e ON e.id = f.estimate_id
JOIN site_visits sv ON sv.estimate_id = e.id
WHERE f.site_visit_capture AND sv.frozen_at IS NOT NULL AND f.created_at <= sv.frozen_at
  AND e.project_id IS NULL
GROUP BY e.status;
```

## Step P3 — Q14 write path + conversion; Q16 punch + Q17 guard — built, committed locally

- `9b6ddd3b` — route writes `'photos'` for images; migration `20261770000000` (conversion
  reclassifies `'other'` images; freeze admits the conversion re-point); `prepareImageForUpload()`
  shared by `uploadFile()` and both route callers (HEIC). **Migration not applied yet** (CI).
- `da07198d` — punch completion gets the library sibling; `test/s111-camera-roll-guard.test.ts`:
  8/8 after; **1 failed / 7 passed against the pre-fix `punch-actions.tsx`** (the defect it guards).
  New e2e in `m-writes.spec.ts` completes a punch through the library input — not yet run.

## Step P4 — Q18 (daily-log and safety images under Photos) — ⛔ STOPPED, widening breaks a THIRD surface

The ruling: widen the Photos query to include images in `daily_logs` / `safety`, and STOP if that
breaks either of those surfaces. Those two surfaces are safe — they select by `daily_log_id` /
`safety_incident_id` (`daily-logs.ts:131-134`, `safety.ts:106`), not by category. **But
`getProjectPhotos()` is not only the Photos pages' query:**

- **Chat** uses it as the composer's photo picker (`api/chat/photos/route.ts:45`) and to resolve
  thumbnails (`api/chat/messages/route.ts:78`, `api/chat/threads/route.ts:181`). Its own header
  says it is chat's definition of "what a project photo is", and that a second definition would
  recreate #129.
- Chat's **send** path is independently gated on `category = 'photos'` (`eligiblePhotoIds()`,
  `lib/chat/photos.ts:62`). So:
  - widen only the query → the picker offers log/safety images the send then **refuses** (broken
    chat UI);
  - widen the send gate too → **safety images (injury photos) become postable into the SUB thread
    and the CLIENT thread**; daily-log images to subs, who are excluded from `daily_logs` itself.
- Also affected by a widened `getProjectPhotos()`: the /m viewer (`photos/[fileId]/page.tsx:51`),
  and — if `getPhoto()` follows — markup and gallery actions (delete, client-visible) on log and
  safety images.

**Not built.** Options for Josh in the final report: (A) a gallery-only widening — a separate
Photos-page query, with chat keeping `'photos'` only, stated in code as a deliberate difference;
(B) (A) but daily logs only, safety excluded (safety images carry injury/incident evidence and
crew cannot read `safety_incidents`); (C) defer.

## Step P5 — Add photos (Q16 part 2), markup storage arm, live test, prepared backfill — built

- `74892486` — desktop `AddPhotosButton` (library, shared `uploadFile()`, category 'photos');
  /m "Add photos" is a `<label htmlFor>` on the tab bar's own library input
  (`app/m/library-input.ts`), one pipeline. e2e written for both, not yet run.
- Migration `20261780000000` — `project_files_insert_non_client` gains the derivative arm SELECT and
  UPDATE already carry. Not applied yet.
- `test/s111-photo-conversion.live.ts` — before/after proof for the conversion, the freeze and the
  markup write. Not yet run.
- `docs/sessions/S111-photos-backfill-PREPARED.sql` — Q15 count, UPDATE (commented), undo. Not run.
- Local, no database: unit suite **117 files / 1638 tests passed, exit 0** (the new guard is among
  the 117 — checked with `vitest list --filesOnly`); `next build` **BUILD_EXIT_LINE=0**.

## Step P6 — migrations applied to rebuild-test, proven before / middle / after [2026-09-25]

CI run 36083667540 (`feature/s111-project-role`) **completed/success 02:19:12Z**; Actions API then
showed 0 in progress, 0 queued. CLI link re-checked: rebuild-test (`nmyphyhmfttxkdoposvf`). Only
`20261770000000` and `20261780000000` were pending. Applied **one at a time** so each fix had its own
before/after:

| run | migrations applied | `s111-photo-conversion.live.ts` | what it proves |
| --- | --- | --- | --- |
| BEFORE | neither | **5 failed / 3 passed**, exit 1 | 2a: conversion of the accepted estimate raised **"This site-visit photo is frozen: it was captured before the estimate was sent."** (42501) — the whole conversion rolled back. Fixture checks passed first (1a, 1b incl. the control that the freeze fires). **The production defect is real.** |
| MIDDLE | `20261770000000` only | **1 failed / 7 passed**, exit 1 | conversion succeeds; 4a: assigned PM's derivative write refused — **"new row violates row-level security policy"**. The markup ride-along defect is real. |
| AFTER | both | **8 passed**, exit 0 | 2b **rows moved: 3** (capture 'other'→'photos', tab image 'photos', PDF control stays 'other', paths unchanged); 2c **Photos query rows: 2** on the owner's session; 4a PM writes `markup_data` + derivative; 4b CONTROL unassigned crew refused. |

- The MIDDLE run's teardown threw on `projects_source_estimate_id_fkey` (the shared project purge
  deletes the source estimate before the project); fixed in the test's sweep. Residue after the
  AFTER run: projects 0, estimates 0, files 0, storage objects 0.
- `npm run db:fingerprint` regenerated both baseline files (functions n=311, latest migration
  `20261780000000`), committed with this step.

## Step P7 — build and e2e against the migrated rebuild-test

- `next build` after the last change: **BUILD_EXIT_LINE=0**.
- Actions API immediately before: in_progress 0, queued 0.
- Playwright against the production build (`next start`), 8 files — the two new specs,
  `m-capture-camera`, `m-writes`, `m-site-visit`, `desktop-site-visits-s110`,
  `desktop-file-sheet-s109`, `m-photos`: **121 passed, 2 skipped, 0 ✘, PW_EXIT=0**. The three new
  tests ran and passed: desktop Add photos (DB row exactly 1, category photos, count +1), /m Add
  photos (chooser is the tab bar's library input, no `capture`, `multiple`), punch completion
  through the library input. The 2 skips are the pre-existing subcontractor-identity cases in
  `m-writes` (A-68, A-68b), unrelated.

## Step P8 — pushed; CI green

`feature/s111-photos` pushed at `afbe26af`. CI run **36086660760 on `afbe26af`: completed / success,
03:03:46Z** (the run's head SHA matches the pushed tip). **Not merged** — Q20: merges only after
Josh applies `20261770000000` and `20261780000000` to production, and authorizes it.
