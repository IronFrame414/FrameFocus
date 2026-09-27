# docs/claude/rules.md

> The working rules, in full: PARITY, the run protocol and its MANDATORY rules, tech-debt numbering. Verbatim from CLAUDE.md (main `80e15bad`). The two S112 rules added since are appended at the end.
> **Nothing here was rewritten.** CLAUDE.md carries the operative statement and links here.


<!-- CLAUDE.md lines 76–106 -->

### PARITY: ONE FEATURE, BOTH SURFACES, SAME BEHAVIOUR — **RULED [Josh, S122]**

**Everything viewable from both desktop and mobile behaves the same way on both.**

A feature that exists on both surfaces is ONE feature with two presentations. Layout, spacing and
input affordances may differ — a phone is not a desktop. **What must not differ is behaviour:** what
gets written, what the rules are, what an error means, and what the user ends up with.

**Why this is a rule and not a preference.** It was ruled after TECH_DEBT #129, where the two
markup editors quietly disagreed about what a save produces. Mobile wrote a flattened derivative;
desktop wrote only `markup_data`. Both "worked". The result was that a photo annotated on desktop
displayed on mobile as an **unannotated original with no indication the markup existed** — silent
loss, discovered by reading the save path rather than by anything failing. Divergent behaviour
between surfaces does not announce itself; it presents as data that is simply wrong somewhere else.

**In practice, when building or reviewing anything that both surfaces reach:**

- **Share the mechanism, not just the intent.** #129's fix was to call the SAME `saveMarkup()` with
  the SAME `drawShapes()` rasteriser, moved to `lib/` so neither surface owns the format. A second
  implementation that "does the same thing" is the divergence, written in a form that looks like
  agreement.
- **A helper under `app/m/` or `app/dashboard/` implies that surface owns it.** If both need it, it
  belongs in `lib/`. Location is a claim about ownership.
- **The rules live below the UI** — in RLS, a service function, or a shared util — so neither
  surface can enforce a different version of them.
- **When the surfaces must genuinely differ, say so where the code is** and give the reason. The
  ruled exceptions are recorded, e.g. `/m` opens files INLINE while desktop appends `?download=`
  (M6M §4.11.16) — a deliberate difference in a delivery affordance, not in what is stored.

---


<!-- CLAUDE.md lines 207–379 -->

## Claude Code — run protocol

LAUNCH REQUIREMENT: start CC with `claude --dangerously-skip-permissions`
(set at launch, NOT mid-session). Permissions also come from `.claude/settings.json`.

Phase 0 — BRANCH: run `git branch --show-current`. If on `main`, create and switch
to a new feature branch (`git checkout -b feature/<short-task-name>`) BEFORE any
edit. Never edit, create, or migrate on `main` — `main` auto-deploys to production.
Merging to `main` is Josh's call, done manually.
Phase 1 — ANALYZE: read the prompt and every file it references; build full
understanding. No edits in this phase.
Phase 2 — QUESTIONS: surface ALL questions / ambiguities / spec↔schema conflicts
at once, then STOP and wait. If none, say so and continue.
Phase 3 — BUILD: perform all reads/edits/creates autonomously; show diffs at the
end; never commit — Josh commits manually. **In an UNATTENDED run this last
clause is superseded — see the rule immediately below.**

### UNATTENDED RUNS COMMIT AFTER EACH DISCRETE STEP, NOT AT THE END — **RULED [Josh, S173]**

**A step is one finding, one fix, one battery check — the smallest independently-meaningful unit of
the session. Commit it path-scoped before starting the next.**

**Rationale, recorded here so nobody tidies it into one clean commit later: this Codespace has
destroyed unattended work three times.** The S166 and S168 battery logs survived precisely because
they were committed step by step; **an entire S173 follow-up session was lost** because its commits
were batched to the end. A branch holding one commit written at the finish is exactly what a
restart takes.

**⚠️ THIS SUPERSEDES "never commit" IN PHASE 3 ABOVE, AND ONLY FOR UNATTENDED RUNS.** The two
rules were written for different situations and the contradiction is deliberate rather than an
oversight:

|             | attended                                      | unattended                                                    |
| ----------- | --------------------------------------------- | ------------------------------------------------------------- |
| who commits | **Josh**, path-scoped by concern              | **CC**, path-scoped, after every discrete step                |
| why         | he is watching the diffs and owns the history | nobody is watching, and the box eats work                     |
| pushing     | **never CC's**                                | **CC pushes the feature branch to origin after every commit** |

**⚠️ WHY THE PUSH RULE CHANGED [S105, Josh].** A twelfth Codespace restart destroyed 11 unpushed
commits — the S105 spec, three list screens, burst capture, and the TECH_DEBT classification.
Committing step by step is not enough: a local branch dies with the box. Pushing a FEATURE BRANCH
to origin is not a merge and risks nothing — `main` is protected by the merge rule, not by the
push rule.

**What does NOT change:** CC never pushes to `main`; commits stay path-scoped rather than
`git add -A` over an unrelated working tree; and merging to `main` remains Josh's call.

**And the reason a step is small rather than tidy.** "One finding" means the fix, its tests and its
spec amendment land together — not that a half-built feature is committed to bank progress. The
unit is what would still be worth having if the next step never ran.

### CC may merge to `main` without a separate approval when three conditions all hold — **RULED [Josh, S180]**

_This narrows "merging to `main` remains Josh's call" (above), and only that. It does not touch the
push rule, the path-scoping rule, or Josh's ownership of applying a migration to production._

CC may merge a feature branch to `main` **without a round-trip for approval** when **all three** of
the following hold. Fewer than three → it is still Josh's explicit call.

1. **CI is green on the branch rebased onto CURRENT `main`** — not an older one. A green run on a
   stale base does not count; rebase (or confirm current `main` is already an ancestor) and read the
   run on that exact tree.

   **Tree-identity exemption to (1) — RULED [Josh, S180].** Condition 1 is ALSO satisfied by a green
   run PLUS a proof that the rebased tree is byte-identical to the tested tree **outside a delta that
   the build, the tests and the runtime never read.** A byte-identical code tree is stronger evidence
   than a re-run, which would add flake risk and rebuild-test drift without testing different bytes.

   ⚠️ **The delta is defined by EXCLUSION, not by intuition.** It may touch **ONLY `docs/` and
   root-level `*.md` files.** Any delta touching `apps/`, `packages/`, `scripts/`, `supabase/` or
   `.github/` **disqualifies** the exemption — `.github/` especially, since a workflow change is
   precisely a change to what CI does. A migration-bearing delta is disqualified by `supabase/` and by
   condition 3 both.

   **The proof MUST be stated in the merge message AND the report:** the **full list of changed paths**
   in the delta, and the **command** used to establish tree identity (e.g.
   `git diff --name-only <tested-sha> <rebased-tip>`). "It's docs-only" is a claim; the file list is
   the evidence. This exemption is why a docs-only branch (`docs/` + root `*.md` only) may merge by
   proof rather than by a run — it is the same standard, defined by path exclusion.

   _First use: S112 R7 heic-conversion (`3bde33d0` green; rebased-tip `ad739e2c`; delta = `CLAUDE.md`
   plus `docs/claude/*.md` plus `docs/specs/S113-SPEC-open-items.md` — all under `docs/` or root
   `*.md`), merged to main `32570857`._
2. **Every check agreed in session has passed, and its measurement is stated** — the pass is written
   down with its number (test tally, row count, exit line), not asserted.
3. **⚠️ Every migration the branch carries is ALREADY on production and verified by object.** This
   point is **never waived.** Deploying code ahead of its migration means the app calls a function or
   column that does not exist and real users get errors. "Verified by object" means the object was
   confirmed present on production (e.g. the runbook's Step-8 catalog read), not merely that a
   migration file exists in the branch.

**What changed is only the approval round-trip.** **Applying a migration to production is still
Josh's action** — CC never runs it. So in practice CC still cannot merge a migration-bearing branch
until Josh has applied and confirmed that migration; condition 3 is the gate that enforces this.

### Questions are asked in plain text, never the interactive picker — **MANDATORY [Josh, S180]**

**Every question to Josh goes in the FINAL message of a turn, as plain text, then the turn ends.**
Never the interactive picker (`AskUserQuestion`), and never a numbered chooser that takes one answer
at a time. This governs Phase 2 of the run protocol and every other ask.

**Why — recorded so nobody reverts it as a style preference:**

- **The picker delivers one question per turn.** A session with six questions becomes six round-trips.
- **Josh is notified when a turn ENDS.** The picker does not end the turn, so he does not know it is
  waiting and the session sits idle.
- **The picker's options are not quotable.** He cannot paste one back with an amendment, so every
  conditional ruling gets flattened into a bare choice.
- ⚠️ **The ruling that comes back loses the question.** "Q3: option A" is useless to a future session,
  and this campaign has already lost time to exactly that.

**The required shape:**

```
Q1. [ASK-n] <the question, stated in full — assume the reader has no memory of the spec>
    Options: A) ...  B) ...
    My recommendation: <which, and why, in one line>
```

**State EVERY question in full**, including ones you think are obvious. **Ask all of a turn's
questions in one message** rather than trickling them. Then **end the turn.**

### The thing inspected must be the thing being judged — exit statuses first — **MANDATORY [moved from TECH_DEBT #137, S122; generalised S108, Josh ASK-D3 → C]**

_Previous heading, quoted: "Reading the exit status of a command"._ The exit-status rules below are
the most frequent case of a wider class, which this campaign hit well over six times: **the evidence
read belonged to something other than what was being judged.** An exit status is one instrument;
every instrument can be pointed at the wrong thing. Before stating a result, name what produced the
evidence and confirm it is the thing in question:

- **A wrapper's status** — `tail`, `echo`, `/usr/bin/time`, a task-notification summary. Rules 1–2
  below. (S108: a notification reported "exit code 0" twice over printed lines reading
  `BUILD_EXIT_LINE=127` — `time` was not installed, no build ran — and `BUILD_EXIT_LINE=1`.)
- **Truncated output** — a grep through `head -20` that stopped before the line contradicting it
  (`#2-deliv`). Count, or read to the end.
- **A script that threw and fell through** to a conclusion printed by the code after the failure.
- **An absent tool** — `dig`, `gh`, `time`. "No output" from a missing command is not "no result".
- **A cached result** — a Turbo cache hit reported as a build; a cached `download()`. A cache hit
  is not a run.
- **The wrong scope** — Prettier run on a copy in `/tmp`, outside the repo, where `.prettierrc` does
  not apply; an env-var sweep that included `.next` build output (42 names instead of 28). S108.
- **A probe that cannot fail** — a test passing on zero rows, or a regex that matches everything
  (`'[^']*--` reported 80/80 bodies; the quote-parity truth was 1). **State row counts, and run a
  control that must fire.**

**A status is only evidence if it belongs to the process being judged.** Five instances in two
sessions (S106–S107) all had one root cause: the status read belonged to a _different_ process than
the one under test. A build that failed lint was reported clean and **committed on that basis**; two
Playwright runs reported `0` while 89 and 91 tests had actually failed.

1. **Never judge a command through a pipe.** `npx next build | tail -20` reports **`tail`'s** status,
   which is always `0`. Redirect to a file and inspect that instead:
   `cmd > log 2>&1; echo $?` — **immediately**, before anything else runs. If a pipe is unavoidable,
   `set -o pipefail` first, or read `${PIPESTATUS[0]}` rather than `$?`.
2. **Print the real code into the output and read _that line_.** Not a wrapper's status, not a
   summary. `cmd; echo "exit: $?"` is itself the trap — the compound command's status is the
   **`echo`'s**, so the shell _and_ any task-notification summary report `0` over a run that exited
   `1`. Print the code and read the printed line.
3. **Corroborate with an independent signal.** A `✘` count, a test tally, a connection-error count.
   A status can be masked; a tally cannot.
4. **Never `pkill -f <pattern>`.** It matches **any** process whose command line contains the
   string — **including the shell running the pkill**, which is why such commands return exit `144`
   and why servers appear to die for no reason. List the processes and `kill <PID>`, excluding `$$`.
   Reference: `scripts/e2e-preflight.sh` (#138).

**In CI this is worse, not equal.** Locally a masked failure costs a re-run; in
`.github/workflows/ci.yml` it **ships red as green**. The workflow sets
`defaults.run.shell: bash -euo pipefail {0}`, which closes the pipe case for every `run:` step —
but **nothing closes the trailing-command case except not writing it**.

### Audit by what is CALLED, not by what matches a catalog filter — **MANDATORY [Josh, S180]**

_Same family as "the thing inspected must be the thing being judged": here the evidence read belonged
to a set defined by a **property**, not to the set of things that actually **run**._

**A catalog query defines a set by a property — `prosecdef`, a name pattern, a schema, a table list.
That set is NOT the set of things that execute.** Two overloads share a name; one is live and one is
dead, and the filter cannot tell you which. **Cross-reference every enumeration against actual call
sites before drawing a conclusion from it.** An audit that reads every member of a filtered set has
still not audited the system if the live code path was outside the filter.

**The instance.** The S180 `authenticated`-writer audit enumerated **39** SECURITY DEFINER functions
(`prosecdef = true`) and read all 39. `create_safety_incident`'s **6-arg SECURITY DEFINER** overload
was in that set — and has **no caller**. The **7-arg SECURITY INVOKER** overload — the one every safety
incident on production actually goes through — was **outside the `prosecdef` filter and was never
read**. It turned out to be RLS-safe; **that was luck, not method.** The audit had read the dead
overload and called the function reviewed.

**In practice:** after any catalog-driven enumeration (functions, policies, columns, routes), grep the
codebase and the DB for who actually calls/uses each member — and, just as important, ask what the
filter **excluded** that shares a name or a job with what it included. Report the excluded set as a
stated residual, never as covered.

### A fix session must sweep for EXISTING tests that encode the behaviour it is overturning — **MANDATORY [Josh, S157]**

**When a session changes a rule — an RLS policy, a role floor, a constraint, a ruling — it is not
done when its own probes are updated. It must go looking for OLDER tests that assert the behaviour
it just overturned.**

**Why this is a rule and not a nicety.** S154 floored `contact_addresses` SELECT for
`subcontractor` and `client`, because the open policy was leaking every client's home address to
subs. It inverted the probes **it had written** and stopped there.
`s121-contact-addresses-floor.live.ts` had a describe block titled **"contact_addresses SELECT is
NOT floored"**, written at S121 to protect the _old_ rule, asserting that crew, foreman **and
subcontractor** could all read an address.

**Only the subcontractor case went red.** Crew and foreman still read company-wide by design, so
two of the three cases kept passing and **the file read as healthy while its title asserted the
opposite of a shipped ruling.** It sat that way through two audit passes.

> **A test that passes while contradicting a shipped rule is worse than a failing one, because
> nothing surfaces it.** A red test is a task. A green test that encodes the wrong rule is a
> statement — and the next person to read it will believe it.

**In practice, before a fix session ends:**

- **Grep for the table, column, policy or function you changed** across `apps/web/test/`,
  `apps/web/e2e/` and the specs — not just the files you touched.
- **Read the describe/it TITLES, not only the assertions.** The defect above was fully visible in
  the title and invisible in the diff.
- **Assume the suite is still green.** A partially-stale file is the normal case, not the edge
  case: any test whose cases span several roles will go red only on the roles you changed.
- **Invert, do not delete.** A test asserting the old behaviour names what changed; rewritten to
  the new rule it becomes the regression guard for the fix. Deleting it discards the record. (Same
  reason `TECH_DEBT.md` entries are closed rather than removed — the repo lost one to deletion at
  `53c7353`.)

**A closely related trap, from the same session.** `s145-contracts` asserted a _column default_ by
reading a row anyone can toggle, and `s140-lien-releases` asserted that a _supported action_ could
never happen. Both describe the freshly-seeded world and then test it forever against live, shared,
mutable data. **If an assertion's name says "default", "none" or "never", check that it is reading
the schema and not a row.**

### A `.limit(1)` must be ORDERED, or SCOPED to the property the caller depends on — **MANDATORY [Josh, S165]**

**A `.limit(1)` with no `ORDER BY` returns a heap-order row — whichever the storage engine hands
back — and that order shifts the moment any row in the table is updated.** So the query passes for
several runs and then fails, with nothing in the diff to explain why. `context100` §6 named this
class; it has recurred roughly eight or nine times across the campaign (`s143-void-authority`,
`s162` F1, `s163` D3, and the S165 sweep among them) and has outlived every individual fix.

**Every `.limit(1)` is one of three things. Decide which before you leave it:**

1. **Ordering fixes it** — the caller wants _a_ deterministic row and any stable one will do (the
   latest, the oldest, the highest `sort_order`). Add `.order('<col>', …)`. Reference:
   `invoices-client.ts:202`/`:292` (append after the last line), which document exactly this.
2. **Ordering does NOT fix it** — the caller depends on the row having a property the query never
   filtered for. `s143-void-authority` wanted _the PM's_ assignment and took the first in the
   company; `s163` D3 wanted a segment the owner did **not** author; the S165 sweep found
   `s143-qb-scaffolding` Q4 taking any company invoice when it needed one the PM could _see_.
   **Ordering would only make the wrong pick stable.** Scope the query with the `.eq`/`.in`/`.not`
   the dependency actually names. **This is the important category and the one that keeps
   recurring** — the tell is that code _downstream of the fetch_ asserts or relies on something
   (a role, an author, an assignment, a status) the `select` did not constrain. A silent early-out
   (`if (!readable?.length) return`) on a wrong pick is not a pass; it is an untested run wearing a
   green tick.
3. **Genuinely arbitrary** — any matching row is fine and nothing downstream depends on which
   (an existence probe reading only `(data ?? []).length > 0`, a schema/column-exists probe, or a
   query guaranteed to return exactly one row by RLS). Leave it, and **add a one-line comment
   saying so**, so the next sweep does not re-examine it.

**This is not test-only.** A service that takes an unordered first row (`reminders.ts`,
`email-service.ts`'s owner fallback, existence probes in `client-portal.ts`) has the same defect
with worse consequences. When sweeping, read `app/` and `lib/` too, not just `test/` and the
fixtures. Comment lines that merely _mention_ `.limit(1)` are not call sites — judge the query, not
the grep hit.


<!-- CLAUDE.md lines 885–907 -->

## Tech-debt numbering — **RULED [Josh, S136]**

**Never allocate a bare `#N` on a branch.** `TECH_DEBT.md` lives in the working tree, so every
branch appends to its own copy and two branches filing on the same day both "take" the same
number. There is no allocator, and there cannot be one while the file is versioned alongside code.

**On a branch, file with a provisional branch-scoped id: `#N-<branch-tag>`** — `#12-notif`,
`#3-m6m`. Numbered from 1 within the branch; the tag is short and names the branch, not the
session. **Convert to a real number when the branch lands**, taking the next free number from
**main's** `TECH_DEBT.md` at that moment, and update any cross-references in the same commit.

**Why not "just take the next number from main":** that was the previous rule, it was written into
`TECH_DEBT.md`'s own header as "main's file is the assignment authority", and it still failed.
`feat/notifications` and `feature/m6m-mobile` each independently allocated `#147`–`#149` for
**four different items**, colliding with main and with each other. Reserving from main only works
if a branch merges before the next one files, which is not how these branches run.

A provisional id is ugly on purpose: `#12-notif` in a commit message or a code comment reads as
"this is not final yet", which a bare `#149` does not. **The reconciliation table for the current
collision is in `TECH_DEBT.md`'s header** and is applied at merge, not now.

---

<!-- Added S112 follow-up; verbatim from feature/s112-followup-docs CLAUDE.md -->

### Never reformat a file the repo does not already format — **MANDATORY [Josh, S112 follow-up]**

**Run a formatter only on files that were already formatted before you touched them, and only on the
lines you changed. Never `prettier --write` a whole file that main does not keep formatted.** Check
first: `npx prettier --check <file>` on the file **as it is on main**. If that fails, the file is not
formatted, and your edit must match its existing style by hand.

**The rule is the lesson: an unreviewable diff is where authority errors hide.**

**What happened [S112 follow-up, `feature/s111-project-role`].** A session finishing the Project
Executive's money UI ran `prettier --write` over every file it edited. Most of them had never been
formatted on main. About **40 real lines of change** landed inside about **1,300 lines of reflow**:
`budget/page.tsx` 739 changed lines, `invoice-builder.tsx` 676, `payments-view.tsx` 355. No
reviewer could have found the forty.

**Then the cleanup made it worse.** The first attempt rebuilt the files by keeping only the diff
hunks that mentioned the change, and applied them with zero-context patches
(`git apply --unidiff-zero`). A zero-context patch has no surrounding text to anchor it, so it lands
wherever its line number points. In `lib/services/payments-shared.ts`, **`canRecordPayment`'s new
body landed inside `canIssueRefund`**:

```ts
export function canIssueRefund(role: string): boolean {
  return seesProjectMoney(role);   // ← meant for canRecordPayment
```

**That would have granted the Project Executive refund authority**: money going out to a client,
which the ruling withholds from the role. Meanwhile `canRecordPayment` quietly went back to
Owner/Admin. **It was a Financial Visibility Floor breach, and it survived into a second attempt.** It
compiled. It would have passed a skim, because it sat among hundreds of formatting lines. The unit
suite did not catch it either: no test asserted that a Project Executive may NOT issue a refund.

**The only reason it did not land:** every file was then checked against the intended change.
Both sides were formatted with Prettier and compared: the committed intent, and the rebuilt file.
Anything not byte-identical was a real difference. That check found the swap, plus a dropped test
expectation. Both were rebuilt against exact anchors and re-verified (26 of 26 files equal).

**In practice:**

- **Before formatting**, `prettier --check` the file as it is on main. If it fails, do not run
  `--write` on it.
- **Before committing**, read `git diff --stat`. **If a file's changed-line count is far larger than
  the edit you made, stop.** That number is the alarm: 676 changed lines for a two-line gate change.
- **Never apply zero-context patches (`--unidiff-zero`) to code.** To rebuild a file, start from the
  pre-edit version and re-apply each edit against an anchor that must match **exactly once**, and
  fail if it doesn't.
- **An authority change needs its negative asserted.** If a role gains "record a payment", a test
  must also say it does **not** gain "issue a refund". The swap above survived because only the
  positive was tested.
- **Already on main from the same session, left in place:** two wrapped i18n strings per language
  and one parenthesised `return` in `photos/page.tsx`. They came from the wave-1 conflict
  resolution, are semantically identical, and were CI-tested. They're recorded here so the next
  reader knows they were not a design choice.

<!-- Added S112 overnight 2, queue 3 -->

### Role-permission tests are TOTAL maps — **MANDATORY [Josh, S112 overnight 2, queue 3]**

**A test that decides a role's permission states the answer for EVERY role, as a
`Record<CompanyRole, T>`, driven through `forEveryRole()` (`apps/web/test-support/role-matrix.ts`).
Never a hand-written list of the roles someone thought of.**

**Why this is a rule.** `payments-shared.test.ts:141-143` asserted `canIssueRefund` for owner, admin
and project_manager, by hand. When `project_executive` was added (S111), that test kept passing while
saying **nothing** about the new role. In the same week a mis-applied patch put the Project
Executive's `canRecordPayment` body into `canIssueRefund` (refund authority), and **no test failed.**
See "Never reformat a file the repo does not already format" above for the full incident.

**How it works.** TypeScript requires every key of a `Record<CompanyRole, T>`, and test files are
type-checked in CI (`apps/web/tsconfig.json` includes `**/*.ts`; the "Lint & Type Check" job runs
`tsc --noEmit`). So **adding a role to `CompanyRole` fails to COMPILE until every permission test
states that role's answer.** Proven at S112: adding `'project_executive'` produced exactly 10
errors in the 6 converted files; reverting restored `tsc` exit 0.

**In practice:**

- **Assert the deny, not only the allow.** A role gaining "record a payment" must be stated as NOT
  gaining "issue a refund". The total map makes that unavoidable.
- **Add `JUNK_ROLES`**: `''`, `'OWNER'`, `'Owner'`, `'superadmin'`, `'owner '`. Every predicate must
  fail closed on strings that are not roles.
- **A test whose claim is "every dashboard role"** iterates `DASHBOARD_ROLES` rather than a hand copy
  of it. That is the constant being honest about its own scope, not a permission decision.
- **Scope at S112:** 7 of 124 unit test files matched a hand-enumeration shape; 6 were permission
  decisions and were converted (10 maps). The commands are in `docs/sessions/S112-overnight-2.md`.
