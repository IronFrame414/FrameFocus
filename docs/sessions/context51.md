# context51 — 4D/4E close-out + the full 4D revision arc (Rev 2 + Rev 3)

**Span:** June 18–29, 2026 (multiple sittings; migration timestamps 20260618 ->
20260629).
**Branches touched:** `feature/module-4-estimates` (4D/4E build), `feature/4d-
revision` (the revision; child of the former).
**Number caveat:** last committed context was context50; confirm this is context51
against your own sequence before committing.

---

## What this session was supposed to be vs. what it became

It started as the `module5-computer-tasks.md` carryover checklist: commit the
4D/4E build, fix the 4E spec domain, run acceptance checks, add Vercel env vars,
set up the Resend webhook, update STATE + write the context doc (Group A), then
grep-verify Module 5 assumptions (Group B).

Only **item 1 (commit the 4D/4E build)** got done before a smoke test turned the
session into a full builder redesign. Everything else on that checklist is still
parked (see "Parked carryover" below).

---

## What was accomplished (chronological)

1. **Committed the 4D/4E build.** Verified the dirty tree on `feature/module-4-
estimates`, type-check green, committed in 11 scoped commits (10 planned + 1 for
   three files the grouping missed: `lib/proposal/`, `email-service.ts`,
   `email.ts`). NOT pushed.

2. **Smoke-tested 4D/4E** — surfaced three _design changes_ (not bugs; the build
   matched its spec): (a) labor as rate x qty, (b) nested Scope of Work, (c) unify
   the Items input so lump-sum vs detailed is presentation-only.

3. **Spec'd the revision.** Design interview -> unified typed-row model
   (labor/material/subcontractor/other). Read `module4-architecture.md`, flagged
   the changes amend it. Wrote `4D-revision-spec.md`, revised to **Rev 2** after
   CC's Phase 2 caught schema collisions — most importantly reusing the existing
   `proposal_pricing_level` instead of a parallel presentation system, plus
   rewriting three RPCs (`switch_pricing_mode`, `set_winning_bid`,
   `clone_estimate`).

4. **CC built Rev 2** on `feature/4d-revision`. Migration applied + verified live;
   architecture doc amended; type-check + `npm run build` clean. Confirmed the
   **tax-on-marked-up-cost** convention (markup applies to cost + tax) — now
   codified in architecture §4.4a.

5. **Smoke-tested Rev 2** — caught that there was **no UI control to set proposal
   detail level** (every proposal fell back to the company default = lump-sum), and
   that the per-line/category presentation dropdowns on the Items tab were unwanted
   clutter.

6. **Rev 3 spec** (additive, separate file `4D-revision-spec-rev3.md`): remove the
   per-line/category `presentation_mode` dropdowns + columns; replace the
   presentation model with a single estimate-level **five-value** selector; split
   the Items "Detail" column into **Price** and **Qty**.

7. **Fixed the misplaced spec file** — it had saved to
   `docs/specs/docs/specs/4d revision spec.md` (doubled path, spaces, lowercase).
   Moved spec + notes to `docs/specs/`, removed the stray nested tree.

8. **Committed the Rev 2 build** (4 commits) and the **Rev 3 spec** (1 commit).

9. **CC built Rev 3.** Phase 2 caught that `clone_estimate` / `clone_estimate_line`
   reference `presentation_mode` (CREATE OR REPLACE to drop the references in the
   same migration). Answered the two design questions: **Q1 no-price scope = hide
   breakdown but KEEP the grand total**; **Q2 selector = on Details tab AND keep it
   on the preview page** (both bind to the same field). Built, smoke-tested
   successful (five modes + Price/Qty split).

10. **Committed Rev 3** (3 commits).

---

## Current repo state

- **`feature/4d-revision`** — all Rev 2 + Rev 3 work committed. Working tree clean
  except two untracked docs (below). NOT pushed.
- **`feature/module-4-estimates`** — parent; holds the original 4D/4E build (11
  commits). NOT pushed.
- **Untracked, deliberately left out:** `docs/specs/module5-architecture.md` and a
  new `docs/Framefocus future module architecture.md` (Module 5 / future planning,
  not part of this build).

---

## Final estimate data model (authoritative for Module 5)

- **estimate_line_items** — named unit: name, description (client-facing),
  discount, **total_price_override** (kept), computed total_price, notes,
  sort_order. REMOVED: line_type, the lump-sum/detailed cost columns, the three
  line-level markup columns, and (Rev 3) presentation_mode.
- **estimate_line_rows** (replaced estimate_line_materials) — `row_type`
  (labor/material/subcontractor/other), per-row markup_percent, apply_tax (forced
  false for labor; material defaults true; sub/other opt-in), computed total, plus
  type-specific columns (labor: rate/quantity/labor_unit; material: catalog_item_id
  /unit_of_measure incl. allowance/unit_cost/quantity; sub/other: amount;
  subcontractor: subcontractor_id).
- **estimates.proposal_pricing_level** — now FIVE values: `lump_sum`,
  `category_with_price`, `category_no_price`, `detail_with_price_qty`,
  `detail_no_price`. Quantity shows at detail level only. Both no-price modes keep
  the grand total. (presentation_mode override columns dropped in Rev 3.)
- **companies** — added `default_labor_rate`; `default_proposal_pricing_level`
  expanded to the same five values.
- **Scope** — `scope_sections` JSONB (one-level nesting) + `scope_summary` TEXT
  (replaced `scope_of_work TEXT[]`).
- Tax convention: markup applies to cost + tax (codified, architecture §4.4a).
- Per-row typed costs are first-class and queryable per line — a superset of what
  Module 5's budget snapshot needs; no information lost.

---

## Open deviations / decisions still pending

- **Lump-sum category label** renders as "Included scope" — wording never
  confirmed; eyeball and change if wanted.
- **No inline subcontractor picker** on rows — a manually-added sub row carries an
  amount but no sub link; linkage only via the Bidding tab / `set_winning_bid`.
  Spec-compliant, flagged as a UX gap; decide v1-acceptable or follow-up.
- Multiple subcontractor rows on one line: `set_winning_bid` errors on 2+ (v1
  stance); richer mapping deferred.

---

## Parked carryover (from module5-computer-tasks.md — still undone)

- **Item 2:** fix on-disk 4E spec domain — `frames-focus.com`/`frame-focus.com` ->
  `rafterworks.com` (`grep -n "frames-focus\|frame-focus" docs/specs/4E-spec.md`).
- **Item 3:** run full 4D (checks 5–43) + 4E (checks 5–45) acceptance checks; the
  email/cron ones need items 4–5 first.
- **Item 4:** Vercel env vars — add `RESEND_API_KEY` and `CRON_SECRET` (only in
  Codespaces secrets now).
- **Item 5:** Resend webhook -> `https://<vercel-url>/api/webhooks/resend`; copy
  signing secret -> add `RESEND_SIGNING_SECRET` to BOTH Codespaces and Vercel.
- **Item 6:** update STATE.md (Module 4 status + the new line/row + five-value
  presentation model). [This context doc covers the retrospective half of item 6.]
- **Push** `feature/module-4-estimates` and/or `feature/4d-revision`.
- **Group B (items 7–9):** re-run the Module 5 grep checks, but **re-read against
  the shipped schema** — the revision changed the estimate line model, so the
  architecture doc's §5.13 assumptions may have shifted. Flag mismatches; do not
  edit the architecture doc.
- Decide where `docs/Framefocus future module architecture.md` belongs and whether
  `module5-architecture.md` gets committed.

---

## How to start the next session

1. **Verify state first — git is ground truth.** `git status`, `git log --oneline
-10`, confirm you're on `feature/4d-revision` and both builds are committed as
   this doc claims.
2. **Decide the branch path:** merge `feature/4d-revision` -> `feature/module-4-
estimates`, then push? Or keep going first. Nothing is pushed yet.
3. **Then work the parked carryover** in the order above — start with the cheap,
   safe one (item 2, the 4E domain grep/fix), then env vars + webhook (items 4–5),
   then acceptance checks (item 3), then STATE.md (item 6), then the Group B greps
   against the shipped schema.
4. The 4D revision arc itself is **closed** — built, tested, committed. No further
   builder work pending unless the two open deviations above get promoted.
