# S114 — session prompt: close every open item, starting with the role

Fresh context. Read this whole prompt, then `docs/specs/S114-SPEC-close-open-items.md`, before doing
anything.

**Three phases:** verify read-only → ask everything in one plain-text message and STOP → build.

This is a **program, not one build**. PART A only, this session, unless Josh says otherwise.

---

## ⚠️ HOW TO ASK — read before Phase 2

⚠️ **Never the interactive picker.** Josh is notified when a turn ends; the picker does not trigger that
notification, so he will not see it and the session sits idle. This is a standing rule in CLAUDE.md.

Plain text, in your final message, then **end the turn**. No timers, no loops.

```
Q1. [ASK-n] <the question, stated in full — Josh may be reading it with no memory of the spec>
    Options: A) ...  B) ...
    My recommendation: <which, why, one line>
```

⚠️ **State each question in full.** A ruling that reads "Q3: option A" is useless to a future session.

Ask **all** of PART A's questions in one message. Do not ask, build, and come back.

---

## The work

`docs/specs/S114-SPEC-close-open-items.md` — the scaffold. **Fill it in place. Do not restructure it and
do not write a new spec file.**

⚠️ **PART A only.** Finish the Project Executive: the operational arms. PARTs B–G are scoped and
sequenced in the spec and are **not** this session.

**R1 is the whole rule:** complete access to the projects it is assigned to, **two carve-outs**, nothing
at company level.
- ⚠️ **No refunds** (Q1). Neither issue nor approve.
- ⚠️ **No contract authority** (Q2). Not client contracts, contract documents or subcontracts.

⚠️ **R2: the role stays hidden until the end.** `WITHHELD_ROLES` comes off in FILL-A-6, the **last** step.
Shipping the arms with the role already grantable means an Owner can hand someone a half-working role.

---

## State — verify against git, do not trust this

- `main` carries S181: the Project Executive's money arms, the withheld-role guard, and migrations
  `20261820000000`, `20261830000000`, `20261910000000`, `20261920000000`, `20261930000000`.
  ⚠️ **Confirm each of those five is on PRODUCTION, by object, before building on it.** If any is not,
  STOP — the S181 production run may not have completed.
- Of **98** policies naming `project_manager` in a positive role list, **0** name `project_executive`
  (measured 2026-09-27). Treat that count as load-bearing and re-measure it.
- Four migrations remain owed to production from unmerged branches: `20261850000000`,
  `20261860000000`, `20261890000000`, `20261900000000`. They are PART E, not yours — but they are why a
  dry run may report remote-only versions.
- Josh and three real staff use production daily. There are 2 owners, 1 admin, 1 foreman and 3 crew on
  production; no project managers.
- The CLI is linked to **rebuild-test** (`nmyphyhmfttxkdoposvf`). ⚠️ **Never run `supabase link`.** That
  ref file is shared with Josh's terminal; read it, never write it.

---

## Phase 1 — verify, read-only

Fill every PART A FILL by measurement.

⚠️ **Confirm the instrument measured the thing.** This campaign has lost time to a wrapper's echo, a
`grep` truncated by `head`, a script that threw and printed a conclusion anyway, a cached read, a Turbo
cache hit reported as a build, and a catalog filter that did not match how a policy was named. One of
those shipped a production regression: a `head -10` search for a route's consumers missed the eleventh
hit and every site-visit photo went blank. **Never truncate a search whose completeness is the point.
State the command and the full count.**

⚠️ **This work's version of that trap is the hand-written role array.** Role lists appear literally in
policies, triggers, functions and TypeScript. The `Record<CompanyRole, T>` total maps fail to compile
until the role answers; the hand-written arrays do not, and that is where the refund near-miss lived.
FILL-A-3 exists for this. Treat its count as load-bearing.

⚠️ **Storage policies are their own measurement (FILL-A-2), and they carry a recorded trap: a storage
policy must never call `get_my_company_id()`.** Resolve the caller from `auth.uid()` inline, the way
`pe_can_attach_lien_release` does.

## Phase 2 — ask, then stop

⚠️ **ASK-A-1 is the only judgement call you should be making here.** "Complete access" answers most
tables on its own. Where it does not obviously settle read-versus-write, ask — do not pick.

Also ask explicitly: **may this branch be merged**, and confirm the order.

## Phase 3 — build

⚠️ **FILL-A-4 before FILL-A-6.** The two carve-outs get their live negatives, each with a sabotage that
goes red, **before** the role becomes grantable. Prove what it cannot do before letting anyone hold it.

⚠️ **Write off-project negatives without returning rows.** An off-project negative written with
`.insert().select()` measures the READ policy, not the write policy: with RETURNING, Postgres checks the
new row against the SELECT arm, which refuses it off-project, so the test goes green whether or not the
write arm exists. Count with the service role instead. ⚠️ Watch the unique keys — a widened arm's row
must land where the tally sees it rather than collide on a duplicate key. Use a fresh disposable project
holding none of the one-per-parent rows, as `PEW BARE` does.

⚠️ **UPDATE and DELETE arms cannot be isolated through the API.** Every PostgREST update carries a WHERE,
so the SELECT policy judges the existing row and the new row regardless. Those arms stay bounded by the
SELECT arm, whose sabotage does go red. State this limit rather than claiming coverage you do not have.

⚠️ **PARITY, per surface, stated.** `/m` and desktop. `/m`'s `readsChangeOrders()` omitted the PE while
desktop listed them; that is the defect shape this role keeps producing.

### Stop rules, which override "do not stop"

1. Anything that writes to **production**. ⚠️ **Applying a migration to production is Josh's action.**
   The S181d override was scoped to five named migrations in one session and does **not** carry here.
2. A decision not settled in the spec.
3. Destroying existing rows, or moving them between surfaces.
4. ⚠️ **Any change that weakens the Financial Visibility Floor.** A gate controlling only rendering still
   ships the data in the payload (`#136`). Authority belongs in the database.
5. ⚠️ **Anything that would grant refund or contract authority**, however it is reached. R1's carve-outs
   are not negotiable inside this session.
6. Merging a branch carrying a migration Josh has not yet applied to production.

---

## Standing constraints

Branch from `main`. Push after every commit. Commit path-scoped; never `git add -A`. ⚠️ **Never reformat
a file the repo does not already format** — a whole-file Prettier pass once buried ~40 real lines in
~1,300 lines of reflow and hid a refund-authority error that compiled and passed every test.

Migrations rebuild-test only, via `npx supabase db push`, never MCP `apply_migration`, and **never a
relink**. ⚠️ **Count on PRODUCTION first the rows any new constraint governs and give Josh the query** —
a constraint written against rebuild-test's rows has aborted on production twice. ⚠️ **Never run
`migration repair --status reverted`**; production's ledger is legitimately missing four versions that
live on unmerged branches.

`next build` must pass and the printed exit line must be read; type-check is not enough. **A test that
passes on zero rows is a failure — state row counts.** Every sabotage restored, and the policy text read
back identical.

⚠️ **One branch's CI at a time.** Check for an in-progress run before pushing and before any local e2e.
`[skip ci]` is read from the **HEAD commit only** — a docs push on top of skipped commits still starts a
run.

Append to `docs/sessions/S114-report.md` after every step, commit the append, push. ⚠️ **The Codespace
has restarted eight times in five days and killed a session mid-run. Only pushed work survives.** A
rebuild also removes Claude Code: `npm install -g @anthropic-ai/claude-code`.

⚠️ **"Done" means merged, or it says where it is.** A report line claiming work was built, when it
existed only on an unnamed branch, cost a full recovery pass on 2026-09-27.

⚠️ **A report is a claim.** The S181 report held on 22 of 24 items when re-measured, and the two that
failed were a citation of evidence that did not yet exist and a whole class of test that could not fail.
Both were found by re-running, not by re-reading.

Final report in plain text: what is built and proven, what is built and untested, what is blocked; every
migration owed to production with its row count and verification query; anything awaiting a ruling; and
**what a person still has to click** — which for PART A means signing in as the Project Executive on a
real phone and confirming it can now upload a jobsite photo, open a task and see the schedule on its own
project, and still sees nothing at company level.