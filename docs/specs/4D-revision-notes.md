# 4D Builder — Design Revision Notes (Pre-Spec)

**Captured:** June 18, 2026, during the 4D/4E smoke test.
**Status:** Design changes, NOT spec deviations. The 4D/4E build faithfully
implemented `4D-spec.md`; these are changes to the original design that surfaced
on first real use. To be turned into a proper spec via an interview-first session
before any implementation.

**How to use this file:** This is a capture of intent + open questions, not a
build-ready spec. The "Open questions" under each item must be answered in the
revision spec interview before Claude Code is given anything. Do not let Claude
Code infer answers to these — they are domain/product decisions for Josh.

---

## Sequencing dependency (read first)

Item 3 changes the estimate **line data model**. Module 5's estimate-to-project
conversion reads that model for its budget snapshot (`module5-architecture.md`,
§5.13). Therefore the **schema portion** of this revision should be settled
before Module 5 spec work begins, or Module 5 will be specced against a line
model that's about to change. The builder-UI and proposal-PDF portions can lag;
the schema cannot.

---

## 1. Labor input format + company default labor rate

**Current behavior.** A "Detailed" line has a single flat **Labor cost** field
(e.g. `$1,234.00`) plus a **Labor markup %**. Materials, by contrast, are entered
as rows: material, unit, qty, unit cost, tax → row total, with "+ Add Material".

**Desired behavior.** Labor should be entered the same way materials are —
as **rate × quantity** rather than a single flat figure — so the two halves of a
detailed line are structurally consistent.

**Plus:** add a **default labor rate** field under Company Settings. Like every
other settings default, it pre-fills the builder but stays editable per-estimate
(and presumably per-line).

**Why.** A flat labor cost forces the user to do the rate×hours math in their head
or elsewhere. Rate × quantity matches how contractors actually price labor and
keeps the line auditable. A company default rate removes repetitive entry.

**Touches:** estimate line schema (labor fields), company-settings schema + form
(this is the 4M area just built), `estimate-totals` util, builder UI, proposal PDF.

**Open questions for the spec interview:**

- Unit of labor quantity — hours only, or selectable (hours/days)?
- One labor entry per line (single rate × qty), or multiple labor rows like
  materials support ("+ Add Labor" for different crew/rates)?
- Company default labor rate — a single company-wide rate, or multiple (per trade,
  per role/crew type)? Does it relate to the planned `tm_rate` on `profiles`
  (Module 6 prep), or is it a separate field?
- Does Labor markup % stay unchanged, applied on top of rate × qty?
- Does labor get a per-row tax flag like materials' `apply_tax`, or is labor never
  taxed?
- Migration: existing estimates carry a flat labor cost. Backfill as
  qty 1 × rate = old cost, or treat current data as throwaway and drop/recreate?

---

## 2. Scope of Work — nesting + summary

**Current behavior.** Scope of Work is a flat list of bullets (add, reorder
up/down, delete).

**Desired behavior.** Support **nested sub-categories** — a parent grouping with
child bullets under it — and add a **summary at the top** of the Scope section.

**Why.** Real scopes group naturally (e.g. "Demolition" → its bullets,
"Framing" → its bullets). A flat list forces all of that into one undifferentiated
column. A top summary gives the client a high-level read before the detail.

**Touches:** scope data shape (flat array → tree), builder UI, proposal rendering.

**Open questions for the spec interview:**

- Nesting depth — exactly one level (category → bullets), or arbitrary depth?
- The summary — a single free-text field the user writes, or auto-assembled from
  the category headers? Where does it render on the proposal (top of scope section,
  cover sheet)?
- Do sub-categories have their own titles/headers, and do those headers appear on
  the client-facing proposal?
- Storage shape — JSONB tree on the estimate, or a child table?
- Proposal rendering — how does nesting appear visually (indented bullets, bold
  category headers, numbering)?

---

## 3. Unified line editing — "lump sum" is presentation-only

**Current behavior.** Each line has a **type** chosen at creation:
"Lump Sum (sub bid)" produces a line with `sub_bid` + `sub_margin %`; "Detailed
(labor + materials)" produces the labor + materials breakdown. They are two
different input forms backed by different schema.

**Desired behavior.** The **Items section is the user's build/input surface** and
should look the same regardless of type — the user always builds with their real
data. **"Lump sum" becomes purely a presentation choice**: what the end client
sees is either the itemized breakdown or a single rolled-up number. It is not a
separate way of entering data.

**Why.** The internal estimate and the client-facing proposal serve different
audiences. The user wants to build and track full detail internally even when the
client should only see a single price. Splitting "how I build it" from "what the
client sees" lets one estimate do both without re-entry.

**Touches:** estimate line **data model**, builder UI, proposal PDF. Largest of
the three, and the one with the Module 5 dependency noted above.

**Open questions for the spec interview (these are the crux — do not infer):**

- **Sub bids with no breakdown.** A subcontractor's bid is often a single number
  with no labor/material detail you can enter (e.g. "Electrical sub: $12,000").
  If the input surface is always detailed, how is a flat sub bid entered? Is there
  still a single-number line, or does a sub bid become one material-style row?
- Is the show-as-lump-sum toggle **per-line, per-category, or per-estimate**?
- When shown as lump sum, what exactly is the rolled-up number — the line/category
  total including markup? Pre- or post-discount? Pre- or post-tax?
- The existing `sub_bid` / `sub_margin` schema and the line-type column — removed,
  migrated, or repurposed? What happens to estimates already built with lump-sum
  lines?
- How does this relate to the separate **Bidding tab** (sub-bid tracking,
  `bid_document_file_id`)? Are sub bids tracked there and pulled into a line, or
  entered directly on the line?
- **Module 5 contract:** what does the estimate-to-project budget snapshot need to
  read — the detailed breakdown, the client-facing number, or both? This answer
  determines the schema and is the gating decision for sequencing.

---

## Not yet decided

- Whether this revision ships as one spec or is split (e.g. labor + scope as a
  smaller spec, line-model unification as its own).
- Timing relative to Module 5 (see sequencing dependency above).
