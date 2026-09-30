# S120 — SPEC

**Commit this to `docs/specs/S120-SPEC.md` as the first action of the session.**

Every item ruled by Josh 2026-09-29, in the order he set. `main` = `fad4787e` at writing.
⚠️ **Verify that against git. This spec is a claim like any other.**

⚠️ **Nothing here is deferred.** Josh: *"there are no items that have been brought up that should be
filed, everything belongs on this bullet point list."* Every item is built or fixed, or it stops with
a written reason.

---

# PART 0 — HOUSEKEEPING. FIRST. [Josh: *"there shouldn't be any stagnant trees"*]

⚠️ **Nothing else in this spec starts until Part 0 is done and its findings are in the report.**

## 0-A. Get onto `main` and prove it

Josh's tree was on `feature/s115-r10-budget-edit` at `69a7c39b`. ⚠️ **Two greps on 2026-09-29 read
that branch and were reported as facts about `main`.** That is the session's own instance of the
recurring failure class: *the thing inspected was not the thing being judged.*

- `git fetch --prune`, then state `origin/main`'s SHA and subject.
- State the SHA you are building from. ⚠️ **Every measurement in this session names the ref it was
  taken on.**

## 0-B. Enumerate every branch with its true merge status

- List **every** local and remote branch with: last commit date, last commit subject, and whether
  `git branch --merged origin/main` / `git branch -r --merged origin/main` contains it.
- ⚠️ **Do not delete anything on the strength of this spec.** Josh was told these three are safe:
  `feature/s118-material-signout`, `feature/s118-project-rename`, `feature/s118-slow-spots`.
  **That is a claim. Prove each one is fully merged into `origin/main` before deleting it**, and state
  the proof per branch.
- For every branch that is **NOT** merged: state what is on it that `main` does not have
  (`git log --oneline origin/main..<branch>`), and **do not delete it.** Report it.

## 0-C. `feature/s115-r10-budget-edit` carries an unlanded ruling — resolve it

Its HEAD `69a7c39b` is a `[skip ci]` docs commit:

> `[Docs] S118 item 16 updated to the 2026-09-29 rulings: employee reads OWN documents;
> non-dismissible Owner/Admin notice; /m required; employee-to-employee negative is load-bearing
> (ASK-16 answered)`

⚠️ **This is a RULING that may never have reached `main`, and item 16 was reported merged.** Determine,
by object:

1. Is that commit's content present on `origin/main`? (diff the file, do not compare SHAs.)
2. Does the **built** item-16 behaviour on production match those three rulings — employee reads
   **own** documents only, the Owner/Admin notice is **non-dismissible**, and the box exists on
   **`/m`**?
3. Is there an employee-to-employee negative test, and does it fail under sabotage?

⚠️ **If the built behaviour does not match the rulings, that is Part 6 work (Verify), not a Part 0
deletion.** Report it and carry it forward. **Do not delete this branch until its content is on
`main` or recorded in the report verbatim.**

## 0-D. Stale root-level report copies

`./S118-report.md` and `./S119-report.md` exist at the repo root on Josh's branch. The real ones are
`docs/sessions/S118-report.md` and `docs/sessions/S119-report.md` on `main`.

- Determine whether the root copies are **tracked on `origin/main`**. If they are not, they are branch
  or working-tree litter — say so and remove them on the branch they live on.
- ⚠️ **If they ARE tracked on `main`, diff them against the `docs/sessions/` copies before removing
  anything.** A divergent copy may hold a measurement the canonical one lost.

## 0-E. Repo hygiene read-out

State, as numbers: branch count before and after, how many were deleted, how many were kept and why,
and whether the working tree is clean.

---

# PART 1 — SECURITY

⚠️ **All six are ruled FIX, none filed** [Josh, 2026-09-29, after correcting an earlier mistyped
"file"]. Build them as one database-side pass where they share a migration boundary, but **one
migration per section** per the production runbook.

## 1-A. `#175` — cross-tenant PDF deletion. HIGHEST PRIORITY ON THIS SPEC.

⚠️ **THE TEXT OF THIS ENTRY WAS NEVER READ.** What follows is from the S119 ITEM A-3 list — a summary
of CC's S118 audit, **not the ledger entry**. Note that `#176` and `#177` below carry exact migration
paths and line numbers because their entries *were* read, and this one carries none. **That asymmetry
is the warning.**

⚠️ **PHASE 1: read the real `#175` entry** from `origin/main:TECH_DEBT.md` and **quote it verbatim into
the report before building anything.** If the real entry says something different — a different file, a
different mechanism, or a narrower blast radius — **the entry wins over this spec**, and say so
explicitly. This is the highest-priority item on the list and it must not be built from a paraphrase.

As summarised: PDF regeneration deletes whatever `pdf_file_id` points at, using the service role, and
the record's author may set `pdf_file_id` — it is not covered by the column-scope triggers. **A user in
one company can destroy another company's file.**

- ⚠️ **Prove it is real before closing it**, on rebuild-test: as company A, point a record's
  `pdf_file_id` at a `files` row owned by company B, trigger regeneration, and show B's object is
  gone. **State the object's existence before and after.**
- Fix: the regeneration path must verify the target file's `company_id` matches the record's before
  deleting anything, **and** `pdf_file_id` must be frozen to the service role by column-scope trigger
  so an author cannot set it at all. ⚠️ **Do both** — the check alone leaves the write surface open.
- Negative test **written without returning rows**, with its own sabotage, restored and read back.
- ⚠️ **State the row counts.** A test that passes on zero rows is a failure.

## 1-B. `#176` — `email_has_account` is an account-existence oracle

`supabase/migrations/20260916000000_email_has_account.sql:35` — SECURITY DEFINER, EXECUTE granted to
`authenticated`. Anyone becomes an Owner by signing up, so any account can ask "does this address
exist" for any address, unlimited.

⚠️ **The fix shape is a decision and Josh has not ruled it. This is a PHASE 2 QUESTION.**
Two options:
- **A rate limit** — keeps the platform-wide answer the invite flow depends on.
- **Same-company scope** — stronger, but ⚠️ **the invite flow needs a platform-wide answer** to decide
  invite-new vs link-existing. Scoping it may break invites.

⚠️ **Unattended default if Josh does not answer: the RATE LIMIT.** It is the narrower change — it does
not alter what the function answers, only how often. **Prove signup and invite-accept still work end
to end either way.** Record the choice and the alternative.

## 1-C. `#177` — `record_client_payment` does not check the contact's company

`supabase/migrations/20261830000000_s111_project_executive_floor_reads.sql:159` — the live body
inserts `p_contact_id` at :204 and compares it **only per application** at :238. With
`p_applications = []` an Owner/Admin records an unapplied payment against **another company's
contact.** Same family as `#175`.

- Prove it on rebuild-test with an empty applications array before fixing. State the row.
- Fix: check `p_contact_id`'s `company_id` against the caller's, unconditionally — **before** the
  applications loop, so the empty-array path is covered.
- Negative without returning rows, own sabotage.

## 1-D. `#178` — `create_safety_incident` trusts member ids in its JSON

⚠️ **THE TEXT OF THIS ENTRY WAS NEVER READ.** It is inferred from the S119 ITEM A-3 list.
**PHASE 1: read the real entry** from `origin/main:TECH_DEBT.md` and quote it into the report before
building anything. If the real entry says something different, **the entry wins over this spec.**

## 1-E. `#179` — payment functions confirm another tenant exists

⚠️ **Same caveat as 1-D — text never read. Quote the real entry first.** As inferred: two payment
functions reply *"belongs to another company"* rather than *"not found"*, which confirms a foreign
row exists. Fix: one indistinguishable message for both cases.

⚠️ **Check every error string in those two functions, not only the one named.** A second message that
still discriminates makes the fix cosmetic.

## 1-F. `#180` — trial deletion reports success while orphaning an auth login

`apps/web/lib/trial/deletion.ts` `runTrialDeletion` re-reads user ids from `profiles` on every run.
Once `deleteRows` has removed `profiles`, a retry reads `[]`, so an auth user whose `deleteUser`
failed is never retried and the job completes with `auth_done = true`.

⚠️ **The security half is ALREADY CLOSED** — since S119, `banAuthUsers` bans every login before any row
is deleted, so the orphan cannot sign in. What remains is a junk auth row and a status field that
lies.

- Fix shape: persist the user ids on `deletion_jobs` (a **nullable** column) at the first run, and read
  the persisted list on retry.
- ⚠️ **This needs a migration on a live table.** Nullable column, no constraint over existing rows.
  If you find yourself adding a NOT NULL or a constraint that must hold for existing rows, **stop**
  (stop rule 2).
- ⚠️ **Do not weaken `banAuthUsers`.** It is the security property now. Prove it still runs first.
- `auth_done` must be false when any delete failed. Test both arms.

---

# PART 2 — DEFECTS HITTING JOSH AND THE CREW NOW

⚠️ **These are live on production and blocking real people today.**

## 2-A. Mobile timeclock clock-out does nothing when tapped

**Josh hit this himself 2026-09-29 and had to be unblocked by hand in the SQL editor.**

Root cause as diagnosed: the mobile clock-out path **never collects `completion`**, and the production
check constraint requires it once a segment has a `task_id`:

```sql
-- time_segments_completion_gate_check (production)
CHECK ((((task_id IS NULL) AND (completion IS NULL))
     OR ((task_id IS NOT NULL) AND ((segment_end IS NULL) OR (completion IS NOT NULL)))))
```

So **anyone clocked in against a task cannot clock out on mobile.** Desktop works, because the desktop
modal collects it.

- ⚠️ **Reproduce it first**, on rebuild-test, on a mobile viewport, against a segment with a
  `task_id`. **State the error the user actually gets.** Josh reported *"nothing happens when i tap
  it"* — if the failure is silent, the missing error surface is part of the defect.
- Fix: the mobile clock-out must collect `completion` the way desktop does. ⚠️ **Do not work around it
  by sending a default completion value** — that writes a false statement about whether work finished.
  Ask the user, on mobile, in a control that meets the 44px floor.
- ⚠️ **`clock-modal.tsx:309` is `width: '460px'` with no `maxWidth`** (measured S97) — wider than every
  phone viewport. If you reuse that modal, this is part of the fix.
- e2e on a mobile viewport, proving a task-bound segment can clock out. ⚠️ **A test that passes on a
  page that never rendered is not a pass** — assert on the rendered control, not the absence of an
  error.

## 2-B. The "Tap to choose a project" banner is dead

No action on tap. Find it, state the file and line, and state **why** it is dead before fixing it —
a missing handler and a handler that throws are different defects with different fixes.

## 2-C. Held photos have no list anywhere in the app

⚠️ **30 of Josh's photos are queued with no screen that shows what is held.** He has them in his
camera roll but cannot tell which of ~300 they are. The offline queue (`lib/offline/queue`) holds
entries; `/m/offline` renders a "Waiting to sync" card for them.

- Determine whether the 30 are **actually in the queue** or were lost. ⚠️ **State which.** If they are
  not in the queue, a list will not bring them back and Josh needs to be told that plainly.
- Build a reachable list of held photos — thumbnail, when captured, which project, and why it is
  held. Reachable from the mobile app without typing a URL.
- ⚠️ **`accept="image/*"` with no `capture` attribute** in the field forms (measured S97) means photo
  capture opens the file chooser rather than the camera. Josh reported *"orange camera button goes
  straight to camera"* — so at least one path differs. **State which paths set `capture` and which
  do not** before changing any of them.
- A retry control that actually retries, and a clear statement when an entry can never succeed
  (the CONFLICTED treatment already exists — do not offer a retry that will always fail).

---

# PART 3 — SPEED. Josh's target is **"near instant."**

⚠️ **Why the S118/S119 speed work was not felt:** it removed work *inside* the page render — 28
Supabase clients collapsed to 1, rollup queries parallelised. The fixed toll *before* the render was
never touched, so every page kept the same floor.

Confirmed in `apps/web/middleware.ts`: it calls `supabase.auth.getUser()` **unconditionally**, and its
matcher covers `/dashboard/*`, `/m/*`, `/portal/*`, `/onboarding*`, `/sign-in`, `/sign-up`, `/locked`,
`/trial-limit` **and `/api/:path*`**, with `is_my_company_locked()` as a second round trip on the API
paths. The file's own comment calls the `/api` addition *"a real cost and a deliberate trade."*

⚠️ **Measure the same way before and after and state both numbers.** `scratchpad/nav-measure.mjs` and
the server-side fetch log were used for H-2 and H-5. ⚠️ **CONFIRM THAT FILE STILL EXISTS BEFORE RELYING
ON IT** — `scratchpad/` may be gitignored and may not have survived a repo restart. If it is gone, say
so and write a replacement measurement script, then **state the method** so the before and after are
comparable. **Do not report a speed number without saying how it was measured.**

## 3-A. Replace the middleware's `getUser()` with local JWT verification — THE BIG ONE

`getUser()` is an **HTTP call to Supabase's auth server on every request**, not a database query.
Typically 80–250ms.

⚠️ **THE FOLLOWING IS THE SPEC AUTHOR'S UNDERSTANDING, NOT A MEASURED FACT. VERIFY IT BEFORE BUILDING
ON IT:** that `getClaims()` verifies the token **in-process** against a cached JWKS when the project
uses asymmetric signing keys, and **falls back to a network call** when it does not — which is what
would make this change safe to ship before the keys are switched.

- ⚠️ **VERIFY, FIRST, AND STATE EACH ANSWER IN THE REPORT:**
  1. Does `getClaims()` exist in the installed `@supabase/ssr` / `@supabase/supabase-js` version?
     **State the installed versions.**
  2. Does it verify locally under asymmetric keys, and what does it do under the project's **current**
     (symmetric) keys? **Read the library source or its docs — do not take this spec's word.**
  3. ⚠️ **If it does NOT fall back safely under symmetric keys, STOP this item.** Shipping a local
     verification that cannot verify the project's actual tokens would break every gate in the app.
     Write it up and move on — it becomes Josh's first action tomorrow alongside the key switch.
- ⚠️ **If the verified behaviour differs from the paragraph above, the library wins.** Say so, and
  re-plan the item in the report rather than forcing this shape.
- ⚠️ **Then: determine whether switching the project to asymmetric JWT signing keys is reachable from
  your own tooling** (Supabase MCP, CLI, Management API) or whether it is a dashboard-only action.
  **State the answer plainly in the report** — Josh has it as tomorrow's first agenda item and needs
  to know whether it is his click or yours. ⚠️ **Do not flip it yourself even if you can.** Report
  and stop at that.
- ⚠️ **NEVER substitute `getSession()`.** It does not verify the signature. Using it here would make
  every gate in the app trust an unverified token. **This is stop rule 8.**
- ⚠️ **THE SESSION REFRESH IS LOAD-BEARING AND THE FILE SAYS SO.** Middleware is the **only** place a
  refreshed token gets persisted, because `lib/supabase-server.ts` swallows its cookie writes. If
  `getClaims()` does not drive the same `setAll` path, tokens go stale and **every user gets logged
  out** — the `/m` ping-pong bug of S107, but for everyone.
  **Prove all four, and state each result:**
  1. A valid session still navigates.
  2. A **stale** access token is still refreshed and the refreshed cookie is still written. ⚠️ **This
     is the one that breaks silently and the one to sabotage.**
  3. A **tampered** token is rejected.
  4. An **expired** token is rejected.
- ⚠️ **Sabotage the refresh test specifically** — break the `setAll` wiring and prove the test goes red.
  A refresh test that passes with the persistence removed is worthless, and this is exactly the shape
  that has slipped through before.

## 3-B. Get `is_my_company_locked()` out of the request path

A Postgres round trip on **every** API request.

- Move it to a short-lived cookie or a JWT claim.
- ⚠️ **It fails OPEN by design** (*"a fault here cannot lock the product"*). **Keep that property** —
  prove a failure of the new path does not lock a healthy tenant.
- ⚠️ **Prove a locked tenant still gets locked** within the TTL window, and state the TTL.
- ⚠️ **The payment routes must stay exempt.** `lib/trial/lock-guard.ts` exempts by path so they survive
  a lock. Prove they still do — locking a tenant out of paying is the one failure that cannot be
  recovered from inside the product.

## 3-C. Vercel region vs Supabase region — MEASURE AND REPORT, CHANGE NOTHING

If the function region and the database region differ, every round trip above pays cross-country
latency twice.

- State both regions and the source you read them from.
- ⚠️ **Do not change either.** Moving Vercel's region is a redeploy decision; moving Supabase's is a
  whole-project migration. **Report the finding and the cost of each option. Josh decides.**

## 3-D. `force-dynamic` audit — REPORT ONLY. DO NOT REMOVE ANY.

⚠️ **RULED REPORT-ONLY, and this is a security ruling, not a scope cut.** Removing `force-dynamic`
from a route that renders tenant data lets Next cache one company's page and serve it to another.
**That is a cross-tenant leak and it is not a thing to do unattended.**

- List every route carrying it, with a one-line judgement: does it read tenant data, or not?
- ⚠️ **Change none of them.** Produce the list; Josh rules next session.

## 3-E. `staleTimes.dynamic: 0` — determine and revert if present

⚠️ **UNVERIFIED — `next.config.js` could not be read when this spec was written.**
`feature/s112-staletimes-hold` set `staleTimes.dynamic: 0`, which made revisits **slower**: 52ms →
369ms unthrottled, 51ms → **2,129ms on slow 3G.**

- Read `apps/web/next.config.js` on `main` and **quote the `experimental` block verbatim.**
- If `staleTimes.dynamic: 0` is present, **revert it** and measure a back-navigation before and after,
  unthrottled and on slow 3G, and state all four numbers.
- If it is absent, say so plainly. ⚠️ **Do not "fix" a setting that was never set** — and do not add
  a `staleTimes` block that was not there before.

---

# PART 4 — FEATURES

## 4-A. Multiple send-to contacts on an estimate

- A join table — `estimate_recipients` or equivalent — one estimate to many contacts, **with its own
  RLS.** State the table you built and why.
- ⚠️ **Who may add a recipient?** Send is Owner/Admin (S119 ruling, unchanged). Adding a recipient is
  part of sending. **Unattended default: Owner/Admin only** — the narrower option. Record it.
- ⚠️ **Recipients must be contacts of the caller's own company.** This is the `#177` shape in a new
  place. Negative test without returning rows: a contact from another company cannot be added.
- Sending mails every recipient. ⚠️ **One record of the send listing every address it went to** — a
  sent document must be able to say who received it.

## 4-B. "Also send to" — a free-text email field on the estimate details page

[Josh: *"a field on the details page, 'also send to', where i can simply type an additional email
address to be sent to"*]

- A column on `estimates`, **persisted on the record** so the next send remembers it. ("A field on the
  details page" is a stored field, not a one-time send dialog.)
- Validate it is a well-formed address. ⚠️ **Reject rather than silently drop** — an address that
  looks saved but never receives anything is worse than an error.
- ⚠️ **PHASE 2 QUESTION: one address, or several?** **Unattended default: ONE** — the narrower reading
  of *"an additional email address"*, singular. Record the choice and the alternative.
- ⚠️ **This address is NOT a contact and gets no portal access.** It receives the email and nothing
  else. Prove it grants no read path — this is a new external recipient on a surface that sends
  documents, which is the bid-token failure class. **Negative test that a typed address cannot reach
  the portal.**
- It appears on the send record with the contact recipients.

---

# PART 5 — DESIGN

## 5-A. Both signature name fields to 16px

[Josh, 2026-09-29: *"make both signatures 16px"*]

The shared-component move raised the client portal's signature name fields 14px → 16px as a side
effect of the iOS focus-zoom guard. **Ruled: both are 16px deliberately.**

- ⚠️ **16px is the floor that stops iOS zooming the page on focus.** Do not drop either below it.
- State every signature field you changed, by file, and confirm the portal and the internal surface
  now match.

---

# PART 6 — VERIFY BEFORE CALLING ANYTHING DONE

## 6-A. Two open time segments on production — THE ONLY ITEM WITH A LIVE COST

⚠️ **Two `time_segments` rows with `segment_end IS NULL`, started 10:50 and 12:29, owner unknown.**
If those are crew, **hours are accruing right now.**

- On **production**: list every open segment with its member, project, task, start time and elapsed
  duration. ⚠️ **Read only. Do NOT close any of them.**
- ⚠️ **Closing a crew member's segment invents a stop time and that is payroll.** Report them for
  Josh to rule on. This is stop rule 3 territory.
- ⚠️ **If 2-A's fix means someone was stuck rather than still working, say so** — that is the likely
  explanation and it changes what Josh does about the hours.

## 6-B. S118 item 16 — employee documents, against today's rulings

Carried from Part 0-C. Verify the **built** behaviour on production against the three rulings:
employee reads **own** documents only; the Owner/Admin notice is **non-dismissible**; the box exists
on **`/m`**. Plus an employee-to-employee negative that fails under sabotage.

⚠️ **If it does not match, fix it.** Josh: everything 100% complete. An item reported merged that does
not match its ruling is not complete.

---

# PART 7 — ALREADY SETTLED. NO WORK OWED. DO NOT BUILD.

## 7-A. PE visibility stands exactly as shipped

[Josh, 2026-09-29]: *"the PE can see everything on a project they are assigned to, including the
estimate. they can also see estimates they are assigned to."*

Both paths are live: `estimates_select_project_executive` (project-assigned) and the S119 per-estimate
assignment table.

⚠️ **A narrowing was recommended and REJECTED. Do not build it. Do not narrow either arm.** If any
change in this session touches either path, that is a regression.

## 7-B. Project rename stays Owner/Admin only

Shipped S119 §C. ⚠️ **Unchanged. And PM is not touched** — D-1 stands: *"Leave PM as it was before all
of this started."*

---

# STANDING CONSTRAINTS

## Production

⚠️ **Merge to production is AUTHORISED for this list** [Josh, 2026-09-29].
Per migration: **one migration per section**, a dry run that must list **exactly one file**, push,
then **verification by object with every expected value stated.** ⚠️ A value that does not match is a
**stop**. ⚠️ **End every turn with the CLI on rebuild-test** (`nmyphyhmfttxkdoposvf`), read back —
**including a turn that stops.** ⚠️ **Never `migration repair --status reverted`.**
⚠️ **This spec does not amend CLAUDE.md.**

## CI — stack two at a time

Cut the second branch **from the first**, `[skip ci]` on the first, one run on the stacked head.
⚠️ **You cannot cancel a run** (403). ⚠️ **Never stack migration-carrying work with work that carries
none.** ⚠️ **Two deep, no more.** ⚠️ **Run `scratchpad/lint-job.sh` before every CI request** — it caught
two unit failures S118 item 12 would have shipped red. ⚠️ **If that file does not exist** (`scratchpad/`
may be gitignored and may not have survived a restart), **say so and run the lint and unit jobs
directly**, matching what `.github/workflows` actually runs. **Never skip the pre-CI check because the
helper is missing.**

## Evidence

- ⚠️ **Verify by object. A prior report is a claim.** S118's report said `selection_option_images` was
  fixed; production still held md5 `ea83f07bc5cab6c42fc200676f97bc95` and a linked **client** could
  sign **another tenant's storage object.** That was found only because the prompt said to check.
- ⚠️ **Write off-project negatives WITHOUT returning rows.** An `.insert().select()` negative makes
  Postgres check the new row against the SELECT policy, which refuses it off-project — so the test
  passes whether or not the write arm exists. Count with the service role. Watch unique keys.
- ⚠️ **A test that passes on zero rows is a failure. State row counts.**
- ⚠️ **Every sabotage restored and read back identical.** If a sabotage's anchor has been reflowed so
  the edit never applied, the green is meaningless — **read back what you actually wrote.**
- ⚠️ **Name the ref every measurement was taken on.** Two greps this session read a feature branch and
  were reported as facts about `main`.
- No test deleted; every superseded assertion quoted in place.
- ⚠️ **Never reformat a file the repo does not already format.**
- `next build` must pass and the printed exit line read.

## Commits — ⚠️ THE REPO RESTARTS AND HAS LOST WORK

[Josh: *"CC must build a detailed report and commit often to prevent any loss if the repo restarts"*]

- ⚠️ **Commit and push after EVERY proof, every sabotage, every production section, every stop.** Not
  at the end of a part. **A commit that is not pushed does not exist.**
- Commit path-scoped. ⚠️ **Never `git add -A`.**
- ⚠️ **A repo restart mid-part must lose at most one proof.** If you are holding more than one
  unpushed result, you are holding too much.

## Stop rules

1. Any production verification value that does not match its expectation.
2. A migration adding a **constraint over existing production rows** — count on production first,
   then stop.
3. Anything touching refund, contract or **payroll** authority — including closing an open time
   segment.
4. ⚠️ Anything weakening the Financial Visibility Floor (`#136`).
5. A dry run listing anything but the single file its section names.
6. CI red twice on the same cause.
7. ⚠️ **Any signup or invite-accept path that stops working** (Part 1-B is on the path both use).
8. ⚠️ **`getSession()` substituted for `getClaims()`/`getUser()` anywhere in the auth path**, or a
   session-refresh test that cannot be made to fail by removing the persistence.
9. ⚠️ **Any change that narrows either PE read path** (Part 7-A).

**On any stop:** relink to rebuild-test, prove it, write the state into the report, commit, push,
move on to the next item. ⚠️ **Stop the ITEM, not the session.**

## A part ships whole or not at all

⚠️ **Merge a part only when it is complete with its proofs run.** A part unfinished when you run out
of road **stops, unmerged, with a written state.** ⚠️ **Do not merge a partial feature because the
list says finish everything.** Josh's crew use production.

⚠️ **"Done" means merged and on production, or it says exactly where it stopped.**