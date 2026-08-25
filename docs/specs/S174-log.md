# S174 — the selections release email, the markup snapshot, and four investigations

Branch: `feature/s174-selections-email-and-markup` off `main` @ `56f10c1` (S173 merged). Unattended;
no push; stage 5 untouched.

> **⚠️ A PREVIOUS RUN OF THIS BRIEF WAS LOST TO A CODESPACE RESTART** — nothing survived, and this
> branch was started again from `56f10c1`. On the brief's own instruction, **each finding is
> committed as it lands** rather than at the end: this box has eaten work three times, and a branch
> with one commit at the end is exactly what a restart destroys.
>
> One consequence worth stating plainly rather than papering over: **the fixture census was not
> taken BEFORE the battery**, because the battery's first steps had already run by the time this
> log existed. The AFTER census is therefore compared against the canonical baseline in
> `fixture-snapshot.mjs`'s own header, not against a same-session BEFORE. See V8.

---

## Job 1 — RELEASING SELECTIONS SENDS AN EMAIL. It never did. (`0626e6c`)

Josh: *"I received the estimate via email when I tested it. I have not received the selections."*

**The diagnosis is S173 Job 1's class, one module over — *nothing was ever removed, the affordance
never existed*.** `grep -rn 'sendEmail'` across `app/api/selections/` and
`selection-lifecycle-service.ts` returned **nothing at all**. The release flipped N rows to
`awaiting_approval`, opened N signing sessions, notified the company's own managers through
`notify()` — and told the one person the whole feature exists for nothing.

`s171-selections-lifecycle.live.ts` was green throughout, and would have stayed green forever,
because the lifecycle was never what was broken.

**What shipped**

- `lib/services/selection-email.ts` — `sendSelectionsReleasedEmail()`, riding `sendEmail()` from
  `email-service.ts`: the `getResend()` wrap, the `+REPLY-TO` company resolution, the `email_logs`
  row. Josh: *"Do NOT build a second mailer."* **One mechanism, two callers** —
  `POST /api/selections/release` (batch) and `POST /api/selections/[id]/offer` (single).
- `lib/email/templates/selection-released-email.tsx` — white-label, tenant logo and brand colour,
  product named only in the footer.
- `20261029000000_selection_released_email_type.sql` + the `EmailType` union member, **in one
  commit**: the table half fails at RUNTIME and the union half at COMPILE time, so one without the
  other ships silently (`mention`, S126).

**Three decisions worth keeping**

1. **ONE email per RELEASE, not one per selection.** Josh's S173 ruling is that the batch is the
   DELIVERY mechanism while the signature stays per-selection. That is also why `email_logs` gets
   **no `selection_id` column** — every other client-facing sender got an FK, and a scalar FK
   cannot describe an N-selection send without either naming one of the N or forcing one email per
   selection, which would undo the ruling to satisfy a column. The ids ride in `metadata`, as
   `mention` and `invite` already do.
2. **No money in the message.** Under the S173 client-choice model the release stamps nothing
   (`offered_*` stays NULL), so there is no offered figure to quote and an email naming one would
   be inventing it. The template's props type is the contract: no amount, no markup, no variance
   in it.
3. **A failed send is not a failed release — and must not be a silent one.** The rows are already
   released when the send runs, so it never throws; it reports `{ emailed, error }` and BOTH
   surfaces render a warning (`selections-email-warning`, `sel-email-warning`). Replacing a UI that
   implied delivery with one that hides a failure is the same defect wearing a different coat
   (`invite-email.ts`, D2).

**The CTA goes to the portal, not a token link** — `completeSelectionSignature` has no token arm at
all, deliberately ("a selection is portal-only"), so the portal is the only honest destination.

### Tests

- **`s174-selections-email.live.ts` — 9/9.** It **executes the REAL SHIPPED ROUTE MODULES**
  (`s146-generate-route.live.ts`'s pattern), not the service. A harness calling the service would
  go green on a route that forgot to call it — which IS the failure being guarded against.
- **No real email leaves.** The fixture project's contact is `qa-client-a@example.invalid`, so the
  send is attempted for real and lands in `email_logs` as sent-or-failed without reaching a person.
  `s160-invite-send.live.ts` already owns the one real-delivery assertion in the suite; a second
  would buy a duplicate assertion and an unsolicited message.
- **`brand-email-footer.test.tsx` — 52/52.** The COVERED walk goes red on any new template; the
  subject is a pure function so it can be asserted without a database (S136's hole, which fired in
  the SUBJECT and no template test could see).
- **`desktop-selections.spec.ts`** now asserts the mail on the batch release and sweeps its own
  `email_logs` residue.

---

## Job 2 — "INHERIT" INHERITS, FROM A SNAPSHOT (`9b49cc1`)

An option at qty 100 × cost 100 totalled **$10,000** — cost — with "inherit" in the markup box. Not
a data problem: the estimate carried `material_markup_percent = 20` and the company carried
`default_material_markup_percent = 20`. Both rungs held a value and neither was read.

**`markup_percent` NULL means inherit. Three readers wrote `?? 0`:** the sheet's chosen-total, the
per-row `= $x` Josh was staring at, and `computeChosenFigures` — **which stamps the figure a client
SIGNS.** Three copies of one expression, one bug, three places to forget.

### The ruling [Josh, S174], narrower than Q3 as ruled at S170

> *"the option inherits the markup FROM THE ESTIMATE AS IT STOOD WHEN THE ALLOWANCE WAS SET — a
> snapshot at allowance-creation time, not a live read of the estimate now."*

The S170 chain is unchanged — row markup → the instrument's material markup → company default.
**What changed is WHEN it is walked.** Spec §5.2 carries the amendment in a banner, and Q3's row in
the ruling table now points at it; the superseded live-chain reading is quoted, not deleted.

**Why a snapshot:** it is how this module already treats every agreed figure. `selections.signed_*`
exists precisely so *"the figure she signed cannot move under her signature"* — a live markup chain
reintroduces that movement through a side door.

**The moment is the writing of `allowance_budget_item_id`**, not option creation: an option added a
week later must price on the same basis as the ones beside it, or two options in one list disagree
about what "inherit" means. Unlinked selections snapshot at creation from
`projects.source_estimate_id`.

### Three structural decisions

| | |
| --- | --- |
| **A side table, not a column** | `selections` is CLIENT-READABLE and a markup percent on that row is a cost-basis leak — `20261026000000` says so itself. RLS is row-level, so a floored figure needs its own row. `selection_amounts`, floored **owner/admin/PM**, no DELETE policy for anyone. No foreman arm: foreman is `actual_only` (RULED [Josh, S150]). `selection_notes` was the tempting reuse and is wrong for one reason — its floor admits foreman. |
| **A trigger, not a service call** | Every write reaches `selections` straight from the browser through PostgREST (`selections-client.ts`). There is no server hop to put a service call in. CLAUDE.md PARITY: *"the rules live below the UI."* |
| **ONE chain, not two** | `allowanceSellFor()` already walked this exact chain in ~40 lines of TypeScript, and the trigger needed the same walk where TypeScript cannot run. Two copies is #129 in its purest form. The chain is now `allowance_effective_markup_percent()` in SQL and `allowanceSellFor` calls it — REVOKEd from `authenticated`, because it returns a floored figure. |

**And ONE formula, not three** — `lib/selections/option-sell.ts`, pure and client-safe, so the
browser sheet and the server signature path hold the identical function. The placeholder now names
the percent it will actually use (`inherit (20%)`); "inherit" over a field that inherited nothing is
what made the defect read as a working feature.

### Tests

- **`s174-option-sell.test.ts` — 11/11**, a UNIT test because the formula is now a unit. Before
  this it lived twice inside React components, which is exactly why it could be wrong in all three
  at once and stay that way.
- **`s174-markup-snapshot.live.ts` — 15/15.** The trigger stamps at insert and **re-walks** on
  relink (not merely re-dates: the basis is moved underneath and the new value must appear). **The
  ruling is asserted BOTH ways** — a later edit does not move a stamped selection, AND a selection
  linked after the change picks the new value up. A snapshot that never updates and a live read
  that always does would each pass a one-sided probe. Plus the floor on four roles, no DELETE for
  anyone, and the RPC un-callable by every role — that last one paired with a positive (the
  allowance deduction resolving through the same RPC), so "nobody may call it" means a floor and
  not a broken function.
- **`s171-selections-lifecycle` 41/41 and `s171-selections-tables` 34/34 unchanged.**

### The S157 sweep

Grepped `markup_percent` across `test/`, `e2e/`, `app/m/` and the specs. **No existing test encoded
inherit-means-zero** — every selections fixture sets an explicit markup, which is itself why the
defect survived. Read the titles as well as the assertions; nothing to invert. The new floored
table has no inventory test to update (there is none in this repo).

---

## Jobs 3–6 — INVESTIGATED AND REPORTED, NOT BUILT (`072eeb0`)

Per the brief. Filed in `TECH_DEBT.md` as `#1-s174` … `#6-s174`, branch-scoped per the S136 rule.

**Every claim was probed against live rebuild-test, not read off the migrations**, because in one
place they disagree. The probe created, exercised and hard-deleted a throwaway estimate in one
script; its residue check returned zero rows and the script is not committed.

| id | verdict |
| --- | --- |
| `#1-s174` | **Manual/company-side selection.** Blocked by TWO schema constraints, not one: `channel_check` permits exactly one value, and `completed_shape` requires `signature_data` AND `signer_profile_id`. Notary path is the right precedent and fits exactly; the shape is Q6's caller context. **Do NOT overload `signer_profile_id`** with the staff member — that column means "the client who signed". Josh's required note gets a CHECK, not a form. One open question flagged for Josh: is an attestation reversible? |
| `#2-s174` | **⚠️ FOUND WHILE INVESTIGATING 4 AND 5, AND MORE SERIOUS THAN EITHER.** An Owner or Admin can rewrite a SENT estimate's `name`, `grand_total` and `scope_summary` through ordinary PostgREST. Probed: three UPDATEs, 1 row each, `grand_total` read back as `999999`. `estimate_line_items` IS floored at the DB (`AND e.status = 'draft'` in both policies); `estimates_update_manager` carries that predicate **only on its PM arm**. The children are frozen and the parent is not. |
| `#3-s174` | **Sent estimate cannot be voided.** Same shape as `#1-s167fx`, and narrower — no deadlock to unpick, only a missing concept. Soft delete already works; hard delete is refused; `voided` is not in the status CHECK and `declined` is the CLIENT's act. Flags the judgement call the CO ruling does not answer: a CONVERTED estimate is load-bearing through `projects.source_estimate_id`, so voiding one probably must be refused outright. |
| `#4-s174` | **Sent estimate cannot be unsent — IN THE UI. THE PROBE IS THE FINDING:** `UPDATE estimates SET status='draft'` as Owner returned **1 row**. Unsend is not blocked; it is unreachable. Nothing defends the boundary — the absence of a button does. **Answer to Josh's question: yes, void-and-reissue is right and unsend should NOT be built**, with three reasons and a recommended sequencing (freeze → void → close this WON'T BUILD). |
| `#5-s174` | **Native dialogs, swept: 56 `confirm()` across 38 files, 20 `alert()`, 2 `prompt()` — and ZERO under `app/m`.** The parity angle is why it is debt: mobile `co-actions.tsx` already uses a styled panel with `tone="danger"` for the same CO actions `co-builder.tsx` confirms natively, with no note recording a deliberate difference. S168 set the rule: a confirmation carrying DATA is a panel; these 56 are pure yes/no. Fix direction is ONE `useConfirm()` primitive, not 38 rewrites — and flags the S157 trap: `e2e` accepts these via `page.once('dialog')`, so every such handler goes green while clicking nothing once the dialog stops being native. |
| `#6-s174` | **CLOSED — not a defect.** `EST-1951` is `sent` and was never converted; `EST-1952` is `converted` and links to `PRJ-1952` through `source_estimate_id` exactly as expected. The two are one clone apart and their names differ by a single "Copy of". Recorded so nobody re-investigates a link that works. |

## The unverified register — `GATED.md`

Josh: *"ALSO RECORD AS UNVERIFIED, not for this session."* New section, with the reason it exists
stated: **a green harness closes none of these**, because every line has passing coverage of its
MECHANISM — which is precisely where this session's first two defects lived.

- **Batch release** — the control was never reached in the click-test.
- **Denied → reopen** (S172) — shipped and harness-covered, never clicked.
- **Option images — 1 of 4 paths verified.** Only Upload was clicked; paste, drag-drop and the
  product-link thumbnail (which calls a third party and degrades to "no preview image was found")
  are unverified by hand.
- **Portal Part B** — the R17 three-state control and the three `presentation_level` disclosure
  levels.

Recorded as **VERIFIED** so they are not re-tested: the catalog and job-budget option sources.

---

## Verification battery — all printed exit lines

> **⚠️ THE PRINTED LINE IS THE EVIDENCE, NOT THE TASK SUMMARY — and this session is the proof.**
> Playwright shard 1's completion notification reported *"exit code 0"* while the run's own
> `SHARD1_EXIT:` line said **1**, with two `✘` in the log. The command was
> `( npx playwright test …; echo "SHARD1_EXIT: $?" )`, whose status is the **echo's** — exactly the
> trap CLAUDE.md's exit-status rule names in its second clause. Reading the printed line is what
> caught both failures; taking the summary would have shipped this red as green.

| # | Step | Result |
| --- | --- | --- |
| V1 | `tsc --noEmit` (apps/web) | **exit 0**, empty output. Re-run after the e2e edit: **exit 0** |
| V2 | `next lint` | **exit 0**, "No ESLint warnings or errors" |
| V3 | `next build` | **exit 0**, compiled. No sandbox kill this session (S173's V3 needed three attempts) |
| V4 | committed `vitest run` | **exit 0**, **60 files, 919/919** (59/904 at S173 + `s174-option-sell` 11 + the new subject assertion in `brand-email-footer`, 51 → 52). New file's collection verified by name, not inferred from the total |
| V5 | every live harness, COLD | **exit 0 — 94/94 files, 1313/1313**, 713s. (92/1289 at S173 + 2 files + 24 tests.) Zero `×`/`FAIL` markers in the log |
| V6 | Playwright ×4 shards, serial | **🟢 after two investigated reds.** Shards 2/3/4 **exit 0 first pass** (124+3sk / 157+4sk / 104+2sk, `✘` 0). Shard 1 **exit 1, one `✘`** — see below. Totals: **536 passed, 9 skipped, 1 `✘`**, that one re-run to 28/28 in isolation |
| V7 | `supabase migration list` (repo root, linked `nmyphyhmfttxkdoposvf`) | **exit 0, 137 = 137**, latest `20261030000000`. Two migrations this session, both applied and both type-regenerated |
| V8 | `fixture-snapshot.mjs` + a marker sweep | ⚠️ **PASS-WITH-NOTES** — see below |

### V6 — the two reds, and only one was mine

**RED 1 — `desktop-selections.spec.ts`, and it WAS mine. Not a regression; a real change in
product behaviour that the assertions had to be told about.**

Releasing now **blocks on an outbound email** so it can report `emailed` — the same shape the CO
send route uses (*"a failed email is a warning, not a rollback"*). That put `resend`,
`@react-email/components` and the template into the module graph of
`/api/selections/release` AND `/api/selections/[id]/offer`, so the first dev-server hit compiles a
much larger tree and then waits on a network call to a `@example.invalid` recipient.

**The tell that it was latency and not breakage:** the two routes SHARE that graph, so exactly one
test per run pays the cold compile and **which one depends on shard order**. Shard 1 failed at the
batch release (line ~282); the same file run in isolation failed at the withdraw (line ~218); **each
passed in the other run**. The batch test's closing DB assertion — both rows `awaiting_approval` —
proves the writes land either way.

Fixed by giving the post-POST assertions in that spec an explicit `AFTER_POST` (20s) with the cause
written down, extending a precedent the file already carried at 15s for a smaller version of the
same thing. **`desktop-selections` re-run: 13/13, exit 0.**

**RED 2 — `m-capture.spec.ts:698`, and it was NOT mine.** `page.goto: Page crashed` on the first
occurrence, `page.waitForURL: Navigation failed because page crashed!` on the second — **zero
assertions evaluated either time**, at two different lines of the same test. That is the #145
renderer-crash class S173 recorded in this same file (at `:622` then). Nothing in S174 touches
`/m/p/[projectId]/safety/new`. **`m-capture.spec.ts` in isolation: 28/28, exit 0 — twice**, once
before the shard run and once after, the second re-run also clearing the fixture-teardown FK error
the crash had left behind.

### V8 — the census, honestly

**The BEFORE census does not exist for this session**, because the restart destroyed the first run
and the battery's early steps had already executed by the time this log did. So the AFTER is
compared against S173's recorded closing state rather than a same-session BEFORE. Saying which
comparison was actually available matters more than presenting a matched pair that was not.

| | S173 close | S174 close | verdict |
| --- | --- | --- | --- |
| projects | 11 | **12** | **+1 HUMAN** — `PRJ-1952` "Copy of Copy of Copy of test4", Josh's own conversion of `EST-1952` (the `#6-s174` investigation). Not marker-named; no sweep may claim it |
| project_assignments | 27 | **28** | +1, the assignment that came with that project |
| estimates | — | 18 | includes Josh's `EST-1951`/`EST-1952`. **My two probe estimates (`EST-1953`, `EST-1954`) were hard-deleted and verified gone** |

**Marker sweep — zero residue, all five markers, across selections / areas / options / budget lines
/ estimates:**

`S174MAIL` 0 · `S174SNAP` 0 · `S174PROBE` 0 · `E2ESEL` 0 · `E2ESEND` 0

**And zero `email_logs` rows of type `selection_released` anywhere** — the new sender leaves nothing
behind, because both the live harness and the e2e spec sweep their own.

**One invariant re-checked AFTER the whole battery, not just inside its own harness:**
`selection_amounts` = **6** and `selections` = **6**. Every live selection carries a markup
snapshot; the backfill holds and the trigger fired for every row created during the run.

**Not committed, and not mine:** `docs/handoffs/EZContractorBinder_Desktop_handoff/` is untracked
and predates this session. Left exactly as found.

---

## Closing — 🟢 two jobs built and verified, four investigated, on `feature/s174-selections-email-and-markup`

- **Job 1** — the release mails the client, through the one `sendEmail()` mechanism, one message
  per release, no money in it, a warning on both surfaces when it does not go. Both registry
  halves in one commit.
- **Job 2** — "inherit" inherits, from a trigger-stamped snapshot in a floored side table, with the
  Q3 chain reduced from two implementations to one and the sell formula from three to one.
- **Jobs 3–6** — filed as `#1-s174`…`#6-s174`, every claim probed live. **`#2-s174` was not on the
  brief and is the most serious thing found**: an Owner or Admin can silently rewrite a SENT
  estimate through ordinary PostgREST, because the freeze is a TypeScript `if` while the estimate's
  own line items are floored at the database. **`#6-s174` closed as not-a-defect.**
- **Recommended sequencing, recorded because building in the wrong order wastes the work:**
  `#2-s174` (the freeze) → `#3-s174` (void + reissue) → close `#4-s174` as WON'T BUILD. A void on a
  row that can still be edited afterwards records nothing.
- **Stage 5 not started.** No 7B/7D/7H file touched; nothing written to `project_budget_items`.
  Nothing pushed.
