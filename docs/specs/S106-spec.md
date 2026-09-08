# S106 — SPEC — estimates layout, line totals, estimate files

**Status: INCOMPLETE (Phase 1 in progress).** Scaffold from Josh; CC fills the
FILL markers by measurement, then ASKs go to Josh in one Phase-2 message.

**RULED** = settled by Josh. Do not re-litigate.
**FILL-n** = a hole CC measures and fills in place.
**ASK-n** = goes to Josh in Phase 2 and becomes a ruling.

⚠️ **Do not build from this file until the audit at the end passes.**

⚠️ **THREE pieces of work with different risk, sharing a screen and nothing
else.**
- **Part A** — details page layout. Cosmetic.
- **Part B** — editing a line item's Total. **A write path on money.**
- **Part C** — estimate files, carried over from S105b. **A service-role route
  where the route itself is the access floor.**

⚠️ **Part A ships first, alone. B and C do not start until A is committed and
pushed.**

Branch: `feature/s106`, off `feature/s105b` (2e3552f) — Part C needs S105b's
`estimate_id` foundation, which is unmerged and lives there, not on `main`.

---

## How to use this file

1. **Fill every FILL by measurement** — read the file, run the query.
2. **Put every ASK to Josh in one message.** Record his answer as RULED, with the
   alternative it beat.
3. **Then audit** — the checklist at the bottom.
4. Commit and **push** the completed spec before any build.

⚠️ **A FILL you cannot fill must say why, in one line. Do not delete the marker.**
⚠️ **If a measurement contradicts a RULED line, STOP and report.**

**FILL-0** — Report `main`'s tip and whether the tree is clean.
**MEASURED [S106]:** `main` = `662b531`, tree clean (only the untracked skeleton
file at session start). Working on `feature/s106`, branched off `feature/s105b`
(2e3552f). The `estimate_id` migration + `uploadFile` extension are present on the
base branch (verified).

---

# PART A — the details page layout

⚠️ **STRICTLY COSMETIC. No data changes, no query changes, no permission changes.**

## RULED — the target layout

```
Contract type          — FULL WIDTH, between the tab strip and Client
Row 1:  Client (L)          |  Proposal format (R)
Row 2:  Pricing basis (L)   |  The Job (R, top)
                            |  Whole-estimate discount (R, below)
```

- **Both halves are half-width with a small gap between them.**
- ⚠️ **The "Contract" section header is DELETED** — the header text and its rule.
- **The Job and Whole-estimate discount are STACKED** in the right half of row 2.
- **Nothing else on the page moves.**

## What CC measures

**FILL-A.1** — Details page component file(s); current DOM order and grid/flex of
the six boxes + the "Contract" wrapper.  *(pending)*
**FILL-A.2** — What the "Contract" wrapper provides besides a header.  *(pending)*
**FILL-A.3** — Which of the six boxes render conditionally.  *(pending)*
**FILL-A.4** — Existing half-width two-column pattern to reuse.  *(pending)*
**FILL-A.5** — Mobile/narrow collapse behaviour + stacking order.  *(pending)*
**FILL-A.6** — Tests/e2e selectors depending on DOM order or "Contract" text.  *(pending)*

## ASK

**ASK-A.1** — If a row-2 box can be hidden, does the survivor go full-width or stay
half-width with empty space?
**ASK-A.2** — The collapsed stacking order if source order is not what Josh wants.

---

# PART B — editing a line item's total

⚠️ **A write path on money. Does not ship with Part A.**

## RULED

- A line item's Total becomes editable; cost and quantity DO NOT change — editing
  the total back-solves that line's markup/margin, nothing else.
- Per-line margin editing already exists — a SECOND input to a value with one.
  Both directions must agree (edit margin → total; edit total → margin).
- Estimate-level rates are DEFAULTS; a line may override them.
- ⚠️ When an estimate-level default changes, a line whose value was edited SURVIVES
  (Josh verified for margin; a total-edited line must behave the same).

## 🛑 The mechanism question — gates the build

**FILL-B.1** — How a per-line override is stored: explicit column/flag or inferred?  *(pending)*
**FILL-B.2** — Where the line total is computed; stored or derived at read time?  *(pending)*
**FILL-B.3** — Exact formula (cost, qty, margin/markup, total) per category; which is stored.  *(pending)*
**FILL-B.4** — Rounding rule + stored precision; what happens on a non-even total.  *(pending)*
**FILL-B.5** — Every other place that recalculates a line (bid award fill, revision, conversion, COs).  *(pending)*
**FILL-B.6** — Financial floor on line items: who can WRITE a line's margin/total (write policy, not read).  *(pending)*
**FILL-B.7** — Whether Estimate Health + sticky totals derive from line totals or estimate-level rates.  *(pending)*
**FILL-B.8** — total=0, total<cost (negative margin), non-numeric entry.  *(pending)*

## ASK

**ASK-B.1** — If override is inferred, does Part B add an explicit flag (migration + prod push)?
**ASK-B.2** — Non-representable back-solved margin: round or refuse?
**ASK-B.3** — If header figures derive from rates, do they change to derive from line totals?
**ASK-B.4** — Does an edited total need a visible "edited / no longer follows default" marker?

---

# PART C — estimate files: the PM desktop path and the sub upload

## What already exists (S105b, rebuild-test only)

- `files.estimate_id` column, index, `files_owner_arm_check` (three-arm CHECK).
- The conversion re-point; `uploadFile` extended.
⚠️ **Migration `20261540000000` is on rebuild-test ONLY. Production apply is
attended and owed — FILL-C.7.**

## 🛑 The blocker, and the ruling

`files_insert_non_client` and `files_select_non_client` both require
`project_id IS NOT NULL` for every non-owner/admin role → a PM can neither upload
nor list files on an estimate they authored.

**RULED [Josh]: Option A — a service-role server route. No RLS change.** The route
reads the estimate through the caller's session to prove visibility, then lists and
inserts via the service-role client. Access is enforced in the route; the `files`
floor is not widened. Options B (estimate arm on the policies) and C (owner/admin
only) rejected. **One mechanism, two authorizers** (session for PM, bid token for
the sub).

## ⚠️ THE ROUTE IS THE FLOOR — a control to prove, not a pattern to trust

**FILL-C.1** — Existing service-role-behind-session-check pattern (proposal-service, bid-token). Name files.  *(pending)*
**FILL-C.2** — Exactly how the route proves visibility, statement by statement; failure mode if skipped.  *(pending)*
**FILL-C.3** — Test: a PM cannot reach another PM's estimate files; no role reaches a contract via this route. Row counts.  *(pending)*
**FILL-C.4** — The read path (listing + upload endpoints).  *(pending)*
**FILL-C.5** — What `category` an estimate file receives; category restrictions.  *(pending)*
**FILL-C.6** — Sub path: token→estimate resolution; 25MB + pdf/jpeg/png/heic cap in the ROUTE.  *(pending)*
**FILL-C.7** — Production apply of `20261540000000`: still unapplied? Row counts the CHECK validates against on PRODUCTION.  *(pending)*

## ASK

**ASK-C.1** — Upload requires EDIT rights or VIEW rights on the estimate?
**ASK-C.2** — What a PM sees on a view-but-not-edit estimate: read-only files or no tab?
**ASK-C.3** — Are the sub's uploads visible to a PM through the route, or owner/admin only?

---

# Cross-cutting

**FILL-X.1** — Every migration Part B requires, with purpose (Part A must require none).  *(pending)*
**FILL-X.2** — Test coverage on the line items screen today; what Part B will/won't be covered by.  *(pending)*

## Standing constraints
Commit path-scoped after every unit; push after every commit. Type-check necessary
not sufficient — `next build` must pass (new `useMemo` after early returns).
A test that passes on zero rows is a failure — state row counts. A markdown
formatter reflows tables; note it, don't fight it.

---

# AUDIT — run before any build
1. Every FILL filled or one-line why. 2. Every ASK ruled with the beaten alt.
3. No measurement contradicts a RULED line. 4. Part A needs no query/permission/
migration change. 5. FILL-B.1 answered; ASK-B.1 ruled if inferred. 6. B's two
directions consistent. 7. Every FILL-B.5 site respects the override or is listed.
8. Part C visibility proven by test with row counts. 9. No `files` RLS policy
changed. 10. Anything still unknown the build needs.
