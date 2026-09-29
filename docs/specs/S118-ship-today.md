# S118 — finish everything and get it live, today (unattended)

**This supersedes the S116 and S117 prompts. Use only this file.** It is self-contained: every field,
ruling and constraint needed is here.

Continue in your current session if you have one; otherwise read `docs/sessions/S116-report.md` and
`docs/sessions/S115-report.md` first.

**Josh is away. Every item below ends merged and on production, or stopped with a written reason.**

---

## ⚠️ PRODUCTION AUTHORISATION — today, this list only

**CC may apply migrations to production and merge without a separate approval.** Conditions, none
negotiable:

1. ⚠️ **This does not amend CLAUDE.md.** It covers the work named in this file and nothing else.
2. A runbook per migration: **one migration per section**, a dry run that must list **exactly one file**,
   push, then **verification by object with every expected value stated**. ⚠️ A value that does not match
   is a **stop**, not a note.
3. ⚠️ **End every turn with the CLI on rebuild-test** (`nmyphyhmfttxkdoposvf`) and read it back —
   including a turn that stops on an error.
4. ⚠️ **Never `migration repair --status reverted`.** Production legitimately lacks four versions that
   live on the stranded branches; item 4 is what fixes that.
5. **Write nothing else to production** beyond the migrations and the catalog import in item 8.

---

## ⚠️ CI — batch two at a time

[Josh, 2026-09-29] A full run per item costs 30–40 minutes and they are reliably green.

**Stack, do not start-and-cancel.** Cut the second branch **from the first**, not from `main`. Mark the
first branch's commits `[skip ci]`. Request CI **once**, on the stacked head. A green run on a branch
containing both proves both.

⚠️ **You cannot cancel a run** — `gh run cancel` returned 403 in S115. Do not start a run you intend to
abandon.
⚠️ **Never stack migration-carrying work with work that carries none.** A stacked merge brings both, so
a migration waiting on production would hold the other item hostage.
⚠️ **Two deep, no more.** A red on a stack does not say which half broke it.

---

## ⚠️ UNATTENDED — do not stall

- **Reversible and unruled** → take the **narrower** option, build it, record what you chose, the
  alternative, and why.
- **Irreversible, or in the stop list** → prepare, write it up, stop **that item only**, move on.
- ⚠️ **Never the interactive picker.** Josh is not notified; the session sits idle.

**First action:** create `docs/sessions/S118-report.md`, commit, push — before anything else. Then append,
commit and push after every proof run with its counts, every sabotage with its restore and read-back,
every production section with its verification row, every build exit line, and every stop.
⚠️ **A commit that is not pushed does not exist.**

---

## State — verify against git, do not trust this

- `main` = `160a57d5`, carrying H-1, F-11, H-2, H-3, C-12, C-11, H-5 and H-1b.
- R11 was in CI at run `36562206482`. Check its result; merge if green.
- `feature/s116-c5-step1` has all eight components moved and eight proof specs written, **none run**.
- ⚠️ **R10 has never had a CI run** — every commit on it is `[skip ci]`. What was green is its live test
  against rebuild-test (19 passed). Correct any note saying otherwise.
- Production has every S114 migration. `20262020000000` (R10) is on rebuild-test only.
- Four migrations are owed from the stranded branches (item 4).

---

## Rulings — every decision is made; nothing waits on Josh

**Q8 — staletimes is NOT shipped.** `feature/s112-staletimes-hold` sets `staleTimes.dynamic` to **0**,
making every revisit refetch (52 → 369 ms unthrottled, 51 → 2,129 ms slow 3G). It is a correctness fix
bought with speed, and the markup-save reorder already fixed the case that prompted it. ⚠️ **Correct any
spec line saying it "raises the router cache above its 30-second default" — that is backwards.** Record
it against the S112 hold so nobody un-parks it believing it makes navigation faster.

**The foreman/crew photo soft-delete is floored.** RLS lets a foreman, crew member or subcontractor
soft-delete a photo on any project they can view — wider than any written rule. Bring it to
**Owner/Admin/PM/PE**. Negative test per excluded role, written without returning rows.

**The direct-UPDATE bypass on `project_budget_amounts` is closed.** R10's invoice lock binds only the new
functions; a direct update walks around it. ⚠️ A lock that can be stepped over is not a lock.

**`setup_payment_schedule()` is fixed** (`#167`). ⚠️ **Live defect affecting the Owner today**: one
hand-entered expense linked to a subcontract makes the formal schedule refuse for everyone. State the
production count of subcontracts affected.

**A project rename does not change history.** Sent documents keep the name they were sent under.
Owner/Admin only.

**The Project Executive gets estimates from the beginning.** Create and build, the author-floor model the
PM has. ⚠️ **Send stays Owner/Admin** — sending a proposal for signature is contract-adjacent and R1's
carve-out 2 stands.

**CLAUDE.md is left alone at 392 lines.** The 350-line target is withdrawn.

---

# PART ONE — finish what is built and ship it

**1. C-5 step 1 — run the eight proofs.** All eight components are on `feature/s116-c5-step1` with specs
written and **none run**. ⚠️ **A written spec is not a proof.** Run each, state its counts, fix what it
finds, sabotage each so you know it can fail. Then the end-to-end duplicate-on-retry proof: force a link
failure, retry, count exactly N rows with the service role. Then CI, then merge.
⚠️ Step 2 (adding `multiple` to new inputs) is **not** today.

**2. R11** — merge when its CI is green.

**3. R10 to production.** `20262020000000`, runbook `docs/sessions/S115-PRODUCTION-RUNBOOK.md`. Its nine
expected values were re-measured on rebuild-test today and match. Apply, verify by object, merge.
⚠️ **On its own — never stacked.**

**4. The three stranded branches.** `feature/s112-bid-token-status` (`20261850000000`, `20261860000000`,
`20261890000000`), `feature/s112-default-acl-guard` (`20261900000000`), and
`feature/s112-catalog-importer` for item 8. They are ~215 commits behind — **rebase, do not assume**.
⚠️ **Confirm the bid-token work's `bid-scope` tag matches the S114 hotfix already on `main`**, or merging
it silently reverts the fix that closed a live file exposure. **That mismatch is a stop.**
This unblocks three things: the bid page lists its documents, the drift detector stops crying wolf, and
the `supabase_admin` default-ACL guard goes live.

**5. The bid page's document list.** The S114 hotfix left it unbuilt deliberately. With item 4 merged,
build it: a sub invited to bid reaches the scope documents, **and only those**. Negative test that an
untagged staff file is unreachable.

**6. Regenerate the drift baseline from the migration FILES**, not from rebuild-test (`#1-s112f`).

**7. The three ruled fixes** — soft-delete floor, budget-amount bypass, `setup_payment_schedule`. Each
with its negative test and sabotage. They carry migrations; do not stack them with anything else.

**8. The cost catalog.** `scripts/data/cost-catalog-home-depot-south-florida-2026-09-23.csv`, 282 items,
pre-validated. The importer has never run.
⚠️ **Apply +5% to each item's cost on import.** State the rounding rule and show five worked examples,
before and after.
⚠️ **Idempotent** — running it twice must not double the catalog. Prove it by running twice against
rebuild-test and counting. Then import for **both** companies on production and report row counts.

**9. The security enumeration — measure only.** Re-run the S112 anon enumeration against
`authenticated`. ⚠️ Nobody has ever asked what an ordinary signed-in user of **any** company can execute.
State the full count and the command. **Report it; fix nothing today** unless something is plainly
reachable that should not be — then stop and write it up.

**10. Merge the docs branches** — `feature/s115-report`, `feature/s116-report`, this session's. Docs-only,
no CI needed.

---

# PART TWO — the new features

⚠️ **Order: 16 → 12 → 11 → 14 → 13.** Smallest and least risky first; the estimate widening last, where a
stop costs least.

## 16. Files and photos on an employee's record

[Josh, 2026-09-29] So a signed employee handbook, and anything else specific to a person, can be kept
against that person rather than against a project.

⚠️ **This is the most sensitive store in the application.** It will hold employment documents —
handbooks, acknowledgements, certifications, licences, and whatever Josh files next. Treat every
question here as a security question first and a feature second.

⚠️ **The failure mode to design against, by name:** two days ago `GET /api/bid/[token]/files` handed
signed URLs for every staff-uploaded file on an estimate to anyone holding a bid token, because a route
authorised the token and not the file. **An employee document must be structurally unable to reach any
external surface** — no bid token, no client portal, no proposal payload, no share link.

**Ruled — narrowest defaults, all reversible:**
- **Owner and Admin only**, read and write. ⚠️ Not PM, not the Project Executive, not the employee
  themselves. Widening later is one line; a disciplinary note read by a foreman cannot be un-read.
- Its **own storage prefix and its own category**, never a project category. ⚠️ **Category, never MIME.**
- ⚠️ **Never appears** in project Files, project Photos, the client portal, a proposal, a bid scope, or
  any share surface. Prove each of those by a negative test, not by inspection.
- **Files survive the person.** Deactivating, banning or removing an employee must not delete or orphan
  their documents — there are retention reasons to keep a signed handbook after someone leaves.
- Uses `runUploadBatch` and `upload-batch-list` per `#2-s180u`. ⚠️ Not another bespoke upload path.

**FILL-16.1** — Where an employee record lives today (`profiles` / `company_members`) and what surface
shows it. The upload belongs on that surface.
**FILL-16.2** — Every existing route and query that returns `files` rows. ⚠️ **Audit by what is CALLED,
not by what matches a filter** — enumerate the callers and state the full count. Each one either excludes
this category or is proven unable to reach it.
**FILL-16.3** — ⚠️ **Negative tests, written without returning rows, one per excluded role**: PM,
Project Executive, foreman, crew, subcontractor and client each refused, counted with the service role.
Plus a bid-token probe and a portal probe proving neither can reach an employee file. Each with its own
sabotage that must go red.
**FILL-16.4** — Production count of anything that would already match the new category (expected zero;
say so explicitly rather than assuming).
**FILL-16.5** — PARITY: desktop is primary. `/m` needs at most read access for Owner/Admin, and only if
it costs nothing.

**ASK-16** — Should an employee be able to see their **own** documents? Narrower default taken: **no**.
Recommend raising it with Josh, because "where is my signed handbook" is a reasonable question from a
crew member and the answer today would be "ask the office".

## 12. The daily log, brought up to the paper form

Source: `WP-Daily-CloseOut-Lookahead`. ⚠️ **Add what the paper form has and the app lacks. Remove
NOTHING.** Anything the app captures that the paper form does not goes into the report as a list **for
Josh**, unchanged and unbuilt.

The paper form's sections:
- **A — Close-out checklist**, ten items: floors swept/vacuumed; debris hauled, no piles; cut station
  broken down and clean; tools cleaned, staged, locked; cords coiled, walk paths clear; materials stacked
  flat and covered; finished work protected; water and power off at source; windows and doors locked,
  site secure; tomorrow's first task staged. Plus **photos sent** (each work area, staging/debris area,
  entry path, 4–5 minimum) **with the time sent**.
- **B — Completed today.**
- **C — Next two days:** tomorrow and day after, each with a date.
- **D — Needed on site, not here now** — the 48-hour rule. Table: item / material, qty, unit, needed by,
  vendor / source, **ordered (office)**.
- **E — Blockers:** sub, inspection, or a decision from the office.
- **Footer:** completed by; **office reviewed / actioned**.

**Ruled:** section D's **"ordered (office)" is actionable** — the office marks it ordered and the field
sees that. Record-only makes the 48-hour rule pointless, which is the reason the section exists.

**FILL-12.1** — The app's daily log today, field by field, against the above: what is missing, what
exists under another name, and the app-only list for Josh.
**FILL-12.2** — Whether a daily log reaches anyone in the office today or is only stored.
**FILL-12.3** — PARITY `/m` and desktop. Filled on a phone at the end of a day.

⚠️ **Separate feature from item 11. They are not connected.** [Josh]

## 11. The material sign-out form, on the Field tab

Source: `WP_Material_Signout_Form`. ⚠️ **A two-stage record with an open state**, not a single-submit
form.

**The fields, verbatim from the document:**
- **1 — Job:** job address, project / job name, date.
- **2 — Material:** type / name, colour / pattern, manufacturer / brand, model / SKU, item #, quantity,
  dimensions / size; **condition at release** (undamaged | minor damage | pre-existing damage); damage /
  condition notes.
- **3 — Purpose and return:** work to be performed, **expected return date**, return location.
- **4 — Receiving party:** company name, contact name, phone, driver / recipient name, vehicle / unit #.
- **5 — Sign-out:** released by (WP) + date/time + **WP signature** + title; received by + date/time +
  **receiving party signature** + title / company.
- **6 — Return, completed later:** date returned, time returned, **condition at return** (same as
  released | damage occurred | **material not returned**), return notes, received back by (WP) +
  date/time + **WP signature**.
- Above the receiving party's signature, verbatim: *"By signing above, the receiving party acknowledges
  responsibility for the listed material while in their possession and agrees to return it in the same or
  better condition."*

**Ruled — all narrower defaults, all reversible:**
- Linked to a project, created from that project's Field tab.
- States: **open → returned | damaged on return | not returned**. **Overdue** from `expected_return_date`.
- Created and WP-signed by anyone who reaches the Field tab. Closed out by Owner/Admin/PM/PE.
- Receiving party **always external** — no account, no invite; signs on the creator's device.
- ⚠️ **At least one release photo REQUIRED** before the receiving party signs. **No in-app bypass** —
  staff carry paper copies for a dead phone. ⚠️ **Do not add a skip control.**
- ⚠️ **Two photo sets, never merged.** Release photos evidence "condition at release"; return photos
  evidence "condition at return". The whole value is putting them side by side when a sub says the damage
  was already there. Each set carries its timestamp and who took it.
- ⚠️ **Use `runUploadBatch` and `upload-batch-list`** per `#2-s180u`. It must **not** become another
  bespoke upload path. Counts as a surface needing its own proof.
- ⚠️ **Category, never MIME** — its own category, so the project Photos grid does not fill with pallet
  shots.
- PDF output, both photo sets captioned by stage, attached to the project like other documents.
- Open and overdue records surface on the Field tab. ⚠️ **A record nobody is shown is a record nobody
  closes.**

**FILL-11.1** — ⚠️ Signature capture already exists for proposal signing. Measure whether it and its
storage are reusable. **Do not build a second signature mechanism without stating why.**
**FILL-11.2** — PARITY: `/m` primary — used on a phone at a tailgate. Desktop needs the list and the PDF.

## 14. Rename a project

⚠️ **The name travels.** QuickBooks has no project object, so the name is **memo text** on everything that
syncs; it is also on proposals, invoices, emails and notifications.
- Already-sent documents **keep the name they were sent under**.
- Owner/Admin only.

**FILL-14.1** — Every place `projects.name` is read, copied or embedded. ⚠️ **Audit by what is CALLED,
not by what matches a filter.**
**FILL-14.2** — Anywhere the name is denormalised at creation, which a rename would not reach.

## 13. The Project Executive builds estimates from the beginning

Today it reaches only a **converted** estimate, read-only. Give it the author-floor model the PM has:
create an estimate, and see the ones it authored.

⚠️ **A migration across 21 write policies.** State the full count and the command — a role list missed
here is a silent denial or a silent leak.
⚠️ **Send stays Owner/Admin.** The PE builds and downloads the PDF; it does not send.
⚠️ Markup and margin stay visible to the PE. No column scope added.
⚠️ Negative tests **without returning rows**: a PE cannot read or write an estimate it did not author and
that is not on its project. Each with its own sabotage.

---

# PART THREE — the remaining slow spots

All measured, not speculative. Ship to production like everything else.

**15.1** — `getBudgetRollup` runs **8 calls in series**, `getJobCostRollup` **6**. Budget's remaining
sequential depth is 8. ⚠️ Money code — its own tests before any reorder.
**15.2** — `/m` → `/m/timeclock` is a server redirect, so a cold PWA launch pays two requests.
**15.3** — `/api/chat/threads` is polled 4 times on first load, each a full middleware run.

⚠️ **Measure the same way before and after and state both numbers.** Instruments already exist:
`scratchpad/nav-measure.mjs` and the server-side fetch log used for H-2 and H-5.

---

## ⚠️ A part ships whole or not at all

Items 11 to 14 are features, not fixes. **Merge a part only when it is complete with its proofs run.** A
part unfinished when you run out of road **stops, unmerged, with a written state** — a clean outcome and
the right one. ⚠️ **Do not merge a partial feature because the list says finish everything.** Josh's crew
will be using whatever is live before he is back at a keyboard.

---

## Stop rules, which override "do not stop"

1. Any production verification value that does not match its expectation.
2. A migration adding a **constraint over existing production rows** — count them on production first and
   stop.
3. Anything touching **refund or contract authority**. R1's carve-outs stand.
4. ⚠️ Anything weakening the Financial Visibility Floor (`#136`). Authority belongs in the database.
5. A dry run listing anything other than the single file its section names.
6. CI red twice on the same cause.
7. ⚠️ The `bid-scope` tag mismatch in item 4.

**On any stop:** relink to rebuild-test, prove it, write the state into the report, commit, push, and move
to the next item.

---

## Standing constraints

Commit path-scoped; never `git add -A`; push after every commit. ⚠️ **Never reformat a file the repo does
not already format.** ⚠️ **Write off-project negatives without returning rows** — with RETURNING the read
policy judges the row and the test cannot fail. Watch unique keys; use a fresh disposable project holding
none of the one-per-parent rows.

⚠️ **Run `scratchpad/lint-job.sh` before every CI request.** S115 lost a run to a unit failure that
testing only the new files missed.

⚠️ **Confirm the instrument measured the thing.** This campaign has lost time to a `grep` truncated by
`head`, a catalog filter that did not match how a policy was written, a role search that missed 16
policies in another form, an `.insert().select()` negative that could not fail, a Prettier check run on
`/tmp` copies, a sabotage whose anchor had been reflowed so it never applied and still printed "10
passed", and an e2e negative that passed on a page that never rendered.

`next build` must pass and the printed exit line read. **A test that passes on zero rows is a failure —
state row counts.** Every sabotage restored and read back identical. No test deleted; every superseded
assertion quoted in place.

⚠️ **"Done" means merged and on production, or it says exactly where it stopped.**

## Final report, plain text

Per item: merged with its SHA and on production, or stopped and why. Every production section's
verification row against its expectation. The eight C-5 proofs with their counts. The `authenticated`
enumeration count and command. Catalog row counts per company. The daily log's **app-only list for Josh**.
Every unattended decision with its alternative. And what a person still has to click.