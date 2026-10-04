# S128 — Estimates & change orders. THREE PHASES. Two different endings.

Fresh context.

⚠️ **READ `docs/specs/estimates-and-change-orders-spec.md` ON `main`, IN FULL, BEFORE ANYTHING ELSE.**
It is the whole build: Parts A–H, every ruling Josh made on 2026-10-03, the stop rules, and a
§ SEPARATE BUILD section naming what is **not** in this session.

⚠️ **The spec is a claim. So is this prompt.** Re-verify anything you build on. Context files drift;
git and the database are ground truth.

⚠️ **THIS SESSION IS `S128`.** Do not reuse S126, S127, or any of S136–S148 / S180–S181, which already
exist in `docs/sessions/`.

---

# ⚠️ THE ONE THING THAT MAKES THIS SESSION DIFFERENT

**Parts A, B, C, D, E-1, F and G ship the normal way: built, proven, CI green, merged, migrations to
production.**

⚠️ **PART H — DIVISION BUDGETING — DOES NOT MERGE AND DOES NOT TOUCH PRODUCTION.**

> **[Josh, 2026-10-03 21:19]** *"CC can merge the parts that were here before I added divisions.
> divisions should be tested on the dev server."*

**Part H is built on its own branch, its migration goes to REBUILD-TEST ONLY, and it stays there for
Josh to click through on the dev server.** ⚠️ **No merge to `main`. No migration to production. Not
even a green CI run earns it.** Josh rules on it after he has used it.

---

# ⚠️ THE THREE PHASES

| phase | what happens | forbidden |
| --- | --- | --- |
| **1 — RESEARCH** | the spec's verifications, run and reported | ⚠️ **no application code, no migrations, no merges** |
| **2 — PLAN** | the plan and every open question, in chat AND in the report | ⚠️ **no building before the plan is written down** |
| **3 — BUILD** | the queue in the planned order | ⚠️ **nothing outside the plan** |

⚠️ **PHASE 1 IS NOT A SKIM.** Three of the spec's parts begin with a verification that can shrink or
kill them. **The point of phase 1 is that phase 3 holds no surprises.**

**If Josh is not answering:** present the plan in plain text and in the report, list every open
question with your recommendation, then proceed on your own stated reading — ⚠️ **except where the
answer is irreversible, could reasonably go either way, or hits a stop rule. That item stops, unbuilt,
with its decision written out; the rest continues.** ⚠️ **Never an interactive picker. Plain text
only** — Josh is not notified when a picker appears.

---

# PHASE 1 — RESEARCH

## ⚠️ 1.0 — FIRST ACTION, BEFORE READING ANYTHING

**Run `ListAgents`.** ⚠️ **No peer is expected. Any peer at all — this checkout or another — stops
you. Say so and stop.**

## 1.1 — The ground

`git fetch --prune`. State `origin/main`'s SHA and subject, and the ref you are on. **Confirm
`docs/specs/estimates-and-change-orders-spec.md` is on `main` and read it in full.** ⚠️ **If it is
missing, stop the session and say so** — without it you are working from memory.

**State what S127 left:** items 1 and 7, P-1 to P-6, 4a–4e, 5a, 6, R-2, R-9 and item 2 all merged, and
seven migrations on production. ⚠️ **Verify that by log, not from this sentence.**

## 1.2 — The verifications. These ARE phase 1.

**A-0 — does a description field already exist on estimate and change-order line items?** ⚠️ **This
has bitten twice: the clock location was captured for months with nothing rendering it, and
`client_schedule` returned a task status no page ever showed.** Check both line-item tables, the cost
catalog, and whether anything writes or reads such a field.

**A-2 — the real proposal format values.** Josh named four: summary with description, itemized with
description, cost plus, time and material. ⚠️ **Those are his words, not necessarily the stored enum,
and "cost plus" / "time and material" are ALSO contract-type values on `projects.project_type`.**
Establish which is which before writing a condition against either.

**B-0 — is the raw back-calculated markup STORED, or only displayed?** `20.496666666666673%` on a
$600 line with a hand-set $722.98 total. ⚠️ **If it is stored at full float precision and anything
downstream recomputes money from it, rounding the display hides the problem.**
⚠️ **`docs/specs/money-representation.md` governs.**

**D-0 — was Scope of Work's formatting problem actually FIXED?** Josh's wording reads as past tense;
that is a claim. **If a working rich-text editor and renderer exist, Part D is reuse. If not, it is two
surfaces and a shared mechanism.**

**E-0 — why is a SUB line missing from the Sub Bids tab?** Three SUB lines exist; two cards show, and
the cards are titled by SECTION name with the Rough Phase card reading $7,000 — one line's amount, not
the section's $7,850. ⚠️ **Hypothesis only: it groups by section and surfaces one line per section.
Find the real cause. Do not build the fix for the hypothesis.**

**F-2 — can a client ever see a projects list or card carrying an image?** ⚠️ **RULED ALREADY (Josh):
a client never sees a cover photo anywhere.** So this is not a question — it is **establishing every
portal surface that names a project**, so the payload proof covers all of them.

**G — is the clipped "More actions" menu one screen or many?** ⚠️ **Report the list before fixing
anything.** And: **does a menu elsewhere already flip upward correctly?** If so the fix is to use it.

**H-2 — the cost codes.** ⚠️ **Read Sheet2 of Josh's workbook format as the spec describes it: CSI
MasterFormat 1995, FIVE digits, `DDSSS`, zero-padded TEXT.** Establish where a seeded MF95 section list
would come from, and confirm nothing in the repo already stores codes as numbers.

## 1.3 — Read before planning

- ⚠️ **C before H.** H-5 says `+ Line` opens **the same sheet** the line-item estimator uses — which
  Part C builds. **Part C must land before Part H starts.** Say so in the plan.
- ⚠️ **A before C.** The sheet shows the description that Part A creates.
- **Part E:** ⚠️ **only E-1 is in this session.** E-2 to E-6 moved to the separate build.
- **Part H's size.** Read H-1 to H-16 and say plainly how much of it you expect to reach.

**Commit and push phase 1's findings before phase 2. Push after each one.**

---

# PHASE 2 — THE PLAN

**In the chat and in the report:** every item in build order, with what changes, how many migrations,
what you will prove, and what could break · anything phase 1 found that changes an item's scope or
kills it · every remaining open question with your recommendation and what breaks either way ·
⚠️ **which items you are NOT going to reach.**

**An honest short queue beats a plan that silently stops halfway.**

---

# PHASE 3 — BUILD, in this order

## 1 — THE THREE DEFECTS. Small, real, and they land first.

**1a — Part B: the markup on a hand-set total.** The typed number always wins, either direction; the
derived figure displays to 2dp and ⚠️ **nothing recomputes the typed number from the rounded one** —
$722.98 never becomes $723.00. A later cost change leaves the total alone and turns it **red**. ⚠️
**Decide and state how the red state is cleared; red is the marked half, and the precedent is
S122's pinned invoice lines: visibly marked and always reversible.**

**1b — Part E-1: the missing sub-bid line.** ⚠️ **Count the SUB lines and count the cards. They must
match.** Leave a test behind that holds with one section carrying two sub lines.

**1c — Part G: the clipped menu.** Fix it wherever 1.2's list says it occurs. ⚠️ **The proof is that
the menu's LAST item is reachable and clickable with the sticky bar present. A test that opens the
menu and never asserts that proves nothing.**

## 2 — PART A: line-item descriptions

Every line, never required, **blank renders nothing and shows no empty box**. The section description
is **untouched**.

⚠️⚠️ **THE FORMAT GATE IS NOT A CONDITIONAL RENDER.** The client read path returns a shape containing
**no description** on the other formats. **Prove it on the PAYLOAD — a cookie-less fetch of the
bytes**, the way 4e's gate was proven. **A sabotage restoring the field must go RED.**

## 3 — PART C: the line detail sheet

Click any line → its full record, editable. ⚠️ **It ADDS to inline editing; the grid stays
quick-editable.** `Add Line` on a category with existing lines lists them. ⚠️ **Reading taken and never
confirmed: that list is live, and clicking an entry opens its detail. STATE THIS PROMINENTLY in the
report.**

⚠️ **This is the sheet Part H reuses. Build it to be reused.**

## 4 — ⚠️ PART H: DIVISION BUDGETING. BRANCH + REBUILD-TEST ONLY. NO MERGE. NO PRODUCTION.

**Build it per H-1 to H-15.** The pieces that carry the most risk:

- ⚠️ **H-2's cost codes: zero-padded TEXT, division read from the first two characters.** `01000` read
  as the number `1000` files General Conditions under Division 10, **silently.** A unit test on that
  exact case.
- ⚠️ **H-8's gross-up is SOLVED, not multiplied:** `Total = Cost ÷ (1 − Σ mode-2 rates)`.
  **Multiplying leaves the company short.** ⚠️ **If those rates reach 100%, REFUSE and say so on
  screen. Never print a number.** A test at 100%.
- ⚠️ **H-8a: position constrains the base; the default is everything above it; the checkboxes make an
  exception; and EVERY ROW STATES ITS BASIS IN WORDS ON THE ROW** — not on hover, not in a panel.
- ⚠️ **A mode-1 line may not take a mode-2 line as its base.** Report the cycle; never loop.
- ⚠️ **H-9: round fractions UP, and the displayed total is the SUM OF THE ROUNDED LINES**, so what is
  shown always adds up. **Prove it on a figure that rounds both ways.**
- ⚠️ **H-12: the estimate SNAPSHOTS its divisions and its bottom block at creation.** Later template
  edits reach new estimates only.
- ⚠️ **H-14: a division budget is MONEY.** Owner and Admin see all; a PE is selected per estimate.
  **The Financial Visibility Floor applies — proven on the bytes.**
- ⚠️ **H-6's out-to-bid flag: carry the column, build no bidding.** Sub bids moved to the separate
  build.
- ⚠️ **H-16 — the conversion to a project budget — IS NOT IN THIS SESSION AT ALL.**

### ⚠️ How Part H ends

1. **Its migration goes to REBUILD-TEST.** One migration per section, dry run listing exactly one
   file, verified by object with every expected value stated **before** you query.
   ⚠️ **NOTHING TO PRODUCTION.**
2. **Full local proofs:** unit, live role maps judged by the service role with writes returning no
   rows, sabotages red and restored by md5, `next build` exit 0 with the printed line read.
3. ⚠️ **LEAVE JOSH A RUNNING DEV SERVER AND A CLICK LIST.** Confirm how the dev server starts
   (`scripts/e2e-preflight.sh` ran one on port 3000 against rebuild-test during S127 — **verify, do not
   assume**), then write him, in the report:
   - the exact command, verbatim
   - the address to open, and the Ports-tab fallback
   - who to sign in as
   - ⚠️ **a numbered click path through the feature: make a division, add a section, add lines, set a
     percentage line both ways, drag one, and reach the 100% refusal**
   - what he should see at each step, and what to check if he does not
4. **Then STOP Part H.** ⚠️ **Do not merge it. Do not run CI on it to "finish" it. Do not push its
   migration to production.** Say in the report that it waits for Josh.

## 5 — PART F: project cover pictures

Default is the **first picture ADDED** to the project, **stored** at that moment, and only a user
choosing a different one changes it. ⚠️ **Every upload path must set it when there is none** — camera,
upload, offline queue, desktop retry; **enumerate them first.** ⚠️ **Write only when
`cover_file_id IS NULL`**; prove a second photo does not move it and a hand-set cover survives a third.

⚠️ **A client never sees a cover anywhere — enforced in the PAYLOAD.** ⚠️ **Setting a cover must not
touch `client_visible`, in either direction.** **Backfill existing projects to their earliest photo**,
stating the row count before and reading it back after.

## 6 — PART D: rich text on Terms

**Six formats, closed: bold, italic, underline, bulleted list, numbered list, indent.**
⚠️ **Nothing else. Tables, headings, links, fonts, sizes and colours are deliberately excluded.**

⚠️⚠️ **PDF PARITY IS THE GATE, NOT AN AFTERTHOUGHT.** These are terms on a document a client signs.
**Generate a PDF and read it. If a format cannot render identically in both places, it does not ship.
Test indent and nested lists specifically.**

⚠️ **Sanitize server-side on the way OUT**, allowlisting exactly those six. **A sabotage inserting a
script tag must be proven neutralised in the rendered bytes.**
⚠️ **Existing plain-text terms must survive unharmed. A migration that reformats live contract
language is a stop.**

---

# ⚠️ NOT IN THIS SESSION

- ⚠️ **Part E-2 to E-6 — bid packages, allocation, the sub-facing payload, bid attachments.**
- ⚠️ **Recording expenses to cost codes**, and the in-house-labour checkbox.
- ⚠️ **H-16, the conversion to a project budget.**
  **All three are one separate build and Josh wants a new interview first. Do not start any of them,
  and do not half-build a piece as a tail.**
- ⚠️ **S124 Parts 1 and 3** — the QuickBooks sandbox is still dead until Josh reconnects it. **Leave
  `feature/s124-p1-push` alone.**
- ⚠️ **`feature/s114-c5-multi-upload`** — the revert reason holds; discarding is Josh's.
- ⚠️ **P-7 (the single-language dictionary, `#183`), P-8, P-9.** `#183` was ruled to come AFTER this
  build.
- ⚠️ **`staleTimes` / the client router cache** — settled by measurement at S121. **A proposal to
  disable it is a finding to REJECT, not evaluate.**

---

# ⚠️ CI

- **Rule 1:** a merge to `main` carries `[skip ci]` **only when tree identity is PROVEN** —
  `git diff --name-only <tested> <merge-head>` returning nothing outside `docs/` and root `*.md`,
  **printed in the report.** ⚠️ **No proof, no skip.** `main` has no required status checks (S127, 1.3).
- **Rule 2:** stack **two deep maximum**, and ⚠️ **never stack migration-carrying work with work that
  carries none.**
- **Rule 3:** docs-only commits always carry `[skip ci]`.
- ⚠️ **Part H's branch gets NO CI run as a finishing step.** It is not being merged.
- **The two reds are different things.** A red that **overlapped** another run is a suspected
  collision: re-run alone, do not count it. **Connection exhaustion reds a run that has the database to
  itself.** ⚠️ **Check timestamps before calling a red a collision.** A second red on the **same** cause
  is a stop.
- ⚠️ **`workers: 1` is Josh's S134 ruling (TECH_DEBT #150, cause CI #201). Do not raise it**, and do
  not propose running fewer tests on branches — that was rejected with its reason in `CLAUDE.md`.

---

# Working rules

- One branch per item, cut from `main`. **Push after every commit.**
- ⚠️ **Commit path-scoped. Never `git add -A`.**
- ⚠️ **An item ships whole or not at all.** Unfinished = stopped, unmerged, with a written state.
- ⚠️ **Verify by object. A prior report is a claim** — including this prompt.
- ⚠️ **Every sabotage must go RED**, then be restored and read back by md5.
- ⚠️ **A test that passes on zero rows is a failure. State row counts.**
- ⚠️ **Write off-project negatives WITHOUT returning rows.**
- ⚠️ **An e2e that passes on a page that never rendered is not a pass.**
- ⚠️ **Never truncate an inspection with `head`.**
- ⚠️ **Name the ref every measurement was taken on.**
- No test deleted; superseded assertions quoted in place.
- `next build` must pass and **the printed exit line read.**
- ⚠️ **End every turn with the CLI on rebuild-test**, read back — including a turn that stops.
  ⚠️ **Never `migration repair --status reverted`.**
- ⚠️ **One migration per section**, stated expectations **before** the query.
- ⚠️ **Commit and push after every finding, proof and section.** The Codespace has timed out seven
  times in five days, and its 240-minute idle limit is GitHub's maximum.

---

# Stop rules

1. ⚠️ **ANY Part H code reaching `main`, or ANY Part H migration reaching production.**
2. A production verification value that does not match its stated expectation.
3. ⚠️ **A migration adding a constraint over existing production rows.**
4. ⚠️ **A line description reaching a client payload on a format that should not show it.**
5. ⚠️ **An internal note reaching a client payload, on any format.**
6. ⚠️ **A rounded markup changing a total a person typed.**
7. ⚠️ **A cost code stored as a number rather than zero-padded text.**
8. ⚠️ **A gross-up multiplied instead of solved, or a total printed when the mode-2 rates reach 100%.**
9. ⚠️ **A mode-1 line taking a mode-2 line as its base.**
10. ⚠️ **A cover picture reaching a client payload, or served by anything but the `private` thumbnail
    proxy.**
11. ⚠️ **Setting a cover changing `client_visible`.**
12. ⚠️ **Any change to the section description's behaviour.**
13. ⚠️ **A rich-text format that renders differently in the PDF than on screen.**
14. ⚠️ **Rich text reaching a client-facing page unsanitized.**
15. ⚠️ **A migration that alters existing terms or scope-of-work text.**
16. ⚠️ **A division budget reaching a role that may not see it.**
17. ⚠️ **Starting anything from § SEPARATE BUILD.**
18. ⚠️ **A sabotage that does not go red.**
19. ⚠️ **A second Claude Code session live in this checkout.**

**On any stop except 1, 17 and 19:** relink to rebuild-test, prove it, write the state into the
report, commit, push. **Stop the ITEM, not the session** — then continue down the queue.

---

# The report — `docs/sessions/S128-report.md`

⚠️ **One file. Append and push as you go, not at the end.**

**Lead with, in this order:**

1. ⚠️ **`## WHAT JOSH DOES WHEN HE'S BACK`** — one numbered list, **one action per line, nothing
   bundled.** It must open with **the Part H dev-server walkthrough** (§ "How Part H ends", step 3) and
   also carry anything still outstanding from S127: the QuickBooks sandbox reconnect, the two iPhone
   checks.
2. ⚠️ **What Josh must RULE**, each with the options and what breaks either way.
3. **The phase 2 plan as presented, and every deviation from it, with why.**

**Then, per item:** merged with its SHA and whether it is on production, or **stopped and exactly
where** · every sabotage with its read-back and row counts · every production verification row against
its stated expectation · ⚠️ **every decision taken on your own reading, and why** · ⚠️ **everything
deferred, and why.**

⚠️ **Part H's entry says plainly: built, on rebuild-test, NOT merged, waiting for Josh.**

**A gap stated is a gap. A gap unstated is a false clean bill.**