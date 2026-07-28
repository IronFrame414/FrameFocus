# 7B-spec.md — Contract Value & CO Write-Through (Closed by Derivation)

**Status:** SPEC — locked interview decisions (Session 89) + Phase 2 answers confirmed. Not built.
**Design authority:** `docs/specs/module7-architecture.md` §7.2 (7B row), §7.11 (negative CO),
§7.12 #9, as amended S89. **This spec supersedes the §7.2 "write through" wording** — Option B
(derivation) was locked S89; the architecture row's amendment is owed (§6 open items).
**Phase 1 verification:** every claim below was read against the live repo this session
(file:line cited). Git is ground truth over any prior spec claim.
**Protocol:** written on branch `feature/7a-spec`, uncommitted. No SQL run, **zero migrations in
this spec.** No other file touched.

---

## 0. The rule (locked, S89)

1. **`projects.contract_value` is NEVER mutated** (Option B). It permanently holds the original
   contract value set once at conversion (`convert_estimate_to_project`,
   `supabase/migrations/20260704212000_module5_5a_conversion.sql:150,157` — the only writer,
   before and after 7B).
2. **Revised contract value = original + Σ(client-signed CO `net_delta`)** — bidirectional; a
   negative CO lowers it. `net_delta` is already signed and can be negative
   (`20260704215000_module5_5d_change_orders.sql:59-60`).
3. **"Signed" means CLIENT-signed.** Verified: the only writer of `status='signed'` in the app is
   the client token flow (`apps/web/lib/services/co-signing-service.ts:179`,
   `completeCoSignature`). Contractor signing at send sets only `contractor_signed_*` +
   `status='sent'` (`app/api/change-orders/[id]/send/route.ts:202-214`). No conflict exists in
   code; this spec pins it as a rule so none is ever introduced.
4. **One shared derivation (P3).** A single service function is the only legal read of revised
   contract value. No trigger. No stored revised column. Optional DB view — PROPOSED-deferred
   (§2.3).
5. **Voided COs drop out automatically** via the status filter (`voided ≠ signed`). No unwind
   logic exists or is needed.
6. **Visibility = the financial floor.** Revised contract value appears only where Contract
   already appears — Owner/Admin surfaces per ui-01 §11. All four current surfaces already gate
   via `canSeeFinancials` (§4). Hidden from PM/foreman/crew.
7. **Future material-selection COs ride this path unchanged** (§7.8.6): a selection that becomes
   a signed CO contributes its `net_delta` like any other — the derivation does not know or care
   where a CO came from.

This **closes TECH_DEBT #80 by derivation, not write-through** — the deferred "write-through" is
deliberately not built; the reconciliation #80 asked for is the shared derivation (§6, closure
note owed at wrap).

---

## 1. Acceptance example

> Stevens job (the 5D/signed-artifact precedent). Original contract at conversion: **$42,000**
> (`projects.contract_value`). PROPOSED until run against a real Bishop job.

**CO-1042-01 — the $1,200 tile overage (§7.8.6 shape).** Client picks tile $1,200 over its
allowance. A CO is written (fixed_price, one material row), `net_delta = +1200`, sent —
contractor signs at send (`status='sent'`, `contractor_signed_at` set). **At this moment the
revised contract value is still $42,000** — rule 3: a sent, contractor-signed CO contributes
nothing. Jill signs via the token page → `completeCoSignature` sets `status='signed'`
(`co-signing-service.ts:179`).

```
getRevisedContract(project)  →  { original: 42000, signedDelta: +1200, revised: 43200 }
```

**CO-1042-02 — negative CO, scope removed (§7.11).** The clients cut the second vanity:
`net_delta = −800` (credit rows are normal rows with negative values, D-2). Sent, then
client-signed.

```
getRevisedContract(project)  →  { original: 42000, signedDelta: +400, revised: 42400 }
```

The revised total went **down** from $43,200 — bidirectional with zero special-casing: the Σ is
over signed values. The credit comes off what remains owed (7E's concern, not 7B's).

**CO-1042-03 — voided.** A third CO (`+2,500`) is sent, then voided before signature
(`status='voided'`). It never entered the Σ and never will — no unwind (rule 5).

**Throughout:** `projects.contract_value` still reads **42000**. Nothing mutated it. The overview
KPI shows **Contract (revised): $42,400** with caption **Original: $42,000** — Owner/Admin only.
PM Sarah's overview reflows without the Contract KPI, exactly as today
(`app/dashboard/projects/[id]/page.tsx:88,105-121`).

---

## 2. The derivation

### 2.1 Definition (the single source of truth)

```
revised(project) = projects.contract_value
                 + Σ change_orders.net_delta
                   WHERE project_id = project
                     AND status = 'signed'        -- client-signed only (rule 3)
                     AND is_deleted = false

original = projects.contract_value    (never mutated)
revised  = null  when original is null (mirrors today's null-handling, page.tsx:92-93)
signedDelta is always returned, even when original is null.
```

- `status='signed'` is reachable **only** through client signature — verified single writer
  (`co-signing-service.ts:179`). Voided/draft/sent contribute nothing.
- **`requires_client_signature` stays dormant (Q4, confirmed):** the column
  (`20260704215000:66`, `DEFAULT true`) has zero code references. The derivation keys on
  `status='signed'` alone. No internal-acceptance bypass exists or is built — one would violate
  rule 3. Documented as dormant scaffolding; drop is a future migration decision, not taken here.

### 2.2 `apps/web/lib/services/contract-value.ts` (new file — the only legal read)

```typescript
/** The ONE filter that defines "contributes to contract value" (P3).
 *  Every consumer — both functions below, the deferred view (§2.3), any
 *  future 7D/7G/7H read — derives from THIS constant, never re-states it. */
export const CONTRACT_CONTRIBUTING_CO_FILTER = {
  status: 'signed',      // client-signed only — co-signing-service.ts:179
  is_deleted: false,
} as const;

export interface RevisedContract {
  original: number | null;   // projects.contract_value, never mutated
  signedDelta: number;       // Σ net_delta of contributing COs (signed values, ± )
  revised: number | null;    // original + signedDelta; null when original is null
}

/** Per-project derivation. Server-side (supabase-server). */
export async function getRevisedContract(projectId: string): Promise<RevisedContract>;

export interface PortfolioRevisedContract {
  originalSum: number;       // Σ contract_value over active projects
  signedDeltaSum: number;    // Σ net_delta of contributing COs on those projects
  revisedSum: number;        // originalSum + signedDeltaSum
}

/** Portfolio derivation for the dashboard KPI (active projects, RLS-scoped —
 *  Owner/Admin see all, matching dashboard.ts's existing session-client posture). */
export async function getPortfolioRevisedContract(): Promise<PortfolioRevisedContract>;
```

Both functions apply `CONTRACT_CONTRIBUTING_CO_FILTER`; neither takes a status parameter — there
is no legal variant. PROPOSED implementation detail: two queries (projects + grouped CO sums),
no N+1.

Client components never derive: they receive the computed values as props from server pages
(the existing pattern — `changes-panel.tsx` and `projects-list.tsx` already take server-computed
props).

### 2.3 DB view — PROPOSED-DEFERRED (Q2, confirmed: no migration now)

Specced once so it is written once; **built only when 7G/7H needs a SQL-side read:**

```sql
-- PROPOSED-DEFERRED — do NOT create until a reporting consumer exists.
CREATE VIEW public.project_revised_contract AS
SELECT p.id AS project_id,
       p.company_id,
       p.contract_value                       AS original,
       COALESCE(SUM(co.net_delta), 0)         AS signed_delta,
       p.contract_value
         + COALESCE(SUM(co.net_delta), 0)     AS revised
FROM projects p
LEFT JOIN change_orders co
       ON co.project_id = p.id
      AND co.status = 'signed'                -- MUST mirror CONTRACT_CONTRIBUTING_CO_FILTER
      AND co.is_deleted = false
GROUP BY p.id, p.company_id, p.contract_value;
-- Views run with invoker RLS on the underlying tables (security_invoker at
-- creation — decide at build); revised is floor-gated data, so any grant must
-- honor ui-01 §11 / the FINANCIAL-RLS-FLOOR migration when it lands.
```

7B v1 ships **zero migrations**.

---

## 3. Call-site migration list (from Phase 1b/1c — the complete set)

| # | Site | Today | Change |
| --- | --- | --- | --- |
| 1 | `app/dashboard/projects/[id]/page.tsx:91-93` | inline `contract_value + Σ signed net_delta` | replace with `getRevisedContract(projectId)` |
| 2 | `app/dashboard/projects/[id]/page.tsx:509-513` | shows original as the Contract figure | **Revised becomes the headline Contract KPI, Original the caption** (Q5, confirmed) |
| 3 | `app/dashboard/projects/[id]/budget/page.tsx:53-54` | inline `contractValue` + `signedCoTotal` | replace with `getRevisedContract(projectId)`; header shows revised + original caption |
| 4 | `app/dashboard/projects/[id]/changes/changes-panel.tsx:118-119` | `signedSum` computed in-panel | `signedSum` prop fed from `getRevisedContract().signedDelta` (server page passes it); `sentSum` ("awaiting") is NOT contract value — unchanged |
| 5 | `lib/services/dashboard.ts:39,74-83` | portfolio Σ `contract_value` + company-wide signed-delta query | replace with `getPortfolioRevisedContract()`; `awaitingSum` (`:83`) unchanged, out of 7B scope |
| 6 | `app/dashboard/projects/projects-list.tsx:244-248` | Contract column = original | **switches to revised** (Q3a, confirmed): the projects page fetches grouped signed deltas via the shared module and passes revised per row; column label stays "Contract"; Owner/Admin-only gate unchanged (`:22,85`) |
| 7 | `lib/services/change-orders.ts:119-132` | `getSignedChangeOrders` + formula comment (`:116-117`) | function stays (the changes panel lists signed COs); its comment repoints to `contract-value.ts` as the derivation authority |

**Explicitly-original sites (no change):** `convert_estimate_to_project`
(`20260704212000:150,157`) — the one writer; `budget.ts:33` comment (budget≠contract by design).
**Excluded — different table:** `contracts-panel.tsx:60,149,261` reads
`client_contracts.contract_value`, not `projects`. Do not migrate it.

Nothing else in `apps/web` reads `projects.contract_value` (grep, Phase 1c — complete list).

---

## 4. UI (screens, roles, entry points, nav)

**No new screens, no new routes, no nav change.** 7B is a correctness pass on four existing
Owner/Admin surfaces; PM/foreman/crew see exactly what they see today (reflowed layouts, no
dollars). Roles below are enforced by the existing `canSeeFinancials` gates — file:line cited.

| Surface | Entry point / nav | Change | Role gate (existing) |
| --- | --- | --- | --- |
| Project overview | Projects → [project] (`/dashboard/projects/[id]`) | Contract KPI = **Revised** headline, **Original: $X** caption (Q5); values from the shared fn | `page.tsx:88,105-121,509` |
| Budget header | Project → Budget tab (`/dashboard/projects/[id]/budget`) | Contract summary = revised + original caption + signed-CO delta line, all from the shared fn | `budget/page.tsx:45,57-83` |
| Changes panel summary | Project → Changes tab (`/dashboard/projects/[id]/changes`) | "Signed" $ caption sourced from `signedDelta` prop; "Awaiting" caption unchanged | `changes-panel.tsx:52,114-143,279` |
| Dashboard KPI | `/dashboard` (nav: Dashboard, `dashboard-shell.tsx:48`) | Portfolio Contract KPI = `revisedSum` (was original-sum + delta inline) | `dashboard.ts` RLS + existing KPI gating |
| Projects list | nav: Projects (`dashboard-shell.tsx:49`) | Contract column value = revised per project (Q3a); label unchanged | `projects-list.tsx:22,85` |

Presentation rule (PROPOSED): wherever revised ≠ original, the caption shows the original —
"Original: $42,000" — so the derivation is inspectable at a glance; when no signed COs exist,
revised = original and no caption renders (zero visual change for CO-less projects).

---

## 5. Hooks & ties (verified this session)

| Hook | Where | 7B relationship |
| --- | --- | --- |
| Only `signed` writer | `co-signing-service.ts:179` (client token flow) | rule 3's ground truth; send route flips only draft→sent (`send/route.ts:202-214`) |
| `net_delta` signed, negative-capable | `20260704215000:59-60`; recomputed on row edits (`change-orders-client.ts:420,514`) | the Σ operand; bidirectional for free |
| CO status enum | `20260704215000:70` (`draft/sent/signed/voided` — no `approved`) | filter constant; voided drops out (rule 5) |
| `requires_client_signature` | `20260704215000:66`; zero code references | dormant, documented (§2.1) |
| Original's only writer | `20260704212000:150,157` (conversion) | unchanged forever under Option B |
| Existing derivation sites | §3 rows 1–7 | the complete migration list |
| Financial floor gates | `page.tsx:88`, `budget/page.tsx:45`, `changes-panel.tsx:52`, `projects-list.tsx:22,85` | rule 6 already enforced UI-side; DB floor still pending (FINANCIAL-RLS-FLOOR) |
| Material-selection COs (future) | §7.8.6 architecture; no selection table exists (S89 prereq read) | ride the same path unchanged (rule 7) |
| 7A reopen interplay | `7A-spec.md` §2.7/§3.4 | none — reopening a project does not touch CO statuses; a signed CO keeps contributing through reopen/re-complete |

---

## 6. Open items / flagged conflicts (not resolved here)

1. **Architecture §7.2 wording amendment owed:** the 7B row still says "write through to the
   job's contract value" — superseded by locked Option B (derivation). Amend
   `module7-architecture.md` §7.2 (and §7.12 #9's "file as a 7B design point" — satisfied by
   this spec) in the next architecture pass.
2. **7G "Approved change order" term** (`7G-spec.md:149`): the status is `signed` — no
   `approved` exists in the CHECK (`20260704215000:70`). Fix when 7G is next touched; the QB
   contract-adjustment event should key on the same filter constant.
3. **7H "write-through" wording** (`7H-spec.md:119`): substance already matches (original +
   signed COs, up or down — `:60`); the word "write-through" is a misnomer under Option B. 7H
   must consume `getRevisedContract`/the deferred view, never re-derive (its own rule,
   `7H-spec.md:149-150`).
4. **TECH_DEBT #80 closure note owed at wrap:** closed **by derivation, not write-through** —
   the reconciliation exists as the single shared function; the deferred mutation was
   deliberately not built. File the closure per the TECH_DEBT process (move to Closed, grep
   `#80` references — `co-signing-service.ts:108` comment and 5D migration header cite it).
5. **DB view** — PROPOSED-deferred (§2.3); build with the first 7G/7H SQL-side consumer, with
   the RLS/`security_invoker` decision taken then.
6. **FINANCIAL-RLS-FLOOR:** revised contract value is UI-gated only, like every contract figure
   today — a gated role can still read `contract_value` + CO rows via direct API on assigned
   projects (`can_view_project` SELECTs). Unchanged risk, carried to the named floor migration.
7. **`requires_client_signature` disposition** — dormant by decision (Q4); if ever dropped,
   that is a migration + a 5D/signed-artifact doc touch, not a 7B concern.

---

*Written Session 89 on `feature/7a-spec` after Phase 1 verification and Phase 2 approval. Not
committed — Josh commits manually. No SQL run; 7B ships zero migrations by design. Anything
labeled PROPOSED was not locked and is a build-time decision surface.*
