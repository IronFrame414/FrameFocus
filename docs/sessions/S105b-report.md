# S105b — session report

**Append after every step, commit the append, push.** The last report was lost
because the branch was never pushed. This report is only as durable as the last
push.

Branch: `feature/s105b`, off `main` = `662b531`.

---

## Phase 1 — analyze (read-only)

### Step 0 — setup

- Ground-truthed git: `main` = `662b531`, tree clean, only `docs/specs/S105b-spec.md`
  untracked. **FILL-0 confirmed: tip is `662b531`, tree clean.**
- Created branch `feature/s105b`.
- Created this report.
- Origin remote is `https://github.com/IronFrame414/FrameFocus`; `origin/main`
  is at `662b531`, matching local.
- **Next:** push the branch immediately so nothing is local-only, then begin the
  read-only measurements (item 6A first, per the gating rule).

### Step 1 — item 6A / item 6 DB investigation (rebuild-test)

MCP supabase is bound to `nmyphyhmfttxkdoposvf` (rebuild-test) — verified via
`get_project_url`. All queries below ran there. Production cross-check
(FILL-6A.6 / FILL-6.3) is pending a safe read-only connection method — noted.

**All six `files` policies read (FILL-6.2 / FILL-6A.1/3/4):**

- `files_select_non_client` (SELECT, authenticated): `company_id=get_my_company_id()
  AND role<>'client' AND ( role IN (owner,admin) OR ( project_id IS NOT NULL AND
  ( (category='invoices' AND role='project_manager' AND EXISTS invoice authored by
  member) OR (category NOT IN ('contracts','change_orders','invoices') AND
  can_view_project(project_id)) ) ) )`.
- `files_update_non_client` (UPDATE): same shape as SELECT's non-client arm, with
  the invoice arm using `can_view_project` instead of authorship.
- `files_delete_owner_admin` (DELETE): owner/admin only, company-scoped.
- `files_insert_non_client` (INSERT): owner/admin may insert with null project_id;
  every other role requires `project_id IS NOT NULL` and a category arm.
- `files_insert_client` / `files_select_client` (public role, client): project-scoped
  via `is_client_of_project`, `client_visible=true`, category='photos' for insert.

**FILL-6A.1 — no company-wide read arm for non-owner/admin.** A `project_id IS NULL`
row is readable **only by owner/admin**. Non-owner/admin roles are gated by
`project_id IS NOT NULL` before any category arm. So the 178 null-project rows are
owner/admin-only. **Not a company-wide leak.**

**FILL-6A.2 — contracts are owner/admin-only regardless of project.** `contracts`
(and `change_orders`, `invoices`) are excluded from the non-owner/admin category arm
entirely; there is no other arm that admits them. A gated role (PM/foreman/crew/sub)
**cannot SELECT a contract file at all.** The Financial Visibility Floor holds on
`files` for contracts. **No `#136`-class payload leak** — the gate is in `qual`, so
the row never leaves the DB for a gated role.

**FILL-6A.3 — the 178 null-project rows are owner/admin-only for UPDATE too, NOT the
S104 "readable-but-unwritable" trap.** UPDATE requires `project_id IS NOT NULL` for
non-owner/admin, same as SELECT — so those rows are *neither* readable nor writable
by non-owner/admin, and *both* readable and writable by owner/admin. Consistent, not
a trap. (S104's defect was rows readable by a role that could not write them; here
read and write are gated identically.) **Writer-error-check concern (who writes
lien releases / contracts, does the writer check its error) → delegated to code
exploration.**

**FILL-6A.4 — DELETE is owner/admin only** (`files_delete_owner_admin`). Soft-delete
runs through UPDATE (`is_deleted` flag), which for null-project rows is likewise
owner/admin only. These are signed artifacts — never destroyed — so owner/admin-only
delete is coherent.

**FILL-6.1 — YES, company-level files are identifiable by `category`.** Column
inventory: `files` has NO `estimate_id` column (confirms the item-6 blocker). It has
`category` (text, NOT NULL) plus association FKs (`invoice_id`, `daily_log_id`,
`expense_id`, `delivery_id`, `delivery_item_id`, `safety_incident_id`, `supersedes_id`).
Category × project_id breakdown (rebuild-test, 326 rows):

| category      | total | null project | has project |
| ------------- | ----- | ------------ | ----------- |
| change_orders | 93    | 0            | 93          |
| contracts     | 4     | **4**        | 0           |
| daily_logs    | 22    | 0            | 22          |
| deliveries    | 2     | 0            | 2           |
| invoices      | 4     | 0            | 4           |
| lien_releases | 174   | **174**      | 0           |
| photos        | 21    | 0            | 21          |
| receipts      | 1     | 0            | 1           |
| safety        | 5     | 0            | 5           |

The 178 null-project rows are **exactly** `contracts` (4) + `lien_releases` (174),
and **no other category ever has a null project_id.** So a third ownership arm IS
expressible: company-level = `category IN ('contracts','lien_releases')`. This makes
ASK-6.A option 1 (three-arm CHECK) the expressible/preferred one — pending FILL-6A.5
(design vs missing association) from the creation code.

**FILL-6.3 — 178/326 counts confirmed on rebuild-test** (exact match to PREV).
Production cross-check pending (see Step 5).

### Step 2 — item 6A/6 creation code (delegated, verified)

**FILL-6A.5 — the 178 null-project rows are DESIGN, not a missing association.**
This is the pivotal finding for ASK-6.A.
- Lien releases: `apps/web/app/api/lien-releases/generate/route.ts:267-285` sets
  `project_id: null` **explicitly and by design**. Code comment: *"Store the
  rendered PDF against the company (no project on the file row — the release links
  to its invoice, which carries the project)."* A lien release is company-level
  file storage; its project linkage runs through the `lien_releases` table →
  `invoice_id`/`sub_contract_id` → project. It never had a project to put on the
  file row.
- Contracts (both paths set `project_id: null` deliberately):
  `contracts-client.ts:263-279` (template PDFs) and `proposal-service.ts:116-152`
  (signed proposal PDFs, created at signing time, not tied to a project).
- **Consequence: the fix is a third ownership arm (ASK-6.A option 1), NOT a
  backfill.** FILL-6A.5's "design vs missing association" resolves to DESIGN.

**FILL-6A.3 writer-error-check — NO S104-class defect.** Every writer checks its
insert error: lien-release route checks `fileErr || !fileRow`, logs, returns 500;
contract template checks `!uploaded.success`; signed-PDF checks `insertError`. No
silent-ignore path like S104's.

**Item 6 RULED confirmations (stop rule 4 stays cleared):**
- `/bid/[token]` (`apps/web/app/bid/[token]/page.tsx`) is anonymous — "the token
  IS the credential." Reads via `get_sub_bid_request` (service-role RPC,
  server-side); submits via `submit_sub_bid_reply` (SECURITY DEFINER RPC, browser
  anon). No anonymous storage/RLS weakening.
- `signing_sessions` has exactly ONE policy — `signing_sessions_select_manager`
  (authenticated owner/admin SELECT), no write policies (service-role writes).
  Confirmed NOT an anon-RLS model. (`co_signing_sessions` is the separate
  token-flow table; not this one.)

### Step 3 — item 5 list screens (delegated, verified)

**FILL-5.1 — anatomy confirmed at `apps/web/components/list-screen/list-screen.tsx`.**
Parts: `ListPageHeader`, `MetricStrip`, `AlertStrip`, `ListSearchInput`,
`FilterChips`, `Metric` type. Order: header → alert strip → metric strip →
filter chips + search → table card (table itself deliberately NOT shared).

⚠️ **CORRECTION to a PREV count.** The RULED line says "four of the six" conform
(estimates, subs, cost catalog, projects). Measurement: **FIVE conform** —
`contacts` (14c) also uses the anatomy (`contacts-list.tsx:9-12`). The "six"/"four"
bookkeeping in the spec is loose (universe is ≥8 list surfaces). **The actionable
rule is unaffected:** build the three that remain (team, files, daily logs); do
not touch any conforming screen — contacts included.

**FILL-5.1 floors confirmed, role sets DIFFER (as PREV):**
- Estimates: `estimates_select_authenticated` — Owner/Admin all; **PM own only**
  (`created_by = auth.uid()`); foreman/crew/client none.
- Cost catalog: `cost_catalog_select_manager`
  (`20261024000000_cost_catalog_select_floor.sql`) — Owner/Admin/**PM all**;
  foreman explicitly excluded; crew/client none.
- ✓ PM is own-only on estimates but company-wide on catalog — role sets differ,
  both enforced in RLS. No `#136` payload leak on either.

**FILL-5.2 — the three to build (note: files & daily logs are PROJECT-SCOPED, not
top-level nav lists):**

| screen     | route                                                | component file                                                   | anatomy today            |
| ---------- | ---------------------------------------------------- | ---------------------------------------------------------------- | ------------------------ |
| team       | `/dashboard/team`                                    | `app/dashboard/team/team-page-client.tsx`                        | partial — `ListPageHeader` only |
| files      | `/dashboard/projects/[id]/files`                     | `app/dashboard/projects/[id]/files/page.tsx`                     | none — bespoke header + table   |
| daily logs | `/dashboard/field-ops/[projectId]/daily-logs`        | `app/dashboard/field-ops/[projectId]/daily-logs/page.tsx`        | none — breadcrumb + flex list   |

**FILL-5.3 — NO money on files or daily logs.** Files renders size (KB), date,
category, tags — no dollars (`file-row.tsx`). Daily logs renders date, author,
hazard badge — no dollars. Team's Burden / hr is the only money screen of the
three, and it is `instrument_rates`-floored (reflows to em-dashes for gated roles).

**FILL-5.4 — hook-placement rule.** The team component is CURRENTLY compliant: all
hooks (`useMemo/useRouter/useConfirm/useAlert/useState×7/useCallback/useEffect`,
lines ~37-77) sit ABOVE the early returns (`if (loading)` ~138, `if (error)` ~146).
The lost run's five `next build` errors came from adding NEW `useMemo`s AFTER those
early returns during the build. **Rule for the three screens: every hook —
including any new `useMemo` for metric derivation — goes above the first early
return. Derive metrics with a `useMemo` placed at the top, never after a
`loading`/`error` guard.** `tsc` passes this; only `next build` catches it, so run
a production build before committing item 5.

### Step 4 — item 7 capture (delegated + self-verified)

**FILL-7.1 — `debt-split-ux-log.md` §2.5 (lines ~79-100):** burst is NOT built;
deferred in phase 3 because it rewrites a tightly-ruled subsystem and needs a real
device to verify. It ruled the burst design: replace the single slot with a LIST,
accumulate without navigating, and **route burst shots through the existing
`offline-sync` queue** (idempotent via `uploadFile`'s `id` option), NOT bare
`uploadFile`; **per-photo status, keep failed shots held, offer retry, do NOT
silently drop, do NOT abort the rest.** It corrected the stale clock-routing and
`capture`-attribute claims. **No contradiction with a RULED line.**

**FILL-7.2 — `PendingShot`** at `apps/web/app/m/capture-store.tsx:33-38`:
`{ file: File; projectId: string | null; takenAt: string }`. Stored as
`PendingShot | null` (single-slot, line 41); `hold()` overwrites. Single-slot
because §7a/A-21c forbid a non-owner/admin `files` INSERT without a `project_id`,
so a shot is held client-side until a project is chosen.

**FILL-7.3 — §7a** documented at `docs/specs/M6M-mobile-pwa-spec.md:4073-4075`
(*"A file cannot be inserted without a project for any non-owner/admin role…"*).
RLS: `files_insert_non_client` (`20260822000000_m6m_subcontractor_photo_access.sql`)
— `project_id IS NOT NULL` required for every non-owner/admin role. Matches the
live policy I read in Step 1.

**FILL-7.4 — A-21** (`M6M-mobile-pwa-spec.md`): A-21 *"With no project in context,
the project prompt appears **after** the shot, not before."* A-21b: with context,
files with no prompt. A-21c: never submitted without `project_id`. The clock→job
wiring adds a THIRD project source before the prompt fires — changing A-21's
trigger condition (see ASK-7.A).

**FILL-7.5 — offline queue** at `apps/web/app/m/offline-sync.tsx`; gate at
`capture-screen.tsx:70` is `if (!navigator.onLine && offlineSync)`.
⚠️ **CORRECTION to PREV.** PREV said weak signal "fails on an unhandled rejection
path." Self-verified (`capture-screen.tsx:90-103`): `uploadFile` returns a
structured `{ success:false, error }` and never throws — **there is no unhandled
rejection.** The accurate failure path: weak signal → `navigator.onLine === true`
→ ONLINE branch → `uploadFile` fails → `setError()` shown, shot stays HELD (not
cleared), user must MANUALLY retry. **The real gap is that an online-branch failure
is not auto-queued** — it never falls into `offline-sync`. This is exactly why
§2.5 routes burst shots through the queue unconditionally.

**FILL-7.6 — photo 4 of 7:** burst does not exist yet, so there is no live
multi-photo failure behaviour. Single-shot today: online failure → held for manual
retry; offline → enqueued individually, each idempotently retryable with backoff.
§2.5's ruled burst design is the answer to be built (per-photo status, hold failed,
don't abort). ASK-7.B decides the exact UX.

**FILL-7.7 — five `capture="environment"` sites CONFIRMED:**
`app/m/mobile-shell.tsx:553`, `app/m/logs/new/log-form.tsx:359`,
`app/m/p/[projectId]/punch/[itemId]/punch-actions.tsx:170`,
`app/m/p/[projectId]/safety/new/incident-form.tsx:328`,
`app/m/p/[projectId]/deliveries/check-in/check-in-form.tsx:336`. Matches PREV.

### Step 5 — item 10 + production reads

**FILL-10.2 — s148/s149 disconnect window.** `s148-qb-connection.live.ts` and
`s149-qb-queue-webhooks.live.ts` mutate the QB columns of **two shared live QA
tenants** (`josh+test50@worthprop.com`, `josh+qa-b-owner@worthprop.com`) — they
create no company. `restore()` sets `qb_connection_state: 'disconnected'` FIRST,
then re-applies the snapshot; individual tests also write `disconnected` mid-run.
**Exposed window:** from the first mutation until `afterAll`'s restore — a crash in
that window leaves the live tenant's QB state `disconnected`/partial. s149 already
records a real S188 incident: it nulled a live customer link (Karen Foster →
Customer 62), risking a duplicate customer, restored by hand. Proposal drafted in
spec FILL-10.2.

**FILL-10.1 — QB sandbox residue.** The residue lives in Intuit's SANDBOX company
tied to the *production* FrameFocus connection, not in rebuild-test (whose
`qb_vendor_map`/`qb_webhook_events`/`qb_account_cache` are empty; `qb_sync_queue`=12,
`sync_conflicts`=204 are local test artifacts). Inventorying the sandbox objects
would require querying the QuickBooks API, which touches the live connection —
**forbidden this session.** Known residue from prior records: Bills 147/149,
Purchases 151/152/155/156, Vendor 77 (voidable, not deletable), plus whatever S104
added. Proposal: document, do not delete; recommend Josh (or a future authorized
session) reconcile against the sandbox. Recorded in spec FILL-10.1 as PARTIAL.

**FILL-6A.6 / FILL-6.3 (production counts) — PENDING, no safe channel.** MCP is
bound to rebuild-test; the CLI link must not be repointed at production (stop
rule 1 / the "CLI can reach production" warning); no `.env.local` exists and
hand-crafting a credentialed production connection is exactly the probe class the
spec forbids. **Recorded as an FYI in the Phase 2 message and as a REQUIRED
pre-apply check for item 6's migration:** before that CHECK is ever applied to
production, production's null-project category distribution must be confirmed to
contain ONLY `contracts`/`lien_releases` (as rebuild-test does). CC will not push
item 6's migration to production regardless.

### Step 6 — cross-cutting

**FILL-X.1 — floor canonical implementation.** Authority is in the DATABASE via
per-table RLS SELECT floors keyed on `get_my_role()`: `instrument_rates`
(owner/admin), `project_financials_*_owner_admin`, `project_budget_amounts_*_owner_admin`,
`estimates_select_authenticated` (PM own-only), `cost_catalog_select_manager`
(PM all), and `files_select_non_client`'s contract/CO/invoice exclusion. The UI
companion is `budgetColumnsFor()` (`apps/web/lib/services/invoices-shared.ts:472`)
— a renderer helper, NOT the floor. **Items 5 and 6 both rely on the same DB-RLS
mechanism** (item 5 renders columns the RLS already gates; item 6's new arm lives
in RLS + a CHECK). No renderer-only gate is introduced.

**FILL-X.2 — migrations this spec requires.** Exactly ONE candidate, gated on
ASK-6.A: item 6's `files.estimate_id` column + a three-arm CHECK. Items 5, 7, 10
require NO migration (UI, client-side capture wiring, and housekeeping
respectively). If ASK-6.A defers item 6, this spec needs ZERO migrations. Either
way, CC applies migrations to rebuild-test ONLY; no fifth attended production push
originates from CC in Phase 3.

### Step 7 — item T (TECH_DEBT classification) — measured, arithmetic reconciled

**Current state (measured, top-level `- **#` entry lines):**
- `TECH_DEBT.md` (OPEN): **186** entries
- `TECH_DEBT_CLOSED.md`: **34** entries
- `TECH_DEBT_IDEAS.md`: **3** entries
- **Total = 223** ✓ (matches the spec's "Total conserved at 223")

**⚠️ Reconciling the spec's "CLOSED 69, IDEAS 11, OPEN 106".** 69+11+106 = **186**,
NOT 223 — so these are NOT final file totals. They are the **partition of the 186
current OPEN entries**: 106 stay OPEN, 69 are classified CLOSED and moved, 11 are
classified IDEAS (deferred decisions) and moved. Final file totals then become:
- OPEN 106, CLOSED 34+69 = **103**, IDEAS 3+11 = **14** → **106+103+14 = 223 conserved.**

This is the only reading that conserves 223 and matches OPEN's current 186. Recorded
so Phase 3 counts against the right target (final OPEN must land at exactly 106).

**⚠️ The per-entry classification was LOST and is NOT purely mechanical.** Only **38**
of the 186 OPEN entries carry a headline closure marker (✅ / CLOSED / WON'T BUILD /
NOT A DEFECT / RESOLVED / SUPERSEDED). Reaching 69 requires ~31 further closures
judged from each entry's BODY (text saying the work shipped/was built/was ruled a
non-defect). That judgment is the lost analysis. **Independent re-derivation may not
reproduce exactly 69/11** — and the spec's own rule is "Count before and after; if
any count is off by one, STOP." So Phase 3 for item T proceeds only if the
re-derived partition lands on 106 OPEN / 69→closed / 11→ideas; any deviation is a
STOP-and-report, not a silent adjustment.

**Josh's preserved rulings all verified present:**
- The 5 stay-OPEN entries (`#31`, `#54`, `#77`, `#150`, `#1-trial`) each exist as a
  live OPEN entry. ✓
- Accepted dual-file entries (`#110`, `#131`, `#151` split; `#8`/`#10`/`#12`/`#13`/`#50`
  pre-existing in two files) mean the 223 has accepted, documented fuzz — hitting an
  exact grand total tolerates these known duplications.
- 6 pointer blockquotes to keep — Phase 3 execution detail.

### Step 8 — the "four stale claims" (spec §"Four stale claims") — all verified

1. *"Item 5 is the largest remaining UI gap / four of six conform"* — CORRECTED:
   **five** conform (contacts is the fifth); the three to build stand.
2. *"clock→job routing already works, verify it"* — CONFIRMED FALSE: it does not
   exist; `projectInContext()` never reads the clock. Item 7 is new wiring.
3. *"No image input sets `capture`"* — CONFIRMED FALSE: set at five sites.
4. *"#118: there is NO offline queue"* — CONFIRMED FALSE: `offline-sync` exists and
   capture uses it offline; the real gap is narrower (online-branch weak-signal
   failure is not auto-queued) — and I refined PREV's "unhandled rejection" wording
   (there is none; `uploadFile` returns structured errors).

**Phase 1 measurement complete.** Next: fill the spec's FILL markers in place, then
Phase 2 (one questions message: ASK-6.A, ASK-7.A/B/C, plus the production-count FYI).

## Phase 2 — questions ruled

Put all four ASKs to Josh in one AskUserQuestion call. He chose every recommended
option:
- **ASK-6.A → three-arm CHECK** (add `files.estimate_id`; VALID CHECK: exactly one of
  project_id/estimate_id, OR company-level `category IN ('contracts','lien_releases')`
  both null). Beat "at most one" and defer.
- **ASK-7.A → approve clock source**, precedence URL > ?project= > clock > null;
  changes A-21's trigger (clocked-in user files silently). Beat prompt-always.
- **ASK-7.B → surface & proceed** (offline-sync queue, per-photo status, hold failed,
  don't abort; also auto-queue online-branch weak-signal failures). Beat block / drop.
- **ASK-7.C → keep held, no insert** ("needs a project" state on dismiss). Beat
  discard / mandatory-picker.

Spec updated with each RULED (+ the alternative it beat), AUDIT RESULTS completed
(PASS), status banner flipped to COMPLETE & AUDITED. Committed and pushed.

**Part 1 done. Beginning Part 2 (Phase 3, unattended): build order 5 → 6 → 7 → 10 → T,
commit+push after each discrete step.**
