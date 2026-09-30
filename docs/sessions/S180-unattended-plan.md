# S180 unattended plan

> **RESUME PROTOCOL — fresh session after a restart:** read this file, then your latest report
> (`docs/sessions/S180-report.md`), then state which item you are resuming and why. Do not wait for
> orientation; it is all here.
>
> The Codespace was recreated this morning after the previous one hung. Anything not pushed dies with
> it.

---

Josh is away. Unattended rules apply.

FIRST ACTION: write this message verbatim to docs/sessions/S180-unattended-plan.md, commit, push.
Add at the top:
  RESUME PROTOCOL — fresh session after a restart: read this file, then your latest report, then state
  which item you are resuming and why. Do not wait for orientation; it is all here.
The Codespace was recreated this morning after the previous one hung. Anything not pushed dies with it.

COMMIT AND PUSH AFTER EVERY STEP. Not at the end of an item — after each step within it.

WHAT YOU MAY DO: commit and push branches; merge branches that satisfy all three S180 conditions;
apply migrations to REBUILD-TEST; run tests and builds.

⛔ WHAT YOU MAY NOT DO: touch production in any way — no migrations, no backfills, no service-key
queries, no HEIC conversion run. Act on no decision that is not already ruled in writing.

WHEN BLOCKED: record it under NEEDS A RULING with the question stated IN FULL, and move to the next
item. Do not idle. The only thing that stops everything is a live production security issue, and that
goes in the first line of the report.

QUEUE:
1. Finish the CI wave: heic-conversion → files-and-upload → proposal-payload → role-permission-maps →
   the docs branches. One at a time. Merge each that meets all three conditions. Reconcile
   s112-claude-md-restructure with s180-merge-ruling before either lands — you flagged that conflict
   yourself.
2. ⚠️ A NEW MEASUREMENT, read-only, and nobody has asked it yet: the lockdown closed the LOGGED-OUT
   door. Re-run the same enumeration against `authenticated` — what can an ordinary signed-in user of
   ANY company execute? State the full count and the command, list every SECURITY DEFINER function
   reachable that way, and say which of them write. Report only; build nothing.
3. Finish the CDN revocation measurement, or drop it on the record. It has been killed twice and is
   the one question we keep spending effort on without an answer. 90 minutes, disposable tenant, its
   own identity, sweep afterwards. If you finish it, the number goes in the report; if you drop it,
   say why in one line so nobody picks it up a fourth time.
4. State N1, N2, N3 and N4 IN FULL — the questions you raised overnight — with options and your
   recommendation for each. Josh has never seen them stated, only their labels.

REPORT: docs/sessions/S180-report.md, appended and pushed after every step. First line is either "No
production issue found" or the issue. Then NEEDS A RULING, DONE AND PROVEN (with the measurement, not
"tests pass"), BUILT BUT UNTESTED, BLOCKED, OWED TO PRODUCTION, WHAT JOSH MUST CLICK, BRANCHES.

When the queue is done, STOP. Do not invent work.
