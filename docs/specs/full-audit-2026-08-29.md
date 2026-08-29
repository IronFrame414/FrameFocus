# Full audit — desktop redesign and everything since (17cdf77 → b14806d)

> **Date:** 2026-08-29 · **Tree:** `feature/full-audit` = `main @ b14806d` (64 commits in scope)
> **Read-only.** Nothing was fixed. Live reads: rebuild-test (`nmyphyhmfttxkdoposvf`) via
> `scripts/live-sql.mjs` only. Every claim carries a path and, where it is about code, a line.

---

## SUMMARY

| Section | Findings | One line |
| --- | --- | --- |
| A — citations | **2 drifted, 0 wrong** | Every cited path exists; two coordinates moved (+2 lines / a line-wrap) |
| B — spec vs build | **0 divergences** | Every redesign + PO ruling built as ruled; all 21 register items verified, none a silent gap |
| C — ruling integrity | **0 unruled widenings** · 1 known live exposure confirmed · 1 known doc contradiction confirmed | The audit's core question answers clean |
| D — efficiency | **7** (6 N+1 incl. the known one, 1 serial-loop note) | All bounded-class; none new-catastrophic |
| E — robustness | **4**, all one class | UPDATE writes missing the `applied()` row-count guard — one is from the PO module just merged |
| F — errors | type-check 5/5 · lint clean · build clean · unit **966/966** · live **1491/1493 → 73/73 isolated** · Playwright: see §F | Every red classified; zero regressions |
| G — anything else | **1** | `s146-C5` is now a three-time recurring parallel-run flake; TECH_DEBT candidate |

### The single most consequential finding

**The only live Financial Visibility Floor breach remains the KNOWN one, and it is no worse:**
`client_contracts_select_visible` (live policy, read from pg_policies on rebuild-test) admits every
staff role with project view — `get_my_role() <> ALL ('subcontractor','client') AND
can_view_project(project_id)` — so **PM, foreman and crew can read `contract_value`** on projects
they can view. This is register item **A2**, checkpointed, and this audit confirms it is *exactly*
as described: the write arms are Owner/Admin (or assigned-PM), and there is **no DELETE policy at
all**, so nothing has widened around it. It stays the top of the fix queue it was already at.

**The headline NEW result is a non-finding, and it is the one this audit exists for: no money
approval, recording, release or void authority widened without a ruling.** Every live gate read
from `pg_get_functiondef` matches its recorded ruling (§C2). The "Owner/Admin/PM" loose phrasing
class that motivated this audit has no shipped instance.

### Findings ranked by consequence

1. **A2 confirmed live (known):** PM/foreman/crew read `contract_value` — live policy, §C1.
2. **A20 confirmed (known):** `money-representation.md:3` + `7d1-spec.md:942-989` still state the
   overturned S97 carve-out; the code implements the reversal, the docs contradict it — §C3.1.
3. **NEW — 4 silent-no-op writes (Class E7):** `updatePoLogistics`
   (`po-lines-client.ts:264`), `reorderFileCategories` (`file-categories-client.ts:90`),
   `updateCatalogItem` (`cost-catalog-client.ts:166`), `softDeleteCatalogItem`
   (`cost-catalog-client.ts:184`) — an RLS-refused UPDATE returns `error: null`, the service
   returns success, the user sees "saved" on a write that changed nothing. §E.
4. **NEW — 5 unlogged N+1s** beyond the known `/m/expenses` one — §D (largest:
   `portal.ts:549-587`, 2 queries per invoice head on the client portal).
5. **A21 confirmed (known):** Files does not exclude what Photos shows — ruled, unbuilt, live UX
   overlap.
6. **Citation drift (cosmetic):** two coordinates — §A.
7. **`s146-C5` flake, third sighting** — §G.

---

## SECTION A — citation integrity

Method: every cited path opened; `file:line` citations verified exact / drifted / wrong. Priority
files (project-header, dashboard-shell, theme, tailwind.config, the dialog-sweep set, everything
the PO module added) covered exhaustively; the long tail sampled (~40 line-cites verified in full).
Prior art `desktop-redesign-spec-citation-audit.md` was read first and re-verified rather than
duplicated.

| Document | ✅ | ⚠️ drifted | ❌ wrong | Notes |
| --- | --- | --- | --- | --- |
| `desktop-redesign-spec.md` | 24 verified | 2 | 0 | drifts below |
| `po-module-spec.md` | 11+ verified | 0 | 0 | Fully ground-truthed against the tree in the pre-merge Phase A audit of this same session; merged unchanged at `b14806d` |
| `desktop-redesign-build-log.md` | 5/5 sampled entries | 0 | 0 | all commits exist |
| `outstanding-work-register.md` | all cross-refs resolve | 0 | 0 | all 7 inventory files exist |

The two drifts, both substance-intact:

| Citation | Verdict | Current location |
| --- | --- | --- |
| `invoice-delivery-panel.tsx:175` (lien-releases link) | ⚠️ | **:177** (+2 lines above it) |
| `7i_contracts.sql:504` (void trigger condition) | ⚠️ | **:503–504** (wrapped) |

Schema claims were checked against `packages/shared/types/database.ts`, never a `CREATE TABLE`.
Policy-arm claims were verified LIVE in §C1 (they are not re-listed here).

---

## SECTION B — spec versus build

**Desktop-redesign rulings (R1–R10, §S1–§S2, §7–§8): all built as ruled.** Highlights, each
verified in the current tree: R1 first-visible-sub-tab (`project-header.tsx:227`); R2 role lists
untouched (`project-header.tsx:24-102`, filter at `:161`); R5 token move with brand amber intact
(`theme.ts:20-60`, `brand.ts`); §S1 `/costs` redirect (`costs/page.tsx:7`); §7.1 invoice floor
(`20261038000000_invoice_payment_floor.sql`, keyed `author_member_id`).

**PO-module rulings (R2–R8, R-Q1..Q8, R-L1..L4, R-B1..B3): all built as ruled** — re-verified
post-merge; the spec's final amended text and the merged tree agree (the closeout string and the
three-function drafting service were amended INTO the spec during Phase B, so no residual
disagreement exists).

**The 21 register deferrals: none is a silent gap.** Per-item verdicts:

| Item | Verdict |
| --- | --- |
| A4 (PO module) | **landed-since** — merged at `b14806d` |
| A12 (portfolio rollups) | **landed** — `getPortfolioMoney()`, Owner/Admin, concurrent |
| A1, A3, A5–A11, A13–A19 | **still-deferred**, recorded reasons present where claimed |
| A2 | still-deferred **and live** — see the headline finding |
| A20 | still-deferred **and the docs actively contradict shipped code** — §C3.1 |
| A21 | still-deferred **and user-visible** — Files renders what Photos shows |

---

## SECTION C — ruling integrity

### C1 — the Floor, checked against LIVE policy (pg_policies on rebuild-test)

| Area | Live policy / gate | Expected | Verdict |
| --- | --- | --- | --- |
| Invoices | `invoices_select_visible`: O/A, or PM ∧ `can_view_project` ∧ **`author_member_id = get_my_member_id()`** | PM authored-only, keyed author_member_id | ✅ |
| Payments (client) | `client_payments_*_owner_admin` + `client_payment_applications_*_owner_admin` — all three commands O/A | O/A, PM removed | ✅ |
| Client contracts | `client_contracts_select_visible`: **any staff role** ∧ can_view — `contract_value` exposed to PM/foreman/crew | KNOWN exposure | ⚠️ **confirmed, no worse** (writes O/A or assigned-PM; no DELETE policy) |
| Sub contracts | `subcontractor_contracts_select_visible`: staff ∧ can_view | broadly visible, cost tier | ✅ |
| Budget & Cost | `budgetColumnsFor()` (`invoices-shared.ts:466-489`): full 7 / committed 5 / actual_only 3 / none 0; side tables `project_financials` + `project_budget_amounts` all-commands O/A in live policy | 7/5/3 + DB floor | ✅ |
| Change orders | `change_orders_select_visible`: O/A or PM-authored (`created_by = auth.uid()`); render `changes-panel.tsx:366` `canSeeFinancials && net_delta !== null` → omitted cell, no dash | PM own-only; empty cell | ✅ |
| Profitability | server-side O/A redirect, `profitability/page.tsx:45-46` | O/A, server-repeated | ✅ |
| POs | `purchase_orders_select_visible`: staff ∧ can_view (ungated Deliveries); PDF/panel/email render cost only — no markup/sell symbol anywhere in `po-pdf-data.ts` / `po-lines-panel.tsx` | cost tier, no sell leak | ✅ |
| Expenses | `expenses_select_scoped`: own rows, or the five staff roles ∧ can_view; Bills tab `seesBills` excludes crew (`expenses-page-client.tsx:85`); reviewers O/A (`:82`) | as ruled | ✅ |

### C2 — money authority, from live `pg_get_functiondef` — **nothing widened**

| Function | Live gate | Verdict |
| --- | --- | --- |
| `approve_expense` | O/A ("Only Owner/Admin may approve expenses.") | ✅ |
| `record_expense_payment` | O/A, **and an explicit Owner-ONLY arm: "Retainage release is Owner only."** | ✅ |
| `record_client_payment` | O/A | ✅ |
| invoice void (`enforce_invoice_void_authority`) | O/A (an inner Owner-distinct arm on top) | ✅ |
| CO void | O/A, or the authoring PM | ✅ (as ruled) |
| estimate void | O/A, or the authoring PM | ✅ |
| contract void | O/A | ✅ |
| `issue_po_lines` | O/A/PM | ✅ |
| `mark_po_lines_purchased` | O/A ("it is a review act") | ✅ |
| `flag_po_item_missing` | assigned member, or O/A/PM | ✅ |
| `set_po_total_amount` | O/A/PM + the costed-line refusal (legacy arm only) | ✅ |

### C3 — reversed rulings: did every consequence land?

| Reversal | Verdict |
| --- | --- |
| S97 PM-invoice carve-out overturned | **BROKEN in docs, correct in code.** `money-representation.md:3` and `7d1-spec.md:942-989` still state the carve-out as live; register A20 already tracks it. Nothing *else* in docs/ or code comments cites it as live (swept for "carve-out", "§12a", "amounts ON an invoice"). |
| R5 README text ramp (amended wider) | HELD — `theme.ts:28-50`, `tailwind.config.ts:20-46` carry the full ramp |
| R6 m6m repaint | HELD — palette unified; **`canvas` `#0d1220` and `danger` `#c0362c` did not move** (`tailwind.config.ts:70,76`) |
| §S2 OS chrome to navy | HELD — `brand.ts:74,89` both `#0f1729`, kept as two properties, not aliased |
| PO R2 committed-cost meaning | HELD — origin predicate (`20260730010000:826-891`) untouched by every later migration; `source_po_id` appears in **no** recompute/predicate SQL |

### C4 — standing rulings

| Ruling | Verdict |
| --- | --- |
| Chat notify carries no `roles` entry (A-C27) | HELD — `roles` appears nowhere in `lib/chat/mention-notify.ts` |
| One signature serves CO **and** lien releases | HELD — the one stored `companies.contractor_signature_path` is the instrument for both (`api/change-orders/[id]/send/route.ts`, `api/lien-releases/generate/route.ts` → `lien-release-pdf-service.ts:39`); no second store |
| Release PDF fetches no company logo | HELD — `lien-release-pdf-service.ts` renders only the company's own template + signature; no logo parameter exists; notary path leaves the signature blank (`:42-43,64-66`) |
| PDFs tenant-branded, emails repainted | HELD — PDF loaders read `companies.brand_color`/logo; email templates read the platform theme |
| `/m` nine-tile set: colour moved, structure didn't | HELD — exactly nine tiles, `app/m/p/[projectId]/page.tsx:53-63` |
| Estimates freeze at sent; unsend refused at the DB | HELD — `enforce_estimate_immutability` trigger (`20261031000000:111-150`); no later migration weakens it |
| Selection signature binding; no CO generated | HELD — `selection-lifecycle-service.ts:26-53` states and implements it; no CO-creation code in the lifecycle |

---

## SECTION D — efficiency (bounded classes only)

**Class 1 — N+1 (6):**

| # | Site | Shape / cost |
| --- | --- | --- |
| 1 | `app/m/expenses/page.tsx:144-149` | **KNOWN, logged** — `getExpenseReceipts` per expense (concurrent) |
| 2 | `projects/[id]/contracts/contracts-panel.tsx:557-567` | `listExpenseAllocations` per stage (concurrent) |
| 3 | `lib/services/selections.ts:312-321` | signed URL per option image |
| 4 | `lib/services/selections.ts:454-472` | 2–3 RPCs per selection (portal read) |
| 5 | `lib/services/portal.ts:549-587` | 2 queries per invoice head (portal invoice list) |
| 6 | `lib/services/photos.ts:147-151` | 1–2 signed URLs per file |

**Class 2 — serial where concurrent (1):** `projects/page.tsx:114-134` — serial
`getProfitabilityReport` per project. **Ruled acceptable** for single-digit lists (§8.1 R1), noted
because its sibling `dashboard.ts:236-238` does the same work concurrently — the ruling stands,
the asymmetry is recorded.

**Classes 3, 4, 5 — zero findings.** The gated-role pattern is correctly followed (margin loop
behind `canSeeFinancials`; `getPortfolioMoney` invoked only after the O/A check,
`dashboard/page.tsx:38-48`).

---

## SECTION E — robustness (bounded classes only)

**Class 7 — writes missing the `applied()`/row-count guard: 4 findings (the section's only reds).**
Same pattern in all four: UPDATE without `.select('id')`; an RLS-refused match returns
`error: null` and the service returns success — the user sees "saved" on a no-op.

| # | Function | Site |
| --- | --- | --- |
| 1 | `updatePoLogistics()` | `lib/services/po-lines-client.ts:264` — **from the PO module merged today** |
| 2 | `reorderFileCategories()` | `lib/services/file-categories-client.ts:90` (per-row in a loop) |
| 3 | `updateCatalogItem()` | `lib/services/cost-catalog-client.ts:166` |
| 4 | `softDeleteCatalogItem()` | `lib/services/cost-catalog-client.ts:184` |

**Classes 1–6, 8 — zero findings**, with these positive verifications on record: both purge lists
carry both new tables (`file_categories`, `purchase_order_item_assignments`) and
`e2e/trial-fixture.ts` still imports the shared module rather than a duplicate; all three
`.limit(1)` sites in the window conform to S165 (`email-service.ts:299` is scoped by
`.eq('role','owner')` — one owner per company is an invariant, reconciling CLAUDE.md's older
mention of it); the flag route's two swallowed catches are deliberate and commented
(`po-items/[id]/flag/route.ts:31-33,45-50`); date columns all go through `companyToday()`-derived
values, none through a UTC slice.

---

## SECTION F — errors

| Run | Result | Baseline | Verdict |
| --- | --- | --- | --- |
| `type-check --force` | **5/5, 0 cached**, exit 0 | 5/5 | ✅ |
| Lint (whole repo) | "No ESLint warnings or errors", exit 0 | clean | ✅ |
| `build --force` (cold, `.next` removed) | Compiled successfully, exit 0 | clean | ✅ |
| Unit | **966/966, 65 files**, exit 0 | 959 | ✅ above baseline (PO-module tests added) |
| Live RLS | **1491/1493, 102 files** parallel → **73/73 isolated** | 1483/100 | ✅ above baseline; 3 reds classified below |
| Playwright chunk 1 (m-shell) | **54 passed**, exit 0 | — | ✅ |
| Playwright chunk 2 (m-sections+details+hubs) | **115 passed, 1 failed, 1 flaky, 4 skipped** → m-hubs isolated **34/34**, exit 0 | 117 running | ✅ after isolation; red classified below |
| Playwright chunk 3 (m-photos/capture/chat/hydration + rest of m-) | **255 passed, 1 flaky (passed on retry)**, exit 0 | 256 | ✅ |
| Playwright chunk 4 (desktop+portal+harness) | **120 passed**, exit 0 | 120 | ✅ |

Playwright total: **547 across the four chunks** (~530 baseline) — no spec file silently absent
(every file enumerated explicitly in the chunk commands).

**Every red, named:**

| Red | Class | Evidence |
| --- | --- | --- |
| `s138-trial-unlock` (file-level) | **DB statement timeout in the shared purge under parallel load** — not an assertion failure | `company-purge.ts:94` "canceling statement due to statement timeout"; green in isolation |
| `s146-contract-services` C5 | **S167-class contamination** — company-wide toggle raced by a parallel suite; **third sighting this week** | green in isolation (twice prior + this run) |
| `s97ct-roles` 6b | **S167-class contamination** — second sighting, isolates green | green in isolation |
| Playwright chunk-2 first attempt exit 127 | **audit-harness path error** (relative preflight path after `cd`), not a test signal; re-run clean | this file, §F |
| `m-hubs` A-12c (failed + retry) and A-13c (flaky) | **S167-class fixture contamination** — A-13c received "past target" where "future target" was expected (the contamination signature: the wrong fixture project resolved); the tile waits timed out on team/changes, screens the PO merge never touched. **Not a regression**: the whole file passes 34/34 on a fresh isolated run | `f-pw2.log`, `f-pw2b.log`; `m-hubs.spec.ts:469,542` |

**No suite is silently below baseline:** file counts were checked as well as test counts (102 live
files ≥ 100 baseline; 65 unit files; every Playwright spec file enumerated explicitly in the chunk
commands, so a missing file is impossible to miss).

---

## SECTION G — anything else

1. **`s146-C5` is now a three-time recurring parallel-run flake** (twice in the PO Phase B battery,
   once here; always green isolated). The test asserts a **company-wide** contract toggle
   (`clientContractAppliesToEstimate`) while other suites share the company. It is a real
   contamination defect in the suite, not the service. **TECH_DEBT candidate**, filed here rather
   than fixed (audit rule).

---

## UNKNOWNS

1. **Section A long tail:** ~40 of the spec corpus's line-citations were verified exhaustively
   (all priority files + all ❌-candidates); the remainder of `desktop-redesign-spec.md`'s ~1,358
   lines were sampled. No wrong citation surfaced in any sample; a fully exhaustive per-line pass
   was traded for live-policy verification depth in §C. What was tried: prior citation-audit
   cross-check + priority-file exhaustive walk.
2. **`s138` purge timeout root cause:** classified (statement timeout under parallel load) but not
   root-caused — whether the purge needs a bigger `statement_timeout` or fewer concurrent suites
   deleting companies is a fix-time question, out of audit scope.
3. Nothing else. Every hedge raised by a section auditor (chat `roles`, the shared signature
   instrument, the po-module-spec "forward-looking" framing) was resolved with evidence before
   this report; none survives as an UNKNOWN.
