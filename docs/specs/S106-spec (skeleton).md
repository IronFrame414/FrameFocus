# S106 — SPEC (skeleton) — estimates layout, line totals, estimate files

**Status: INCOMPLETE. This is a scaffold, not a spec.**

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

---

## How to use this file

1. **Fill every FILL by measurement** — read the file, run the query. Not from
   memory, not from a context file.
2. **Put every ASK to Josh in one message.** Record his answer here as RULED,
   with the alternative it beat.
3. **Then audit** — the checklist at the bottom.
4. Commit and **push** the completed spec before any build.

⚠️ **A FILL you cannot fill must say why, in one line. Do not delete the
marker.**

⚠️ **If a measurement contradicts a RULED line, STOP and report.** Do not
reconcile it yourself.

**FILL-0** — Report `main`'s tip and whether the tree is clean.

---

# PART A — the details page layout

⚠️ **STRICTLY COSMETIC. No data changes, no query changes, no permission
changes.** If a move requires touching a query, that is not cosmetic — STOP and
report it.

## RULED — the target layout

```
Contract type          — FULL WIDTH, between the tab strip and Client
Row 1:  Client (L)          |  Proposal format (R)
Row 2:  Pricing basis (L)   |  The Job (R, top)
                            |  Whole-estimate discount (R, below)
```

- **Both halves are half-width with a small gap between them.**
- ⚠️ **The "Contract" section header is DELETED** — the header text and its
  rule. Every child it used to hold moves out per the layout above.
- **The Job and Whole-estimate discount are STACKED** in the right half of
  row 2.
- **Nothing else on the page moves.** The right-hand rail — Status, Preview
  Proposal, Estimate Health, Before You Send, Client Activity, More actions —
  is untouched. The tab strip is untouched. The sticky totals bar is untouched.

## What CC measures

**FILL-A.1** — The details page component file(s), and the current DOM order and
grid/flex structure of: Contract type, Client, Proposal format, Pricing basis,
The Job, Whole-estimate discount, and the "Contract" section wrapper.

**FILL-A.2** — ⚠️ **What the "Contract" wrapper does besides render a header.**
If it supplies grid context, spacing, a border, or conditional rendering to its
children, deleting it changes more than a heading. Name everything it provides.

**FILL-A.3** — Whether any of the six boxes renders conditionally — on contract
type, on estimate status (Draft vs Sent), on role, or on a feature flag. ⚠️ **A
box that is sometimes absent changes what the two-column rows look like when it
is.** State what row 2 looks like if The Job or the discount box is hidden.

**FILL-A.4** — The existing half-width two-column pattern on this page or
elsewhere in the app, if one exists. ⚠️ **Use the existing pattern rather than a
new one** — the list-screen anatomy lesson applies here too.

**FILL-A.5** — Mobile behaviour. What the current single-column layout does at
narrow widths, and how the two-column rows must collapse. ⚠️ **The stacking
order when collapsed must be stated**, not left to source order.

**FILL-A.6** — Whether any test, screenshot test, or e2e selector depends on the
current DOM order or on the "Contract" heading text.

## ASK

**ASK-A.1** — On FILL-A.3's answer: if a box in row 2 can be hidden, does the
surviving box go full-width or stay half-width with empty space?

**ASK-A.2** — On FILL-A.5's answer: the collapsed stacking order, if the natural
source order is not what Josh wants on a phone.

---

# PART B — editing a line item's total

⚠️ **This is a write path on money. It is not cosmetic and does not ship with
Part A.**

## RULED

- **A line item's Total becomes editable.**
- **Cost and quantity DO NOT change.** Editing the total back-solves that
  line's **markup/margin**, and nothing else.
- **Per-line margin editing already exists.** ⚠️ **This is a SECOND input to a
  value that already has one.** The two must agree in both directions:
  - edit margin → total recalculates
  - edit total → margin recalculates
- **Estimate-level rates (Pricing basis: subcontractor / material / labor
  margin) are DEFAULTS.** A line may override them.
- ⚠️ **When an estimate-level default changes, a line whose value was edited
  SURVIVES.** Josh verified this behaviour on the live site for margin editing;
  a total-edited line must behave the same way.

## 🛑 The mechanism question — this gates the build

Josh confirmed the _behaviour_ (an edited line survives a default change). **The
mechanism is unknown**, and it decides whether Part B needs a migration.

**FILL-B.1** — ⚠️ **How a per-line override is stored.** An explicit column/flag
on the line, or **inferred** by comparing the line's margin to the estimate
default?

⚠️ **If it is INFERRED, there is a hole, and the total-edit lands straight in
it:** a line set to exactly the default value reads as "not overridden" and gets
recalculated by a later default change. Editing a total that happens to
back-solve to exactly the default hits the same hole. **Report this explicitly
either way.**

**FILL-B.2** — Where the line total is computed, and whether it is **stored or
derived at read time.** If derived, an editable total has nowhere to live
without a schema change.

**FILL-B.3** — The exact formula relating cost, quantity, margin/markup and
total, per line and per category (sub / material / labor). ⚠️ **Markup and margin
are not the same number** — the UI itself says a 20% markup is a 16.7% margin.
State which the line stores.

**FILL-B.4** — The rounding rule. ⚠️ **A back-solved margin will not be a round
number.** State the stored precision, and what happens when a typed total does
not divide evenly — S104's retainage back-fill **aborted rather than round**, and
the same question applies here.

**FILL-B.5** — Every other place that recalculates a line: bid award fill
(`#113`'s fill-only-when-empty rule), estimate revision, conversion to project
budget, change orders. ⚠️ **Anything that rewrites a line's margin must respect
the override**, or the edit is silently undone somewhere Josh is not looking.

**FILL-B.6** — ⚠️ **The Financial Visibility Floor on the line items screen.**
Which roles can edit a line's margin today, and therefore its total. **Authority
belongs in the database. A gate controlling only rendering still ships the data
in the payload** (`#136`'s class). ⚠️ **An editable field is a WRITE — check the
write policy, not just the read floor.**

**FILL-B.7** — Whether Estimate Health (Client price / Your cost / Profit / Gross
margin) and the sticky totals bar derive from line totals or from the
estimate-level rates. ⚠️ **If from the rates, a hand-edited line makes the header
figures wrong** — and those are the numbers Josh prices a job on.

**FILL-B.8** — What happens at total = 0, total < cost (negative margin), and a
non-numeric entry.

## ASK

**ASK-B.1** — On FILL-B.1: if override is inferred rather than stored, does Part
B add an explicit override flag? ⚠️ **That is a migration and an attended
production push.** The alternative is inheriting a known hole.

**ASK-B.2** — On FILL-B.4: what happens when a typed total does not back-solve
to a representable margin — round it, or refuse the entry?

**ASK-B.3** — On FILL-B.7: if the header figures derive from the estimate-level
rates, do they change to derive from line totals? ⚠️ **This is the difference
between a cosmetic edit and a change to what Estimate Health means.**

**ASK-B.4** — Does an edited total need to be **visible as edited** on the line —
a marker showing this line no longer follows the estimate default? Without one,
a line silently diverges and nothing shows it.

---

# PART C — estimate files: the PM desktop path and the sub upload

⚠️ **Carried over from S105b, where item 6's foundation shipped to rebuild-test
and the UI stopped on this ruling.**

## What already exists (S105b, rebuild-test only)

- `files.estimate_id` column, its index, and `files_owner_arm_check` — the
  three-arm CHECK: exactly one of `project_id` / `estimate_id`, **or** a
  company-level row (`category IN ('contracts','lien_releases')`, both null).
- The conversion re-point, so files carry to the project on conversion.
- `uploadFile` extended.

⚠️ **Migration `20261540000000` is on rebuild-test ONLY. The production apply is
attended and owed** — see FILL-C.7.

## 🛑 The blocker, and the ruling

`files_insert_non_client` and `files_select_non_client` **both require
`project_id IS NOT NULL` for every non-owner/admin role.** An estimate file has
`project_id IS NULL`. So a PM — who is a first-class estimate author — **can
neither upload nor list files on an estimate they authored.** The new column
changed nothing; the policies are blind to `estimate_id`.

**RULED [Josh]: Option A — a service-role server route. No RLS change.**

A Next route reads the estimate **through the caller's session to prove
visibility**, then lists and inserts via the service-role client. Access is
enforced in the route; the `files` floor is not widened.

**Rejected — Option B, an estimate arm on both policies.** It widens the `files`
floor that item 6A was run to establish, and opens an unanswered sub-question
(which roles, which categories) — a PM with an estimate arm on `files_select`
could reach contracts, which 6A confirmed are owner/admin-only.

**Rejected — Option C, owner/admin only.** Leaves PMs authoring estimates they
cannot attach files to, which is the gap this item exists to close.

**The sub upload converges on the same mechanism.** `/bid/[token]` is anonymous
and already writes through the service role behind a SECURITY DEFINER token RPC.
It differs from the PM path only in how it authorizes — a bid token instead of a
session. ⚠️ **One mechanism, two authorizers. Build it that way.**

## ⚠️ THE ROUTE IS THE FLOOR

**Service role bypasses RLS entirely.** The session-based visibility check is the
**only** access control in this design. If it is wrong, skipped, or bypassable,
a caller reaches any estimate's files in the company — and four of the
company-level rows are contracts.

**This is not a pattern to trust; it is a control to prove.**

**FILL-C.1** — The existing service-role-behind-a-session-check pattern in this
repo (proposal-service, bid-token). Name the files. ⚠️ **Use the existing
pattern; do not invent a second one.**

**FILL-C.2** — ⚠️ **Exactly how the route proves visibility**, statement by
statement: which client reads the estimate, which policy governs that read, and
what happens when it returns nothing. State the failure mode if the check is
skipped.

**FILL-C.3** — ⚠️ **A test that a PM cannot reach another PM's estimate files,
and that no role reaches a company-level contract through this route.** A test
that passes on zero rows is a failure — state the row counts.

**FILL-C.4** — The read path. `files_select_non_client` blocks PMs too, so the
route serves **listing as well as upload**. Confirm and name both endpoints.

**FILL-C.5** — What `category` an estimate file receives, and whether any
category restriction in the existing policies applies to it.

**FILL-C.6** — The sub path: token→estimate resolution, and the **25 MB +
`application/pdf`, `image/jpeg`, `image/png`, `image/heic`** cap ⚠️ **enforced in
the route, not at the bucket.**

**FILL-C.7** — ⚠️ **The production apply of `20261540000000`.** Confirm it is
still unapplied to production, and state the row counts the three-arm CHECK will
be validated against **on production** — rebuild-test and production differ.
**Josh applies it, attended. CC does not.**

## ASK

**ASK-C.1** — ⚠️ **Does uploading require EDIT rights or VIEW rights on the
estimate?** A PM edits only their own estimates and only in draft; but
`estimates_select_authenticated` may let them see more. **These give different
answers and the route must pick one.**

**ASK-C.2** — What a PM sees on an estimate they can view but not edit — files
listed read-only, or no files tab at all.

**ASK-C.3** — Whether the sub's uploads are visible to a PM through the same
route, or only to owner/admin.

---

# Cross-cutting

**FILL-X.1** — Every migration Part B requires, with purpose. ⚠️ **If none, say
none.** Josh needs to know before the build whether an attended production push
is coming. Part A must require none — if it does, that is a STOP.

**FILL-X.2** — Test coverage that exists on the estimates line items screen
today. ⚠️ **Green means no regression, not a working feature.** State what Part B
will and will not be covered by.

## Standing constraints

**Commit path-scoped after every unit. Push the branch after every commit.**
⚠️ A Codespace restart destroyed 11 unpushed commits in S105.

**Type-check is necessary and not sufficient. `next build` must pass.** New
`useMemo`s placed after a component's early returns type-check clean and fail the
build — that happened on the team screen in the lost S105 run, and Part A touches
component structure in exactly that way.

**A test that passes on zero rows is a failure.** State the row count each live
test exercised.

**A markdown formatter reflows tables on save**, producing large diffs for small
edits. Note it; do not fight it mid-build.

---

# AUDIT — run before any build

1. Every FILL filled, or one line saying why not. State counts found and filled.
2. Every ASK has a recorded ruling, with the alternative it beat.
3. No measurement contradicts a RULED line.
4. ⚠️ **Part A requires no query change, no permission change, and no
   migration.** If any is required, Part A is not cosmetic — say so.
5. ⚠️ **FILL-B.1 is answered.** If override is inferred, ASK-B.1 is ruled before
   the build.
6. Part B's two input directions are consistent — margin→total and total→margin
   produce the same line state.
7. Every place from FILL-B.5 that rewrites a line respects the override, or is
   listed as not respecting it.
8. ⚠️ **Part C's visibility check is proven by test, not asserted** — FILL-C.3
   names the row counts. A route that is the only access control and has no
   negative test is not built.
9. ⚠️ **No RLS policy on `files` was changed.** Part C is ruled to weaken no
   floor; if the build required a policy change, that is a STOP.
10. Anything still unknown that the build will need.

---

# PART B — the award prompt — **RULED [Josh, S106]**

The last open piece of Part B. `set_winning_bid` CLEARS `total_price_override`
when awarding itemizes a line (`20261560000000`). That clear must not be silent.

## The copy, as ruled

```
Title:  Replace your manual total?
Body:   Your total: $X
        After awarding: $Y (bid + markup)
        Awarding itemizes this line, so your manual total no longer applies.
Buttons: Replace / Cancel
```

- **$X** = the line's `total_price_override`.
- **Fires ONLY when the awarded line carries a `total_price_override`.** Every
  other award stays silent, exactly as before.

### $Y — **AMENDED [Josh, S106]. The amendment SUPERSEDES the ruling's own line.**

_Superseded text, quoted rather than rewritten:_ _"**$Y** = the bid amount at the
line's default subcontractor markup."_

**That is the FIXED-PRICE case only.** Accepted by Josh on report; the correction
stands as the rule:

1. **$Y follows the INSTRUMENT RATE IN FORCE, not the estimate default.** On
   cost-plus, the awarded row prices at `cost_plus_subcontractor_percent`; on
   T&M, at `tm_nonlabor_percent` (money-representation P4 — the negotiated rate
   overrides per-row markup and estimate defaults). A $10,000 bid on a 10%
   cost-plus job is **$11,000**, not the $12,000 a 20% estimate default would
   suggest. A prompt quoting the estimate default would be wrong by the whole
   difference on **every** non-fixed instrument — and right on every fixed-price
   one it was tested against.
2. **A cost-plus estimate with NO subcontractor rate in force ERRORS. It does not
   quote.** `applyInstrumentRateOverrides` throws `NoRateInForceError` and the
   prompt is not shown. ⚠️ **The alternative is quoting the bid amount itself —
   a silent sell-at-cost — at the moment of an award.** Never treat a missing
   rate as 0%.
3. **The line-level discount is DORMANT under a manual total and WAKES on
   award.** `total_price_override` wins over the computed total, so a line
   discount has no effect while the manual total stands; clearing it at award
   makes the discount live. $Y therefore includes it — 12,000 × 0.90 = **$10,800**
   on a 10%-discounted line. A projection that ignored the discount would
   overstate $Y by exactly the discount.

All three are pinned by `s106-award-prompt-projection.test.ts` (9 cases).

## The condition Josh attached, and how it is met

> _"$Y is computed in the UI, but the real value comes from `set_winning_bid` and
> the row insert. If they diverge, the prompt shows one number and the line gets
> another — on money, at the moment of a decision. Either guarantee they agree and
> say how, or read the resulting line total back after the award and surface it
> when it differs from what the prompt showed."_

**BOTH, because neither alone is sufficient.**

1. **Shared mechanism, not a second formula.** `previewAwardedLineTotal()`
   (`estimate-items-client.ts`) builds the row the RPC will INSERT — the RPC's own
   column list, `markup_percent` NULL, `apply_tax` false, `amount = bid_amount` —
   and prices it through the SAME `applyInstrumentRateOverrides` →
   `computeLineTotalsFromRows` that `recalculateEstimateTotals` runs immediately
   after the award, off the same estimate pricing context. There is no separate
   arithmetic in the component to drift. It mirrors all three RPC branches, so the
   projection is right even on the branches that never prompt.
   ⚠️ **"$Y = bid at the default subcontractor markup" is the FIXED-PRICE case.**
   On cost-plus and T&M the instrument rate in force overrides the estimate
   default (P4), and $Y follows the instrument — otherwise the prompt would be
   wrong by the whole difference on every non-fixed instrument. A cost-plus
   estimate with no subcontractor rate in force reports the error rather than
   quoting a silent 0% (sell-at-cost).
2. **Read-back, because a shared formula cannot see everything.** `setWinningBid`
   now returns `lineTotal`, read off `estimate_line_items.total_price` AFTER the
   recalc. If it differs from the quoted $Y by a cent or more, the estimator gets
   a second dialog naming both figures. A rate superseded, or another user editing
   the line, between the prompt and the click appears in no shared formula.

## Cancel is a true no-op

Everything above the `confirm` in `handleSetWinner` is a SELECT —
`previewAwardedLineTotal` and `loadInstrumentPricingContext`/`pricingAsOfDate`
contain no `insert`/`update`/`upsert`/`delete`/`rpc`. The first write on the path
is `setWinningBid`, below the `if (!ok) return`. So Cancel inserts no row, clears
no override and sets no winner — by ordering, not by cleanup.

## Files

- `apps/web/lib/services/estimate-items-client.ts` — `previewAwardedLineTotal()`;
  `setWinningBid()` returns `lineTotal`.
- `apps/web/app/dashboard/estimates/[id]/bidding-tab.tsx` — `handleSetWinner`.
- `apps/web/components/confirm/confirm-provider.tsx` — `whiteSpace: 'pre-line'`
  so a `\n` in a message renders as a line break (HTML collapses newlines; the
  three body lines would otherwise run together). `pre-line` still collapses
  space runs and still wraps, so all 54 existing single-line call sites are
  unaffected.
- `apps/web/test/s106-award-prompt-projection.test.ts` — 9 cases on $Y.
- `apps/web/e2e/desktop-confirms.spec.ts` — tests **7 (Cancel)** and **8 (Replace)**,
  plus the award fixture in `beforeAll` and `subcontractors` in the sweep.
  ⚠️ **Written and type-checked; NEVER EXECUTED — see `#7-s106`.** This box has
  no `.env.local` and no Playwright browsers after its rebuild.

## Migration status

**All four S106 migrations (540, 550, 560, 570) are ON PRODUCTION, verified
[Josh, S106]:** `files.estimate_id` present, `files_owner_arm_check` VALID, the
conversion files re-point, both invariant triggers, `set_winning_bid` clearing
the override, `estimate_line_rows.total_override`, and the mutual-exclusion
CHECK VALID. The earlier "prod apply owed" note is discharged.

## Tech debt filed

`#3-s106` (`pre-line` unverified on the other 54 dialogs) · `#4-s106` (the
read-back divergence path has never fired) · `#5-s106` (`previewAwardedLineTotal`
has no live test; two of its three branches unexercised) · `#6-s106` (the
SQL↔TS row-shape contract is unguarded) · `#7-s106` (the e2e has never run).
