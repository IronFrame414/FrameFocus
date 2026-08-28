# Desktop Redesign — Spec

> Source handoff: `docs/handoffs/EZContractorBinder_Desktop_handoff/` (verified committed).
>
> **Baseline: `main`.** ⚠️ **`main` has moved repeatedly during this session** — `6f8e3c0` when the spec
> opened, then `296fb34`, `1718c24`, `6fc72ab`. **S175 has since merged, including item 9 (the dialog
> sweep).** Re-verify against current `main` before building.
>
> ⚠️ **Line numbers in this spec come from three different trees.** Money and Documents were gathered on
> `feature/s175-clients-off-team @ ba61257`; estimate detail on `main @ 1718c24`; Settings/Notifications/
> Expenses and the destinations on `main`. **Every `:NNN` citation is a claim to verify, not a fact.**
> The rulings hold; the coordinates may not.
>
> **Status: all 40 screens specced; all five open items closed.**
> Seven items deferred to their own specs (§6b). Four fixes ruled (§8b, §8c, §7.1) — **three
> shipped** (`8de9b4d` tz, `04b67f4` N+1s, **`2ff9966` + `20261038000000_invoice_payment_floor.sql`
> the §7.1 invoice floor**), **one checkpointed** (§8b, now a three-migration change).
> _Superseded, quoted not deleted [corrected post-audit, 2026-08-28]: "**one outstanding** (§7.1,
> the invoice floor)" — it shipped the same night this spec was committed; the citation audit
> (`desktop-redesign-spec-citation-audit.md`) caught the file saying otherwise._

---

## §0 — What this session verified

Every item below was read from the repo, not taken from a context file.

| Claim | Result |
|---|---|
| Handoff committed at the stated path | ✅ 4 files present |
| `main` @ `6f8e3c0` | ✅ when checked. **Long superseded — see the header.** |
| "34 screens" (brief) | ❌ README says **40**, turns 8–16 |
| "18 flat tabs" (design badge) | ❌ actual count is **17** |
| Client-facing PDFs are white-label | ✅ already built that way |
| User-visible brand strings need renaming | ❌ already done |

**Not designed in this handoff** (README, verbatim list): project Selections, Punch List, Deliveries,
Contracts, Lien Releases, People and Chat sub-tabs, and the client portal itself. The portal is
therefore **out of scope**, which removes the S175 collision risk the brief warned about.

`.dc.html` is a **visual reference, not code to port** (README §"About the Design Files"). Rebuild
natively; match the visual result.

---

## §1 — Project detail: six sections

**RULED.** 17 tabs → 6 sections with a sub-tab row.

Declared in **one place**: `apps/web/app/dashboard/projects/[id]/project-header.tsx`, in the `TABS`
array, rendered in the same file. `layout.tsx` renders `<ProjectHeader>`; `deliveries/page.tsx` and
`profitability/page.tsx` mention it **in comments only**. Verified: no second render site.

| Section | Sub-tabs |
|---|---|
| Overview | *(index — no sub-tab row)* |
| Work | Schedule · Selections · Punch List · Deliveries |
| Money | Budget & Cost · Change Orders · Invoices · Payments · Profitability |
| Documents | Files · Photos · Contracts · Lien Releases |
| People | Contacts · Team |
| Chat | *(no sub-tab row)* |

### R1 — Section links resolve to the caller's first *visible* sub-tab
A section header is not a route. Money lands on Budget & Cost for a foreman, Change Orders for crew.
**A section with zero visible sub-tabs does not render.**

### R2 — Role lists are unchanged BY THE REGROUPING
Grouping is presentation: the regrouping itself changes no gate. **The §7.1 fix has SHIPPED**
(`2ff9966`), so the table below is the live state — **this is the table the six-section build
copies**:

| Tab | Roles |
|---|---|
| Budget & Cost | owner · admin · project_manager · foreman |
| Invoices | owner · admin · project_manager — **authorship-scoped for a PM at the database** (§7.1): the tab renders, RLS shows a PM only invoices they authored |
| Payments | **owner · admin** (§7.1) |
| Profitability | owner · admin |
| Lien Releases | owner · admin |

_Superseded [corrected post-audit, 2026-08-28]: the table previously carried both rows as
"owner · admin · project_manager → ⚠️ becoming …" and was labelled "the state before that fix
lands". The arrows have become. A build that copies the pre-fix roles for Payments would silently
undo the invoice floor._

**Chat carries no `roles` entry and that is the ruling, not an oversight** (A-C27) — `can_view_project()`
already decides who reads a thread. Do not add one while regrouping.

### R3 — People groups Contacts and Team; the two lists stay separate
Two sub-tabs. Not a merged page. A merge would be a page rewrite smuggled in under a regrouping —
if it is wanted it is a separate item.

### R4 — Sections of one render no sub-tab row
Overview and Chat. Matches the Overview mockup, which shows six primary tabs and no row beneath.
Accepts a ~40px content shift when moving Overview → Work.

### §S1 — CLOSED
`/costs` **is** an 8-line redirect to `/budget` (`projects/[id]/costs/page.tsx:7`). The
`project-header.tsx` comment is accurate: S93 merged Budget and Job Cost into one tab at the old Budget
position. `costs` is a surviving URL, not a tab. **Money has five sub-tabs, not six.**

---

## §2 — Design tokens

**RULED.** Adopt the README palette for the general UI. Keep brand identity as-is.

### R5 — Values change; brand identity does not — **AMENDED [Josh, 2026-08-28]: the ramp moves too**
- General UI moves: `navy` `#14213d` → `#0f1729`, `primary` `#2f49d1` → `#3b4ae0`, and the near-identical
  shades (`cardBorder`, `pageBg`).
- **AMENDMENT — the text ramp and semantic colours ALSO move, following the design.** `#1a2437`-family
  text, success `#1f8f4e`, and the rest of the README's ramp (text body/muted/faint pairs, table
  header, row divider, input border, warning `#b45309`, danger `#c0362c`, the page-level warning and
  danger-border tints). _Superseded reading, quoted not deleted: Phase B correctly read the bullet
  above as scoping the pass to navy/primary + near-identical shades and left the ramp alone. That
  reading was right about the text as written; the text was **under-scoped**, and this amendment is
  the ruling that widens it._ Two consequences accepted knowingly: `warning`/`warningDeep` and
  `danger`/`dangerAlt` collapse to one value each (the design carries one warning and one danger);
  consolidating the duplicate names is a later cleanup, not a repaint. Values with no README
  counterpart (`successOnBg`, `primaryHover`, `neutralBadgeBg` — already the README's progress
  track) still do not move.
- **Brand identity keeps current colours**: logo mark, wordmark, avatar amber. `accent.500` stays
  `#f59e0b`. `brand.logoAmber` (`#EDA122`) is untouched.
- **Named stops only.** `brand` is an 11-stop scale and `accent` a 10-stop; the README gives flat values.
  Stops with no README counterpart (`brand.700/800/950`, most of `accent`) are left alone. Re-deriving
  scales is invention beyond the handoff. _[Phase B applied this as: 50/100/500/900 move; 200/300 stay
  because the design files still use those exact hexes; `accent` needed zero changes.]_

### R6 — REVERSED: `m6m` repaints too. One product, one palette.
**RULED [Josh]: all mobile colours match desktop.** This **reverses** an earlier ruling in this spec that
`m6m` stays untouched.

`tailwind.config.ts` carries three palettes — `brand`, `accent`, and `m6m`. The `m6m` namespace exists
specifically so a desktop repaint could not drag the field app: its own comment says *"a future 1a
revision would silently repaint the field app."* **That protection is being deliberately declined.** The
hexes were duplicated on purpose; they are now being re-unified on purpose. Two navies across one product
is the thing that actually looks broken.

**Blast radius:** the `/m` surface moves in this pass. ⚠️ The brief's rule that `/m` is a ruled nine-tile
set that must not drift is about **structure, not colour** — a repaint does not violate it. Do not treat
this as licence to touch `/m`'s layout, tiles or edit surfaces.

**Two exceptions, both ruled:**
- **`m6m.canvas` (`#0d1220`) STAYS.** RULED [Josh]. It is the photo-viewer and markup working surface —
  a near-black backdrop chosen so images read correctly, not a brand colour. Repainting it would degrade
  the tool.
- **`m6m.danger` (`#c0362c`) stays** unless the README names a different red. It matches `theme.ts`'s
  `dangerAlt`; nothing in the handoff supersedes it.

### R7 — The amber attention treatment is permanent
`1.5px #f5cf8f` border + `box-shadow: 0 0 0 4px rgba(245,165,36,.09)`.

The README calls this a review device that disappears on acceptance. **Overruled for the card treatment
only.** The Overview "4 things are blocking this job" card and the Estimates expiring-soon alert are
permanent attention states, not review markers. The **NEW badge** still disappears; the **card style**
ships as a named token.

### Four tokens to add — `theme.ts` has no equivalent today
| Token | Value | Use |
|---|---|---|
| `purple` / `purpleBg` | `#5b45c4` / `#ede9f8` | Subcontractor category, Owner role, retainage |
| `rowTintAttention` | `#fffdf7` | Row needing attention |
| `rowTintProblem` | `#fdf7f6` | Row with a compliance/data failure |
| `attentionCardStyle` | *(above)* | Permanent attention card |

**Note:** tables are per-page inline styles, not a shared component. The row tints are **tokens, not
behaviour** — every screen that tints a row hand-applies it, so each screen's spec must say so.

### RULED [Josh, 2026-08-28] — emails follow the repaint; PDFs do NOT
**Platform-sent mail moves to the new palette** — auth mail and the rest of `lib/email/templates/`
(their grey chrome is platform typography; the tenant's identity in client-facing mail is the
`brandColor` prop and logo, which are per-company data and untouched). **The PDF templates —
incident, spec sheet, delivery, daily log — are LEFT ALONE, and the reason is recorded so it is
not re-litigated:** PDFs are client-facing documents, and the branding rule (R9) is that a client
sees their contractor's identity, never the platform's. `invoice-data.ts` already pulls
`companies.brand_color` per tenant. Putting a product palette on a tenant-branded document is the
wrong direction, whatever the hex.

### Blast radius
The sidebar is styled with **Tailwind classes** (`bg-brand-900`, `bg-brand-500`, `text-brand-200`), not
`theme.ts`. Repainting it means editing the `brand` scale in `tailwind.config.ts`, which auth pages and
other class-based consumers also ride. Both files move together under R5.

### §S2 — CLOSED: OS chrome moves to the new navy
**RULED [Josh]: `brand.ts`'s `themeColor` and `backgroundColor` move to the new navy** (`#0f1729`), with
`theme.ts`. They do **not** diverge.

`brand.ts` argues at length that these must never be aliased to `theme.ts` — OS chrome (status bar,
splash, task-switcher card) and the in-app palette are two decisions that merely coincide on one value.
**That reasoning still holds and the columns stay separate**; they are simply being set to the same new
value, deliberately, rather than aliased. A future divergence remains possible.

⚠️ Carried: `brand.ts` flags `backgroundColor` as an **unconfirmed assumption** — a navy splash means a
dark-to-light flash on every cold start, and the file says that if it reads badly on a real handset, that
value alone becomes the surface grey. Unchanged by this ruling; still worth checking on a phone.

---

## §3 — Branding

### R8 — The user-visible rename is already done. No work.
`apps/web/lib/brand.ts` is the single source: `name: 'EZ Contractor Binder'`, `shortName: 'EZ Binder'`.
Verified empty on old-brand strings: `apps/web/app/**/*.tsx`, `lib/notify`, `email-service.ts`,
`app/layout.tsx`, `package.json`.

### R9 — Client sees the contractor; company user sees EZ Binder. Already architected.
`brand.ts` states the rule itself: tenant identity is per-contractor data from the database, and
client-facing proposals, invoices and change orders are *"deliberately white-label: they carry the
contractor's identity, never this one."*

Verified in the pipelines — these fetch `companies.logo_url`:
`invoices/invoice-data.ts` · `proposal/proposal-data.ts` · `selections/spec-sheet-data.ts` ·
`services/co-signing-service.ts`.

`services/lien-releases.ts` does **not**, and that is probably correct: the uploaded PDF is the legal
instrument and carries its own letterhead. Confirm at spec time; not a defect.

`app/manifest.webmanifest/route.ts` serves the **field crew** manifest — internal, platform mark correct.
Its comment says the route conversion at S164 existed to let the portal have its own manifest via
`app/portal/layout.tsx`. **Unverified.**

### R10 — Package scope rename is deferred to `TECH_DEBT.md`
The 470-file match count is misleading. The bulk is `@framefocus/shared` — the **npm workspace scope**,
a build-time identifier never rendered anywhere. Renaming it touches ~150 import lines plus `package.json`
and `tsconfig` paths, breaks the build on any missed reference, and changes nothing a user sees.

Also excluded, permanently: `docs/sessions` (85), `docs/specs` (30), `supabase/migrations_archive` (16),
`docs/handoffs` (6). Rewriting history makes it disagree with the commits it describes.
`supabase/migrations` (5) — editing an applied migration is a hash mismatch, not a rename.

---

## §4 — Sidebar

**Structure, order, sections and gates already match `EZNav.dc.html` exactly.** This is a pure restyle.

`apps/web/app/dashboard/dashboard-shell.tsx` — `NAV_ITEMS`, 14 items, three sections (top layer
unlabelled, then Reference, then Admin). Order is an interview outcome locked at S130. Gates:
Estimates o/a/pm · Cost Catalog o/a/pm · Settings o/a · Billing owner-only.

Already correct: filled-pill active state (`bg-brand-500 rounded-[9px]`), icon `size 17 / strokeWidth 1.9`,
gap `11px`, Notifications badge capped at `9+`, sticky `h-screen` aside (S158).

### Three deltas
| | Now | Design |
|---|---|---|
| Width | `w-[236px]` | **228px** |
| Active item | no ring | + `inset 0 0 0 1.5px #7d8bf5` |
| Item padding | `px-3 py-[10px]` | **`9px 11px`** |

### §S4 — WITHDRAWN. The claim was wrong.
An earlier note here said `e2e/desktop-ffnav.spec.ts` asserts on testids nothing renders. **False.**
`dashboard-shell.tsx:362` emits ``data-testid={`nav-section-${key}`}`` from `NAV_SECTIONS` — the string
is **constructed**, which is why a literal grep missed it. The header sits inside
`{ items.length === 0 ? null : … }`, which is exactly what the spec's A-N2 assertions test.

CC checked every spec assertion against `NAV_ITEMS` statically and found no contradiction: Owner 14
items across 3 sections, Admin loses Billing only, PM keeps Estimates and Cost Catalog, foreman list
equals crew list, filtering never re-orders. **Whether the run passes is UNKNOWN** — it needs a dev
server and five seeded sign-ins, outside a read-only pass.

**Lesson for this spec: a constructed identifier is invisible to a literal grep.** Two claims in this
document were nearly wrong for that reason.

---

## §5 — Build order

Rewritten after every screen was specced. Cheapest and most foundational first, so that every feature
decision is made against an already-migrated shell.

### Prerequisites — before any screen work
| # | Item | Why first |
| --- | --- | --- |
| P1 | **Re-verify this spec's line numbers against current `main`.** | Citations come from three trees; S175 has since merged. |
| P2 | ✅ **DONE — §8c.2, the three N+1 loops.** Committed `04b67f4`. | Touched `expenses` and `settings`, both of which get restyled — so the restyle starts from the batched version. |
| P3 | **§8.2 — proposal view tracking.** | RULED built ahead of the restyle so `14b`'s Client Activity binds to real data. ✅ `estimates.viewed_at` and status `'viewed'` already exist with **zero writers** — the column is waiting. |

**Not prerequisites, deliberately:** §8b (client contracts — checkpointed, its own session) and §7.1
(the invoice floor — its own commit). Both are database changes independent of the restyle. `14a` is
built against the Owner/Admin view either way.

### The build
| # | Step | Shape |
| --- | --- | --- |
| 1 | **Theme tokens** — `theme.ts` values, four additions; `tailwind.config.ts` `brand`/`accent` **and `m6m`** (R6); `brand.ts` chrome (§S2) | Everything after this inherits. **Widest blast radius in the whole pass** — auth pages and `/m` move too. |
| 2 | **Sidebar** — three values (width 228, active ring, padding) | One component. Structure and gates already correct. |
| 3 | **Project header six sections** | **One file** (`project-header.tsx`). Fully decided, no open questions. |
| 4 | **The six list screens** (§8.1, §8.3–§8.6) | One shared anatomy, built once and applied six times. ⚠️ `14f`'s usage count needs **grouped queries, not per-row** (148 items). |
| 5 | **Money** (§8.8) — five sub-tabs | Heaviest area. Budget's ~13 loops are pure reshaping — **safe to move**. |
| 6 | **Documents** (§8.9) — four sub-tabs | ⚠️ Contains **two schema changes**: custom file categories, and Photos' `client_visible` toggle. Sub-inbound lien releases are UI over shipped schema. |
| 7 | **Notifications · Expenses** (§8.11.2–3) | Type→chip and decision-set mappings are ruled; the roll-up is new. |
| 8 | **Settings** (§8.11.1) — seven tabs | ⚠️ Autosave conversion for Company and Accounting; the Notifications tab is **largely net-new**. |
| 9 | **Estimate detail** (§8.10) | ⚠️ **Eight tabs, not seven** — no Review & Send. Per-field autosave must survive. |
| 10 | **The five destinations** (§8.12) | Most NEW features, most feasibility questions. Last on purpose. |

### Out of the pass entirely
`16c` Terms (§8.7 — schema change) · `17a`–`17c` and `18a`–`18b` (§6b.5 — its own module) ·
the target bar (§6b.2) · stored sell (§6b.3) · custom roles (§6b.4) · unbilled-to-client (§6b.6) ·
7G (§6b.7) · the package rename (§6b.1).

---

## §5b — Acceptance criteria

**"It renders" is not sufficient.** Most of this surface is role-gated, and every defect this session
found was a role reading something it should not.

### Every screen
1. **Renders for Owner** with real Bishop data — not an empty state.
2. **Renders for at least one gated role** — the strictest that can reach it. Seeded identities and the
   shared password are in `scripts/seed-test-identities.mjs`.
3. **`npx turbo run type-check` passes 5/5.**
4. **The Playwright suite runs in four chunks** — m-shell, m-sections, m-photos, then the rest. The dev
   server does not survive a single full run.

### Where a role gate is involved
5. **Check the gated role sees less, not nothing** — a reflow, not a broken page. `14a` already reflows
   6 columns → 5; that is the pattern.
6. ⚠️ **A test that passes on zero rows is a failure.** This session produced two proposed fixes that
   would have turned real assertions **false-green**. If a screen's role test would pass against an empty
   result, it is not testing anything.

### Where the palette moved
7. **Check `/m` alongside desktop.** R6 repaints `m6m` deliberately; `canvas` and `danger` must **not**
   have moved.
8. **Check a phone's splash and status bar** — §S2 moved OS chrome, and `brand.ts` flags the splash
   colour as an unconfirmed assumption.

### Where a caption asserts behaviour
9. Several mockup captions **describe things the app does not do**. Each is flagged in place; the caption
   ships **only if the behaviour is real**. The known ones: the Expenses Review-queue's QuickBooks claim
   (§6b.7), Billing's retention copy (§8.12.4), Time Tracking's payroll-week claim (§8.11.1), and
   Timeclock's on-site badge (§8.12.3).

---

## §6 — Margin on the Projects list

**RULED:** the Margin column ships in this pass, and it calls the **existing** per-project
`getProfitabilityReport` in a loop. **No batch helper is built.**

### Why not a batch helper — the premise that failed
An earlier ruling in this session said to build `getProfitabilityMap` first. **Reversed after reading
the code**, and the reason is worth keeping.

Margin here is **not a subtraction.** `ProfitabilityReport` loads a `LoadedInstrument` per estimate, per
change order, and per approved selection, each with its own effective-dated rate rows, and derives sell
from those — the brief's *"sell derives per instrument, then aggregates"* rule, in code. A selection
instrument carries no rate rows at all: its sell is the **signed figure** (`signed_sell_amount`), because
the signature is the binding instrument. The report also carries `caveats`, `unattributed` costs that have
no margin by ruling B2, and sub-held retainage that exists so the categories reconcile.

So a "lighter" batched margin is the **same per-instrument load with the loop moved**. It buys nothing
and risks diverging from the one correct derivation.

### Why calling it N times is acceptable
- The list is single-digit projects today.
- Correctness is free: it is literally the function the Profitability page uses.
- Verified: **one call site exists** (`projects/[id]/profitability/page.tsx:47`). The list becomes the
  second, and the first to loop.

### Floor — and the thing that makes the loop cheap
Margin is **Owner/Admin only** (7H.6; money-rep P9 — *budgeted, sell and margin figures remain
Owner/Admin-only*).

**The loop goes in `projects/page.tsx` (server), behind the same `canSeeFinancials` gate that already
guards `getRevisedContractMap`.** A PM, foreman or crew member triggers **zero** of these calls — not N
wasted ones. `profitability/page.tsx` repeats its gate server-side; a hidden column is not a gate.

### Unbilled work comes free
The report already carries earned and billed, so the `14a` **Unbilled work** metric is a sum over the same
calls. No additional work.

### The trigger to revisit
If the list is slow at ~40 jobs, that is when the batch helper or stored sell gets built — not before.
`getRevisedContractMap` (`services/contract-value.ts`) is the grouped-query precedent when that day comes.

---

## §6b — Deferred to their own specs

**Seven items**, each ruled out of this pass deliberately.

1. **Package scope rename** (`@framefocus/shared`) → `TECH_DEBT.md`. See §3 R10.
2. **Company margin target.** A stored value the three "against target" treatments need —
   `14a`'s "Margin under target", `15a`'s Margin-by-job card, `13e`'s "8.5 points under your 30% target".
   Nullable, company-wide; no mockup shows a per-project override. **Margin still renders as a number
   without it** — only the judgment disappears. Recommendation on the table when it is picked up: no
   target set means the comparison UI does not render, rather than defaulting to a number nobody chose.
3. **Stored sell.** Josh's instinct, and the codebase already went halfway: `signed_sell_amount` **is**
   persisted on a selection. What is not stored is sell on rate-derived instruments, where it is
   `cost × the rate in force when the cost was incurred` — and rates are effective-dated, so the same
   cost row prices differently depending on when it landed. **The hard part is invalidation**, not
   storage: Owner correct-rates edit mode exists, so a stored sell can go silently stale, which is worse
   than a slow correct one. Specced on its own or not at all.
4. **Custom composable roles.** Josh raised per-person visibility — an owner ticking, per employee, which
   items they can see. **Ruled toward the middle path instead: custom ROLES, not per-person grants.** The
   owner composes a role from a list of capabilities and assigns people to it; the database still keys on
   a role.

   *Why not per-person.* Every gate in the platform is an RLS policy or derivation keyed on
   `get_my_role()` — 7H.6's margin rule, S121's authored-by CO floor, the roster floor,
   `budgetColumnsFor(role)`. Per-person overrides turn every one of those from a role lookup into a
   per-user, per-item lookup. Three concrete costs: **RLS cannot restrict columns**, so a per-person
   permission on a *field* multiplies the 1:1 side tables rather than replacing them; **testing loses its
   fixed set** — the S121 audit caught a crew member reading 13 COs precisely because "crew" is a knowable
   state, and arbitrary grants have no equivalent; and **support** answers stop being "that is what a
   foreman sees" and become "check that person's checkboxes."

   The real need behind it is legitimate — a bookkeeper who needs invoices but not the schedule does not
   fit any of the five roles cleanly. Custom roles serve that without abandoning the model.

   **→ `TECH_DEBT.md`. Not this pass.**
5. **The add-items sheet and PO conversion (`17a`–`17c`, `18a`–`18b`).** A second design handoff,
   received mid-session: batch-pick from the catalog into a two-step sheet, then material lines drafting
   into purchase orders on conversion. **RULED: its own module spec. Out of the redesign pass entirely.**
   The existing Items tab and the existing PO page get restyled as they are.

   *Why it cannot ride in a restyle.* The design's PO **has no schema behind it.**
   `purchase_order_items` carries description · qty_ordered · unit · sort_order — **no money at all**.
   The only dollar figure on a PO is a single **hand-entered `total_amount`** that commits as one lump
   against one budget line. So per-line cost, per-category subtotals, "the PO total foots against its
   visible lines", "Against the estimate", and *delivery posts cost back to the budget line it came from*
   all have nothing under them. The delivery chain dead-ends: `delivery_items.po_item_id` →
   `purchase_order_items.id`, but **PO items carry no `budget_item_id`.**

   *It also reverses a shipped model.* Committed cost today lands **when someone types a total**. The
   design makes it **the sum of de-marked-up lines, committed on issue**. Everything reading committed
   cost — Budget & Cost, the dashboard, `getPayablesSummary()` — moves with it. And if the Money screens
   restyle while their committed-cost basis changes in the same pass, a wrong number has two possible
   causes.

   **The schema gaps, so the module spec starts from facts:**
   - PO lines need money columns and a `budget_item_id`.
   - **Vendor exists but is not wired.** `subcontractors.sub_type='vendor'` is a real entity, already used
     by `cost_catalog.default_vendor_id` — but `purchase_orders.vendor_name` is **free text with no FK**,
     and a material estimate row has **no vendor column at all**. So vendor-first grouping has no key at
     *either* end.
   - **`cost_catalog` is material-only** — no type column, so Equipment / Labor / Subcontractor as catalog
     sources do not exist. No cost code, no favorites, no assemblies.
   - The `06 — CARPENTRY` cost code is stored **nowhere** on catalog, estimate or PO. It appears only as
     `project_budget_items.cost_code` (= the category name) after conversion.
   - PO status is **open/closed only** — there is no draft-vs-issued, and "committed" fires on entering
     the total, not on issue.
   - `convert_estimate_to_project()` creates no POs.
   - Batch write: the estimate add-row path is **one insert plus a full recalc RPC per row** — 12 rows
     would be 12 inserts and 12 recalcs. A batch sheet must recalc once. **POs already batch-insert their
     lines in one call — that is the pattern to copy.**

   **⚠️ CARRY THIS RULING FORWARD VERBATIM — it is correct and it is the point of the handoff:**
   > The estimate carries **cost and sell**. A **purchase order is cost only** — every PO line, subtotal
   > and total is de-marked-up. **"Against the estimate" compares ordered cost to budgeted cost, never to
   > sell.** Comparing cost to sell produces a percentage that looks fine while the category is actually
   > over.

   This is the Financial Visibility Floor applied correctly, and it is the reasoning the module spec
   should open with.
6. **"Unbilled to client" on the Expenses Receipts tab.** **RULED [Josh]: skipped, tech debt, possible
   future build.** There is **no expense→invoice link** and no client-billing column on `expenses` — it
   needs new schema. ⚠️ Note the near-miss: a *per-allocation* unbilled figure **is** derivable via
   `invoice_cost_claims` (see §8.8.3's "Cost you've fronted"), but that is cost fronted on a **project**,
   not an expense-level "billed to the client yet" flag. They are different questions; do not build one
   and label it the other.
7. **Module 7G — the QuickBooks connector. RULED [Josh]: a PRIORITY, and it gets its own session.**
   Not a redesign item. The schema is already staged: `expenses.qb_push_status / qb_bill_id /
   qb_synced_at` and `companies.gl_account_{labor,material,subcontractor,other}` all exist. What does not
   exist is any writer — **`approve_expense` never touches the `qb_*` columns and there is no export
   service in the tree.** So 7G is a connector plus a push path, not a schema build. Still blocked on the
   Intuit developer account.
   ⚠️ **Two things the redesign must do in the meantime:** the Expenses Review-queue caption claims
   approving *"posts it to job cost and to the QuickBooks export"* — **the second half does not happen**;
   and the Accounting tab must say that **GL mapping is live, not frozen** (unlike burden and retainage,
   it is read at export time, so a change is retroactive).

---

## §7 — Rulings made late, and carried items

### §7.1 — CLOSED: PM and client-facing billing

**RULED [Josh], after testing the live PM experience.** Signed in as `josh+pm@worthprop.com` on a real
project and read the Payments tab.

#### What the test showed
A PM sees **collected to date · spent to date · ahead by · the full AR aging table (all buckets) ·
retainage held · total outstanding · every invoice with its remaining balance · payments received**.
That is the client's whole financial position on the job. The page header states the existing posture
outright: *"Read-only — recording a payment is Owner/Admin."* So the shipped design was **read yes, write
no** — precisely the premise Josh rejected.

Also confirmed working: a PM **creates** an invoice and **submits it for approval**, and it arrives in
the Owner's queue. That routing is correct and stays.

#### The ruling
The absolute form — *a PM sees no client-facing billing* — **cannot hold**, because a PM who builds an
invoice necessarily sees its amount. The workable rule is narrower and is **the S121 shape applied to
invoices: authorship, not role.**

| | Ruling |
| --- | --- |
| **Keep** | A PM **creates** invoices, **sees the ones they created**, and **submits for approval**. Their own invoice, their own amount. The prepare-then-approve workflow is correct. |
| **Remove** | Every **aggregate**: collected to date, ahead by, AR aging, retainage held, total outstanding, payments received — **and other people's invoices**. Aggregates are not authorship-scopeable; they *are* the client's financial position, which is what the rule is about. |

**Net effect:** the **Payments tab becomes Owner/Admin**. The **Invoices tab stays PM but
authorship-scoped**.

#### How it got built — SHIPPED [2026-08-28, post-spec]
**Built exactly as ruled, in its own commit: `2ff9966` +
`20261038000000_invoice_payment_floor.sql`, tests reconciled at `0f5d37e` (five suites inverted,
with owner counterfactuals so nothing passes vacuously).** One deliberate deviation from the plan
below, recorded because the plan predicted the S121 key: **the floor keys on `author_member_id`,
NOT `created_by`** — `created_by` is NULL on 10 of 18 live invoices, so S121's key would have
hidden them from everyone. `author_member_id` is never NULL and agrees with `created_by` where
both exist. A PM keeps write on their own invoices because Postgres matches UPDATE through the
SELECT policy — the §8b-measured mechanism, used deliberately this time.

_The section below is the plan as written pre-ship, kept because its reasoning is the record:_

**Its own commit, and the floor belongs in the database.** `20260830000000_change_order_read_floor.sql`
[S121] is the precedent in both shape and documentation: *"PM SCOPE IS AUTHORED-BY."*

⚠️ **This reverses a deliberate decision, not an oversight.**
`20260806000000_financial_rls_floor.sql:56` names the conflict in its own words: *"That collides with 7D
§12a, which deliberately lets a PM create invoices."* The floor campaign met this tension and resolved it
**in favour of PM access, knowingly**. `project-header.tsx` currently gates Invoices and Payments to
`owner · admin · project_manager`, citing 7D §12 and 7E P-3 — *"a PM who cannot see whether their invoice
was paid cannot do the job."* **That premise is now rejected.** The migration header must say so and
supersede it explicitly rather than quietly contradicting it.

⚠️ **The S97 carve-out is now wrong** — *a PM sees the amounts on an invoice they can reach* — and it
lives in `money-representation.md`. Amend it there too, or the Floor documents disagree with the Floor.
**[Post-ship status: still owed. RULED [Josh, 2026-08-28]: the amendment travels with the
invoice-floor work, not the redesign — the redesign pass leaves `money-representation.md` and
`7d1-spec.md` §12a alone.]**

⚠️ **Saved invoice PDFs** must follow the same rule; Josh ruled the documents blocked alongside the
figures. Check what `files_select_non_client` does with invoice-category files for a PM.

**`14a` is unaffected** — it is built against the Owner/Admin view. The PM variant is a
column-visibility branch on the existing `canSeeFinancials` flag.

### §7.2 — Smaller carried items (no ruling; do not fix without one)

- `crew-manifest.ts:66` has a literal `description` — *"The all-in-one platform for residential and
  commercial contractors."* — under a banner reading **"EVERY BRAND VALUE IS IMPORTED. NONE IS A
  LITERAL."** Not a missed import: `brand.ts` has **no `description` field at all**, so there is nowhere
  to import it from. The string also still says *"platform"*, predating the rebrand.
- `brand.ts` flags `backgroundColor` as an **assumption awaiting confirmation** on a real handset — a
  navy splash means a dark-to-light flash on every cold start.
- Billing is internal but is EZ Binder *billing you* — plausibly the one internal surface where the
  platform mark is the subject.
- The **Client portal branding** add-on ($19/mo in the `15e` mockup) implies the contractor's logo on the
  portal is a paid feature. What an unbranded portal falls back to needs an answer.

---

## §8 — Screen specs

### §8.1 — `14a` Projects list

Files: `apps/web/app/dashboard/projects/page.tsx` (server) · `projects-list.tsx` (client, 282 lines).

**Already exists and is a restyle only:** page header, counts subtitle, client-side search over name /
project number / client, status filter chips on the `?status=` URL contract, the table card, the empty
state, and the `canSeeFinancials` grid reflow (6 columns → 5).

#### Columns

| Column | Source | Status |
|---|---|---|
| Project *(+ number beneath)* | exists as two columns | restyle — fold `project_number` under `name` |
| Client | exists | restyle |
| Status | exists, badge colours authoritative (ui-03 §4) | restyle |
| Progress | project start / target end | **new — see below** |
| Contract / projected | `getRevisedContractMap` | restyle, **header and qualifier unchanged** |
| Billed | invoices | new |
| Margin | per-project `getProfitabilityReport` (§6) | new |
| Needs attention | derived counts | **new — see below** |

#### ⚠️ The design is amended on the Contract column
The `14a` mockup shows a bare **CONTRACT** header with no per-row qualifiers. The live header is
**"Contract / projected"** and each non-fixed-price row carries a small `projected` label beneath the
number. This is [S97], and its reason is on the record: one header over rows of both kinds cannot claim
either, and a cost-plus or T&M figure is a **non-binding projection, never a contract** (P11).
**The ruling wins. Keep the header and keep the per-row qualifier.**

Related: the design drops the **Type** column. Dropping the column is fine — dropping the *distinction*
is not, because `project_type` is what decides whether a row is marked projected.

#### Progress — RULED: percent + days left, nothing else
Schedule-driven: elapsed against the project's start and target end. `62% · 38d left`. Null case renders
**"no dates set"**, not an empty bar.

**No phase label.** The mockup's `88% · punch` and `30% · permit` were phase names — and `public.phases`
does exist (`20260704213000_module5_5b_tasks_scheduling.sql`, *"name + sort order only; dates/status roll
up from tasks"*). **Ruled out anyway.** A phase has no dates of its own, so "the phase covering today"
would mean a task-range query per row for a single word. Not worth it. The column costs nothing beyond
dates already on the project.

#### Needs attention — RULED: four conditions, fixed set
Per-row text naming the specific problem; em-dash when clean.

1. **No dates set**
2. **Draft CO count** — "1 draft CO"
3. **Open punch count** — "4 punch open"
4. **Accepted estimate not yet converted** — "Accepted — convert"

Closed set on purpose: every condition added is another per-row check. **Margin-under-target is NOT in
the set** — it needs the target, which is deferred (§6b.2).

#### Metric strip
Contract value active · **Unbilled work** (free from §6's calls) · Awaiting signature ·
**Need attention** (count over the four conditions above).

### §8.2 — `14b` Estimates list

Three NEW elements. Two are arithmetic on data that exists; one is not.

| Element | Verdict |
|---|---|
| **Expiring soon** metric + alert | **In.** Arithmetic on the expiration date already stored (the Details tab renders "Expires Sep 22, 2026"). |
| **Win rate** | **In.** Accepted over sent. **RULED: 12-month window, not the mockup's 90 days.** |
| **Client activity** | **Build first — see below.** Nothing records it today. |

#### Client activity — a prerequisite build, not a restyle
Verified: no migration records proposal views or opens (`ls supabase/migrations/ | grep -i
"estimate\|proposal\|view\|open"` returns five estimate migrations, none of them view-related). The brief
was right on this one.

The mockup leans on it hard — the alert strip reads *"EST-1885 expires in 3 days with no client activity
since it was opened Aug 14."* That sentence cannot be written from stored data.

**RULED: build it ahead of the restyle so it is ready to bind when the screen lands.**

**Shape — row per view, counters derived.** One row per open: estimate id, timestamp, user agent.
Total-opened and last-opened are computed from the rows; they are the **display**, not the storage.

*Why not a counter on the estimate.* Email security scanners hit these links and will inflate any count.
Filtering at write time freezes today's scanner rule into data that cannot be corrected — with rows, the
rule improves and every historical count improves with it. Rows also answer what a counter cannot: three
opens in one afternoon reads differently from three across three weeks, and the alert copy above is a
timeline claim, not a tally.

**Do not count the contractor's own views.** Josh will open his own proposal to check it; that must not
render as client activity.

##### §S8.2 — open at build time
- The proposal link is public and logged-out. RLS on a table written from an unauthenticated surface
  needs care — the write path is the whole security question here.
- No IP stored. User agent only, and only to filter non-humans.

#### Until it lands
The Client activity column renders from what already exists — "sent Aug 21" / "not sent" — and upgrades
to real open tracking without a layout change.

---

### §8.3 — `14c` Contacts

No NEW badges on the mockup. Two columns are new work; the rest is restyle.
Files: `contacts/page.tsx` 77 (server, `getContacts()`) · `contacts-list.tsx` 215 · a detail sheet
already exists at `contact-detail-sheet.tsx` 352.

| Column | Verdict |
| --- | --- |
| Name · Company · Type · Phone · Email | Restyle. `getContacts()` is `select('*')`. |
| **Jobs** | **New, cheap.** Two arms are both required: `projects.contact_id` **and** the `project_contacts` junction. `getPortalAccountsForProject()` already walks exactly that pair, because `is_client_of_project()` honours both. Do not use one arm. |
| **Client portal** | **New read; the data exists.** `profiles.client_access_state`, joined by `profiles.contact_id`. Values: `active` · `deactivated` · `signed_documents_only` · `documents_for_signature`. **"Not invited" is a derived fifth state** — no `profiles` row for that contact; `invitations.contact_id` separates *invited-not-accepted* from *never invited*. The existing derivation is **project-scoped**; a company-wide contacts-list version is new. |

### §8.4 — `14d` Subs & Vendors

**⚠️ Insurance expiry has two independent stores. RULED [Josh]: LEAVE AS IS for now — no change in this
pass.** Recorded so the screen build does not silently pick one.

- `subcontractors.insurance_expiry` — a bare date typed into the sub form. No document behind it, no
  type. Written by desktop (`subcontractor-form.tsx:100`) and mobile (`sub-edit-form.tsx:135`); rendered
  on `/m` only. **Desktop displays it nowhere** except its own input.
- `subcontractor_compliance_documents` — a row per uploaded document (`coi` · `license` · `w9` · `other`)
  each with its own `expiration_date`. Rendered on desktop only.

**Live state (rebuild-test): the documents table holds ZERO rows**, and one sub carries a populated,
already-expired `insurance_expiry` (2026-07-30). So today desktop renders an empty compliance table
while the only real insurance date in the system sits in a field desktop does not show. **That is the
state `14d` must be built against** — not against an assumption that either store is authoritative.

*Closed sub-questions, so they are not re-investigated:* every sub **does** get a `member_id` — a
`BEFORE INSERT` trigger (`subcontractors_create_member`) assigns one unconditionally, live-verified,
zero nulls. The column is nullable but the constraint is procedural, not declarative. Compliance uploads
are **not** on the create form for three real reasons: `member_id` does not exist until insert,
`subcontractor_compliance_documents.member_id` is `NOT NULL`, and the storage path is
`compliance/${memberId}`. Plus a fourth that is not technical — sub creation admits **OAP**, compliance
insert admits **OA**, so a PM creating a sub would meet a database refusal.

**⚠️ The real gap, and deriving from documents would NOT close it:** `expiration_date` is nullable for
every doc type and nothing enforces otherwise. A COI saved with no date **silently never warns** — the
query filters `.not('expiration_date','is',null)`, and the UI shows a neutral "No expiry" chip that
reads as benign. `insurance_expiry` has the same hole, so this is not a regression. It is the thing
worth fixing whenever this is picked up.

| Element | Verdict |
| --- | --- |
| **Compliance alert** ("2 subs have expired insurance") | **Already built, and already covers licenses.** `getExpiringCompliance()` is **type-blind** — it filters only on soft-delete and non-null expiry, so `coi`, `license`, `w9` and `other` are all included. `deriveComplianceStatus()` returns `current \| expiring_soon \| expired \| no_expiry`. The alert is that call plus a count. "Today" is company-timezone via `complianceToday()` — a UTC version was a real bug fixed at S140. **Owner/Admin only by RLS**; the sub profile page skips the read for a PM rather than showing an empty list, because *"an empty list renders identically to 'this sub has no documents' — a false statement."* |
| **W-9 on file** | Exists as `doc_type='w9'`. Compliance documents key on `member_id`, which **every sub has** (trigger-assigned — see above), so there is no orphan case. ⚠️ But the table is empty today, so this column renders "missing" for every sub until documents are uploaded. |
| **Open commitments** | Derivable for **subcontractors only**: `expenses.sub_contract_id` → `subcontractor_contracts.contract_value`. `getPayablesSummary()` computes it **per project**, never per sub. New rollup. |
| **12-month spend** | Same chain, same caveat. **⚠️ Vendors cannot be aggregated at all** — `purchase_orders.vendor_name` and `expenses.supplier` are free text with no FK. Sub spend joins; vendor spend is string-matching. The mockup shows a `$54,300` figure on Jones Lumber, a **supplier**. That number cannot be trusted to a join. |

### §8.5 — `14e` Team

**The `BURDEN / HR · $25.00` column is buildable — the figure is derived, not stored.**
An earlier objection in this spec said the schema has no `$/hr` and the column could not render. **That
was wrong and is withdrawn.** Burden is `pay rate × multiplier` **or** `pay rate + company fixed`,
chosen per member by `burden_source ∈ ['member_multiplier','company_fixed']`. The UI already spells the
arithmetic out (`pay-rate-section.tsx:104–106`), so the derivation exists and just needs reusing.

Inputs: `member_burden_settings.burden_multiplier` (`numeric(6,3)`, default `1.0`) ·
`companies.fixed_burden_per_hour` · `member_pay_rates.hourly_rate`, which is **effective-dated** — take
the rate in force, matching `pay-rate-section.tsx:76`.

| Element | Verdict |
| --- | --- |
| **Hours this week + overtime** | **Free.** `timesheets/page.tsx` already does it right: **one** `getSessionsForReview({from,to})` for the whole week, grouped in JS, then the pure `weeklyHoursSummary()` per member. No per-row query. ⚠️ Do **not** reach for `getWeeklyHours(memberId)` in a list. |
| **Pending invite as a row** | **Presentation only, no schema work.** Today they are two tables on screen: `getTeamMembers()` reads `profiles`, `getPendingInvitations()` reads `invitations`, rendered as two separate `<table>`s. A merged row needs `invitations.role` and `invitations.email` — both present. |
| Access scope column | Restyle from the existing role. |

⚠️ Note the page shape: `team/page.tsx` is **33 lines and fetches nothing** — the client fetches from
the **browser**. It is the one route in the set that inverts the server/client pattern.

### §8.6 — `14f` Cost Catalog

| Element | Verdict |
| --- | --- |
| **Last priced** + **Stale** filter + the stale alert | **Free.** `cost_catalog.last_verified_at` is already stored, already editable in the form, and **already rendered in the list**. "Stale" is a comparison on a column that exists. |
| **Usage count** | **In. New query.** RULED [Josh]: counts **estimates plus selections**, labelled **"used 19 times"** — no noun. *(An earlier ruling removed this entirely, then reversed.)* |

#### Usage count — scope, label and cost
**Two sources, both counted:**
- `estimate_line_rows.catalog_item_id` → distinct **estimates**. ⚠️ `estimate_line_rows` has no
  `estimate_id`, so this is a two-hop join up through `estimate_line_items.line_item_id`.
- `selection_options.catalog_item_id` → selection options.

**The label must not say "estimates".** The mockup reads *"used on 14 estimates"*; a combined count
under that word states something false. **Ruled wording: "used 19 times"**, no noun — the number answers
*does this catalog row earn its place*, which is what a combined count is for.

**⚠️ Cost.** This is two counts per catalog item on a list showing **148 items**. It wants **one grouped
query per source**, not a per-row lookup — the `getRevisedContractMap` shape, not the
`getProfitabilityReport` shape. This is now the only new data work on `14f`.

### §8.7 — `16c` Terms — the one screen that is a schema change

**RULED BY THE DATA, not by preference.** `estimates.terms_sections` validates as
**`{ name: string, content: string }`** — free text. Nothing parses it.

- **Deposit % is stored nowhere on an estimate.** The only `deposit` in the schema is
  `invoice_lines.source_deposit_invoice_id` — a deposit is an *invoice that later credits*, not a term.
- **Invoice-due is not on the estimate either** — `invoices.due_date` is set per invoice.
- **`retainage_percent` is the one payment term that is already a real column.**

So the `16c` mockup's own copy is correct about the problem — *"these three numbers were previously
buried in the terms paragraph, where nothing could read them"* — and the fix is **columns plus a
migration**, not styling. Two of the three fields do not exist.

Also on this screen: **Excluded scope sections are new.** `estimates.scope_sections` validates as
`{ title, bullets[] }` — one level, no per-section flag. Adding Excluded changes the schema and every
reader of the JSON. And there is **no saved scope library**: `companies.default_terms_sections` exists
(a *terms* library), but there is no `default_scope_sections` anywhere.

**Sub bids are fully built** — `estimate_sub_bids` with `is_winner`, a `set_winning_bid` RPC, and a
523-line tab. The **Sub Bids** tab (turn 9, estimate detail — *not* a turn-16 screen) is a restyle.

### §8.8 — Money section (`13a`–`13e`, `16a`)

Source: `docs/specs/money-section-inventory.md`, gathered on `feature/s175-clients-off-team @ ba61257`.
⚠️ **Line numbers and any `[S175]`-tagged code re-verify against `main` before build.**

**The regrouping touches no page body here.** All five pages get the strip from `layout.tsx` +
`project-header.tsx`. Two genuine sibling-URL couplings break only if a slug changes:
`payments-view.tsx:142` hardcodes the invoices base (4 links), and
`invoice-delivery-panel.tsx:175` hardcodes lien-releases. **Slugs are not changing**, so neither moves.

**Audit result worth recording: no money reaches a client payload without a role check on any of the
five pages, and there is no database N+1 in any of them.** Budget's ~13 loops are all pure in-memory
reshaping of one top-level `Promise.all` — **safe to move in a restyle.**

#### §8.8.1 — `13a` Budget & Cost

**⚠️ RULED: "Cost to complete" means the mockup's number, NOT the shipped field of a similar name.**
The service field `costToDate` is `actual + committed` — **cost incurred**. The mockup captions the same
card `budget − actual − committed` — **budget remaining**. Opposite quantities. The mockup's own figures
settle which it means: $178,212 budget, $0 actual, $0 committed → **$178,212**. Build the mockup's.

- Trivial arithmetic; all three terms already come from `getBudgetRollup()`.
- **⚠️ It requires `seesBudgeted`, so it is Owner/Admin only.** A PM and a foreman see a **three-card
  row**, not four. Do not render an empty fourth card.
- **Do not reuse the name `costToDate`** for it. The existing field keeps its meaning and its column.

| Mockup figure | Status |
| --- | --- |
| Committed · Actual spent · Budgeted cost (bar) | ✅ in `getBudgetRollup()` |
| Margin (bar) | ✅ derived on page — **fixed-price + Owner/Admin only** |
| Labor to date | ✅ separate service — `getJobCostRollup().labor.totalCost` |
| **Cost to complete** | **New arithmetic, Owner/Admin only (above)** |

**Grouping and columns already exist.** The page groups by instrument then cost code, with the
"Original Contract" / CO title header — the mockup's structure is shipped. All five per-line columns
exist and are gated per `budgetColumnsFor(role)`.

**Watch list — NEW panel, all three conditions feasible:** line at N% of budget with no signed
subcontract (`subcontractor_contracts.status='signed'` + `requires_formal_contract`, already resolved in
`budget.ts`); unspent allowances (`BudgetRowType` carries `'allowance'`, selection totals in
`item.selection_subcategory`); no labor logged against a labor budget (`BudgetRowType` `'labor'` +
`getJobCostRollup().labor`).
**⚠️ The mockup's allowance copy — *"a client upgrade turns into a change order"* — is WRONG and must be
rewritten.** See §9.1: the selection signature is the binding instrument and no CO is generated.

#### §8.8.2 — `16a` Change Orders

| Mockup element | Status |
| --- | --- |
| **Schedule impact `+0 days`** + *"1 CO has no impact entered"* | ✅ `change_orders.schedule_impact_days`, **nullable** — the "no impact entered" case is `NULL`, exactly as the mockup shows |
| **CO age** ("in draft for 2 days") | ✅ `created_at`; `sent_at` and `signed_at` also exist for finer age |
| **Credit line** (negative row lowering the contract) | ✅ Already permitted. Credits are **negative values on normal rows (D-2)** — no `is_credit` flag, and **no CHECK forbids negative** amounts. `net_delta` can be negative. |
| **"Bill on next invoice" vs "Bill now, on its own"** | ❌ **Not stored on the CO.** Billing timing is an action at invoice time via `invoice_lines.source_change_order_id`. Putting this radio on the CO means a new column — **or** render it as what it is: a shortcut that performs the invoice action. |
| **"From a photo or punch item"** | ❌ **Not possible today.** No `punch_item_id`/`file_id` FK on `change_orders`. `punch_list_items` has `reference_photo_file_id` but **no reverse link**. New column + new create path. |

**Per-row redaction is the thing to preserve.** `canSeeCoMoney(created_by)` — Owner/Admin see every CO's
money; a **PM sees money only on COs they authored** (S121). Redaction happens **at the RSC boundary**
via `redactCo()`, nulling `net_delta`, the three markup percents and `tax_rate` on the parent,
`total_price` on line items, and `total/rate/unit_cost/amount/markup_percent` on line rows.
**A redacted amount renders as an empty cell — no dash, no placeholder** — and the summary cards flip
their caption from "$X pending" to "sent to clients". **The restyle must keep both behaviours.**

#### §8.8.3 — `13c` Invoices

**⚠️ [Corrected post-audit, 2026-08-28] This section was inventoried PRE-invoice-floor. Since
`2ff9966`:** the list shows a PM **only invoices they authored** (`author_member_id`, RLS), and the
summary cards / billing-progress strip are gated `canSeeContractValue` — **a PM sees no
aggregates on this page**. The presentation_level caveat below still holds, but "a PM who can
reach a draft" now means **their own draft** only. Build `13c` against that state.

| Mockup element | Status |
| --- | --- |
| **Three-step wizard** (What to bill → How it reads → Send) | Restyle. "How it reads" is `presentation_level` ∈ `full_detail \| by_section \| lump_sum`, **DB CHECK-enforced**, default `lump_sum`. ⚠️ No RLS on the column — a PM who can reach a draft can change it until send. |
| **Three billing modes** — draw · contract lines · manual | ✅ **All three built.** Draw and contract-lines are fixed-price only. |
| **"Numbered when sent"** | ✅ Accurate. A BEFORE trigger assigns the number on transition into `{sent,paid,voided}`; drafts carry `NULL`. Row-locked, race-safe. |
| **Billing progress** (invoiced / collected / left to bill) | ⚠️ **Mixed.** Invoiced ✅ on this page. Collected ✅ computed — but in 7E, **not on this page**. Left-to-bill ✅ **fixed-price only** (NULL for cost-plus/T&M) and currently threaded to the **detail** page, not the list. |
| **`Cost you've fronted`** | ⚠️ **Partially.** Per-allocation unbilled approved cost is derived; **no project-level aggregate exists**. One new query over `expense_allocations ⋈ expenses ⋈ invoice_cost_claims`. |

#### §8.8.4 — `13d` Payments

**⚠️ [Corrected post-audit, 2026-08-28] The Payments tab is now Owner/Admin** — `2ff9966` changed
the TABS gate and `payments/page.tsx` redirects; the RLS floor removed every PM arm on
`client_payments`, `client_payment_applications` and `retainage_releases`. Everything this section
says a PM could see, they no longer can — the shipped design this section describes ("read yes,
write no") is the premise §7.1 rejected. **The rulings below all stand, as Owner/Admin screens.**

**⚠️ RULED: keep FOUR aging buckets, not the mockup's five.** Code has `current (≤30)` · `31–60` ·
`61–90` · `90+`. The mockup splits *current* from *1–30*. **Splitting is cosmetic until due dates
exist** — P-1 means nothing writes `due_date` yet, so aging falls back to issue date and a split bucket
would be meaningless. Revisit when terms are ruled.

**⚠️ RULED: payment reminders stay per-CLIENT. Relabel the control so it does not lie.**
`client_reminder_settings` spans **all of that client's projects**; the mockup places it on a project
page, implying per-project. The control is correct, the wording is not — say **"chasing rules for this
client"**, never "for this job". Company default `[3,7,14]` and the off switch both exist.

| Mockup element | Status |
| --- | --- |
| **Retainage held outside every bucket** | ✅ Already excluded from aging and rendered separately. The mockup is right and matches shipped behaviour. |
| **"Immutable once recorded" / "corrections remove and re-enter"** | ✅ **DB-enforced by trigger**, not UI. A column-scope trigger blocks UPDATE of every money and identity field; **no DELETE policy exists**, so corrections are soft-delete + re-enter. The caption is accurate. |
| **Refunds** | ✅ Stored — `client_refunds`, with source and status. Owner-initiated auto-approves; Admin pends. |
| **Client credit balance** | ✅ **Derived, not stored** — sums unapplied surplus per client. |
| **`Expected in 30 days`** | ❌ Not built, and **blocked on P-1** — it needs populated due dates. Defer with the bucket split. |

#### §8.8.5 — `13e` Profitability

Strictest page in the tree: Owner/Admin at the tab, repeated as a server redirect.

| Mockup element | Status |
| --- | --- |
| Earned · Billed · Actual cost · Backlog | ✅ all on `ProfitHeadline` |
| **`Projected at completion`** | ❌ **Not computed anywhere.** `computeHeadline()` derives profit as `earned − actualCost` (active) or `billed − actualCost` (complete). No cost-to-complete term exists in the service. **New build.** |
| **No-cost-landed caveat banner** | ❌ **New.** No caveat is emitted for `actualCost === 0`. The six real caveats are `labor_instrument_assumed` · `unattributed_costs` · `owner_hours_unapproved` · `rate_missing` · `basis_switched` · `selection_variance_outside_contract` [S175]. |
| **By-category Revenue / Margin em-dashes** | ✅ **Genuinely unavailable, and the mockup's explanation is correct in substance.** `project_budget_amounts` carries only `budgeted_amount` — **no sell column**. Sell derives per instrument and is null in three cases: fixed-price instrument (the contract is a lump sum, not per-category), rate missing on the cost date, and unattributed cost. ⚠️ The caption *"unlock when the budget carries a sell figure"* is **the mockup's wording, not in code** — and it points at §6b.3 (stored sell). |

### §8.9 — Documents section (Files · Photos · Contracts · Lien Releases)

Source: `docs/specs/documents-section-inventory.md`, gathered on `feature/s175-clients-off-team @ ba61257`.
⚠️ Re-verify `[S175]`-tagged items against `main` — notably the `selections` file category
(`20261036000000`).

**No Documents page hardcodes a sibling tab's URL** — unlike Money. The regrouping touches only
`layout.tsx` + `project-header.tsx`.

**Storage paths are project-scoped, not category-scoped** —
`${company_id}/${scope_segment}/${uuid}-${safe_filename}`, with an explicit comment saying category
lives in the column and not the path *"to keep category editable without orphaning the storage
location"*. **Changing a file's category cannot break its storage path.** That matters for §8.9.1.

#### §8.9.1 — Files

**RULED [Josh]: per-job custom categories are IN this pass**, with a **default set** seeded per company
— contracts, lien releases, change orders, proposals, invoices, and the rest.

⚠️ **This is a schema change, not a restyle.** Today `files.category` is a **fixed 14-value CHECK enum**
(`photos · contracts · plans · permits · invoices · change_orders · daily_logs · receipts · safety ·
deliveries · compliance · lien_releases · selections · other`); the upload picker exposes only 9 because
the rest are written by the app. "Rename, reorder, add your own" needs a **categories table, a per-file
FK replacing the enum, a seeded default set, and a migration of existing rows**.

Two constraints the build must respect:
- **System-generated categories still have to resolve.** The app writes `lien_releases`, `selections`,
  `daily_logs` and others itself. A renameable category must keep a stable key those writers target —
  renaming the label must not orphan the writer.
- Storage paths are unaffected (above), so re-categorising is safe.

| Element | Verdict |
| --- | --- |
| **Shared with client** | ✅ Exists as **per-FILE** `files.client_visible`, enforced by RLS `files_select_client` (`client_visible = true AND is_client_of_project() AND client_has_full_access()`). Staff read through a separate arm that ignores the flag. ⚠️ The design shows the badge on a **category**; the column is per-file. Render it per-file. |
| **Current revision / superseded** | **RULED [Josh]: IN.** ✅ `files.version` (int, default 1) and `files.supersedes_id` (FK → files.id) are **already stored and never rendered** — `file-row.tsx` shows name, category, tags, size, date only. This is UI over existing columns. |
| **Trash + restore** | ✅ Built. Soft delete; `restoreFile()` open to owner/admin/pm/foreman/crew; **permanent delete is owner/admin only** and the UI already hides it otherwise. |
| **AI tags** | ✅ Editable via `AiTagEditor` (max 4), component ungated. **Auto-tagging on upload is gated on `companies.ai_tagging_enabled`** — the Billing add-on — and returns `add_on_disabled` when off. The `15e` mockup's "$29/mo AI photo auto-tagging" toggle is real and wired. |
| Role gates on the page | **None, by design — RLS only.** Five policies carry it. Do not add a page gate in the restyle. |

#### §8.9.2 — Photos

**RULED [Josh]: a SURFACING JOB, not a build.** The gallery, lightbox and markup editor all exist. The
desktop tab is a **20-line "coming soon" stub** that mounts none of them.

- **The gallery exists on mobile** at `/m/p/[projectId]/photos/` — 3-column grid, day-grouped,
  newest-first, with a lightbox. Port it to desktop.
- **The markup editor already runs on desktop** (`files/[fileId]/markup/`): arrow, circle, rectangle,
  pen, text, select; 9 colours; 4 stroke widths. Persists to `files.markup_data` (JSONB) and **rasterises
  a `.markup.jpg` derivative always from the original, never from a prior derivative** (#129 D-31).
  Preserve that.
- **Photos are distinguishable** two ways: `files.category = 'photos'`, and MIME (markup accepts
  `image/*` only).

| Filter chip | Status |
| --- | --- |
| All · Daily logs · Punch · Deliveries | ✅ Already rendered on mobile. `daily_log_id`, the punch photo FKs, `delivery_id`/`delivery_item_id`. |
| **Safety** | ⚠️ **Data ready, chip not rendered** — `files.safety_incident_id`. UI only. |
| **Marked up** | ⚠️ **Data ready, chip not rendered** — `files.markup_data IS NOT NULL`. UI only. |

**In this pass:** the desktop gallery, both missing chips, and a **UI toggle for `client_visible`** —
the column and both RLS arms exist but **no toggle exists anywhere today**.

**RULED: the three "turn this into work" actions are DEFERRED.**
*Create punch item* is not built on either surface. *Attach to change order* has **no backing path** —
`change_orders` carries no file FK, the same gap as `16a`'s "From a photo or punch item"; the two should
be built together or not at all. *Share with client* exists only as the mobile Web Share API.

#### §8.9.3 — Contracts

`contracts-panel.tsx` is **1,376 lines**, the largest client panel in the repo: a Client Contract card,
then a Subcontractor Contracts card with per-sub schedule editors. **Two tables, two lists** —
`client_contracts` and `subcontractor_contracts`, sharing a `draft | sent | signed | void` status.

**⚠️ See §8b — this tab carries a live Floor exposure that must be fixed before or alongside the
restyle.**

| Element | Verdict |
| --- | --- |
| **Box placement** | ✅ Coordinates in `contract_template_boxes` (`x, y, width, height, page, kind, party, value_key`). The **`BoxMapEditor` is shared with lien releases** — same component, different props (Contracts: 4 kinds + party; Lien: 3 kinds, no party). A restyle touches both surfaces at once. |
| **Signature status per party** | ✅ Stored, but **not on the contract row** — it lives in the 7I document layer: `contract_documents.status` plus **per-recipient** `contract_signing_sessions`. **There is no denormalized "countersigned" flag**; execution means `status IN ('signed','notarized')`. Do not invent one. |
| `projectHasUnsignedContract()` | **Display only — it gates nothing.** The migration is explicit: *"DECOUPLE, DO NOT GATE."* Conversion, invoicing and payments proceed regardless. It is PM-visible on purpose: it reveals that paperwork is outstanding, not the terms or the value. |
| **N+1 in edit mode** | ⚠️ `listExpenseAllocations` is called **once per stage** on edit-mode open and again in "Approve all". Off the default read path; fine at 3–5 stages, degrades at 15+. Logged, not a redesign item. |

#### §8.9.4 — Lien Releases

**Owner/Admin — and the reason is NOT the Financial Floor.** The migration says so verbatim: that
rationale was **struck at S98**, because the Floor's S97 carve-out already lets a PM see invoice totals
and retainage, *which IS the release amount*. The actual reason is narrower and sufficient: **a release
waives legal rights and voiding does not retrieve it.** Do not re-justify this gate on the Floor.

**The four release types are two columns, not a four-value enum:** `type ∈ conditional | unconditional`
× `is_final` boolean. Render the four combinations; do not add an enum.

**The release PDF fetches no company logo, and that is correct** — unlike invoices, proposals, spec
sheets and CO signing. The uploaded, box-mapped form **is** the legal instrument; the app overlays values
and a signature into placed boxes and supplies no page content of its own.

##### RULED [Josh]: sub-inbound releases are IN this pass
The tab is client-outbound only today — `getTemplates('client_outbound')`, releases tied to invoices.
**But the schema for the second direction already shipped.**

`20260925000000_7f_sub_inbound.sql` — *"Module 7F §12 — SUB-INBOUND lien releases. **The schema half**"* —
carries the S145 rulings and the columns. **CC's inventory reported sub-inbound as deferred; that came
from reading the earlier client-outbound migration's header and the service layer, and was overtaken by
this later migration.** The comment was accurate when written. Verify against `main`.

What S145 already ruled, so none of it is reopened:

| Decision | Ruling |
| --- | --- |
| Signing method | **Upload-back.** Send the PDF, the signed copy comes back and is uploaded. **No tokenised link, no new external surface.** |
| Triggers | **Two, and the type differs by trigger** — sub completion → **conditional**; payment → **unconditional**. |
| Roles | Owner/Admin, matching client-outbound. |
| Templates | **Their own rows** — the sub is the lienor and the form differs. |
| Blocking | **Both triggers are OPTIONAL. The system prompts; it never blocks.** |

The table was deliberately built to absorb this: `lien_releases` shipped with nullable `invoice_id` plus
`expense_id` / `sub_contract_id`, and `lien_releases_subject_check` keyed off `direction` requiring
exactly one — `client_outbound → invoice_id`, `sub_inbound → expense_id XOR sub_contract_id`
(completion → `sub_contract_id`, payment → `expense_id`). `completed_at` was added as the
"this sub finished" signal that had no representation before.

**So this is UI and service work over shipped schema — the same shape as Photos.** The legally-operative
forms concern is handled exactly as client-outbound handles it: the company uploads its own form and the
app fills placed boxes.

### §8.10 — Estimate detail

Source: `docs/specs/estimate-detail-inventory.md`, gathered on **`main @ 1718c24`, clean** — the only
inventory taken on baseline. Nothing to re-verify.

**Confirmed: the six-section regrouping touches none of these tabs.** That strip is project detail, not
the estimate builder.

#### §8.10.1 — ⚠️ The mockups have the wrong tab set

The design shows **seven** tabs. The shipped builder has **eight**, in a different order, and
**there is no Review & Send tab.**

| Mockup tab | Shipped reality |
| --- | --- |
| Details · Scope of Work · Terms · Notes | Same names ✅ |
| Line Items | **Items** |
| Sub Bids | **Bidding** |
| **Review & Send** | **No such tab.** Send actions live in the **Details right-rail**, and preview is a **separate full-page route** at `[id]/proposal/`. |
| — | **Cover Sheet** — exists in code, absent from the mockups |
| — | **Files** — present but `disabled: true` / "Coming soon" |

**Tab state is a client `useState`, not a URL param** — no tab is deep-linkable today. If the redesign
wants linkable tabs that is a change, not a restyle.

#### §8.10.2 — Two constraints the restyle must not break

**Saving is per-field autosave. There is no Save button and no dirty state.** Every field persists on
blur via `updateEstimate`, and pricing fields then fire `recalculateEstimateTotals`; after each write the
whole tree re-fetches via `reload()`. **There is no batch to hook** — a restyle must preserve the
onBlur/onSave-per-field contract.

**Immutability is whole-builder, not per-field.** `canEdit = status === 'draft'`, threaded to every tab
as `disabled={!canEdit}`, and backed three ways: the service refuses non-draft writes, RLS carries
`status='draft'` on the PM arm, and a DB trigger freezes on send. The grand-total footer is rendered
**once by the shell**, not per tab.

#### §8.10.3 — Three NEW panels have no data behind them

| Panel | Verdict |
| --- | --- |
| **Estimate History** ("Priced to $123,651", "Margin dropped 31% → 18.4%", "Created from Weller template") | ❌ **No audit, event or history table exists anywhere.** Confirmed across all migrations. And the mockup's `v1.1` is literally a **dead `DEFAULT 'v1.1'` with zero writers** — there is no version numbering and no history link. **Building this means building an event log.** |
| **Coverage check** ("line-item categories with no scope section describing them") | ❌ **No link exists between scope and categories.** Scope is estimate-level JSONB `{title, bullets[]}`; categories are `estimate_categories` rows. **No FK, no shared key, no id reference.** The only possible match is **free-typed name strings** — and category names and scope titles are independently authored. **This is guesswork, not a feature.** Do not build it as designed. |
| **Allowance "has no cap"** | ❌ **No cap concept exists.** `estimate_line_rows` has no cap column; an allowance is just `quantity × unit_cost`. The unpriced-row half of that warning **is** derivable (a row with zero total/cost/rate). Ship the unpriced half; drop the cap half. |

#### §8.10.4 — What is real

| Element | Verdict |
| --- | --- |
| **Estimate Health** (margin %, your cost, client price, profit) | **New but tractable.** Client price is `grand_total`. **Cost is deliberately never surfaced on an estimate today** — but it is summable from row cost bases, using the same expression `convert_estimate_to_project()` already uses. Margin and profit follow. ⚠️ The **target** bar is deferred (§6b.2). |
| **Client Activity** | ⚠️ **Half-built, and better than expected.** **Sends ARE recorded** (`email_logs`, keyed `estimate_id`) and **signatures ARE recorded** (`signing_sessions`) — both already rendered in `SigningActivity`, **Owner/Admin only**. Reminders are counters (`reminder_count`, `last_reminder_sent_at`), not events. **Opens are NOT recorded** — `estimates.viewed_at` and status `'viewed'` exist in schema with **zero writers**. So §8.2's view-tracking build has a column waiting for it. |
| **"Before you send" checks** | **New — no cross-tab validation exists anywhere.** Five of six checks map cleanly to stored fields. ⚠️ **The expiration check is near-vacuous** — `expiration_days` is NOT NULL with a default, so it is *always* set. Drop it or redefine it. The sixth check is unnamed on the mockup. |
| **Proposal detail level** | ✅ Exists as `estimates.proposal_pricing_level` — **five** values (`lump_sum · category_with_price · category_no_price · detail_with_price_qty · detail_no_price`). ⚠️ **A different field from the invoice's `presentation_level`** (three values). Do not conflate them. |
| **"Mark as sent"** | ✅ Built — freezes without emailing, sets `sent_at`, computes `expires_at`. **"Send me a test" is NOT built.** |
| **Reminders (Day 3 · 7 · 14)** | ✅ Per-estimate override `estimates.reminder_schedule` (`null` = company default, `[]` = off). ⚠️ **A different mechanism from 7E payment reminders** — do not unify them in the restyle. |
| **Contract section** | ✅ The T&M labour-rate / non-labour-markup block the mockup shows. Owner/Admin edit, **PM read-only**. |
| **Pricing mode** | ✅ Per-estimate `pricing_mode` (`markup \| margin`) with a company default. |
| **Row types, categories, per-row tax and markup** | ✅ All stored as the mockups show. `markup_percent` **null inherits the estimate default for that row_type** — preserve that; a restyle must not write an explicit value where null was meaningful. |
| **Notes** | ✅ `estimates.internal_notes`. **"Never shown to the client" is enforced only by the renderer omitting it** — no DB gate — but no client can reach the route. **"Carry to the project" already works**: the convert RPC copies `internal_notes` → `projects.internal_notes`. ⚠️ It carries **the whole blob**; there are no per-note rows, so the mockup's per-note tick-boxes have nothing to tick. |

#### §8.10.5 — ⚠️ Mockup/reality conflict: Foreman on Notes

The Notes mockup grants **Foreman read-write**. **A foreman cannot reach estimates at all** — the route
redirects and RLS returns nothing (`owner/admin/project_manager`, with the PM arm scoped to
`created_by`). **The code is right; the mockup is wrong.** Correct the panel's role list.

#### §8.10.6 — Open

**Does a PM actually see instrument rates?** `contract-section.tsx` renders them read-only for a PM,
but `instrument_rates` SELECT is floored to Owner/Admin at the database. If that floor applies to
estimate-scoped rates, a PM sees em-dashes, not rates. **Needs a live check as a PM identity on
rebuild-test.** Not a redesign decision — but the Details tab's right rail depends on the answer.

### §8.11 — Settings · Notifications · Expenses

Source: `docs/specs/settings-notif-expenses-inventory.md`, gathered on **`main @ 1718c24`, clean**.

#### §8.11.1 — Settings

Today `settings/page.tsx` renders **seven forms stacked**, not tabbed, behind an Owner/Admin redirect.
The mockup's tab strip is itself the redesign. The Documents tab hosts **two** forms (Lien + Contracts);
the Notifications tab has **no form at all** today.

**RULED [Josh]: everything autosaves.** Company and Accounting move to the same 1s debounce Estimating,
Proposals and Time Tracking already use. The mockup's caption — *"This tab saves on demand; every other
tab saves automatically"* — describes a state that is **already wrong** (Accounting is also manual) and
is being removed rather than corrected.

⚠️ **The one real obstacle, which the build must solve rather than ignore:** Company bundles identity
fields with **two independent async file uploads** (logo, signature). Per-field autosave would fight the
upload handlers. Keep uploads as their own explicit action; autosave the text fields around them.

| Tab | Notable findings |
| --- | --- |
| **Company** | One signature serves everything — `contractor_signature_path` is reused by change orders **and** lien releases. **"Type your name" is built**: a canvas renders a script-font transparent PNG through the same upload path. ⚠️ `companies` also carries a newer `contractor_signature_mode/name/ref` triple the form does not write — **find its consumer before touching this form.** |
| **Estimating** | **Both markup and margin triples are stored**; `default_pricing_mode` selects which one seeds a new estimate. `default_terms_sections` order **is** stored (array order). Next number is allocated by `next_estimate_number()` at creation — atomic and company-scoped. |
| **Proposals & Email** | ⚠️ **Template variables are hardcoded per email type and substituted at send** — they are not stored or configurable. The mockup's variable palette is a **legend, not a feature**; do not build a variable editor. Reminder day-chips are the same `default_reminder_schedule` column. |
| **Time Tracking** | ⚠️ **The payroll-week caption is only half right.** OT is derived at read time and `week_starts_on` is read dynamically, so changing it **does** re-group past time and re-derive OT. Approved weeks keep their approval *record*, but **their totals re-display under the new grouping** — no OT-grouping snapshot exists (TECH_DEBT #92). The caption must not promise that approved weeks are unaffected. |
| **Accounting** | **The burden-freeze caption is accurate and enforced** — `session_rate_snapshots` freezes `hourly_rate`, `burden_multiplier`, `fixed_burden_per_hour` and `burden_source` per session **at approval** via a SECURITY DEFINER trigger, and `expenses.ts` reads the snapshot, not the live value. ⚠️ **But `gl_account_*` is NOT snapshotted** — it is read at export time, so a mapping change **is retroactive** to all future exports. **The screen must say so**, since it sits beside a frozen value and reads like one. |
| **Documents** | **The four release forms ARE seeded per company** — pre-named by a `seed_lien_release_templates()` signup trigger plus a backfill, **with no PDF**. **"No form uploaded" means the type cannot be issued** until the company uploads its own PDF and places boxes — that is the liability posture, not an empty state. `client_contracts_enabled` gates **only the send flow**; forms stay authorable while off. Sub agreements are authorable now, sending arrives later — the mockup's caption is correct. |
| **Notifications** | ⚠️ **Largely net-new.** There is **no `notification_preferences` table** and no per-type app/email toggle anywhere. What exists: `companies.notify_hours_start/end` (quiet hours) and a wired `push_subscriptions` + service worker. **"Roll up repeats" is not implemented.** The per-type routing grid is a build. |

#### §8.11.2 — Notifications page

**15 stored types**, each raised by a `notify()` call at its source event. Starred and read-at **are**
stored per notification, and the page's unread count is **the same `getUnreadCount()` the sidebar badge
uses** — one source, already consistent.

| Mockup element | Verdict |
| --- | --- |
| **Five category chips** (Everything · Signatures · Money · Field · Account) | ❌ **New.** There is **no `category` column** — the only grouping key is `type`. Today's filters are All · Unread · Starred, with an explicit *"no type filter in v1"*. **Mapping RULED below.** |
| **"Needs a decision from you"** | ❌ **Not a stored state.** No severity, priority or state column — it is **derived from `type`**. **Set RULED below.** |
| **Roll-up** ("3 more change orders signed — Expand") | ❌ **Not implemented.** The list renders flat; there is no grouping code. |

##### RULED [Josh] — the type→chip mapping

Derived from `type`; **no `category` column is added.** Keep the mapping in one place so a new type has
one obvious home.

| Chip | Types |
| --- | --- |
| **Signatures** | `signed` · `contract_signed` · `reminders_exhausted` |
| **Money** | `selection_approved` · `selection_denied` · `discrepancy` · `low_stock` |
| **Field** | `incident` · `daily_log_missing` · `still_clocked_in` · `timesheet_ready` · `punch_assigned` |
| **Account** | `trial_warning` |
| **Everything only** | `mention` · `assignment` |

⚠️ **Two judgement calls, recorded so they can be revisited rather than rediscovered:**
- **`mention` and `assignment` fit no chip.** They are *routing* notifications — someone tagged you or
  assigned you something, and the subject can be any object in the app. They appear only under
  Everything, which means that chip does double duty as a real category. Accepted rather than forcing
  them somewhere wrong.
- **`low_stock` and `discrepancy` are filed under Money, not Field**, although both originate on a
  jobsite. The action they demand is purchasing, and that is the tiebreak used.

##### RULED [Josh] — "needs a decision from you"

Types where the reader must **act**, not merely read:

`timesheet_ready` · `selection_approved` · `selection_denied` · `discrepancy` ·
`reminders_exhausted` · `trial_warning` · **`low_stock`** · **`incident`**

*(`low_stock` and `incident` added by Josh — a hazard on site and a material shortfall both demand a
response, not an acknowledgement.)*

⚠️ Note the overlap this creates: **every Money type is a decision type.** That is correct rather than a
modelling error — the four money notifications all exist because something needs approving, denying,
resolving or ordering.

#### §8.11.3 — Expenses

| Mockup element | Verdict |
| --- | --- |
| Spend this month · Awaiting approval · Missing receipts | ✅ All derivable. Missing receipts = pending with no `files.expense_id` row. |
| Committed open · Paid to date · Retainage held · Missing due dates | ✅ All derivable. |
| **Unbilled to client** | ❌ **RULED [Josh]: skipped — deferred to tech debt.** No expense→invoice link exists; it needs new schema. See §6b.6. |
| **"Not on any job yet"** | ❌ **Not a real state — the mockup is wrong.** `expenses.project_id` is **NOT NULL**; every expense has a project. Reassignment is allowed, but never to null. **Remove this from the design.** |
| **Duplicate check** | ❌ New. No detection code and no constraint; all four keys (supplier, amount, date, project) exist, so it is buildable — but it is entirely new. |
| **Retainage "ready to release"** | ✅ Derivable. ⚠️ **Release is Owner-only** — `record_expense_payment` raises *"Retainage release is Owner only"*. Not Owner/Admin. |
| **Approve → "posts to job cost and to the QuickBooks export"** | ⚠️ **Half true, and the caption over-promises.** Job cost ✅ — `approve_expense` validates allocations sum **exactly** to the amount, then fires the budget recompute. **QuickBooks ✗** — the `qb_*` columns exist but `approve_expense` never writes them and **no export service exists**. **Fix the caption or ship 7G first.** |
| **Close out vs Settled** | Two different things, both real. **Settled** is derived at read time (`remaining ≤ 0` and approved). **Closed out** is an explicit Owner/Admin action requiring a `closeout_reason`, and it removes the row from every committed sum. Settled = all money accounted; closed out = done with the commitment despite a shortfall. |

**Floor check:** crew and foreman **do** see expense amounts on assigned projects — actual cost, correct
under the Floor. Crew are excluded from the Bills tab; reviewers are Owner/Admin; budgeted amounts in the
allocation picker are Owner/Admin-only. **No unexpected leak in this area.**

### §8.12 — The five destinations

Source: `docs/specs/destinations-inventory.md`, gathered on **`main @ 6fc72ab`, clean**.
**Confirmed: the six-section regrouping touches none of these five** — that strip is project detail.

#### §8.12.1 — Already built, contrary to expectation

The brief listed several of these as blocked. They are not:

| Element | Reality |
| --- | --- |
| **Crew double-booking detection** | ✅ Already computed — `findOverlaps`, non-blocking. |
| **"On the clock now"**, 30s refresh | ✅ The live board exists, with the poll. |
| **Dashboard crew card week/month toggle** | ✅ Already there (`schedule-card.tsx`). |
| **"You may approve roles strictly below you"** | ✅ Real **and DB-enforced** — `can_approve_member`. The caption is accurate. |
| **Overtime "derived, never entered"** | ✅ Accurate. |
| **Hours by job, one query** | ✅ `workedHoursByProject(segments)` over one range-filtered read. |

#### §8.12.2 — Genuinely new

| Element | What is missing |
| --- | --- |
| **"Proposed timeline from your estimate"** *(the largest NEW item in the handoff)* | **Zero machinery.** `phases` carries only `name`, `sort_order`, `project_id` — **no `estimate_id`, no dates, no dollar weight, no link to `estimate_categories`.** Deriving phases from category dollar weight, previewing them, and an Accept action that writes real tasks is a build in its own right. |
| **Portfolio money** — Coming in · Going out · Not yet billed | Only **per-project** services exist (`getProjectAging`, `getPayablesSummary`, `getProfitabilityReport`). **No company-wide rollup of any of the three.** ⚠️ Anything keyed on `due_date` also inherits the **P-1 caveat**: due dates are not yet written, so it falls back to issue date. |
| **Recent activity** | **No audit or event table anywhere** — the same finding as the estimate and PO passes. It would have to be assembled per source. |
| **Crew load bars** ("33/40h") | ⚠️ **`tasks` has no hours column**, so **scheduled** hours are not derivable. Only **actual** hours are (from `time_segments`). The bars can show what a person *worked*, never what they are *booked for*. |
| **Company Gantt / Timeline / By-crew** | The Gantt is **project-level only**; the company schedule is **calendar-only**. The mockup's three-view company timeline is new. |
| **"Resumes when permit clears"** | Needs a hold reason. **No `hold_reason` column exists.** ("Cannot be scheduled until dates are set" *is* derivable.) |

#### §8.12.3 — ⚠️ The "on-site" badge does not mean what the mockup implies

The Timeclock mockup shows **On site / Off site** per person. **There is no geofence and no jobsite
coordinates anywhere to compare against.** The code already acknowledges this (M6M D-34 / S99): the badge
means **GPS was captured**, not that the person is near the job. **Do not restyle it as a proximity
claim.** Either relabel it to what it is, or leave it as-is; do not make it look like a location check.

#### §8.12.4 — Billing

**Owner-only** (not Owner/Admin) — confirm the redirect stays.

| Mockup element | Reality |
| --- | --- |
| **Team seats** | ✅ **Enforced** — `getSeatUsage`. |
| **File storage "2.4 GB of 100 GB"** | ❌ **Never measured. Display only.** |
| **QuickBooks sync "Included"** | ❌ A stub — see §6b.7. |
| **Add-on: AI photo auto-tagging $29** | ✅ Real — `companies.ai_tagging_enabled` gates it. |
| **Add-on: Client portal branding $19** | ❌ **RULED [Josh]: NO CHARGE. Remove it.** The add-on does not exist and **the portal logo renders unconditionally** — there is no gate, so the toggle sells something the customer already has. |
| **Add-on: Extra storage $15** | ❌ Does not exist, and storage is not measured. |
| **Invoice history + PDF links** | Lives in the **Stripe customer portal**, not in-app. |

##### RULED [Josh]: retention and access

**No read access without payment, in either path.**

| Path | Retention | Access | Built? |
| --- | --- | --- | --- |
| **Trial expiry** | **14 days** | **Locked.** Recoverable only by paying — which for a lapsed trial means opening a paid account. | ✅ Built (`lib/trial/lifecycle.ts`), with the retention window stored as a fact on the row rather than recomputed. |
| **Paid cancellation** | **90 days** | **Locked**, same as trial. | ❌ **Not built.** The only trace is a comment: *"cancellation gets 30 days and is a different path that is not built here."* |

⚠️ **The mockup's copy is wrong three ways** — *"Your data stays read-only for 90 days after
cancelling"*: wrong access model (**locked**, not read-only), a path that does not exist, and a number
that appears nowhere in the code. Replace with something like *"Your data is kept for 90 days after
cancelling. You'll need an active subscription to access it."*

⚠️ **90 days is not a number change — it is a feature.** Paid cancellation needs a lock, a retention
clock and an unban-on-payment route. The trial path is the working precedent, and its own comment warns
that the way back must clear **both the ban and the retention clock**.

⚠️ **Retention is a data-deletion policy.** If a terms of service or privacy policy states a different
period, the code and the document must agree. Not a matter this spec can settle.

#### §8.12.5 — Field Ops

**"2 of 4 jobs logged yesterday"** — the cron logic exists (`runDailyLogMissing`) but asks a **narrower
question**: it counts projects **with clocked time that day**, not active projects, and runs on a
service-role client **a page cannot call**. A page figure phrased as "N of M active jobs" is a new
derivation reusing the shape.

---

## §8b — LIVE EXPOSURE: client contract values are readable by PM, foreman and crew





**Found by the Documents inventory. Not caused by the redesign — it is live today.**
Same class as S121's finding that a crew member could read 13 change orders with cost and markup.

**What is wrong.** The Contracts tab carries **no `roles` entry**, `contracts-panel.tsx` renders
`contract_value` with **no role check**, and the RLS SELECT policies on `client_contracts` and
`subcontractor_contracts` floor out only `subcontractor` and `client`
(`20260912000000:129-149`). So **PM, foreman and crew read client contract values** — the figure the
Financial Visibility Floor reserves for Owner/Admin.

### RULED [Josh] — the two contract types are opposite directions of money

| Contract type | Who may see the value | Why |
| --- | --- | --- |
| **Subcontractor contracts** | Everyone **except** subs and clients | It is a **committed price — cost**, not a client price. The Floor's cost tier is broadly visible; a foreman coordinating subs legitimately needs it. **This is correct today. Do not change it.** |
| **Client contracts** | **Owner/Admin only** — blocked for **PM, foreman, crew and subs** | It is client-facing revenue, which is exactly what the Floor reserves. **This is the exposure.** |

The two wear the same words — *"contract value"* — while pointing in opposite directions. That is why
one absent gate covers both and only half of it is wrong.

### How it gets fixed — RULED [Josh]: a 1:1 side table
**Not in the restyle. Its own commit, and the fix belongs in the database.**
Loading client contracts only for Owner/Admin in the panel is **not sufficient** — a renderer that omits
a column is not a floor.

**Move `contract_value` to a 1:1 `client_contract_amounts` side table** (Owner/Admin SELECT/INSERT/
UPDATE, no DELETE), backfill, retarget the convert RPC and the panel readers, drop the column and its
now-moot write-guard trigger, regen types. The `project_financials` precedent.

⚠️ **Two wrong answers were tried first. Both are recorded so they are not tried again.**

**Wrong answer 1 — floor SELECT *and* INSERT/UPDATE.** Rejected because the write side **is already
floored, deliberately**: `contract_value` by a trigger (`20260809000000_financial_rls_floor_part3.sql:155`)
and voiding by another (`20260926000000_7i_contracts.sql:504`). The trigger-over-policy choice was ruled
**twice**, specifically so **a PM can still edit contract notes**. Narrowing UPDATE would overturn that
ruling as a side effect of fixing something else.

**Wrong answer 2 — floor SELECT only.** Rejected on a **measured** finding: in Postgres an
`UPDATE … WHERE` must match the row **through the SELECT policy**. Proven by impersonation on
rebuild-test — PM select count **0**, PM WHERE-filtered update matched **0 rows**, even though
`client_contracts_update_authorized` still admits the assigned PM. So a row-level SELECT floor
**silently removes PM writes too**, kills notes-editing, and makes both write-guard triggers dead code.
It also breaks four tests: `s145 C4` and `s97ct-floor3 4a` go **red** (the trigger never fires), and
`s97ct-floor3 4b` and the s145 narrow-guard test go **false-green** — passing vacuously on zero rows.

**Why the side table is right here when S121 rejected one.** S121 rejected it because *"the money sits on
rows a PM must INSERT and UPDATE."* Here the inverse holds: a PM **does not** write the money (a trigger
already blocks it) but **does** write other columns. That is precisely the case a side table exists for.

**The ruling is about the VALUE, not the row.** A PM keeps the contract; they lose the figure.

### ⚠️ The side table needs TWO SELECT arms, not one — and Fix 1 is CHECKPOINTED

A third correction, found while mapping readers: **`portal.ts:347` shows a client their own
`contract_value`** in the M9 portal — the counterparty view, per S164. **An Owner/Admin-only
`client_contract_amounts` would break the client portal.** The table needs **two SELECT arms** — staff
Owner/Admin, and client-of-project — mirroring the existing `client_contracts_select_client`.

**RULED [Josh]: Fix 1 is checkpointed, not built.** Rebuild-test has been restored to its pre-session
state. It becomes its own dedicated, fully-tested change.

*Why it was stopped:* the fix grew **three times in one session** as facts arrived, and it is now the
same shape and size as the original `project_financials` split (which shipped as **three migrations**).
CC cannot exercise the portal or the panel end-to-end in that environment — only the live RLS suite — and
a change that touches the client portal's money display, verified only by RLS tests, is exactly the kind
that passes and still breaks a customer-facing surface. The exposure is also **internal**: PM, foreman and
crew are staff, on their own jobs, with one real tenant.

**The dedicated session starts from these established facts, not from scratch:**

| Surface | Work |
| --- | --- |
| Migration | New `client_contract_amounts` (1:1), **owner/admin + client SELECT arms**, owner/admin INSERT/UPDATE, no DELETE; backfill; rewrite `convert_estimate_to_project` to insert the amount; edit `enforce_client_contracts_column_scope` to drop its `contract_value` clause; drop `client_contracts.contract_value`; leave `client_contracts_select_visible` broad |
| Types | `database.ts` regen — column dropped, table added |
| Readers | `getClientContracts` (join), the `ClientContract` type, `contracts-panel.tsx` (~8 sites incl. revise/confirm), **`portal.ts:347` (client arm)**, `createClientContract`'s dead-code field |
| **Not** affected | `lien-releases.ts:461` (that is a *sub* contract) · `contract-value.ts` (that is `project_financials`) |
| Tests | Rewrite `s97ct-floor3` 4a/4b to the side table; add amounts-floor **and client-arm** coverage |

**Acceptance signal:** `s97ct-floor3 4b` and the s145 narrow-guard test must stay **genuinely** green.
If either passes on zero rows, the fix is wrong in the same way the two rejected mechanisms were.

**Consistency note:** blocking PM here matches the direction of §7.1 — a client contract is
client-facing money. It is the same position, not a new one.

---

## §8c — Defects

### Ruled for fixing [Josh]
Two items. Both found by the inventory pass; neither is caused by the redesign, and neither is folded
into it.

1. ✅ **FIXED — UTC date bug in `getDashboardData()`.** Committed `8de9b4d` on
   `fix/dashboard-tz-boundary`, path-scoped to `dashboard.ts`.
   ⚠️ **The scope in this spec was wrong and was narrowed on evidence.** It named *both* `today` and
   `sevenDaysAgo`. **Only `today` was a bug** — it is compared to `projects.target_end_date`, a **date**
   column, so between ~8pm and midnight local, UTC's "today" is already tomorrow and a project due today
   counted as overdue a day early. Fixed with `companyToday(timezone)`, the `complianceToday()` pattern.
   **`sevenDaysAgo` was correct and was deliberately left alone** — it is compared to
   `change_orders.sent_at`/`signed_at`, which are **timestamptz instants**. Both sides are absolute
   points in time; there is no calendar boundary to get wrong. `dates.ts` names this trap in its own
   header: *"CALENDAR DATES ONLY — DO NOT 'FIX' INSTANTS WITH THIS… a well-meaning sweep that converts
   them introduces the bug it is trying to remove."* **This spec's instruction was that sweep.**
   No test asserted the old behaviour, so nothing went false-green.
2. ✅ **FIXED — three N+1 loops in server pages.** Committed `04b67f4` on `fix/n1-server-page-loops`,
   five files. Each per-row loop now issues one `.in(...)` grouped by the FK; the per-row functions were
   **kept**, as they have other callers.
   *Output verified unchanged three ways:* all three order by a single key, so grouping a
   globally-ordered result preserves each group's order, and every child row has exactly one parent FK so
   nothing duplicates across groups; live equivalence on rebuild-test showed **0 mismatches**; and
   `s146-contract-services` passed **23/23**.
   ⚠️ **Logged, not fixed — a fourth instance on the mobile surface:** `app/m/expenses/page.tsx:145` has
   the same `getExpenseReceipts`-per-expense N+1. Out of scope for that commit; worth a follow-up.

> A third item was ruled for fixing at the same time — the **dual insurance-expiry stores**. It was
> subsequently investigated and **ruled LEAVE AS IS** (see §8.4). It is not in this list.

### Logged only — no ruling, do not fix
- **A stale policy comment.** `app/m/subs/page.tsx:20–22` quotes the SELECT policy as *"company_id =
  caller's AND is_deleted = false — NO ROLE FLOOR"*. The live policy adds the S131 roster floor
  (`get_my_role() <> ALL (ARRAY['subcontractor','client'])`). The comment's **conclusion** still holds —
  crew and foreman do read every column, so the UI-only cut still matters — but its quoted policy text
  is two migrations stale. Found in the sub-compliance pass, not the inventory pass.

---

## §9 — Rulings the redesign must not re-litigate


Carried from the brief; the design predates them and **the rulings win**.

1. **Selection signature is the binding instrument — no change order is generated.** The `16a` mockup's
   "Full from a selection overage" and the Budget & Cost watch list's "a client upgrade turns into a
   change order" are **wrong** and must be amended. Supersedes S150 R21.
2. **The Financial Visibility Floor.** Foreman sees **actual only**. Sell derives per instrument then
   aggregates; a blanket `cost × markup` produces numbers that look right and are wrong. Check every
   money figure on every screen against who can read it.
   ⚠️ **The S97 carve-out is OVERTURNED.** *A PM sees the amounts on an invoice they can reach* was the
   premise Josh rejected, and **§7.1 is now closed**: a PM sees invoices **they authored** and no
   aggregates; the Payments tab becomes Owner/Admin. `money-representation.md` needs amending to match
   — **[2026-08-28] RULED [Josh]: that amendment travels with the invoice-floor work; the redesign
   pass does not touch `money-representation.md` or `7d1-spec.md` §12a.**
   Everything else in the Floor stands. **[The floor itself shipped — `2ff9966`; see §7.1.]**
3. **`useConfirm()` HAS SHIPPED.** S175 item 9 merged — *"native dialogs replaced with a shared confirm
   overlay; the coverage gap made explicit."* The redesign uses it and does **not** re-solve the sweep.
   ⚠️ The commit message says the **coverage gap was made explicit**, so some call sites were
   deliberately left. Check what remains before assuming every dialog is styled.
   *(Superseded, kept rather than deleted: this spec previously recorded `useConfirm()` as ruled-but-absent,
   with measured counts of 58 `confirm(` / 20 `alert(` / 5 `prompt(` on the S175 branch. Those were the
   pre-sweep figures.)*
4. **The project Selections page carries no costs at all** — visible to every role including
   subcontractors. It sidesteps the Floor rather than needing a role-based arm. Same for the
   specifications sheet.
5. **Estimates freeze once sent**; void-and-reissue is the only path. Unsend is WON'T BUILD, refused at
   the database.
6. **`/m` is a ruled nine-tile set** and is not in this handoff. It must not drift — see R6.