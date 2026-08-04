# Session 98 — context

**Branch at start:** `feature/113c-award-commitment-spec` @ `d3d86d8`, never merged.
**Branch at end:** `main` @ `ff8dae2`, pushed. Two worktrees: `/workspaces/FrameFocus`
(`feature/m6m-mobile-pwa-spec`), `/workspaces/FrameFocus-rebrand` (`feature/rebrand-ezcb`).
No worktree holds main.

**What this session was:** the production migration batch, then a full spec for the mobile PWA.
Nothing was built. Two things shipped: production caught up with the repo, and M6M went from
nothing to 27 rulings and 184 acceptance criteria.

---

## 1 — Production migration batch — DONE

The largest owed item in the repo, growing every session since S87. Closed.

- **31 migrations applied to production** (`jwkcknyuyvcwcdeskrmz`), `20260731000000` through
  `20260821000000`. Order verified by dry-run first: both column drops
  (`drop_projects_contract_value`, `drop_budgeted_amount`) land after the migrations that
  populate their replacements. No manual reordering was needed.
- **Backup taken first** — `prod_backup_pre_S98.sql`, 525 KB, `public` schema.
  `.gitignore` now excludes `prod_backup_*.sql`.
- The prod DB password was rotated afterwards; it had been typed in plain text during setup.

### Tooling notes for next time — this took longer than the migration itself

- **`supabase db dump` and `db push --linked` do not work in this Codespace.** The CLI shells
  out to `pg_dump` inside Docker, and there is no Docker. Install `postgresql-client` and call
  `pg_dump` directly.
- **`db.<ref>.supabase.co` is IPv6-only; Codespaces is IPv4.** Every direct connection fails with
  "Network is unreachable". Use the session pooler:
  `postgresql://postgres.<ref>:<pw>@aws-1-us-east-1.pooler.supabase.com:5432/postgres`.
  Note `aws-1`, not `aws-0` — `aws-0` returns `tenant/user not found` for this project.
- `--db-url` and `--linked` are mutually exclusive.

### The consequence nobody had accounted for

Prod dropped two columns that `main`'s deployed code still read. Enumerated before acting:

- `lib/services/contract-value.ts` — 4 queries on `projects.contract_value`, all erroring.
- `lib/services/expenses-client.ts:404` — selects `budgeted_amount`, error swallowed, returns
  `[]`, so the budget-split editor showed **no lines**.
- `lib/services/expenses-client.ts:337` — inserts `budgeted_amount: 0`, hard failure.
- `lib/services/budget.ts` — `select('*')`, so no crash: every budgeted figure rendered **$0**
  with variance computed against zero. The dangerous one, because it looked fine.

Closed by merging the feature branch to main. One lint error blocked the build
(`react/no-unescaped-entities` in `invoice-builder.tsx:779`), fixed at `ef08932`.
Merge `91806cf`, Vercel green.

---

## 2 — M6M mobile PWA spec — WRITTEN AND MERGED

`docs/specs/M6M-mobile-pwa-spec.md`, merged to main at `83a09a0`. **Spec only — nothing built.**

Written from two design handoffs Josh supplied (Mobile App Shell 6b/6f/6g/6e; Mobile Photos
6j/6k/6l). No prior mobile spec existed; the "basic mobile spec file" referenced in the S98
starting prompt turned out not to exist.

**Ten screens grew to nineteen** when the twelve dead section tiles were ruled in (below).

### The 27 rulings live in §0 as D-1…D-27. Highlights that changed shape mid-session:

|      | Ruling                                                                                                                                                                                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D-6  | Offline v1 = clock in/out, daily log, photo capture. Delivery check-in online-only.                                                                                                                                                                                |
| D-7  | Client-generated UUID at capture. Schema already supports it — `time_clock_sessions`, `time_segments`, `daily_logs`, `files` all default `gen_random_uuid()` and three carry an explicit _"client may generate (offline-ready)"_ comment. **No migration needed.** |
| D-17 | Sync conflict: **the server version stands**; the queued copy is neither written nor discarded — it goes to a server-side `sync_conflicts` table for Owner/Admin review.                                                                                           |
| D-19 | Progress % **cut**, not deferred — no project-level percentage exists in the schema. M-3's stat strip respecced from three stats to two.                                                                                                                           |
| D-20 | Subs upload **and** annotate — **four** policies widened, not one (see below).                                                                                                                                                                                     |
| D-21 | Markup: `markup_data` is source of truth **and** the display path (drawn live over the original); the flattened derivative is a sharing artifact only.                                                                                                             |
| D-22 | `pin` becomes a shape type, `MARKUP_SCHEMA_VERSION` → 2, number **stored** so `next = max + 1` and deletes leave gaps.                                                                                                                                             |
| D-26 | Change-order `net_delta` cut from mobile for **every** role including Owner/Admin.                                                                                                                                                                                 |
| D-27 | Clock-in: **the user selects segment type**; project follows from the type. Supersedes D-25.                                                                                                                                                                       |

### Findings that changed the build plan

- **A photo is two writes.** D-20 originally named one policy (`files_insert_non_client`).
  Applying it surfaced that `storage.objects` carries the identical subcontractor omission, so
  widening only `public.files` would have inserted a row whose bytes storage refused — and the
  criterion written for it would have **passed**. Build step 1 went from one DROP/CREATE to four.
- **`time_segments_project_gate_check` partitions all six segment types with no ELSE.**
  `work`, `material_run` and `warranty` **require** a project; `travel`, `shop` and `break`
  **forbid** one. §8a had named only the three forbidden ones and implied `work` was the sole
  project-carrier. This is what killed D-25 (default to `work`, switch after): it committed the
  app to `work`'s project requirement before knowing whether a project existed.
- **The conflict detector was unsound as first written.** It compared server `updated_at` against
  the queued item's `captured_at` — which records when the phone _wrote_, not what it had _read_.
  Phone loads at 08:00, desktop edits 08:30, phone edits 09:00 → 08:30 ≤ 09:00 → "no conflict" →
  the desktop edit is destroyed. The criterion agreed with the broken rule because it asserted the
  formula rather than the scenario. Fixed with `base_updated_at` captured on the read path and an
  `IS DISTINCT FROM` test.
- **The queue entry's `id` collided with itself.** It was defined as the target row's primary key,
  which holds only while one entry equals one row — but a shift is three entries against two rows,
  so the session insert and its clock-out update shared an id and the update would have silently
  replaced the insert. Split into `entry_id` / `target_id` plus `op`, `entity`, `depends_on`,
  `seq`, `state`.
- **TECH_DEBT #94 (HEIC) was already fixed** in S90 at `de3eaf9` — `uploadFile` converts
  HEIC→JPEG at the shared call site. The gap list was written from the handoffs, not the repo.
  One obligation survives: the offline queue must upload **through `uploadFile`**, or it silently
  reopens #94 for exactly the users the PWA targets.
- **`punch_list_items.assignee_id` is FK-constrained to `company_members(id)`.** The
  _"broad; NOT membership-gated"_ comment describes the RLS visibility rule, not the referent.
- **Punch photos needed no migration** — `punch_list_items.reference_photo_file_id` and
  `.completion_photo_file_id` already exist; the gallery joins them read-only.

### Criterion loss — a recurring editing hazard worth naming

CC dropped criteria from §10 **twice** by anchor-slicing (selecting from one heading to the next
while rewriting). First time: 8 criteria, A-24/A-25 blocks, including both field-conditions
accessibility rules — and §10's own intro still referenced the missing A-24. Second time: 25
criteria, caught pre-commit by diffing IDs against HEAD.

**Diffing the criterion ID sequence against every branch commit is now the merge gate.** Final
audit: 184 criteria, no gaps A-1…A-39b, no duplicates, every live one carrying a harness marker.

---

## 3 — STATE.md — accurate for the first time since S87

Three commits on main. Prod batch no longer owed; Module 7 corrected from ⚪ NOT STARTED to
🚧 IN PROGRESS with 7A–7E built and merged; and the **signed-artifacts warning carried since S87
is closed** — `20260710120000_signed_artifacts.sql` **is** applied to prod, verified by
`supabase migration list` against `jwkcknyuyvcwcdeskrmz` with both columns populated. Git could
never settle it: the file sits at #8 of 65, outside the S98 batch's #35–#65 window, so its
absence from that batch was real and told us nothing.

---

## 4 — What blocks the M6M build

Four items, now listed at the top of the spec rather than buried:

1. **The four-policy subcontractor migration** (§7a) — **build step 1**, before any screen. Until
   it lands the camera, the most prominent control on every mobile screen, is broken for one role.
2. **`sync_conflicts`** (§7b) — before any offline write path ships.
3. **Playwright** — a new dependency. The existing harness is `environment: 'node'` with a bare
   supabase-js client: no DOM, no service worker, no IndexedDB. Ten criteria are unprovable
   without it.
4. **GAP-8 — the Mobile Field Capture handoff, and it is Josh's to supply.** Clock, segment
   switch, daily log, delivery check-in, incident. **Two of D-6's three offline-capable actions
   have no designed screen.** A crew member who clocks in on the wrong segment type also has no
   in-app correction path in this spec's surface set.

---

## 5 — Rebrand session — branched, not started

FrameFocus → **"EZ Contractor Binder"**, with new logo and icons, every surface including Resend,
then live testing on the site with **Stripe billing disabled**.

Sequenced **before** the mobile build, deliberately: the repo is as quiet as it will ever be
(a rebrand touches page metadata, six PDF templates, every email template — all files a large
mobile tree would conflict with); the PWA manifest's brand values are rebrand outputs; the PWA
cannot be install-tested until a stable HTTPS domain and matching Supabase redirect URLs exist;
and DNS verification for Resend has hours of lead time.

**M6M §7 is written to inherit.** M6M owns exactly two manifest fields — `start_url: "/m"` and
`display: "standalone"`. Everything else points at a shared brand source. §7.3 records that
`theme_color` and §2's navy UI token are **two decisions that share `#14213d` today** — navy is
in-app chrome, `theme_color` tints the splash screen and task-switcher card where the product is
being _identified_, not operated. A-26b4 fails a build that aliases them.

Worktree `/workspaces/FrameFocus-rebrand` is on `feature/rebrand-ezcb` off `857695f`. The survey
has not run.

---

## Slips

- **A prompt written for the rebrand session was run by the M6M session.** It did the work
  correctly via `git -C` and then said plainly that it was not the rebrand session and had no
  survey to resume, rather than inventing continuity. Worth repeating as a pattern.
- **The rebrand worktree was sitting on `main`**, not a branch, which blocked the M6M merge —
  git refuses to check out a branch held by another worktree, correctly. Resolved by having that
  worktree do the merge and then branch.
- The prod DB password was typed in plain text during pooler setup, then rotated. The replacement
  is in shell history in both worktrees.
- Two STATE.md lines were stale for eleven sessions before anyone checked them.

---

## Next session

The rebrand survey (Phase 1, report-then-stop) is the immediate work. After it: the two
migrations, Playwright, and the Field Capture handoff — then M6M builds.
