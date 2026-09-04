# UI gap pass — shipped vs. handoff conformance — running log

Branch: `feature/estimates-redesign` (@ `a53b7a8`). Session S103.

⚠️ The Codespace has restarted repeatedly; this log is the durable deliverable — appended and
committed after every screen.

## The finding (Josh, §0)
NEW screens got the design; PRE-EXISTING screens that were *edited* got new features/cards/token-swaps
layered onto their OLD layout. "Feature present" was reported as "screen done." This run measures the
gap (Phase 1) and closes it worst-first (Phase 3).

## Design authority + precedence [Josh, S103] — LATER WINS
1. `EZContractorBinder_Desktop_handoff` (most screens)
2. `EZCB_Estimates_handoff` — overrides desktop for estimates
3. `EZCB_Estimate_Items_PO_handoff` — overrides both (add-item sheet, convert/PO)
- `.dc.html` = authority on layout/behaviour; `support.js` = reference only, never port.
- Colour defers to existing tokens. Numeric typeface = IBM Plex Mono (money/qty/dates/%/cost-codes/IDs).
- `docs/specs/desktop-redesign-spec.md` records deliberate deviations; where it says WILL NOT BUILD,
  the spec wins over the handoff.

### Spec WILL-NOT-BUILD / deferred (do NOT build these even if the handoff shows them)
- ⛔ Coverage check (scope↔categories link) — no link exists; confident-wrong-answer.
- ⛔ Crew load bars "33/40h" — no scheduled-hours column; would lie.
- ⛔ Company Gantt / three-view company timeline — project-level only exists.
- ⛔ "Resumes when permit clears" — no hold_reason column.
- Deferred: Estimate Health *target* bar (§6b.2); Unbilled-to-client (§6b.6); proposal variable editor.

## Contracts that must not break (§4)
per-field autosave (onBlur, no dirty-state layer) · two-step add sheet writes nothing until step 2,
controls never in scroll body · `canEdit = status==='draft'` whole-builder · PO = cost only, never
sell · Financial Visibility Floor (don't move a figure out of a gated block) · #136 (render-gate still
ships payload) · grids `minmax(0,1fr)` never bare `1fr`.

---

## Phase 1 — audit (READ-ONLY). Classification per screen.
(appended below as each cluster completes)

