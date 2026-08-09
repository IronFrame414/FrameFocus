# Session 88 — Module 8 Architecture (parallel to S87)

Branch: feat/module-8-architecture (off origin/main), pushed. Tip: aff85ee.
Session 87 live on feat/module-6b-ui — its uncommitted 6B work was in the shared
tree; untouched. Not merged to main; Josh coordinates merge order.

## Done

- Verified: no M8 architecture existed; module7-architecture.md is the template.
- Inbound hooks grepped: 6B free-text material/notes (additive structuring),
  6B equipment-hours (future tool-catalog FK), 6D discrepancy return flag.
- Interview-first: three founder-approved traces (materials, tools, consumables).
- Wrote docs/specs/module8-architecture.md (aff85ee, path-scoped, 1 file).

## Key decisions (detail in the architecture doc)

- "Shop" everywhere, never "warehouse". Shop is a location, no check-in flow.
- Removal reasons: Project / Trash / Donate. Project removals write budget lines;
  unpriced ones write FLAGGED lines Owner/Admin must backfill.
- Tool + material prices visible to ALL staff (cost basis — no RLS-floor conflict).
- Out for Repair = tool location w/ required where-text. Heavy equipment excluded.
- Consumables = material + low-stock threshold + vehicle locations; use hits budget.

## New cross-cutting item

Notifications system (sidebar w/ unread count, 30-day retention, star, mobile
push) is its OWN build, gates M8 launch. Needs interview + architecture session.

## Carryover flags

1. future_module_architecture.md stale (M4/M7 status) — fix after S87 closes.
2. Inventory + Notifications nav items -> FFNav reindex (S87's 6B scope).
3. M8 spec work blocked on project_budget_items cost/sell/profit resolution.
4. Sub-module split 8A/8B is PROPOSED only.
