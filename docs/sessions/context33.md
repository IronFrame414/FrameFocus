# Session 33 — Module 4 Architecture Planning

**Date:** April 20, 2026
**Goal:** Design the full Module 4 (Sales & Estimating) architecture before writing any code.
**Outcome:** Complete architecture document produced. No code written.

---

## What shipped

- `module4-architecture.md` — comprehensive Module 4 design covering workflow, data model (7 new tables + 1 modification), UI structure (7 routes), role permissions, AI strategy, versioning, proposal generation, e-signature approach, pipeline dashboard, and sub-module build order (4A–4J). To be added to `CLAUDE_MODULES.md` in the repo at the start of Session 34.

---

## Key decisions

All decisions are documented in the architecture doc. Highlights:

- Dual line type: lump sum (sub bids) and detailed (labor + materials + tax + markup) on the same estimate
- Three-level hierarchy with optional subcategory
- Cost catalog with manual pricing and stored product URLs (web price lookup deferred)
- Proposal pricing toggle: total only / category totals / full line items
- Estimates frozen once Sent — changes create a new version (v1.1, v1.2)
- Estimate number format: EST-001 (simple sequential)
- Conditional review step: PM-created estimates need Owner/Admin review before sending
- React-PDF for proposal generation
- E-signature via DocuSign or BoldSign (decide at 4F build time)
- Contact addresses table added (multiple addresses per client)
- Hard delete on estimate child records (categories, subcategories, line items, materials) — deliberate exception to soft-delete convention
- AI v1: GPT-4o suggestions from pasted scope (no historical data needed). Embedding infrastructure built for future personalization.
- In-app follow-up notifications at launch; email automation deferred

---

## How to start Session 34

Session 34 is a **document cleanup session** — no feature code. Three goals:

1. **Audit all context files (context1–context33)** for anything skipped, forgotten, or inconsistent with current architecture. Flag gaps.
2. **Add Module 4 architecture to `CLAUDE_MODULES.md`** in the repo.
3. **Review and shorten CLAUDE.md and STATE.md** — remove stale content, consolidate redundancies, tighten language. Goal: make these docs leaner and more reliable for Claude AI to work with across sessions.

After Session 34, the docs should be clean and current, ready for Module 4 code to begin in Session 35.
