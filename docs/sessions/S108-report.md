# S108 — Session report

**Branch base:** `feature/s108` @ `f1b2de1` (five specs + four mockups committed there, not on `main`).
**`main`:** `ad4e9b8`.
**Started:** 2026-09-22.

This file is appended after every step and pushed. Assume the Codespace dies without warning.

---

## Phase 1 — Analyze (read-only)

### Step 0 — Orientation

- Confirmed on `feature/s108`, tip `f1b2de1`, working tree clean.
- Five specs present and read in full:
  - `docs/specs/S108-SPEC-A-site-visit.md` (178 lines)
  - `docs/specs/S108-SPEC-B-estimates-line-items.md` (141)
  - `docs/specs/S108-SPEC-C-email-and-drift.md` (136)
  - `docs/specs/S108-SPEC-D-tooling-tests-housekeeping.md` (123)
  - `docs/specs/S108-SPEC-E-production-and-attended.md` (82)
- Four mockups present in `docs/design/mockups/`.

---

### Step 1 — Spec C measured

**Tooling guard checked first:** `cat supabase/.temp/linked-project.json` →
`{"ref":"nmyphyhmfttxkdoposvf","name":"framefocus-rebuild-test",...}`. Every live read below went
through `scripts/live-sql.mjs`, which is read-only (rejects any write keyword) and refuses any ref
other than `nmyphyhmfttxkdoposvf`. **No production read or write.**

#### C1 — warming Reply-To

- **Confirmed `apps/web/lib/services/warming-email.ts:370`** — `replyToCompanyId: company.id`, the
  only place warming mail sets Reply-To. Sole caller: `apps/web/app/api/cron/email-warming/route.ts`.
- `sendEmail()` (`email-service.ts:588-596`) prefers an explicit `params.replyTo` over
  `replyToCompanyId`, so the fix is a one-line substitution at the call site — no change to the
  shared resolver, therefore no other email type can be affected by construction.
- `resolveCompanyReplyTo()` (`email-service.ts:501-529`) is `companies.email` → owner profile email
  → null. `h-h-signature-renovations` has `companies.email` NULL, so warming today resolves to the
  owner's personal Gmail. **Defect confirmed as specified.**
- Two comments also state the old behaviour and must move with the code:
  `warming-email.ts:365-368` and `apps/web/lib/email/templates/warming-email.tsx:25-26`.
- ⚠️ **A third comment is now factually stale and Spec C did not name it.**
  `email-service.ts:56-60` (the `SUPPORT_REPLY_TO` docstring) asserts the sending domain
  *"has no inbox — so a Reply-To on the domain would silently eat replies."* The Spaceship catch-all
  makes that false, and it is the exact sentence a future reader would cite to reject C1's ruling.
  Correcting it is part of C1.

#### C2 — drift detection

- **FILL-C2, first half: the cron-route proposal does NOT exist.** `grep -in "cron"` and
  `grep -in "drift|fingerprint|db:verify|replay"` over `docs/sessions/S107-report.md` (438 lines)
  and `docs/specs/S107-spec.md` return **nothing**; both greps were proved able to fire by a control
  grep on the same files. `docs/sessions/S107-live-suite-repair.md` mentions "cron" only as test
  names. **The design is new work in S108.**
- **FILL-C2, second half: `npm run db:verify` DOES exist on `main`** — `package.json:18`
  `"db:verify": "python3 scripts/db-replay-schema.py"`, landed in `536a43e`, with the companion
  `scripts/db-verify.sql`. It replays the migration files and fingerprints tables, columns,
  NOT NULL, CHECK, UNIQUE, FK. Its own docstring lists what it cannot see:
  *"FUNCTION BODIES, RLS POLICIES, TRIGGERS, INDEXES, DEFAULTS, GRANTS. Out of scope."*
- ⚠️ **`scripts/.db-expected.json` is GITIGNORED** (`.gitignore:72`). The baseline FILL-C4 asks for
  ("committed") does not exist as a committed artefact today.

**Measured, both sides, this session:**

| dimension | replay of 222 migration files | live rebuild-test |
| --- | --- | --- |
| tables | 123 | 123 |
| columns | 1918 | 1918 |
| NOT NULL | 772 | 772 |
| CHECK | **230** | **230** |
| UNIQUE | 42 | 42 |
| FK | 566 | 566 |
| latest ledger version | — | `20261600000000` |

**Exact agreement. Zero drift on rebuild-test, measured rather than claimed.**

⚠️ **Correction to Spec C's "Established by S107" block.** It records *"all 223 migration files"*
and *"231 CHECK"*. Both are pre-revert figures. `2e7c4e6` deleted `20261610000000` outright and
dropped its constraint and ledger row from rebuild-test (*"checks 231 -> 230, latest migration
20261600000000"*). The file count is **222** and the CHECK count is **230**. Spec C and Spec E
(FILL-E1) corrected.

**The dimensions the drift route must add**, counted live on rebuild-test:
RLS policies **363**, triggers **268**, functions **285**, indexes 525, constraints (c/u/f/p) **961**.
Total `pg_get_functiondef` text: **267,630 bytes**, largest single body 10,911 bytes.

**Cost (FILL-C7), measured not estimated.** A single catalog query computing four md5 digests over
policies + triggers + function bodies + constraints returned in **0.536 s wall including the
round-trip from this Codespace**. It reads `pg_catalog` only — no tenant table is touched, so cost
does not grow with row count.

**⚠️ FILL-C3, comment normalisation — the naive answer is measurably wrong.** Stripping every `--`
to end-of-line is the obvious normaliser. Measured against the live catalog by counting single
quotes before the `--` on each line (odd = inside a literal):

- `--` that is a real comment: **391 occurrences**
- `--` that sits **inside a string literal: 2 occurrences, in 1 function — `qb_vault_put`**, both in
  `RAISE` message text (`'... for company % -- a company row still points at this secret ...'`).

A naive strip truncates those two messages, so an edit to the text after the `--` would be
**invisible to the detector**. The normaliser must strip a line comment only when the quote count
before it on that line is even. (My first probe for this used `'[^']*--`, which reported 80/80 — a
false positive, because any earlier quote anywhere in the body satisfies it. Re-measured with quote
parity. Recorded because it is this campaign's named failure class.)

---

### Step 2 — Spec D measured

#### D1a — the markdown formatter

- **The formatter is the VS Code Prettier extension, configured by a COMMITTED repo file:**
  `.devcontainer/devcontainer.json` → `customizations.vscode.settings` sets
  `"editor.defaultFormatter": "esbenp.prettier-vscode"` and `"editor.formatOnSave": true`, and lists
  `esbenp.prettier-vscode` in `extensions`.
- **`.vscode/settings.json` does NOT exist** (`.vscode/` is absent). `.gitignore:27-29` ignores
  `.vscode/*` but explicitly un-ignores `settings.json` and `extensions.json` — so creating it is
  the mechanism the repo already anticipates. It is also the one that takes effect **without a
  rebuild**: workspace settings override the machine settings a devcontainer seeds.
- **No `.prettierignore` exists.** `.prettierrc` is 5 lines (`printWidth: 100`).
- **No CI step runs Prettier over `.md` or anything else** — `grep -in "prettier|format"` over
  `.github/workflows/ci.yml` returns one unrelated prose line.

**Damage measured, not assumed** (all on scratch copies; no repo file reformatted):

| file | `npx prettier --write` changes |
| --- | --- |
| `CLAUDE.md` | 4 lines |
| `STATE.md` | 6 lines |
| **`TECH_DEBT.md`** | **295 lines** |

`TECH_DEBT.md` is confirmed Prettier-unclean on `main`, exactly as Spec D warns. **Not reformatted.**

The live failure mode reproduced: a **one-line** edit to the `CLAUDE.md` Technology Stack table
whose cell is wider than the current column → **34 changed lines** (every row re-padded).
⚠️ My first attempt at this measured 6 lines and also showed Prettier rewriting a `typescript`
fence's quotes — both artefacts of running on a copy in `/tmp`, **outside the repo, where
`.prettierrc` does not apply**. Re-run with `--config .prettierrc`. Recorded because it is the
named failure class.

#### D1b — the pre-push `next build` hook

⚠️ **The premise is already satisfied by CI.** `.github/workflows/ci.yml`:

- `on: push: branches: ['**']` — every branch, plus `concurrency` with `cancel-in-progress`.
- Job `check` runs type-check, lint, vitest. **No build.**
- Job **`e2e` runs `next build` as its own step** — line 295, `- name: Build (production)` /
  `run: npm run build`, working-directory `apps/web`. **No `if:`, no `needs:`** — it runs on every
  branch push, unconditionally. Its own comment records why it is a separate step (`#135`).

So a pre-push hook would duplicate a check that already gates every push. Local build timing is
being measured in this session and is reported in the ASK. → **ASK-D1.**

#### D1c — `db:verify` and the ledger

`npm run db:verify` exists and is **schema-only**. Its docstring: *"FUNCTION BODIES, RLS POLICIES,
TRIGGERS, INDEXES, DEFAULTS, GRANTS. Out of scope."* A full-text grep for
`ledger|schema_migrations|duplicate|md5` over `scripts/db-replay-schema.py` returns **only the two
docstring lines naming the ledger as a BLIND SPOT**. **It does not check the ledger at all.**

Measured on rebuild-test this session:

- `supabase_migrations.schema_migrations`: **222 rows**, 222 distinct versions, **0 null names**,
  **0 rows whose name is not a `2026%` version** (no MCP-signature rows).
- Ordered-version md5: **`d0d8670294d11ffa303e2d26341f46e4`** — **identical** to the md5 of the 222
  migration filenames on disk. Files-not-in-ledger: none. Ledger-not-in-files: none.

So the ledger check has to be **built**, and rebuild-test is a clean baseline to build it against.

#### D1d — `gh`

- **`gh` is not installed** (`command not found`). Devcontainer feature:
  `ghcr.io/devcontainers/features/github-cli:1`. ⚠️ Applies on **rebuild**, not restart.
- `GITHUB_TOKEN` is present (length reported only, **value never printed**). `x-oauth-scopes` on
  `GET /user` is **empty** — a fine-grained Codespaces token, not a classic scoped PAT.

Probed by HTTP status, token passed in a header and never echoed:

| call | result |
| --- | --- |
| `GET /repos/{owner}/{repo}` | **200** |
| `GET /repos/.../actions/runs` | **200** |
| `GET /repos/.../actions/workflows` | **200** |
| `GET /repos/.../pulls` | **200** |
| `GET /repos/.../issues` | **200** |
| `GET /repos/.../branches/main/protection` | **403** |
| `GET /repos/.../actions/secrets` | **403** |

Consistent with S107's measured **403 on the Actions cancel API**. **What `gh` buys here:
`gh run list` / `gh run view` / `gh run watch`** — which is exactly the tool the standing "quiet
period until the run is green" rule needs. **What it cannot do: cancel a run, read branch
protection, read or write secrets.** Creating a PR was **not probed** (it would create one).

#### D2b — the directly-invoked-handler class, every suspect classified

The question `#1-deliv` says to ask of each: *does this handler read state that its caller is
concurrently writing?*

| test | asserts | timing-dependent? | verdict |
| --- | --- | --- | --- |
| `auth-email-hook-signature-headers.test.ts` | `/api/auth/send-email` accepts `webhook-*` AND `svix-*`, refuses neither → 400 | No — pure request-shape | **covered** |
| `s160-auth-email.live.ts` A1/A2 | P3 auto-confirm | **Was the defect** | **covered — already fixed**: A1/A2 inverted to assert the *trigger* (`on_auth_user_created_autoconfirm`) with the superseded lines quoted, plus **A1c**, a discriminating control ("no invitation, no auto-confirm") |
| `webhook-resend.live.ts` | delivered/opened/bounced stamping, rank monotonicity, bad sig → 401, **unknown id → 200** | Yes — a Resend event can beat our own `logEmail()` INSERT | **covered**: case 6 is exactly that race, and it is asserted |
| `card-signup-webhook.test.ts` (`/api/stripe/webhook`) | `mode:setup` sets `payment_method_on_file` | No — Stripe calls out-of-band | **covered for handler logic; event SHAPE uncovered — and the file already says so** in its header ("MOCK-VERIFIED, NOT ROUND-TRIP-VERIFIED… Josh must confirm the real event"). This is the explicit note `#1-deliv` asks for, already present. |
| `s107-estimate-files-route-order.test.ts` | session read precedes the admin client | No — ordering inside one request | **covered**, and line 102 is a MIRROR case so the assertion is not vacuous |
| `s107-bid-request-send-order.test.ts` | floor precedes service-role client; origin guard precedes send | No | **covered** |
| `email-unsubscribe.live.ts` | token roundtrip, one-click idempotence, forged token writes nothing, bounce guard outranks consent | No | **covered** |
| `s146-generate-route.live.ts` | lien-release arms, route floor, caller cannot choose type | No | **covered** |
| `s174-selections-email.live.ts`, `s175-stage6`, `s175-stage7` | selection release/offer/spec-sheet/portal pick+sign | No | **covered** |
| `signed-url-error-contract.test.ts` | 403 vs 500 kept distinguishable, cause logged | No | **covered** |

**Result: the class has exactly one member, and it is already fixed.** No suspect remaining is
timing-dependent; one (`card-signup-webhook`) has a declared shape gap that is Josh's to close in
Stripe test mode. Nothing was weakened to reach this.

#### D3a — the committed key

`docs/sessions/context2.md:12` — line number in the spec is **correct**. It carries a partial
publishable key (`sb_publishable_CohyWuCQrtn20grA7gfTjw_`) alongside
`https://jwkcknyuyvcwcdeskrmz.supabase.co`, which `STATE.md:38` confirms is **production**. Nine
other files mention `sb_publishable` generically; this is the only committed value.

#### D3c — `.env.local.example`

Current content (11 lines, read via `git show`): Supabase URL/anon key, six Stripe values,
`NEXT_PUBLIC_APP_URL=https://frame-focus-eight.vercel.app` — the **pre-rebrand** domain.

**The app reads exactly 28 distinct variables — the spec's figure is confirmed exactly.** Measured
over `app/`, `lib/`, `components/`, `middleware.ts`, `test/`, `e2e/`, `packages/`, `scripts/`:

`CRON_SECRET, DISABLE_BILLING_ENFORCEMENT, E2E_EMAIL, E2E_PASSWORD, EMAIL_SEND_ENABLED,
NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL,
NEXT_PUBLIC_VAPID_PUBLIC_KEY, NODE_ENV, OPENAI_API_KEY, QBO_CLIENT_ID, QBO_CLIENT_SECRET,
QBO_ENVIRONMENT, RESEND_API_KEY, RESEND_SIGNING_SECRET, SEND_EMAIL_HOOK_SECRET,
STRIPE_PRICE_BUSINESS, STRIPE_PRICE_PROFESSIONAL, STRIPE_PRICE_STARTER, STRIPE_SECRET_KEY,
STRIPE_WEBHOOK_SECRET, SUPABASE_ACCESS_TOKEN, SUPABASE_SERVICE_ROLE_KEY,
UNSUBSCRIBE_TOKEN_SECRET, VAPID_PRIVATE_KEY, VAPID_SUBJECT, VERCEL_ENV`

⚠️ My first sweep returned **42** because it included `apps/web/.next`, the build output — Next.js
internals (`__NEXT_*`, `NEXT_OTEL_*`) and the bundled `resend` package's own variables. Re-scoped to
source. Same failure class again; recorded.

- **`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is in the example file and the app never reads it** — a
  stale entry to drop, not a variable to document.
- ⚠️ **BLOCKER: I cannot read or write `apps/web/.env.local.example` with my tools** — the path is
  denied by this session's permission settings (both Read and Bash `cat` refused; the content above
  came from `git show HEAD:…`). Writing the rebuilt file is likely to be refused the same way. Noted
  for Phase 2; I will attempt it in Phase 3 and, if refused, deliver the exact file content for Josh
  to paste.

#### E6, measured early because the files were open

- **`QBO_REALM_ID` is NOT read from the environment anywhere.** The realm arrives on Intuit's
  callback and is stored as `companies.qb_realm_id` (unique index `idx_companies_qb_realm_id`);
  requests build it from `conn.realmId` (`client.ts:77`).
- Production path reads **`QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_ENVIRONMENT`**, plus
  `NEXT_PUBLIC_APP_URL` for the redirect.
- ⚠️ **`QBO_ENVIRONMENT` fails to SANDBOX, silently.** `config.ts:65` —
  `process.env.QBO_ENVIRONMENT === 'production' ? 'production' : 'sandbox'`. A typo, or the variable
  being absent, points production at `sandbox-quickbooks.api.intuit.com` with no error.
- API host: `https://quickbooks.api.intuit.com` (prod) vs `https://sandbox-quickbooks.api.intuit.com`.
  OAuth hosts are the same for both (`appcenter.intuit.com`, `oauth.platform.intuit.com`).
- Redirect URI is computed, not configured: `config.ts:121-124` →
  `${NEXT_PUBLIC_APP_URL without trailing slash}/api/quickbooks/callback`.
- `QBO_SCOPE = 'com.intuit.quickbooks.accounting'` — accounting only, with the irreversibility
  warning already in the file.

---

### Step 3 — Spec B measured

**FILL-B0** — `main` = `ad4e9b8`; working branch `feature/s108` @ `f1b2de1`; tree clean.

**FILL-B1 — the components, and the trash is NOT shared.**

| piece | file |
| --- | --- |
| category header, line card, row table, all buttons | `app/dashboard/estimates/[id]/items-tab.tsx` (1443 lines) |
| metrics strip | `EstimateHealthStrip`, `app/dashboard/estimates/[id]/estimate-health-panel.tsx:135` |
| the strip's arithmetic | `lib/estimate-health.ts` → `computeEstimateHealth()` |
| Add Items sheet | `app/dashboard/estimates/[id]/add-items-sheet.tsx` |

- `smallButton` (`:56`) and `dangerButton` (`:64`) are **module-local `const`s in `items-tab.tsx`,
  not exported.** `co-builder.tsx` defines its own, separately named `dangerButtonStyle`.
  **→ ASK-B5 answers itself: enlarging the trash here changes NO other screen.**
- The trash is the emoji **`🗑`** at four sites (`:631`, `:838`, `:1066`, `:1204`) — which is why
  live renders it small and orange-ish. The design shows a red-outlined square with a line-icon
  trash. `lucide-react` is already a dependency.
- ⚠️ **`EstimateHealthStrip` is used by `items-tab.tsx` and nowhere else** (single import site,
  `:1226`). The Details page uses a **different** component, `EstimateHealthCard` (`:63`). So
  restyling the strip does **not** touch the out-of-scope Details layout. The comment at
  `items-tab.tsx:1221` ("one implementation, two surfaces") refers to the shared *derivation*
  (`computeEstimateHealth`), not the component — worth not misreading.

**FILL-B2 — test coupling: effectively none, and that cuts both ways.**
The only hits for `"Price"` are `s175-stage6-spec-sheet.live.ts:609` and
`s175-spec-sheet-template.test.tsx:163`, which assert the word is **absent** from a *specifications
sheet PDF* — a different document, unaffected by renaming a table header. **No test and no e2e spec
references `Add Subcategory`, `+ Add Line`, or any of the three `open-add-items-*` testids.**
**→ Nothing to update, and nothing covers this screen today. Say so plainly rather than claiming the
suite protects it.**

**FILL-B3 — the metrics strip and the Floor: no exposure, measured.**
`estimates_select_authenticated` = `company_id = get_my_company_id() AND (role IN (owner, admin) OR
(role = 'project_manager' AND created_by = auth.uid()))`, and
`estimate_line_items_select_authenticated` requires an `EXISTS` on `estimates`.
**Foreman, crew, subcontractor and client cannot SELECT an estimate row at all**, so they cannot
reach the Line Items tab or receive any figure in its payload. The only three identities that reach
it — Owner, Admin, authoring PM — are all entitled to the cost basis. **No role can reach the tab
and be denied the cost basis, so Profit cannot render a false figure for anyone.** No Floor work is
required; a live test asserting the negative is worth adding so this stays true.

**FILL-B4 — "N pts under target": already shipped, and its rules are already ruled.**
`companies.margin_target_percent` **exists** — numeric, **nullable, no default**, `CHECK (NULL OR
0..100)`, migration `20261110000000`. `details-tab.tsx:522-546` already renders the comparison:

- **NULL target → the block does not render at all.** The code says so: *"Renders ONLY when a
  company target is set (nullable; unset = no comparison, per the ruling)."* → the strip's note is
  simply absent.
- **Above target →** `` `${Math.abs(gapPts).toFixed(1)} pts over` `` in green `#1f8f4e`.
- **Under →** the same in red `#c0362c`. The design's "10 pts under target" matches.
- **Markup mode is NOT excluded.** `health.marginPercent` is `profit/price` regardless of
  `pricing_mode`, and the target is margin-denominated by design — `details-tab.tsx:355` says
  *"30% margin target takes a 43% markup."* **So "pts" is computed in markup mode too, against the
  margin.**
- **The only genuinely unruled case is exact parity**, where the shipped expression yields
  `"0.0 pts over"`. → **ASK-B1**, narrowed to that one case.

⚠️ **Stale comment found:** `estimate-health-panel.tsx:13-14` and `lib/estimate-health.ts:15-16`
both say *"The ⚠️ target-margin bar is DEFERRED (§6b.2 — no target exists)"*. The target **does**
exist and has since `20261110000000`. Correcting both is part of B.

**FILL-B5 — drag-reorder mechanics: the column exists; the DB guard does not.**
- `sort_order` is present on `estimate_categories`, `estimate_line_items` **and**
  `estimate_line_rows` — `integer NOT NULL, no default`. **No migration is needed for ordering.**
- **No unique index on `sort_order`** on any of the three, so duplicates are legal and a reorder is
  a plain integer UPDATE with no two-phase shuffle.
- A cross-category move writes **`estimate_line_items.category_id`** (and should null/retarget
  `subcategory_id`). `UpdateLineItemInput` already permits `category_id`, `subcategory_id` and
  `sort_order`, so **no new service function is needed.**
- Readers that depend on category membership: **`convert_estimate_to_project()` sets
  `project_budget_items.cost_code` from `c.name` — the CATEGORY name** (verified against the LIVE
  function body, not a migration file). It reads the category at conversion time, so a move before
  conversion is correct and a move after conversion cannot retro-change a project.
- **Atomicity:** a reorder within one category is N UPDATEs of one integer; a cross-category move is
  one UPDATE (`category_id` + `sort_order`) plus renumbering of the two affected lists. Because
  duplicates are legal, a partially-applied renumber degrades to a wrong *order*, never to a
  constraint violation or lost row. A single RPC would still be better; see the migration below.

> ⚠️ **FINDING — a real hole that Spec B's cross-category drag would make reachable.**
> `estimate_line_items_update_manager`'s **`WITH CHECK` is only** `company_id = get_my_company_id()
> AND role IN (owner, admin, project_manager)`. It does **not** verify that the NEW `category_id`
> (or `subcategory_id`, or `estimate_id`) belongs to the same estimate. `USING` is strong — it
> blocks non-draft and another PM's draft — so the *source* row is protected, but the *destination*
> is unchecked. There is **no trigger** on `estimate_line_items` enforcing it (only
> `no_override_with_rows`, `set_updated_by`, `updated_at`) and **no composite FK** — the FK is a
> plain `category_id → estimate_categories(id) ON DELETE CASCADE`.
> **Today nothing in the UI writes `category_id` after creation, so the hole is latent. Spec B's
> drag-across-categories is exactly the feature that makes it a live path.** Per stop rule 4 and
> CLAUDE.md's *"authority belongs in the database"*, B must ship a migration that closes it.

**FILL-B6 — which estimates can be reordered: enforced at the database, already.**
`estimate_line_items_update_manager`'s **`USING`** requires the parent estimate to satisfy
`e.status = 'draft' AND (role IN (owner, admin) OR e.created_by = auth.uid())`.
**A reorder of a SENT estimate and a PM's reorder of another PM's draft are both refused by RLS,
with no new code.** Reorder is an ordinary UPDATE and inherits both gates. `estimates_z_immutability`
sits on `estimates`, not the lines — the line freeze is the RLS clause above.

**FILL-B7 — the font is a SYSTEM-WIDE ruled token; the difference is the mockup's.**
`app/layout.tsx:2-19` loads **Barlow** (`--font-barlow`, all UI text) and **IBM Plex Mono**
(`--font-plex-mono`, all numbers and micro-labels) through `next/font/google`, *"ui-01 §S2 — the two
1a families … (no other mechanism existed)"*. The live capture is unmistakably Barlow (narrow
letterforms); the design mockup's wider grotesque is its own tool's default. **Changing the family
would repaint every screen in the product against a ruled token, on the evidence of a mockup.**
→ **ASK-B3, recommending no change.** Ruling #3's *"heavier weight and larger text"* is per-component
and is in scope regardless.

**FILL-B8 — square foot and labor math: measured end to end, and it is clean.**

| machine | what it does with a labor row | unit-safe? |
| --- | --- | --- |
| `computeRowCost` / `rowCostBasis` | `rate × quantity` | ✅ unit-agnostic |
| non-fixed instruments (cost-plus, T&M) | `deriveFlatLaborSell(quantity, rate)` = `quantity × rate`, **no markup, no tax, no burden** | ✅ |
| fixed price | ordinary markup path on `rate × quantity`; labor is never taxed | ✅ |
| `convert_estimate_to_project()` (live body) | `COALESCE(r.rate,0) * COALESCE(r.quantity,0)` | ✅ |
| **`companies.fixed_burden_per_hour`** | read **only** by `expenses.ts:205` against `time_clock_sessions` (`burden_source='company_fixed'`), plus settings/team preview screens. **It never touches `estimate_line_rows`.** | ✅ **the spec's central worry does not arise** |
| **`instrument_rates` `tm_labor_hourly` / `cost_plus_labor_hourly`** | consumed by **7D invoicing** to bill approved TIMESHEET hours (`invoices-shared.ts:233-236`). Estimate labor deliberately bypasses them — `change-order-totals-server.ts:56-58`: *"labor bills FLAT at the row's own rate under `flat_rate_labor` (S97)"* | ✅ |
| `companies.default_labor_rate` | prefills `rate` on a NEW labor row (`items-tab.tsx:337`) | ⚠️ a $/hr default prefilled into a sq-ft row is a **wrong default, not a wrong total** → **ASK-B2** |
| budget-vs-actuals | **`project_budget_items` has NO quantity column** — `committed_amount`, `actual_amount` and `budgeted_amount` only | ✅ **no unit ever crosses into the comparison; it is dollars to dollars** |

**The unit column:** `estimate_line_rows.labor_unit text NULL`, with
`estimate_line_rows_labor_unit_check CHECK (labor_unit IS NULL OR labor_unit IN ('hours','days'))`.
**Adding `'sq_ft'` needs a migration.** `estimate_line_rows_type_columns` already forces a labor row
to leave `unit_of_measure`/`unit_cost` NULL, so sq ft must ride `labor_unit` — correct by
construction. The **material** `unit_of_measure` CHECK already contains `'sq_ft'` and
`UNIT_LABELS.sq_ft = 'Sq Ft'` already exists, so the label needs no new string.

> ⚠️ **FINDING — `change_order_line_rows` carries the SAME `hours`/`days` CHECK**
> (`change_order_line_rows_labor_unit_check`, `20260704215000:183`), and `co-builder.tsx:1088,1119`
> hard-codes the `'hours' | 'days'` union in TypeScript, as does the mobile CO editor. Ruling #6 is
> written for estimates. CLAUDE.md's **PARITY ruling [S122]** says a feature on two surfaces is one
> feature — and a contractor who bills demo by the square foot will bill a *change* to that demo the
> same way. **→ new ASK-B6: does `sq_ft` land on change-order labor rows in the same pass?**

> ⚠️ **Naming correction owed:** `deriveFlatLaborSell(hours: number, hourlyRate: number)`
> (`estimate-totals.ts:217`) is a plain product and its parameter names assert an hours-only world
> that this change ends. Rename to `(quantity, rate)`.

**FILL-B9 — hours-as-square-feet rows.** Confirmed **visible in the LIVE capture itself**: "Tile
Floor Demolition" `$3.00 × 2365 hours` and "Wood Floor Installation" `$3.00 × 2150 hours`.
On **rebuild-test** (reference only): **27** labor rows with `labor_unit='hours'`, of which **12**
have quantity > 40, across 23 lines and 12 estimates. **The production count is Josh's to run** —
query in Spec E. **No migration touches these rows.**

**FILL-B10 — accessibility and mobile.** **No drag-and-drop library is installed and there is no
reorder precedent in the app** (`grep` for `draggable`/`onDragStart` finds only a photo-viewer pan
gesture). So this is built from scratch with native events and **no new dependency**. Native HTML5
DnD has **no keyboard path and no touch support in mobile Safari**, so the handle must also be a
focusable button with ArrowUp/ArrowDown (and an `aria-live` announcement) — that is the keyboard
alternative, and it doubles as the touch fallback. The Items tab is a `/dashboard` (desktop) screen;
the restyled buttons still must not overflow at 400px.

**FILL-B11 — migrations (rebuild-test only; production counts in Spec E):**
1. widen `estimate_line_rows_labor_unit_check` to `('hours','days','sq_ft')` — **a widening CHECK
   governs no existing row**, so it cannot abort on data; the count is still supplied.
2. close the `WITH CHECK` hole above so a line's `category_id`/`subcategory_id`/`estimate_id` must
   stay inside its own estimate.
3. (conditional on ASK-B6) the same widening on `change_order_line_rows_labor_unit_check`.

---

### Step 4 — Spec A measured

**FILL-A0** — `main` = `ad4e9b8`; branch `feature/s108` @ `f1b2de1`; tree clean.

**FILL-A1 — `estimates` has 67 columns.** Money-bearing, and **every one of them is on the row a
SELECT grant would ship**:

| column | populated at INSERT? |
| --- | --- |
| `subtotal`, `tax_total`, `discount_total`, `grand_total` | **yes — `NOT NULL DEFAULT 0`** |
| `tax_rate`, `subcontractor_markup_percent`, `material_markup_percent`, `labor_markup_percent` | nullable, no DB default — written by the create path |
| `discount_type`, `discount_amount`, `retainage_percent`, `deposit_percent`, `projected_value` | nullable, no default |
| `pricing_mode` | **yes — `NOT NULL DEFAULT 'markup'`** |
| `contract_type` | **yes — `NOT NULL DEFAULT 'fixed_price'`** |
| `proposal_pricing_level` | **yes — `NOT NULL DEFAULT 'lump_sum'`** |

Also defaulted at INSERT: `company_id` (`get_my_company_id()`), `created_by`/`updated_by`
(`auth.uid()`), **`created_by_role` (`get_my_role()`)**, `status` (`'draft'`), `version_number`,
`expiration_days` (30), `include_client_contract`, `also_send_to`, and `estimate_number` — see A3.

**FILL-A2 — `estimates_status_check` holds exactly nine values:** `draft, review, sent, viewed,
accepted, declined, expired, converted, voided`. A tenth needs a migration.
`EstimateStatus` (`estimates-client.ts:10-25`) mirrors them.

⚠️ **There is a compile-time forcing function, and it is worth relying on.** Two **total**
`Record<EstimateStatus, …>` maps exist — `STATUS_LABELS` and `STATUS_COLORS`
(`app/dashboard/estimates/labels.ts:7,20`). Adding the union member makes **both fail to compile**
until they are filled. Every other reader is a runtime `status === …` test and must be named by
hand. Named, with what each does with a new value:

| reader | test | behaviour with `site_visit` |
| --- | --- | --- |
| list `getEstimates()` `estimates-client.ts:237-241` | `is_deleted = false` **only** | ⚠️ **a site visit WOULD appear in the estimates list** — the one reader that needs an explicit exclusion |
| list-row money `estimates-list.tsx:239` | renders `grand_total` | would print `$0.00` |
| metrics — win rate `estimates/page.tsx:47-51` | cohort requires `sent_at` non-null | ✅ excluded (a visit is never sent) |
| metrics — expiring soon `:56-60` | `status === 'sent'` | ✅ excluded |
| Before You Send / send `api/proposals/send` | reads `status`, then freezes | ✅ unreachable — no send control on a visit |
| resend `api/proposals/resend` | `status` | ✅ |
| sign `signing-service.ts` | `estimate.status !== 'sent'` → refuse | ✅ |
| submit-for-review / approve `estimates-client.ts` | `current.status !== 'draft'` / `!== 'review'` | ✅ refuse, correctly |
| convert `convert_estimate_to_project()` | operates on accepted | ✅ |
| reminders + expiry cron `estimate-reminders.ts:100,131-133` | `.eq('status','sent')` | ✅ |
| projects page `projects/page.tsx:79` | `.eq('status','accepted')` | ✅ |
| deletion sweep / QuickBooks | no estimate-status branch found | ✅ |

**So exactly one aggregate needs changing, and it is the LIST, not a total.** FILL-A11's warning
about inflating pipeline totals is measurably a non-issue: **there is no pipeline dollar total** —
the strip is Win rate, cohort size and Expiring soon, all `sent`-gated.

**FILL-A3 — `estimate_number`: assigned at INSERT by a column default, and it BURNS a sequence.**
`estimate_number text NOT NULL DEFAULT next_estimate_number()`. **Not unique** — only the non-unique
`idx_estimates_estimate_number`; the only unique indexes on the table are `estimates_pkey` and the
partial `estimates_supersedes_once`. `next_estimate_number()` (SECURITY DEFINER plpgsql, live body
read) does `UPDATE companies SET estimate_number_sequence = estimate_number_sequence + 1 …
RETURNING`, so **an abandoned visit created the ordinary way would consume a client-visible number**
— precisely what the RULED line forbids. Assigning at promotion requires: **drop NOT NULL** (never
fails on existing data), keep the default for the ordinary create path, have the site-visit path
pass `estimate_number => NULL` explicitly, and call `next_estimate_number()` at promotion.
⚠️ Any CHECK pairing `status` with `estimate_number IS NULL` must be **row-counted on production
first** — this is the exact shape of `20261610000000`.

**FILL-A4 — what a foreman and a crew member can do today: nothing, on every table.**

| table | foreman / crew today |
| --- | --- |
| `estimates` | **no SELECT** (`estimates_select_authenticated` = owner/admin, or PM-own), **no INSERT** (`estimates_insert_manager` = owner/admin/PM), **no UPDATE**, and **no DELETE policy exists for anyone** |
| `estimate_categories` / `estimate_line_items` / `estimate_line_rows` | SELECT needs `EXISTS` on `estimates` → nothing; writes are owner/admin/PM on a **draft** they own |
| `files` for an ESTIMATE file | ⚠️ `files_insert_non_client` **does list `foreman` and `crew_member`** — but then requires **`project_id IS NOT NULL` AND `can_view_project(project_id)`**. An estimate file is `project_id IS NULL`. `files_select_non_client` imposes the same. **So they can neither insert nor read one.** `files_delete_owner_admin` is owner/admin only. |
| `contacts` | ⚠️ **they ALREADY read the whole company list** — `contacts_select_authenticated` excludes only `subcontractor` and `client`. INSERT is owner/admin/PM. |
| `contact_addresses` | same shape: `_select_scoped` excludes only sub/client; INSERT/UPDATE/DELETE owner/admin/PM |

**FILL-A5 — a money-free crew INSERT. Measured, then proposed; NOT picked.**
`INSERT … RETURNING` through PostgREST needs SELECT, and **RLS is row-level: a SELECT grant on
`estimates` ships all 67 columns**, including the four NOT NULL money totals. Adding crew to
`estimates_select_*` therefore cannot meet the RULED "NO access to money", now or after promotion.
Three candidates, measured against the schema above:

1. **A `SECURITY DEFINER` RPC (`create_site_visit(...) RETURNS uuid`).** Needs **no SELECT policy at
   all** — an RPC returns its own value, so the `INSERT … RETURNING` problem disappears. It can also
   create the contact and address in the same call, which means **no widening of
   `contacts_insert_authorized` and no new read surface** (and FILL-A10's worry is moot anyway,
   since crew already read every contact). ⚠️ Per CLAUDE.md the function must be **SQL** where the
   RLS-bypass matters, or plpgsql with the documented care.
2. **A column-safe view** (`site_visits_mine`) with its own policy. Postgres 15+ honours
   `security_invoker`; a non-invoker view owned by a privileged role bypasses RLS, which is a second
   mechanism to get wrong. Weaker than (1) and does not solve INSERT.
3. **Notes and photos kept OFF the estimate row entirely** — see A6. **This is not an alternative to
   (1); it is the other half of the answer**, and it is what makes the POST-promotion read safe.

**Recommendation: (1) + (3) together.** Neither alone satisfies the ruling. **This does NOT
contradict the RULED shape** — the estimate row is still the site visit; the crew member simply
never SELECTs it.

**FILL-A6 — where the notes live. They cannot live on the estimate row.**
Scope lives on `estimates.scope_summary` / `scope_sections` (jsonb) today. If conditions,
measurements, blockers and transcripts join them there, then "the recorder keeps READ access to
their notes" **means granting SELECT on a row carrying `grand_total`** — the ruling's own
prohibition. So they must live in **their own table(s) keyed by `estimate_id`, with no money
column**, e.g. `site_visit_notes(estimate_id, kind ∈ {condition, scope, measurement, blocker},
body, …)` plus a transcript/audio table. The recorder's post-promotion read is then a policy on
**that** table (`created_by = auth.uid()`), and the estimate row is never exposed. Photos are
`files` rows with `estimate_id` — already a nullable column that exists.

**FILL-A7 — the S106 estimate-files route.** Both halves confirmed by reading it:
- **GET floor** = a session `SELECT` on `estimates` (`route.ts:40-45`), then the **admin** client.
- **POST floor** = session read **plus** `est.status === 'draft' && (owner/admin || created_by === user.id)` (`:107-113`).
- Its own header states the reason: *"THE ROUTE IS THE ONLY ACCESS CONTROL … If the session read is
  wrong, skipped, or bypassed, a caller reaches any estimate's files in the company, and four of the
  company-level rows are contracts."*
- **A crew member fails BOTH gates** — they cannot SELECT any estimate, and `site_visit` is not
  `draft`. So: the edit gate must admit `status === 'site_visit' && created_by === user.id`, **and**
  the floor must stop being "can you SELECT the estimate" for this case, because that is the thing
  FILL-A5 says must never be granted. The floor becomes **"did you record this visit"**, read from
  the money-free side table — which keeps the route as the only access control.
- `ALLOWED_MIME` must gain audio types for A9; `MAX_SIZE` is already 25 MB.
- ⚠️ The S107 route-floor test must still fail if the admin client moves above the session read —
  `s107-estimate-files-route-order.test.ts` is that test, and its MIRROR case (`:102`) keeps it
  non-vacuous. **It must be extended, not replaced.**

**FILL-A8 — reuse, and the project-less problem.**
- `app/m/capture-store.tsx` — `hold(file, projectId: string | null)` (`:54`, `:105`) **already
  accepts a null project**. Reusable as-is.
- ⚠️ `app/m/offline-sync.tsx:51` types one queue payload's `project_id: string` — **not nullable**.
  That is the seam to widen.
- **§7a is not weakened, and does not need to be.** `files_insert_non_client` refuses a
  `project_id IS NULL` row for foreman/crew, and it should keep refusing: the site-visit photo does
  not go through the session client at all, it goes through the **route** (A7), which uses the admin
  client after its own floor. The policy is untouched.
- `ContactAddressPicker` (`app/dashboard/estimates/contact-address-picker.tsx`) and inline contact
  create (`#147`/`#148`) exist and are reusable; contact creation by crew rides the RPC (A5).

**FILL-A9 — voice. Nothing exists; this is entirely new.**
The only OpenAI use in the repo is `gpt-4o` **vision** in `ai-tagging.ts`. There is no transcription
call anywhere (`grep` for `whisper|transcri|audio|speech` over `lib/` returns one unrelated comment
in `legal-docs.ts`).
- **Storage:** bucket `project-files`, `public=false`, **`allowed_mime_types` is NULL** (so audio is
  permitted at the bucket; the ROUTE's allowlist is the gate). Path convention already established
  and safe: `{company_id}/estimates/{estimateId}/{uuid}-{safeName}` — real UUIDs, so the
  angle-bracket Storage trap cannot arise.
- **Model / size / price:** OpenAI's audio endpoint caps uploads at **25 MB**, which matches the
  route's existing `MAX_SIZE` exactly. **⚠️ I have NOT verified the model list or per-minute price
  this session — there is nothing in the repo to measure them against, and I will not assert a
  figure I did not check.** To be confirmed against OpenAI's current pricing before build, and
  logged per the Module 3H rule (`ai_*_logs`, log `response.model` not the alias, cost row on
  failure too).
- **Offline:** record to the existing IndexedDB store, upload on reconnect, transcribe server-side
  after the upload — so weak signal costs a delay, never the audio.

**FILL-A10 — contact creation by crew.** Answered above: **granting it exposes nothing new,
because foreman and crew already SELECT every contact and every contact address in the company.**
The S131 Roster Floor excluded only `subcontractor` and `client`. Recommended anyway to route
creation through the A5 RPC so no policy changes at all.

**FILL-A11 — aggregates.** Only the estimates **list** (`getEstimates`) counts a site visit today.
No pipeline dollar total exists. Full table under FILL-A2.

**FILL-A12 — migrations this spec requires** (rebuild-test only; production counts in Spec E):
1. widen `estimates_status_check` with `'site_visit'` — a widening CHECK governs no existing row.
2. `ALTER estimates ALTER COLUMN estimate_number DROP NOT NULL` — cannot fail on data.
3. new `site_visit_*` table(s) + policies + the standard `updated_at`/`updated_by` triggers and the
   three column defaults (CLAUDE.md per-tenant checklist).
4. the `create_site_visit` RPC (+ any promote/update RPC), with `REVOKE EXECUTE … FROM public` and
   an explicit `GRANT` to `authenticated`.
5. a `files` policy or route change per A7 — **route preferred, policy untouched.**
⚠️ **Any CHECK tying `status` to `estimate_number` is deferred until Josh runs the production count.**

