# Context 101 — the audit campaign, Module 9, and Allowances & Selections end to end

S150 through S175. `main` from `ab67998` to `6fc72ab`. Roughly forty migrations to rebuild-test,
twenty-five to production in one attended batch.

The through-line, again and more sharply than S100: **almost nothing of consequence was visible in
the source.** A shipped delivery route with no button. A soft-delete that had never once succeeded
in twenty-two rows. Fifty-five destructive actions whose tests dismissed their own dialogs. Each
was found by running something, clicking something, or probing with a real principal.

---

## 1. The system audit — six modules, one pass each, against the whole platform

`SYSTEM-AUDIT.md` was created to make coverage verifiable rather than aspirational: a dependency
map, a **coverage ledger** of module-to-module edges recording which have been examined and from
which side, and a contradictions section for when a later pass disagrees with an earlier one.

**M1 — Settings, Admin & Billing.** `companies_insert_authenticated` was `WITH CHECK (true)`: any
authenticated user could create unlimited companies. Ruled to option (a) — restrict to callers with
no company — on Josh's model: *"a user will have to use a separate email if they want access with a
second company."* Signup never evaluated the policy at all, because `handle_new_user()` is SECURITY
DEFINER.

Seven of eight `companies` writers reported a refused write as success.

**M2 — Contacts & CRM.** Two reachable defects and one that had never worked:

- **The roster floor stopped at the contact and not at its address.** A subcontractor read `[]` from
  `contacts` and the full street address of that same contact, company-wide. *The roles floored out
  of seeing a client's name could read their home address.*
- **Soft delete was impossible.** `contacts_select_authenticated` carried `AND is_deleted = false`,
  and PostgREST's UPDATE returns rows — so the updated row had to satisfy SELECT and could not.
  **0 of 22 contacts had ever been soft-deleted.** The button alerted a raw Postgres string.
- The two interacted perversely: `deleteContact()` **errored for an Owner who may delete and
  reported success for crew who may not.**

**M3 — Documents & Files.** A crew member could not see an invoice's `files` row **and could
download its PDF**. Storage policies are a separate enforcement surface from table RLS, and the
storage side had never been floored to match. Ruled: align wholesale.

**M4 — Sales & Estimating.** The `getResend()` defect S150 fixed in `send` was **still live one file
over** in `resend` — mint a token, throw before invalidation, leave a live signing link for an email
nobody received. The sweep that followed found more. And **four compare-and-swaps never read their
result**, so two concurrent completions both proceeded; a double-click was enough.

**M5 and M6, audited together, produced the line neither could have produced alone:**

> **S161's performance remedy would have broken S162's containment.** The safety child tables are
> guarded by a bare FK-existence check and are safe *only because Postgres applies the parent's RLS
> inside the sub-query*. `SECURITY DEFINER` bypasses exactly that — and that is what
> `can_view_project()` is. Recovering the measured 148× would have opened both tables **with no
> policy edit anywhere near them.**

M5 also: a PM could read the signing token for **every change order in the company** — and
`/sign-co/[token]` is unauthenticated by design, so holding the token *is* the ability to sign. M6:
**all three append-only audit logs accepted forged rows**, and one feeds labour cost.

### The measurement that inverted itself twice

S152 measured `can_view_project()` correctly and inferred wrongly — *"row-varying, therefore
unavoidable."* S161 corrected the inference and claimed 148×. S163 then corrected S161: **the
planner had collapsed the inlined EXISTS into a hashed SubPlan at `loops=1`**, so "4.4 µs/row" was
one evaluation amortised over 10,000 rows. Re-measured with everything varying: **566 µs as a
function against 27.9 µs inlined — 20×, not 148×.**

Five hypotheses died. What survives is a wrapper around a body that calls other user functions,
compounding with depth: **0 nested → 12–16 µs · 1 → 197 · 3 → 590.** Why one nested call costs +185
and not +16 is **unexplained, and recorded as unexplained.**

> **Correlation with depth is exact across five functions. Correlation is not a mechanism.**

---

## 2. Module 9 — the client portal, built on a floor nobody had tested

The load-bearing finding came before a line was written: **every existing "client reads 0" probe
passed vacuously.** The single client profile had no `company_members` row, so it was refused **by
absence, not by any rule.** Josh chose to build straight through, on the condition that every
client-facing policy got a real counterfactual — a second seeded client, linked, against the
unlinked control.

**Identity:** `profiles.contact_id`, nullable and UNIQUE, with client policy arms through a
dedicated `SECURITY DEFINER` helper — never `can_view_project()`. No member row, because a member
row costs 21 companion policy edits **and grants clients write access to `punch_lists`, which R14
rules NO.** One login, one company. `profiles.email` is the credential; `contacts.email` is the
business record.

**Twelve read arms**, each with a linked/unlinked pair, and two findings that would have leaked
silently:

- **`invoice_lines_select_visible` was pure containment.** The moment `invoices` gained a client
  arm, it granted her every line of every bill at every presentation level — and a *narrower
  permissive* arm changes nothing, because permissive policies are OR'd and the widest wins. The
  gate had to be RESTRICTIVE, carrying a `get_my_role() <> 'client'` escape or it would have
  narrowed Owner, Admin and PM too.
- **`invoice_hour_claims(member_id, work_date, raw_hours)` is a named crew member's timesheet**, and
  R8 is one line long: no names anywhere. Same pure-containment shape. Nothing would have failed.

**Q2 dissolved rather than being answered.** `projects` carries no contract-type column at all —
`contract_type` is on estimates, `co_type` on change orders. So a per-project derivation of client
visibility is *unwriteable*, and Josh's lump-sum-contract-with-a-T&M-CO case was structurally
correct rather than an edge.

**The manifest trap.** A nested layout exporting `metadata.manifest` is **silently ignored** — Next
collects the file convention at the app root and applies it after the metadata chain. Following the
documentation would have shipped a portal whose installed icon opens the field-crew shell: Phase 1's
own named failure, arriving through the fix for it, with every test green.

---

## 3. Allowances & Selections — eight stages, from the estimate line to a signature

Specced from a competitor's implementation Josh supplied. Twelve questions ruled at S169, and the
one that shaped everything:

> **Q4 — the selection signature IS the binding instrument. No change order is generated.**
> S150's R21 is superseded, and four other contradictions resolve the same direction.

Its consequence, found in re-analysis rather than at spec time: **the contract-billing ceiling
trigger is scoped to `source_estimate_id`**, so an overage billed against the estimate instrument
is refused with *"raise the scope with a change order"* — the exact outcome Q4 ruled out. It bills
against `source_selection_id`, the way CO lines already escape it.

**Other rulings that held:** allowance becomes a fifth `row_type` (**not a new representation — it
collided with a shipped `unit_of_measure = 'allowance'`**) · the budget subcategory is **derived at
read**, insert-only doctrine untouched · one expense per selection, so nothing needs apportioning ·
underage credits are always owed, timing is the company's choice · the shared Selections page and
the specifications sheet carry **no money at all**, which sidesteps the Financial Visibility Floor
rather than needing a role-based arm · **one signature per selection**, batches are delivery only,
partial batches supported.

### Four things the build found that the rulings did not anticipate

1. **`aggregateCategories` had been dropping the allowance category since S170.** The type and the
   slice loop were widened to five; `PROFIT_CATEGORIES` stayed at four, **and that constant seeds
   the rows.** Putting money in the category is what surfaced it.
2. **`approve_expense()` dropped the selection tag** — it reconciles by delete-and-reinsert reading
   two JSON keys, so the column would have been populated on every pending row and empty on every
   approved one, *which is the only kind that counts*.
3. **The ceiling had a hole at exactly zero.** A selection signed at exactly the allowance — an
   ordinary outcome — fell into the credit arm and could be billed any amount.
4. **"Fixed or as-incurred" is decided by the INSTRUMENT, not the project.** A fixed-price CO on a
   cost-plus job can carry an allowance.

### And the client's half, where two figures were unreachable

`selection_option_amounts` is floored away from her by design. Q5.1 named the sell price; **the
Allowance Deduction line was equally unreachable and the binding wording names it explicitly.**
Both got definer reads. And copying the existing image function's arms would have been a Floor
breach — *that* function restates the staff arm, which admits foreman, crew and subcontractor. **An
image is safe for them; a sell price is not.**

**The totals block told a client who had picked nothing that she was owed the whole allowance.**
Every live probe passed while that was on the page. The browser test found it on its first run.

---

## 4. Defect classes, and the ones that recurred

- **A shipped route with no affordance.** The estimate Send route was built, tested and had **no
  button** — *"nothing was removed; the affordance never existed."* The suite covered the route
  precisely because the route worked. Then the same shape one module over: **releasing selections
  emailed nobody.**
- **`.limit(1)` without `ORDER BY`** — swept at 138 occurrences. **Zero category-2 in shipped code:
  the class was always a fixture problem.** And the correction that matters: where a test depends on
  a *property*, ordering only makes the wrong pick stable.
- **A test asserting the opposite of a shipped ruling, while passing.** `s121` read *"NOT floored"*
  after S154 floored it; only one of three cases reddened. **Now a CLAUDE.md rule: a fix session
  sweeps for existing tests encoding what it overturns, not only its own probes.**
- **A harness that cannot collide with itself cannot tell you it leaked.** S168's own harness used
  timestamped ids and left a dozen rows behind, invisibly.
- **The exit-code trap, paid for repeatedly.** `( cmd; echo $? )` returns the echo's status. Only
  the printed line is true — and reading it is what caught two Playwright failures a notification
  reported as green.
- **Playwright from the repo root LIES** — it collects all 522 specs while `storageState` resolves
  against the wrong root, producing reds that read as product failures. Its mirror:
  `supabase migration list` from `apps/web` fails in a way that reads as migration drift.

---

## 5. The two live production holes, and the twenty-five-migration batch

**A sent estimate was rewritable** — name, `grand_total`, scope — by any Owner or Admin through
ordinary PostgREST. Line items were floored at the database; **the parent row's freeze was a
TypeScript `if`.** And underneath it, a shipped safety argument was false: `money-representation.md`
§7.1 S-4 claimed `recalculateEstimateTotals` was *"a silent no-op that fakes a recompute"* because
its UPDATEs RLS-match zero rows. **True for a PM only.** It was never a no-op: the child writes
dropped silently while the parent write succeeded, **leaving stored totals disagreeing with the line
items they are computed from.**

**A sent change order was unrepairable.** Not merely unvoidable — undeletable, because the line
could not go first (`enforce_co_line_parent_open()` refuses while the parent is not a draft) and the
parent could not go first (no `ON DELETE CASCADE`). That function returns early *"so a CASCADE
delete stays possible"* — **and the CASCADE did not exist.** The comment described the exact defect
it was written to prevent.

**Production was 25 migrations behind** — the gap the M7 audit named as its top recommendation and
could not measure, because only rebuild-test was ever linked. Pushed in one attended batch after
Josh confirmed production carries no valuable data. **The gap is now zero.**

---

## 6. Email — diagnosed, and it was never the application

Invites showed **Delivered** and never arrived. Ruled out across sessions: DMARC, duplicate DMARC,
the hex sender suffix, domain mismatch. The answer came from Google Workspace's own log: **accepted,
then marked spam.** Postmaster Tools shows **DKIM 100% / SPF 100%**; mail-tester scores 10/10.
Nothing in the code was wrong — a weeks-old sending domain at low volume is treated as suspect, and
the fix was an admin allowlist plus time.

**The real finding sat next door.** Four surfaces bypassed Resend entirely — sign-up, invite
acceptance, forgot-password and the team page's reset — via Supabase Auth's own mailer, **capped at
2 per hour project-wide, unaligned, and leaving no `email_logs` row when it failed.** *Invite three
people in an hour and the third never gets it.* Closed with the Send Email Hook, which also let
invited users be confirmed programmatically without touching the project-wide `mailer_autoconfirm`.

---

## 7. Where things stand

**Shipped:** the M1–M6 audit findings, fixed · Module 9 complete, including the client's PWA
install · Allowances & Selections complete, all eight stages · estimate freeze, void and reissue ·
CO void, reissue and delete · clients off the Team side with the URL gate closed · Auth email
through Resend · the dialog sweep.

**Written and unbuilt, with rulings attached:** `client-portal-reopen-spec.md` (the cancelled-project
case still open) · `S167-canonical-seed-spec.md` (CQ1–CQ4 owed) · `7C-retainage-accrual-spec.md`.

**Outstanding:** **the M7 audit** — pass 7 of 11, deferred, eight sub-modules, ruled to state depth
*per sub-module* because a `✓` hiding uneven coverage defeats the ledger · **the click-test
register** — the selections loop end to end, the green-box feel, and **53 of 54 confirm sites that
the sweep made clickable and nothing yet clicks.**

**The rule this session earned, over and over:** the model checked its own premises and was right to.
It corrected `cost_type` (no such column), `client_window_open`'s arity (already three), the
`prompt()` count (five, not two), the dialog exposure (the inverse of what was assumed), and its own
148× measurement. **Every one of those corrections came from reading the system rather than the
document — including the documents this project wrote itself.**