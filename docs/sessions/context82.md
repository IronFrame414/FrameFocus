# Session 82 — Context

**Date:** Monday, July 20, 2026
**Shape:** UI-refresh build session. ui-01 through ui-06 built on `feat/ui-refresh` and merged to `main` (fast-forward). This file is the only uncommitted artifact — Josh commits it manually.

---

## What this session did

Built the full 1a "Refined Navy" UI refresh — ui-01 Foundation through ui-06 Change Orders — per the amended specs from Sessions 80–81, and merged to `main`.

**Commits (all on `feat/ui-refresh`, fast-forwarded to `main`; verified via `git log`):**

| Commit  | Description                                                                             |
| ------- | --------------------------------------------------------------------------------------- |
| d9f4ce7 | feat(ui): theme token module + dashboard KPI and schedule services                       |
| 04020c3 | feat(ui): 1a foundation — fonts, tokens, nav shell                                       |
| 46869e3 | feat(ui): restyle dashboard, projects, project detail, budget, change orders; extract schedule route |

`main` tip = `46869e3`. Working tree clean apart from this context file.

---

## Financial visibility floor — UI-only, RLS follow-up named

The financial visibility floor (Owner/Admin see contract/budget/sell/CO dollars; PM/foreman/crew see actual cost only — CLAUDE.md, added 2026-07-20) is enforced **at the UI layer only** as of this merge. `can_view_project()` has no role floor, so a gated user can still read the figures via a direct API/query.

The DB-level fix is the named **`FINANCIAL-RLS-FLOOR`** migration (ui-01 §10 follow-up). **Batch it with the 7 pending production migrations** from the Session 79 carry-forward — those 7 are still unapplied and still block any real prod use. Together that's a **7+1** migration batch. See context79.md for the ordered list of the 7; do not test against prod — rebuild-test parity first.

---

## Parked / known (not bugs introduced this session)

- **`/billing` redirect bug** — pre-existing, surfaced during shell restyle exactly as predicted (S81 F8). Unchanged.
- **ui-05 export and "+ line item" stubs omitted** — the spec's buttons were dropped because no export or line-item-create flows exist to wire them to. Add when the flows exist, not before.
- **"View all activity" is a placeholder** — there is no activity log in the platform. The dashboard link renders but goes nowhere real.
- **Vendor chips show "Sub"** — the assignee/vendor chips inherit tech debt **#89** (hardcoded "(Sub)" mislabel on vendors). Displays wrong until #89 is fixed at the source; assignment itself works.
- **Photos tab is a stub page** — `projects/[id]/photos/` exists as a route with placeholder content only.

---

## Next session — two candidates

1. **Apply the 7+1 prod migrations** — the 7 from Session 79 plus `FINANCIAL-RLS-FLOOR`, in timestamp order, rebuild-test parity first. This is the gate on real prod use.
2. **ui-07 planning session** — Contacts unification (Item 3) + task-creation panel (Item 4). The brief was corrected in S81; the Item 3 data-model fork (presentation-merge vs. true consolidation) is still the pending decision and comes before anything else there. Interview-first, per S81.

Ground-truth the repo with `git log --oneline -15` before trusting either this file or STATE.md.
