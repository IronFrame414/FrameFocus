# Module 7 — completion audit — **S150**

> **Read-only audit.** No code was changed to produce this document.
> **Date:** 2026-08-18. **Branch:** `feature/7i-stage2-m7-m9`. **Base:** `main` @ `30b2a24`.

---

## §0 — Method, and its limits

Everything marked **[LIVE]** was read from the running `framefocus-rebuild-test`
database (`nmyphyhmfttxkdoposvf`) through `scripts/live-sql.mjs`, which queries
`pg_proc`, `pg_policies`, `information_schema` and
`supabase_migrations.schema_migrations` directly. Everything marked **[REPO]**
was read from files at the commit above. Everything marked **[UNVERIFIED]** is
something I could not check and am not asserting.

**Why this matters here specifically.** Migration files are not the schema. A
later migration supersedes an earlier body, and specs in this repo cite
superseded ones — `7I-spec.md` §5.1a cites `20260731030000` as the owner of
`convert_estimate_to_project`, which is **two revisions stale**. S143 shipped a
defect on exactly that drift. This audit therefore reads `pg_proc`, not
migrations, wherever a function body is at issue.

### Three things I could not verify, stated rather than guessed

1. **Production.** Only rebuild-test is linked. I have **no read of the
   production database at all**. Every statement below about "applied" means
   *applied to rebuild-test*. The question "which migrations are applied to
   rebuild-test but not production" — which this audit was asked to answer —
   **cannot be answered from this environment.** It needs either a production
   link or a `schema_migrations` export from production. This is the single
   largest gap in this document and it is not closeable from here.
2. **`supabase db dump`** needs Docker, which is not installed in this
   Codespace. That is why the Management API route exists.
3. **Runtime behaviour of anything not covered by a live harness.** Where a
   claim is "the code appears to do X", it is marked as such.

---

## §1 — Migration state **[LIVE]**

At the time of the audit: `schema_migrations` held **108** rows against **109**
migration files — the one difference being `20261002000000_7i_e1_contract_status_decoupling.sql`,
written this session and then still unpushed.

**UPDATED [S150, later the same session]:** `20261002000000` has since been pushed
to rebuild-test and `database.ts` regenerated clean. **Local and applied now match
exactly.** There is no orphan migration and no drift in either direction.

**Production status: [UNVERIFIED].** See §0.

---

## §2 — Sub-module status

Legend: **Built** = code and schema present and reachable. **Drifted** = shipped
behaviour disagrees with a document. **Claim-only** = an acceptance criterion
with no test asserting it.

### 7A — Expenses / job cost — **BUILT**

`expenses`, `expense_allocations`, `expense_payments` all live **[LIVE]**.
Spec `7A-spec.md` **[REPO]**. Harness: `s97ct-*` family covers budget writers,
immutability, and the budget floor.

**No drift found.** `enforce_expenses_column_scope` carries the service-role
escape (`auth.uid() IS NULL → RETURN NEW`) that `#1-s143` found missing on 6A's
equivalent **[REPO, `TECH_DEBT.md`]**.

### 7B — Contract value derivation — **BUILT, and the old column is gone**

**[LIVE]** `projects.contract_value` — **0 columns**. `project_budget_items.budgeted_amount`
— **0 columns**. `project_financials` — **1 table**.

This confirms CLAUDE.md's Financial Visibility Floor status table and refutes the
older "DB-level floor is NOT yet in place" text it supersedes. Revised contract
is derived (`contract-value.ts`), never written — `#80` closed by derivation.

### 7C — Payables / sub schedules — **BUILT, with one live display defect**

**⚠️ DRIFT — `retainage_shape` is ignored when printing a percentage.**
`contracts-panel.tsx` reads `retainage_shape` at **:1017** for editing **[REPO]**,
but the "Retainage held" line prints `({n}% across payments)` whenever
`retainage_percent` is non-null, without consulting the shape **[REPO, ~:885]**.
For `final_hold` that sentence is false: nothing is withheld across payments.

This was flagged to me as a known issue in the S150 brief and I confirm it is
still present at `30b2a24`. **Not fixed in this session** — it is 7C UI and no
ruling covered it.

### 7D — Client invoicing — **BUILT**

`invoices`, `invoice_lines`, `invoice_cost_claims`, `invoice_hour_claims` live
**[LIVE]**. Extensive harness coverage (`s97ct-partial-billing`,
`s97ct-remaining-to-bill`, `s97ct-deposit-credit`, `s97ct-retainage-passthrough`,
`s97ct-multi-instrument`, `s97ct-standalone-income`).

**This is the best-tested sub-module in Module 7** and the only one where the
acceptance criteria are mostly *asserted* rather than claimed.

### 7E — Payments — **BUILT**. Harness `s97ct-7e-clicktest`.

### 7F — Lien releases — **BUILT; its editor changed under it at S150**

All three tables live with Owner/Admin RLS including SELECT **[LIVE]**:
`lien_release_templates`, `lien_release_template_boxes` (4 policies — it has the
DELETE policy), `lien_releases`. Harness `s140-lien-releases`,
`s146-generate-route`.

**Changed at S150 and NOT click-tested:** 7F's private box editor was replaced by
the shared `components/box-map/box-map-editor.tsx`, and its settings page now
prefetches box maps. This closed `#1-7i` and fixed `#2-7i` (the editor opened on
an empty map and wiped a placed one on save). Josh accepted the untested risk
explicitly. **7F's renderer is unchanged** — `fitTextToBox()` still shrinks to
`MIN_FONT_SIZE`, so 7F's new placement warning is advisory where 7I's will block.

### 7G — QuickBooks — **BUILT (scaffolding), gated**

`qb_read_budget`, `qb_sync_queue`, `qb_webhook_events` live, one SELECT policy
each, Owner/Admin **[LIVE]**. Harnesses `s143-qb-scaffolding`,
`s148-qb-connection`, `s149-qb-queue-webhooks`.

**Note [LIVE]:** these three tables have **SELECT only** — no INSERT/UPDATE
policy at all. Every write is service-role. That matches the signing-table
pattern and appears deliberate, but I found no spec sentence stating it, so it
is **built-but-undocumented**.

### 7H — Reporting — spec `7h1-spec.md` present **[REPO]**. Not separately audited; no 7H-specific tables exist and its content is read-model work over 7A–7E.

### 7I — Contracts — **stage 1 BUILT; stages 2–4 SPECCED-BUT-UNBUILT**

**[LIVE]** five tables, all Owner/Admin including SELECT:

| Table | Policies |
|---|---|
| `contract_templates` | select/insert/update |
| `contract_template_boxes` | select/insert/update/**delete** |
| `contract_documents` | select/insert/update |
| `contract_document_attachments` | select/insert/update |
| `contract_signing_sessions` | **select only** |

**Unbuilt:** E2 (send route, render v1, N-recipient sessions, completion RPC, v2,
notary path), F (sub notary), G (client payment schedule) — **held for an attended
session with click-testing [RULED S150]**, not deferred by accident. E1 is built,
pushed and green (`s150-e1-contract-decoupling`, 3/3). §6.5's sub e-signature is
held behind Gate 1 by ruling. The §3.2 send-route defect (a live signing token for
an email never sent) was fixed separately this session.

---

## §3 — Where a document contradicts the applied schema

Five were known going in. I found **eight**.

| # | Claim | Where | Reality **[LIVE unless noted]** |
|---|---|---|---|
| 1 | Acceptance criterion 15: the PM gate is "a UI gate; the DB floor is the separate FINANCIAL-RLS-FLOOR follow-up" | `7I-spec.md` §12 | **False, both halves.** The floor landed at S97 and all five 7I tables are Owner/Admin **including SELECT**. Already recorded in `TECH_DEBT.md` this session. |
| 2 | `contracts-shared.ts` does not exist | `7I-spec.md` §11.1 | **False** — 273 lines at `30b2a24` **[REPO]**. Quoted-and-corrected in the spec, but the stale text is still readable as current. |
| 3 | 7F supplies "the box-placement component" as a 7I prerequisite | `7I-spec.md` §13 | **Misleading.** 7F supplied a *component* but not a *reusable* one; it was a private function. Superseded at S150 by the extraction. |
| 4 | `convert_estimate_to_project` is owned by `20260731030000` | `7I-spec.md` §5.1a | **Two revisions stale.** Live body is byte-identical to `20260817000000` — verified by diffing `pg_proc.prosrc` against the migration this session. |
| 5 | Attachments are stage 1 | `7I-spec.md` §13 | **Mis-sequenced.** Every column hangs off `contract_documents`, which stage 2 creates. Table shipped at S150 in the slice-B migration; the UI is still unbuilt. |
| 6 | `change_orders_select_visible` has "no role floor, no author scoping" | superseded text quoted in `CLAUDE.md` | **False, and CLAUDE.md already corrects it.** Live: `... AND (role IN (owner,admin) OR (role = project_manager AND created_by = auth.uid()))`. Confirmed verbatim **[LIVE]**. |
| 7 | GATED.md role-check FAILs #1/#3 — "instrument_rates has no role floor, PM/Foreman/Crew read rates from the API" | `GATED.md:249` | **STALE — now fixed.** `instrument_rates_select_company` no longer exists (0 rows in `pg_policies`); live policies are `instrument_rates_select_owner_admin` + `instrument_rates_insert_authorized`. **✅ GATED.md CORRECTED [S150] — the row now reads resolved, with the superseded text quoted.** |
| 8 | GATED.md FAIL — "a PM rewrote `projects.contract_value` to 999999" | `GATED.md:251` | **STALE — the column no longer exists** (0 rows in `information_schema.columns`). Contract value lives on `project_financials`, Owner/Admin on all three verbs, no DELETE policy. The exploit is not reproducible. **✅ GATED.md CORRECTED [S150].** |

**Findings 7 and 8 mattered beyond bookkeeping.** `GATED.md` is described in the
brief as "the live gate register", and it was carrying two security FAILs the
database had since closed — a reader deciding what to work on would rank them
highly and find nothing to fix.

**✅ CORRECTED [S150, ruled].** The Gate 1 role-check table now shows all five
failures resolved, each against what was read from `pg_policies` /
`information_schema`, with the original findings quoted rather than deleted. The
"Still owed" entry for the `FINANCIAL-RLS-FLOOR` migration is struck through and
marked done. **One caveat carried into that correction:** `change_orders.net_delta`
is the fourth figure family and is still not fully DB-enforced — deliberately, per
`#117` — so the correction says so rather than implying the whole floor is closed.

---

## §4 — Acceptance criteria: asserted vs claim-only

7I's §12 has 19 criteria. At `30b2a24`, **stage 1 is the only part built**, so
most are not yet assertable. Of those that are:

| Criterion | Status |
|---|---|
| 1 — toggle off ⇒ behaviour byte-identical | **Claim-only, but structurally true**: `clientContractAppliesToEstimate` has zero callers in `app/` **[REPO]**, so nothing reads the flag. Whoever wires the first consumer inherits the obligation. |
| 10 — a value that will not fit warns | **Partially asserted.** Placement-time warning exists and over-warns by ruling. **Render-time is unbuilt**, so R10's "blocks the send" is claim-only. |
| 11 — contractor signature stamps from `companies.contractor_signature_path`, no new capture built | **Holds [REPO]** — no signature capture was added by 7I. |
| 15 — a PM cannot generate/send/void | **Asserted** by `s146-C1/C3/C4` for template CRUD, document reads and void authority. Generate/send are unbuilt. |
| 16 — 7I writes no `contract_value`, no `client_contracts.status` | **Was true; E1 deliberately changes the second half.** E1 makes the *conversion RPC* write a corrected status. The criterion should be reworded to "7I's own services write neither", or it will read as violated. **Flagged, not silently amended.** |
| 2,3,3a–3c,4–9,12–14,17–19 | **Claim-only** — the features are unbuilt. |

**The honest summary:** 7I stage 1 has genuine test coverage (23 assertions in
`s146-contract-services`, plus `s145-contracts`). Stages 2–4 have none because
they do not exist.

---

## §5 — Gates, and whether their rationale survives

| Gate | Stated block | Survives? |
|---|---|---|
| **Gate 1** — external-surface gate (RESEND secret, domain cutover, login branding) | Blocks 7I §6.5 sub e-signature | **Survives.** Josh re-affirmed it at S150 ("hold on this"). Nothing in the repo lifts it. |
| **Gate 3** — 7D–7H specs | "blocked on reconciliation + decisions, not on code" | **Largely spent** — 7D–7H specs all exist **[REPO]**. Worth re-reading; it may be closeable. **[UNVERIFIED]** whether every listed decision was made. |
| **Gate 4** — notifications behind PWA install | manifest / service worker / icons "absent" | **STALE.** `notifications` shipped (`20260905000000`) and `notify()` is live with delivery on both surfaces — `7I-spec.md` §14 already carries this correction. Whether the *PWA install* half still holds is **[UNVERIFIED]** — I did not audit `public/` for a manifest this session. |
| **Pre-Module 9 gate** — hosted portal vs. magic-link tokenised pages | Blocks Module 9 | **Survives, and is untouched.** See the M9 documents. |

---

## §6 — Open tech debt that this audit confirms is still real

- **`#1-m7cpl`** — the Financial Visibility Floor says foreman sees actual **and
  committed**; `budgetColumnsFor()` ships foreman as `actual_only`, 3 columns,
  `seesCommitted: false` **[REPO, `invoices-shared.ts:467`]**. **Still divergent.**
  Neither side was changed at S140 or since, deliberately. This needs a ruling.
- **`#117`** — `change_orders.net_delta` remains UI-only for a PM's *own* COs. The
  read floor is real (finding 6); the residual is narrow and deliberate.
- **`#3-7i`** — superseded: box placement is no longer typed-only. Can be closed.
- **7C retainage shape** (§2, 7C) — unfiled. Recommend filing.

---

## §7 — What I recommend next, in order

1. **Answer the production-migration question** — it is the one thing this audit
   was asked for and could not produce. Everything else here is verified.
2. ~~**Re-run GATED.md's role-check table.**~~ **✅ DONE [S150]** — all five
   failures marked resolved against live reads.
3. **Rule on `#1-m7cpl`** before 7H reporting surfaces make the foreman
   divergence visible in more places.
4. **Reword acceptance criterion 16** to survive E1.
