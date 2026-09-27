RESUME PROTOCOL — if you are a fresh session after a restart: read this file first, then
docs/sessions/S112-overnight-2.md for where the work got to, then state which queue item you are
resuming and why. Do not ask Josh for orientation; it is all here.

---

_Everything below is Josh's instruction for the night, recorded verbatim (three messages, in the
order given). Branch: `feature/s112-overnight-2-report`._

---

FIRST ACTION, before anything else: write this entire message verbatim to
docs/sessions/S112-overnight-2-PLAN.md, commit it, and push it. Add at the top:

  RESUME PROTOCOL — if you are a fresh session after a restart: read this file first, then
  docs/sessions/S112-overnight-2.md for where the work got to, then state which queue item you are
  resuming and why. Do not ask Josh for orientation; it is all here.

Then start the queue. If the Codespace dies at 3am, the next session picks up from these two files
without waking anybody.

---

Josh is asleep. Nobody will answer until morning.

=== STATE, verify against git rather than trusting this ===
- main is 80e15bad. Wave 1 is merged and deployed; production returns 200.
- The anon lockdown is ON PRODUCTION and verified: anon_can_execute 272 → 3.
- Production has ZERO change orders of any status. The money-in-text query was vacuous — a pass on
  zero rows. R5b ships title + description + date anyway, because there is no legacy text to leak and
  the editor hint precedes the first entry. That reasoning goes in the report, not the zeros.
- ⚠️ At 11:00Z the drift detector WILL fire, and it is RIGHT: production is at 310 functions and
  20261880000000; the baseline says 311 at 20261810000000, because the lockdown merge skipped
  regenerating it. Do NOT react by rebaselining from production — that was ruled and refused. Note it
  in the report and move on.

=== WHAT YOU MAY DO FREELY ===
Commit and push branches after every step. Apply migrations to rebuild-test. Run tests and builds.

=== WHAT YOU MAY NEVER DO TONIGHT ===
⛔ Merge anything to main. Wave 1's authorization is spent.
⛔ Touch production: no migrations, no backfills, no service-key queries, no conversions.
⛔ Act on a decision not already ruled in writing. Record it and move on.

=== WHEN BLOCKED ===
Do not stop the run. Write it under NEEDS A RULING with the options and your recommendation stated in
full, and MOVE TO THE NEXT ITEM. A night spent idling on item A while B through E were buildable is a
night wasted. The only thing that stops everything is a live security issue on production — that goes
in the first line of the report.

=== CI DISCIPLINE — four false reds in three days ===
One branch's CI at a time; check the Actions API before every push and wait. Never change shared
rebuild-test state — a test user's language, role or assignments — while a run is live. On a red run,
establish contention versus real failure BEFORE changing code, and say which.
Report main's post-merge run 36278907305 when it finishes.

=== THE CODESPACE RESTARTS WITHOUT WARNING — seven times in four days ===
Only pushed work survives. A rebuild also removes Claude Code: npm install -g @anthropic-ai/claude-code
On resume, read your own report first and state where you picked up.

=== QUEUE, in order ===
1. Write the 20261840000000 production steps for Josh. Write them; do not run them.
2. The two system fixes, own branch:
   a) Projects > Documents > Files must not list photos. ⚠️ Filter by CATEGORY, never by MIME — a
      scanned plan or a permit photographed on site must stay in Files. Give Josh a read-only
      production count of rows leaving the Files view. Say what your change does to daily-log and
      safety images; do not decide that yourself.
   b) Multi-file upload. Reuse your 36-control inventory; propose which get `multiple` and which stay
      single, with a reason each. ⚠️ Limit concurrency — this is the same shape as the per-photo
      signing that exhausted Storage twice. Partial failure must name which files failed and allow
      retrying just those. Per-file progress. Report timing for a 10-file batch.
3. Role-permission tests. payments-shared.test.ts:141-143 enumerates Owner, Admin and PM by hand, so
   adding a role leaves it passing while testing nothing about that role — which is how the refund
   near-miss survived. Drive these tests from a total Record<Role, boolean> map so adding a role fails
   to COMPILE until every permission states the new role's answer. State how many test files this
   shape applies to, with the full count and the command.
4. s112-m-loading: the loading.tsx drop was pushed without CI and is unverified. Run it.
5. s112-proposal-payload: RULED — a format named "Summary with Descriptions" SHOWS its line
   descriptions on the signing page; the client signs what they see. Fix the page first, then trim the
   payload to the corrected page, never to the current one.
6. CLAUDE.md restructure: audit table FIRST, before any edit — every section, its line count, and
   KEEP / COMPRESS / MOVE / DELETE. No rule deleted; anything you propose deleting is listed for Josh.
   936 lines to under 350. Add the two new MANDATORY rules: never reformat a file the repo does not
   format, and role-permission tests must be total maps.

=== THE REPORT — appended and pushed after EVERY step ===
docs/sessions/S112-overnight-2.md. Structure it so he can act in five minutes:
1. First line: "No production issue found", or the issue.
2. NEEDS A RULING — each question stated IN FULL, with options and your recommendation. A future
   session may read it with no memory of the question.
3. DONE AND PROVEN — with the measurement. Row counts, bytes, timings. "Tests pass" is not proof.
4. BUILT BUT UNTESTED, and why.
5. BLOCKED — what you skipped and what unblocks it.
6. OWED TO PRODUCTION — every migration with its read-only count query.
7. WHAT JOSH MUST CLICK.
8. BRANCHES — each one, CI state, ready to merge or not.

When the queue is done, STOP. Do not invent work.

---

ALSO: the 20261840000000 runbook is written and waits for Josh in the morning. Do NOT run it, and do
NOT merge feature/s112-wave2-integration — that needs his step 8 verification first. Report CI run
36282031683's result in the report either way.

⚠️ Tomorrow's 11:00Z drift alarm will now also show the new function. Same known cause, the stale
baseline. Still do not rebaseline from production.
