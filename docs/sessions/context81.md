# Session 81 — Context

**Date:** Sunday, July 19, 2026
**Shape:** UI-refresh spec audit + amendments. Docs-only. Nothing built, no repo commits made by Claude — Josh saves the output files into `docs/specs/` and commits path-scoped.

---

## What this session did

Audited the six UI-refresh specs (ui-01 Foundation through ui-06 Change Orders, design direction **1a "Refined Navy"**, drafted from the parallel design session) against known project state and a live read of the repo. Produced amended versions of all six, plus one new pre-spec brief (ui-07). All seven files delivered as outputs for Josh to save at `docs/specs/` and commit.

### Audit findings applied (F1–F8)

1. **F1 — Schedule decision resolved by Josh:** Dashboard keeps the new summary layout WITH the crew-schedule card, AND Schedule becomes its own left-nav item. This reverses the specs' "no Schedule nav item" lock. Nav is now **10 items**: Dashboard · Projects · Schedule · Contacts · Subs & Vendors · Estimates · Cost Catalog · Settings · Team · Billing. The Schedule nav item routes to the existing schedule view (the one the current dashboard renders); its body restyle is deferred (ui-01 §5a).
2. **F2 — Rename:** platform renamed **RafterWorks**. Wordmark = "Rafter" white + "Works" amber. Display-only; repo/package names stay FrameFocus. Sidebar company line is the tenant (Bishop Contracting), unchanged.
3. **F3/F6 — STOPs converted to build-with-definition:** Josh authorized building the missing UI data hooks in-repo. Dashboard KPIs (ui-02 §S2), Needs-Attention feed (ui-02 §S4), projects-list progress/next-up (ui-03 §S2), and project-detail KPIs/open-items (ui-04 §S3–§S6) now carry explicit read-only derivation definitions instead of hard STOPs. Structural conflicts (nav diff, tab diff, status-set diff) remain STOP-and-surface.
4. **Known-gap fallbacks locked:** Cost to Date, Committed, Actual, and Projected Margin render **em-dash** until Module 7A's ledger exists and the `project_budget_items` sell-basis schema gap is fixed. No fake margins from contract − budget (ui-04 §S3, ui-05 §S2–§S3).
5. **F4 — Merge gate added:** ui-refresh build may not start until `feat/signed-artifacts` merges to `main` (ui-01 §1, reinforced ui-06 §1 — CO files conflict otherwise).
6. **F5 — Branch claim corrected:** `feat/ui-refresh` does **not** exist (verified against origin 2026-07-19). Spec now says create it fresh off `main`.
7. **Negative-CO rendering locked (ui-06 §S4):** credits render `−$X` in danger `#dc2626`, mono, right-aligned; the Approved summary sums signed amounts.
8. **F7/F8 noted in-spec:** 6A has no UI (Schedule tab may be absent — surface, don't build 6A here); `/billing` redirect bug will surface during shell restyle (known, unchanged).

### New file — ui-07 brief (pre-spec, do NOT build)

`ui-07-contacts-task-panel-brief.md` — Session 79 planning input, rewritten once this session after Josh corrected Item 3:

- **Item 3 — unified Contacts surface.** One Contacts page, three views (Clients / Subs / Vendors). **Confirmed intended behavior (S79): subs are assignable in scheduling only when entered via Subs & Vendors — that is correct, no assignment gap.** The real confusion: subs also appear in the Contacts list. **Decision locked: subs do NOT appear in the Contacts/Clients view.** Open: tabs vs. filtered list; presentation-merge vs. true data-model consolidation (the big fork); `/subs-and-vendors` route fate; per-type fields. Fixing the model also fixes tech debt **#89** ("(Sub)" mislabel on vendors) at the source.
- **Item 4 — task creation via modal/slide-in panel** (not inline) on the project schedule. Open: modal vs. slide-in; v1 field set; create vs. create+edit (one reusable component recommended). **Downstream of Item 3's data fork** (assignee picker) and of the 6A UI build.
- Sequencing: Item 3 fork first, then Item 4 panel. ui-01 §10 carries forward-pointers to both; ui-01 builds the nav as-is (both Contacts and Subs & Vendors), no pre-merging.

---

## Git state observed (read-only clone, verified — Claude wrote nothing to the repo)

- **`origin/feat/signed-artifacts` tip: `74ebe73`** — Sessions 77–78 happened after the last memory snapshot. Recent commits are test coverage: `74ebe73` (email buildSenderAddress/replaceTemplateVariables), `46b5c26` (server-only stub for vitest), `fab7ee6` (legacy-CO null created_at / empty items), `1b80d11` (two-signature co-data flow). Several of the six owed test areas are being closed.
- **Session 78 context (per its commit message):** 6B/6C/6D landed on rebuild-test; `email_type` CHECK replaced with a lookup table.
- **`origin/main` tip: `65b755b`** (Session 69 context). No `feat/ui-refresh` branch exists. No `feat/module-6bcd` branch visible on origin.
- Nothing in this session modified the repo. All output files live outside it until Josh commits them.

---

## Files Josh needs to save + commit (path-scoped, `docs/specs/`)

`ui-01-foundation-spec.md` (latest = the version containing the §10 ui-07 pointers), `ui-02-dashboard-spec.md`, `ui-03-projects-list-spec.md`, `ui-04-project-detail-spec.md`, `ui-05-budget-spec.md`, `ui-06-change-orders-spec.md`, `ui-07-contacts-task-panel-brief.md`, and this file at `docs/sessions/context81.md`.

---

## Next session

1. Confirm the seven spec files + context81 are committed (verify with `git log`, not this doc).
2. UI-refresh remains **gated on `feat/signed-artifacts` merging to `main`** — the signed-artifacts open items (TECH_DEBT.md location, cursive font, two-signature v2 testing now partially underway, API error-message convention, remaining owed tests) come first.
3. When the gate clears: create `feat/ui-refresh` off `main`, build ui-01 Foundation per its spec (CC Plan Mode, §S resolution first).
4. Item 3 / Item 4 planning sessions (ui-07) are separate interview-first sessions — Item 3's data-model fork before anything else there.
