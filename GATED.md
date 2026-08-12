# GATED.md — blocked work, what blocks it, what unblocks it

> **Created:** Session 95 (2026-07-31). **Purpose:** one place that answers "what is
> blocked, behind what, and what unblocks it," so gated work stops living only inside
> spec sections and session handoffs.
> **This file is the repo copy and the source of truth.** A mirror may exist in the
> claude.ai project knowledge — regenerate that mirror from this file, never the
> reverse.
> **Verify before acting.** Entries are registers, not authorities — confirm against
> git, migrations, and the named spec section before building. Claims that could NOT
> be verified against the repo are marked **[UNVERIFIED]**.

---

## Gate 1 — Pre-M9 external-surface gate — **RE-SCOPED [S140]**

> ⚠️ **The previous opening sentence was false, and had been for some time.** Quoted
> rather than silently rewritten:
>
> _"Nothing that puts a FrameFocus surface in front of someone outside the company
> ships until this gate is cleared. First external surface = first impression;
> identity, branding, and delivery must be settled first."_
>
> **Three such surfaces had already shipped**, and the S140 survey found the gate
> still claiming otherwise:
>
> | Surface | Shipped |
> | --- | --- |
> | `/sign/[token]` + `signing_sessions` | clients sign proposals, in production |
> | `/sign-co/[token]` + `co_signing_sessions` | clients sign change orders, in production |
> | Invoice email + attached PDF | `20260807000000_7d_invoice_email.sql`, `api/invoices/[id]/send/route.ts:294-309`, proven by `s97ct-invoice-email.live.ts` |
>
> `7f2-spec.md:487` reached the same finding independently for the first two and
> called the sub-inbound deferral rationale dead. The invoice email is the third
> and is stronger: it mails a company-branded document to a paying client today.
>
> **A gate that everyone has already walked through stops being read.** It is
> re-scoped rather than deleted, because what it was really protecting is still
> genuinely open.

**What this gate actually protects, stated positively:**

1. **The Pre-Module 9 product decision** — hosted client portal vs. email plus
   magic-link tokenised pages vs. both. This is unresolved and blocks Module 9's
   shape. See "Pre-Module 9 Decision Gate" in `STATE.md`.
2. **Identity and branding on anything a client receives** — sender domain, login
   branding, the RESEND secret actually being deliverable.
3. **NEW, RECURRING external surfaces** — a surface aimed at a party the platform
   does not email today, most notably **subcontractors** (113c stage 6 below).

**What it does NOT block, and never should have been read as blocking:** extending
delivery to a party FrameFocus already emails through machinery already in
production. The tokenized-signing pattern and the invoice mailer are precedent, not
exceptions to be argued around each time.

**Blocked behind it**

- **#113(c) stage 6 — 7F sub-contract template + sub-facing e-signature.** Generates
  the sub-contract document from a company template and sends it to the subcontractor
  to sign. This is also what gives the "contract isn't signed" state real backing —
  today it is the `requires_formal_contract` toggle plus an advisory payment-time
  warning (S95), not an observed signature. Detail: `docs/specs/113c-spec.md` §7 and
  §10.6. Stages 1–5 are internal-only and shipped (through migration
  `20260731050000`) — but stage 5's RPC body is SUPERSEDED by the S95 second ruling
  set (rulings 8–12 below): replacement migration `20260731060000` is written.
  **CORRECTED [S97, 2026-08-02]:** this said "UNAPPLIED". It **is applied to
  rebuild-test** — present in both the local and remote migration lists, and the live
  `revise_sub_contract_schedule` body carries the S95 rulings (verified by exercising it
  in `s97ct-roles.live.ts` item 5). It remains **unapplied to production**, where it sits
  in the owed migration batch.
- **Project material record.** Client-visible, semi-structured list + open notes +
  photos, logged as work proceeds. PARKED, interview-first — do not build without an
  interview. Detail: `docs/sessions/context93.md` §8 (restated context94 §9).

**What unblocks the gate** (from context94 §9's owed list)

- RESEND secret (transactional email actually deliverable — the Codespace override
  slip has recurred)
- Domain cutover
- Login branding

### TRIAL LIFECYCLE — **RULED [Josh, S135]. Not built. Needs its own spec and interview.**

Raised by D3.2 of the invitation-flow work: `trial_emails` is append-only, so an address that
has ever started a trial gets `subscriptions.status = 'incomplete'` on any later signup, and
`middleware.ts:168` treats `incomplete` as `needsPayment` and redirects **every dashboard route**
to `/dashboard/billing/plans`. The person can recover self-serve **only by paying immediately**;
restoring the trial needs an operator. Josh hit this himself with `josh+test2@worthprop.com`.

**The S135 branch changed NOTHING here, deliberately.** D1's fix stops *new* spurious burns by
refusing the signup outright; existing `trial_emails` rows stay, and the behaviour is untouched.

**The ruling this spec starts from — do not re-derive it:**

1. **Immediate deletion at trial expiry**, with a **3-day warning** beforehand.
2. **30 days' retention** for paying customers who cancel.
3. **An export path before deletion.**
4. **3 trials per email address**, tracked (not the current 1, and not unlimited).

⚠️ **This is four systems, not a setting** — a scheduler, a notification path, a retention/erasure
policy and an export pipeline — **with legal exposure** (data deletion, retention promises, what an
export must contain). It gets a spec and an interview before any code.

### Module 9 dependencies raised while building the S133 read floor — **[S133, Josh]**

Both are **flagged, not built.** They surfaced while deciding which roles the
subcontractor read floor (`20260912000000`) should exclude, and both are
pre-existing gaps rather than anything that migration introduced.

- **M9-D1 — `project_budget_items` carries COST ONLY.** ~~**BLOCKS the cost-plus and
  T&M cases**~~ — **CORRECTED [S140]. It does not block them.**

  _Superseded text, quoted not rewritten:_ _"The portal's financial page varies by
  contract type, and this gap **blocks the cost-plus and T&M cases specifically**,
  where what a client is billed is cost plus a margin the schema cannot currently
  express."_

  **The schema expresses it, and has since S93.** Sell is not a column and is not
  meant to be one: money-rep **P1** keeps the budget line as cost, **P2** makes sell
  _"DERIVED… computed from cost + instrument pricing context at read time"_, and the
  mechanism shipped — `instrument_rates` carries four cost-plus rates plus the T&M
  pair, and `deriveCostLine` / `deriveLaborLines` price against them. 7D bills real
  invoices this way in production, and **7H now reports margin the same way**
  (`lib/services/profitability.ts`, S140).

  **Adding a sell column would be a regression, not the fix.** `project_budget_items`
  is INSERT-ONLY by design — no UPDATE policy, no DELETE, guarded by
  `s97ct-budget-immutability.live.ts` — so a stored sell figure could never be
  corrected or removed. `project-income.ts` names storing-on-the-budget-line as the
  thing it deliberately refuses, for exactly this reason.

  **What is actually owed for the client financial page** is a build item, not a
  schema gap: a read-time derivation service (7H's is the model) plus a `client` arm
  on the relevant policies. `20260912000000` leaving no client exclusion on
  `project_budget_items` still stands — for that reason, not this one.

- **M9-D2 — client-visible files and photos.** ~~**Nothing in the schema carries such
  a flag today.**~~ **CORRECTED [S140]: `files.client_visible` EXISTS.**

  _Superseded text, quoted not rewritten:_ _"Nothing in the schema carries such a flag
  today. It needs **a column, a UI to set it, and a client arm on both the file and
  photo policies.**"_

  The column is live and already load-bearing: `files_insert_non_client`
  (`20260728000000:84-90`) restricts setting `client_visible` at INSERT to Owner/Admin
  and treats NULL as false, with a BEFORE UPDATE trigger guarding the UPDATE side —
  because, as that migration says, an insert policy cannot see updates.

  **Two of the three named pieces remain owed**, and the third is narrower than
  stated: a **UI to set the flag**, and a **client arm on the file and photo
  policies**. Photos ride the same `files` table, so there is one column, not two.

  ⚠️ **The S133 reclassification still stands, unchanged.** `files_select_non_client`
  excludes `client` by name; that holds today and stops holding the moment the client
  arm is added. It is an exclusion that was never revisited, not a decision that was
  made.

  ⚠️ **This reclassifies an S133 audit finding from settled to PROVISIONAL.**
  `files_select_non_client` was recorded as category (a) — *intended by construction*,
  because it excludes `client` by name. **That holds today and stops holding the moment
  the flag exists.** It is an exclusion that was **never revisited**, not a decision
  that was made. A future reader must not treat it as the latter.

---

## ~~Gate 2 — Test identities~~ — **CLOSED [S97, 2026-08-02]; fully closed [S113, 2026-08-07]**

**#103 (foreman test identity) and #104 (second test company) are both done.** Nothing
is blocked behind this gate any more.

> **[S113] The residual two-role gap is also closed — #127.** S97 closed this gate for the five
> roles it named while `subcontractor` and `client` were still missing, which is what #127 was
> raised to track. Both now exist. First use: `apps/web/test/s113-punch-sub-visibility.live.ts`
> proves both arms of M6M D-57 by **signing in**, which is the reproducibility #127 existed to
> demand — the S99 §7c probes it complained about minted fixtures in a transaction and rolled them
> back, leaving nothing anyone could re-run.

### What now exists

**Eight persistent identities across two companies on rebuild-test [updated S113]** — **all seven
roles** `profiles_role_check` permits, plus a genuinely separate tenant:

- **Company A — Bishop Contracting:** `owner`, **`admin`** (new), `project_manager`,
  **`foreman`** (new, #103), `crew_member`, **`subcontractor`** (new S113, #127),
  **`client`** (new S113, #127).
  The subcontractor carries a linked `company_members` row and a `project_assignments` row on the
  fixture project — without the assignment, D-57's narrowing would be a no-op rather than a
  narrowing. The client deliberately has **no** member row. **The 32 `profile_id IS NULL`
  subcontractor roster rows are not identities and were not used.**
- **Company B — Ridgeline Builders (TEST CO 2)** (new, #104): `owner`. Carries its own
  contact, project, sent invoice, client payment + application, expense and pay rate, so
  isolation can be tested against real rows rather than an empty tenant. Company A carries
  a matching fixture set for the same reason — the proof runs in **both** directions.

Full table of emails, ids and the shared password: **STATE.md → Test Data**.

Created by `node scripts/seed-test-identities.mjs` — idempotent, and it **refuses to run**
against any project other than rebuild-test.

### Cross-company isolation — now PROVEN, not asserted

`apps/web/test/s97ct-isolation.live.ts` — **14 assertions, 14 PASS**, under real sessions
(password grant, falling back to a magic link — see `test/live-session.ts`), both
directions, across `projects`, `invoices`,
`invoice_lines`, `client_payments`, `client_payment_applications`, `expenses`,
`member_pay_rates`, `instrument_rates` and `contacts`:

- neither company's owner can read a single row of the other's, by id or by listing;
- every row an owner *can* list belongs to their own company;
- an unprivileged role (foreman) and a fully-privileged one (admin) leak nothing either;
- cross-company **writes** are refused — UPDATE, INSERT claiming the other `company_id`,
  and soft-delete — each verified afterwards to have changed nothing;
- the 7E `record_client_payment` RPC, which is `SECURITY DEFINER` and so **not** protected
  by RLS, refuses an invoice belonging to another company via its own check;
- and the proof is guarded against being vacuous: each owner is asserted to read their own
  fixture back before the "sees nothing of the other" assertions run.

### How to use it

Role and isolation checks are a test run, not a manual login:

```bash
cd apps/web && npx vitest run --config test/live.vitest.config.ts
```

`test/*.live.ts` hit rebuild-test and are excluded from the CI suite by the `.live.ts`
suffix. Copy the session pattern in `s97ct-isolation.live.ts` for any new role check.

### Role checks — RUN [S97, 2026-08-02]

`apps/web/test/s97ct-roles.live.ts` — **26 assertions, 21 PASS, 5 FAIL**, under real
sessions for all five roles. The five failures are **real defects**, recorded below and
left unfixed pending a ruling; nothing was adjusted to make them pass.

**Now genuinely verified (was code-reading only):**

| # | Surface | Verified |
| --- | --- | --- |
| 2 | Correct-rates / `supersede_instrument_rate` | **PASS** — Owner only. Admin, PM, Foreman and Crew are all refused *"Superseding a rate is Owner only."*; the Owner passes the guard and is stopped only by the target, so the refusals are a role gate rather than a wall. Admin also cannot reach the same effect by writing `superseded_at` directly. |
| 4 | CO builder rate fields | **PASS** — the real `CoRateSection` client component was RENDERED for both prop values: `canEditRates: false` emits no `<input>` or `<button>`. A PM cannot write a CO rate; Owner and Admin can. |
| 5 | Sub-contract schedules | **PASS** — `revise_sub_contract_schedule` refuses PM, Foreman and Crew; Owner/Admin pass its guard. `setup_payment_schedule` **admits a PM** and refuses Foreman/Crew, so "PM setup-only" is a real distinction and not an accident. A PM also cannot rewrite the contract's retainage directly. |
| 6 | Invoices tab | **PASS** — the real `ProjectHeader` was RENDERED for all five roles: Foreman and Crew get no Invoices tab, the other three do. Both also read **zero** invoices and cannot create one. |
| 7 (part) | §12a — a PM sees invoice amounts | **PASS** — a PM reads `billed_total` / `amount_receivable` / `retainage_withheld` on an invoice they can reach. |

**Failures — open defects:**

| # | Surface | Defect |
| --- | --- | --- |
| 1, 3 | Rate section + Overview rate summary | **FAIL — the gate is UI-only.** `instrument_rates_select_company` is `company_id = get_my_company_id()` with **no role floor**, so PM, Foreman and Crew each read rate rows straight from the API. The UI hides the section; the data is not protected. *(Writes ARE gated — `instrument_rates_insert_authorized` is Owner/Admin, and no gated role could insert.)* |
| 7 | §12a "Original contract" tile | **FAIL — read.** A PM read `contract_value = 12365`; Foreman and Crew read `50000`. The tile's absence is cosmetic. |
| 7 | §12a contract value | **FAIL — WRITE.** A **PM rewrote `contract_value` to 999999** on an assigned project. `projects_update_authorized` admits a PM with no column restriction. The most serious of the five: the Financial Visibility Floor treats contract value as Owner/Admin, and a PM can not only read it but change it. *(The harness restored the value; it writes only to its own QA fixture, never to real project data.)* |

All five are the **`FINANCIAL-RLS-FLOOR`** follow-up CLAUDE.md already names as owed
(ui-01 §10 — "the DB-level floor is NOT yet in place"). What is new is that they are
**demonstrated rather than predicted**, and that the floor is not only a read gap: item 7's
write is beyond what "UI-only read floor" describes.

### Still owed

- **`FINANCIAL-RLS-FLOOR` migration** — a role floor on `instrument_rates` SELECT, and a
  column- or policy-level restriction so a PM can neither read nor write
  `projects.contract_value`. Now backed by five live failures rather than a code reading.
- Click-testing the merged Budget & Cost **screen** as PM, foreman, crew (context93 §12.5).
  Its rate section's data layer is covered above; the per-role column counts (§7.1:
  Owner/Admin 7, PM 5, Foreman 3) are still unexercised.
- The picker amount-hiding gate (S95) — not covered by this harness.
- **Render gates inside `page.tsx` server components remain code-read-only** (items 1, 2, 3
  and 7's tile). They cannot be executed outside a Next runtime — only client components
  can be rendered in the harness. Their data and write halves are covered above, which is
  the half that actually enforces anything.

---

## Gate 3 — 7D–7H specs (blocked on reconciliation + decisions, not on code)

7E–7H are gated behind 7D's design. **The repo currently disagrees with itself about
7D's readiness — reconcile this before any 7D build:**

- The TRACKED specs `docs/specs/7D-spec.md` and `7E-spec.md` (committed S91/S92)
  claim **"WORKFLOW APPROVED + PROVEN (interview)"** with only the §S schema layer
  deliberately absent (CC writes it against live schemas).
- `docs/sessions/context94.md` §8 and `module7-architecture.md` §7.10 say 7D/7E are
  workflow-heavy with only **partial traces** and explicitly **not spec-ready**.
- The UNTRACKED prep docs — `docs/specs/7D Spec-Prep.md`, `7E`, `7G`, `7H`
  (no 7F; verified on disk 2026-07-31) — describe themselves as the **draft**
  input→store→output trace plus the decision record needed to approve it.
- ALSO UNTRACKED: a second generation of spec revisions — `docs/specs/7d1-spec.md`
  through `7h1-spec.md` (all five, 7F included; appeared on disk late 2026-07-31).
  Spot-checked headers: `7d1` presents as the 7D spec deriving from
  money-representation (FINAL, S93); `7f1` as "Interview-backed plan (S92, extended
  and reconciled [S94])". Their relationship to the tracked `7D-spec.md`–`7H-spec.md`
  AND to the prep docs is **[UNVERIFIED]** — three generations of 7D–7H documents now
  coexist.

**What unblocks it**

- One reconciliation pass deciding which generation is authoritative — the tracked
  S91/S92 specs, the Spec-Prep drafts, or the new `7x1-spec.md` revisions — followed
  by committing the winner and deleting or archiving the rest.
- Josh answers whatever decision lists survive that pass.
- **[UNVERIFIED]** provenance: the untracked docs are said to come from a parallel
  session. Whatever their origin, anything written before late 2026-07-31 predates
  the S95 rulings below and must be reconciled with them before being trusted.

Standing rule (Interview-First Mandate, `future_module_architecture.md` §2/§2a): no
spec without an approved trace.

---

## Deferred by decision (not blocked — chosen)

- **Conversion-stamp (contract-start date) — CONFLICT, resolve before build.**
  `money-representation.md` §5.1 item 4 + §7.1 S-4 (amended 2026-07-31) COMMIT to
  stamping the first rate's `effective_from` = contract start AT CONVERSION
  (`[BUILD-VERIFY]` mechanic — likely a definer-side UPDATE in the RPC). A same-day
  chat decision reportedly deferred this pending a distinct project-level
  contract-start field (new column; Owner+Admin editable, whereas rate correction is
  Owner-only) — **[UNVERIFIED]**: no repo document records that deferral, and it
  contradicts the spec as amended. If the deferral is the ruling, amend §5.1/§7.1
  first. Interim reality either way: Correct-rates already lets the Owner set the
  first rate's date by hand; only the default is at stake.
- **Live-job rate renegotiation, original S93 scope.** Superseded by the S95
  project-side rate section; the post-conversion recompute question dissolved (budget
  lines store cost only; rate-in-force pricing of incurred cost/hours is deferred to
  7D).
- **`setup_payment_schedule` RPC hardening.** Force-targets (every sub stage must
  carry a real budget line) is UI-enforced only — the RPC still accepts targetless
  stages via direct API. Follow-up filed alongside FINANCIAL-RLS-FLOOR
  (money-representation.md §7.1 S-2 as amended).
- **#115 expense capture model** — field roles writing budget-line allocations.
  DEFERRED-POST-LAUNCH by Josh (TECH_DEBT #115). Do not touch; interview before any
  change.

---

## Gate 4 — NOTIFICATIONS are gated behind the PWA install — **[S97, 2026-08-03]**

**What is blocked:** the notification system (Web Push to field crew).

**Behind what:** a **manifest, icons and a service worker** — i.e. the PWA install itself.

**Why this is a hard dependency and not a preference.** On iOS, Safari delivers Web Push **only to
a PWA the user has installed to the home screen** (16.4+). There is no browser-tab push on iPhone
and no app-store alternative, because Josh ruled mobile is a PWA and not React Native (CLAUDE.md →
Technology Stack → *"MOBILE IS A PWA, NOT REACT NATIVE"*). **Push is also delivered TO the service
worker and nowhere else** — on every platform, not just iOS. So manifest + icons + service worker
are **prerequisites of the notification project, not a parallel track**, and no amount of
notification-side work can proceed past design without them.

**What unblocks it:** ship the PWA install (manifest, the icon set incl. maskable + apple-touch, a
registered service worker), then the push work can begin.

**Recorded so the sequencing is not rediscovered.** The temptation is to scope notifications as
their own project running alongside the mobile UI. On iOS that ordering cannot work.

**Inventory as of S97 — none of this exists.** Verified by audit, not assumed:

| Needed | Status |
| ------ | ------ |
| `manifest.json` / `manifest.ts` | **absent** — no file anywhere |
| Service worker | **absent** — no `sw.js`, no `next-pwa` / `workbox` / `serwist` dependency |
| Icons (192/512, maskable, apple-touch) | **absent** — `apps/web/public/` contains **only `fonts/`** |
| `viewport` export in `app/layout.tsx` | **absent** — Next 14's default is injected, so nothing is broken, but there is no control over `viewport-fit=cover` (safe area) |
| `theme-color`, `apple-mobile-web-app-*` | **absent** — `metadata` carries `title` + `description` only |
| Offline fallback page | **absent** |
| `web-push` / VAPID keys | **absent** |
| `pushManager` / `Notification.requestPermission` / SW registration | **absent** — zero occurrences in the tree |
| Push subscription table (endpoint + `p256dh` + `auth`, per member) | **absent** — no such table in any migration |

**Precedent to mirror when it is built, NOT infrastructure to reuse:** the existing notification-
shaped code is **email only** — `logEmail` into `email_logs` with `sent`/`failed`/`bounced` and a
Resend webhook advancing status, plus the Owner/Admin retry banner on safety incidents
(`api/safety-incidents/[id]/notify`). A push send path would need its own log or a deliberate
extension of that one, and 410-Gone endpoint pruning has no equivalent anywhere.

---

## Open defects logged S95 (not gated, just not yet fixed)

- **Overview "Cost to Date" / "Projected Margin" render "—".** NOT a mystery —
  deliberate ui-04 §S3 placeholders whose gating comments are now STALE:
  `projects/[id]/page.tsx:116` ("Em-dash until Module 7A populates actuals" — 7A
  shipped; `getJobCostRollup`/`getBudgetRollup` exist) and `:125` ("until the
  sell/profit schema gap is fixed" — substantially resolved by the money-
  representation pass). The KPIs were never wired to the now-existing rollups. Fix =
  wiring, not investigation.
- **`inForceRowIds` re-implements the rate-in-force selection rule** locally in
  `budget/rate-section.tsx` — deliberately (it yields the winning ROW ids for badges,
  where the shared `rateInForce` returns the value), but it is one rule stated in two
  places. Low drift risk; refactor to a shared row-yielding helper when touched.
- **CO post-creation type switcher unbuilt** — `co_type` is set at creation only
  (changes-panel). Interacts with P4 no-mixing and repricing. Nothing needs it to
  price a CO (S-5 flag, S95).

---

## S95 rulings later work must respect (2026-07-31)

Recorded because they reverse earlier decisions and will otherwise be re-litigated.
Each is also recorded at the cited authority — that document wins on detail.

1. **Future-dating allowed** (reverses the 2026-07-30 P5 no-future rule). Any
   effective date — past, today, or future; a future rate sits dormant until its
   date; renegotiations keep the forward-only floor. Guard no longer references
   `CURRENT_DATE`; debt #111 closed moot. (money-representation.md P5; migration
   `20260731010000`.)
2. **Supersede = Owner-only "Correct rates" edit mode** — any live row's amount AND
   date, required reason. Correction replacements are EXEMPT from the renegotiation
   floor; only the no-duplicate-live-date rule binds. Immutability = "renegotiations
   can't rewrite history; Owner corrections deliberately can."
   (money-representation.md §4.2/§5.5/§7.1; migration `20260731020000`.)
3. **Ruling B — awarding a bid must not overwrite an estimator-entered sub cost**
   (reverses the S93 TECH_DEBT #113 NON-ISSUE). Fill-only-when-empty; row still
   created when missing (stage 4's budget-line tie depends on it); budgeted stays the
   plan, the award arrives as `contract_value`, the difference is
   budgeted-vs-committed variance. (TECH_DEBT #113; 113c-spec §1; migration
   `20260731040000`.)
4. **Sub stages require a real budget line** — no Miscellaneous, no fallback; PO
   totals MAY target Miscellaneous. (money-representation.md §7.1 S-2 as amended.)
5. **Rates live on the project, not the estimate.** Full editor + history on Budget &
   Cost, read-only summary on Overview, Owner/Admin only; the estimate keeps
   amount-only, date-free rate entry (S-3). (money-representation.md §7.1 S-4 as
   amended.)
6. **Formal-contract payment warning is advisory** — banner + explicit confirm, never
   a block. (113c build, S95; PaymentModal.)
7. **Revise is Owner/Admin only** — PM excluded (approve-level authority;
   INVOKER/RLS posture). Role floor unchanged by the second ruling set below; the
   citation migration `20260731050000` is otherwise superseded (ruling 8).
   (113c-spec §8 as amended.)

**Second ruling set, same day (2026-07-31, S95 — partial revise). Supersedes
stage 5 as shipped: migration `20260731050000`'s RPC body is replaced by
`20260731060000_113c_partial_revise_schedule.sql` (written, UNAPPLIED — no db
push has run).**

8. **Revise applies to ANY contract — the `requires_formal_contract` gate is
   DROPPED.** Editability is decoupled from the formal flag; italic stays a
   display signal only. (113c-spec §0.5/§5 as amended.)
9. **Partial revise.** Unpaid stages fully editable — torn down and replaced;
   replacements land PENDING and need Owner/Admin re-approval before they count
   toward committed. A PARTIALLY-PAID stage stays editable in place, its amount
   FLOORED AT GROSS PAID — never below money already out; it keeps
   `status='approved'`. FROZEN: closed-out stages, and any stage on a signed or
   void contract. (113c-spec §5 as amended.)
10. **`contract_value` is warn-only on revise** — Σ stages vs contract value
    warns, never blocks (the standing P2 posture); no hard floor. (113c-spec §5
    as amended.)
11. **Retainage mid-stream changes allowed** — percent changes AND shape
    switches (`percent_across` ↔ `final_hold`), forward-only via per-payment
    computation; the withheld accrual row is NEVER touched. (113c-spec §5 as
    amended.)
12. **UI direction (since BUILT — commit `7fa48f4`):** ONE panel-level edit mode
    subsuming the per-draft "Review & confirm" — setup view for contracts without
    a schedule (keeping the award budget-line tie + plan-vs-contract variance),
    editable stages for contracts with one. (113c-spec §5 as amended.)
13. **Mismatch confirm, both directions** (refines ruling 10): Σ stages ≠
    contract value still NEVER blocks, but the save now requires an EXPLICIT
    CONFIRM — over AND under — as an inline confirm step (the PaymentModal
    formal-contract pattern, not a browser dialog), acknowledged once per open
    editor and re-armed when the numbers change; plus a persistent read-mode
    advisory with direction-specific wording. Fixes the click-test bug it was
    ruled against: the advisory previously lived only inside an OPEN editor's
    live line and a transient post-save notice, so a SAVED over-committed
    schedule went permanently silent once the box collapsed.
    (contracts-panel.tsx; commit `7fa48f4`.)
14. **PM setup-only in panel edit mode** (refines rulings 7 and 12): "Edit
    schedules" is visible to Owner/Admin AND PM, but PM sees ONLY schedule-less
    contracts — the setup form, stages landing pending for Owner/Admin
    approval — and can never reach `revise_sub_contract_schedule` (the UI never
    routes PM there; the RPC's Owner/Admin check stays the authority). Restores
    a regression the panel-level rework introduced — it had swallowed PM's old
    per-draft "Review & confirm" entry point; spec §4 preserves PM setup.
    (113c-spec §4; contracts-panel.tsx; commit `7fa48f4`.)
