# S107 — SPEC (skeleton) — burst photo capture + estimate sub-upload end to end

**Status: INCOMPLETE. This is a scaffold, not a spec.**

**RULED** = settled by Josh. Do not re-litigate.
**FILL-n** = a hole CC measures and fills in place.
**ASK-n** = goes to Josh in Phase 2 and becomes a ruling.

⚠️ **Do not build from this file until the audit at the end passes.**

---

## How to use this file

1. **Fill every FILL by measurement** — read the file, run the query, go to the
   wire. Not from memory, not from a context file.
2. **Put every ASK to Josh in one message.** Record his answer here as RULED,
   with the alternative it beat.
3. **Then audit** — the checklist at the bottom.
4. Commit and **push** the completed spec before any build.

⚠️ **A FILL you cannot fill must say why, in one line. Do not delete the
marker.**

⚠️ **If a measurement contradicts a RULED line, STOP and report.** Do not
reconcile it yourself.

**FILL-0** — Report `main`'s tip, the current branch, and whether the tree is
clean. ⚠️ **Confirm S105b and S106 are merged to `main` and deployed** — this
build sits on top of both.

---

## ⚠️ What makes this session different

**Part A cannot be verified by CC.** Burst capture is camera behaviour on a
phone; a Codespace cannot test it. **RULED [Josh]: CC builds it, Josh tests it
in the field.**

Two consequences, both ruled:

1. ⚠️ **It merges and deploys BEFORE it is verified.** Josh is the only user of
   the mobile/field side today, so the blast radius is his own retaken photos.
   That is what makes shipping-unverified acceptable here, and it stops being
   true the moment a crew is on it.
2. ⚠️ **With no test behind it, VISIBILITY is the safety net.** A failure the
   user cannot see is a photo that silently does not exist. Every failure path
   must surface on the phone, not in a log line.

**Part B is the opposite: it must work end to end before it is done.** ⚠️ **RULED
[Josh]: a real bid request to a real subcontractor, who uploads a real file, and
it lands.** Route-exists-and-page-renders is not done.

---

# PART A — burst photo capture

## What already shipped (S105b, on `feature/s105b`)

- ⚠️ **The clock→job wiring EXISTS.** `projectInContext()` gained the open clock
  segment as a **third** project source, precedence **URL path > `?project=` >
  clock > null**, with 7 unit tests. **Do not rebuild it — verify it.**
- The weak-signal auto-queue fix.
- ⚠️ **The multi-shot UI was DEFERRED** as device-dependent. **That is this
  part.**

## RULED

- **Take several photos back to back.** ⚠️ **10–15 in a run is not uncommon** —
  design for that, not for three.
- **Auto-save to the clocked-in job.**
- ⚠️ **ALL photos in a burst land in the SAME project. One project per BATCH, not
  per photo.** The project is resolved once for the batch — a user who clocks
  into a different job mid-batch does not split the photos.
- ⚠️ **ASK-A.1 is RULED [Josh]: approved.** Multi-shot replaces the single-slot
  `PendingShot`. **State what is lost from the prior ruling and record it** — the
  single slot was deliberate and tied to §7a.
- **If not clocked in, the job picker appears ONCE, when the batch is DONE.**
- **If the user dismisses that picker, the shots stay HELD** with a visible
  "needs a project" state. Nothing inserts until a job is chosen. ⚠️ **Nothing
  lost, nothing illegal sent** — a field INSERT without a `project_id` is refused
  by RLS (§7a).
- **A failed photo SURFACES and the batch PROCEEDS.** ⚠️ **Per-photo status.
  Photos 1–3 and 5–7 continue; photo 4 is held with a retry.** It does not block
  the batch and it does not drop silently.

## ⚠️ The things that make this hard, all measured previously

- ⚠️ **The offline queue EXISTS and capture already uses it** — the handoff claim
  that there is none was false. **The real gap is narrower and worse: it fires on
  `!navigator.onLine`, so a jobsite with one bar reads as ONLINE and fails, on an
  unhandled rejection path.** ⚠️ **That is the single most likely field failure
  and it is exactly the case Josh will hit.**
- ⚠️ **`capture` IS set at five sites**, including the burst entry point — the
  handoff claim that none set it was also false.
- **The single-slot `PendingShot` is deliberate**, tied to the §7a invariant.
  ⚠️ **Multi-shot replaces it. That is a ruling change to a ruled subsystem** —
  see ASK-A.1.

## What CC measures

**FILL-A.1** — ⚠️ **Read `docs/sessions/debt-split-ux-log.md` §2.5** and the
S105b report's item 7 section. Summarise what is already decided. **If either
contradicts a RULED line above, that is a STOP.**

**FILL-A.2** — `PendingShot` as it stands after S105b: the type, where it lives,
and exactly what changes to hold N shots instead of one.

**FILL-A.3** — ⚠️ **The `!navigator.onLine` path, precisely.** What throws, where
the rejection goes unhandled, and what the user sees today. **State the fix and
how a weak-signal failure becomes visible rather than silent.**

**FILL-A.4** — ⚠️ **Verify the clock→job routing works.** Do not rebuild it. Say
how you verified — a test passing on zero rows is not verification; state the row
count.

**FILL-A.5** — What the capture flow does at 15 shots: memory held client-side,
upload concurrency, and whether the UI stays responsive. ⚠️ **A 15-shot batch of
phone photos is roughly 10 MB per shot before compression.** State the ceiling
and what happens past it.

**FILL-A.6** — Where held shots live, and ⚠️ **whether they survive the app being
backgrounded or closed.** A jobsite user closes the app. If held shots are in
memory only, a dismissed picker plus a backgrounded app loses them — which
contradicts the "nothing lost" ruling. **Report this even if the answer is
uncomfortable.**

**FILL-A.7** — The five `capture` sites, and which one the burst flow uses.

**FILL-A.8** — ⚠️ **What Josh will see in the field for each failure mode:** one
photo fails, all fail, signal drops mid-batch, app backgrounded mid-batch,
storage full. **A table.** This is the deliverable that replaces test coverage.

## ASK

**ASK-A.1 is RULED above** — approved, one project per batch. Not an open
question. **You still owe the record of what the prior ruling lost.**

**ASK-A.2** — On FILL-A.6: if held shots do **not** survive backgrounding, does
the build add persistence, or does the picker become non-dismissible while shots
are pending?

**ASK-A.3** — On FILL-A.5: the ceiling on a single batch, if one is needed.

---

# PART B — the sub-upload path, end to end

## What already shipped (S106 Part C, on `feature/s106`)

- `/api/estimates/[id]/files` — GET lists, POST uploads. ⚠️ **Session read before
  the service-role client in both handlers; 404 not 403 so there is no existence
  oracle.** Edit rights on POST (owner/admin any draft, PM own draft). 25 MB,
  PDF/JPEG/PNG/HEIC enforced in the route. Orphan blob cleaned on insert failure.
- The estimate Files tab.
- The anonymous sub-upload route and signed URLs.
- `s106-estimate-files-route-floor.live.ts` — a real live test with non-vacuous
  guards (29 estimates, 4 contracts).
- On production: `files.estimate_id`, the three-arm CHECK VALID, and the
  conversion re-point.

## RULED

- ⚠️ **Done means a real bid request goes to a real subcontractor, the sub
  uploads a real file through the link, and it lands on the estimate's files.**
  Route-exists-and-page-renders is not done.
- **The sub receives an EMAIL SUMMARY plus a LINK.** Not the detail in the email.
- ⚠️ **The sub sees NO money** — scope, files, and their own bid form. Never
  totals, never margin. **The page is anonymous; anything it renders is public to
  whoever holds the link.**
- **Token lifetime = the bid request's own expiry. A re-send REUSES the token**,
  so a link in flight never dies mid-upload.
- **Sub uploads are visible to the authoring PM**, who needs them to evaluate the
  bid.
- **Uploads carry to project files on conversion** — shipped as
  `20261550000000`, on production.

## ⚠️ PREREQUISITE — email is currently DISABLED

**RULED [Josh, ASK-B.1]:** re-enabling email is a **prerequisite for Part B, not
a side task.**

**FILL-B.0** — ⚠️ **What disabled email, where, and what re-enabling touches.**
Report this in Phase 2, **before any real send.** This repo has a history with
email delivery — a diagnosis log, a DMARC entry, and a `CRON_SECRET` that turned
out to hold a Resend key. FILL-B.7 still applies on top of this.

**RULED [Josh, ASK-B.1]:** there is no existing subcontractor to test with.
**Create a new one on REBUILD-TEST with email `JSBishop14@gmail.com`.** Any
rebuild-test estimate is fine.

**RULED [Josh, ASK-B.2]: build the route-floor test NOW.** Do not leave it filed.
The estimate-files route is the sole access control, service role bypasses RLS
entirely, and **nothing currently fails if a future edit moves the admin client
above the session read.** Write the test that would fail. See FILL-B.6.

## What CC measures

**FILL-B.1** — ⚠️ **What actually remains.** S106 reported Part C complete. **For
each piece — the email, the token, the anonymous page, the upload, the PM's view
of it — state: shipped and tested, shipped and untested, or not built.** Be
exact; this spec's scope is whatever is not "shipped and tested."

**FILL-B.2** — ⚠️ **Trace the whole path and name every step**, from "PM clicks
send" to "file appears on the estimate." Every route, function, table and email
template. **Where it breaks today, if it does.**

**FILL-B.3** — The email itself: what template, what it says, and ⚠️ **whether it
renders any money.**

**FILL-B.4** — ⚠️ **The anonymous page's payload, not its rendering.** `#136`'s
class: a gate controlling only rendering still ships the data. **Check the actual
network response for totals, margin, cost, or other subs' bids.**

**FILL-B.5** — Token→estimate resolution: how the token scopes to exactly one
bid request, expiry, reuse, and ⚠️ **what a leaked or guessed token reaches.**

**FILL-B.6** — ⚠️ **The route floor gap: nothing fails if a future edit moves the
admin client above the session read.** ⚠️ **RULED [Josh]: BUILD the test that
would fail.** Describe it here, then build it. The estimate-files route is the
sole access control and service role bypasses RLS entirely.

**FILL-B.7** — ⚠️ **What Resend actually sends.** Email delivery has its own
history in this repo. State the sending domain, whether the sub's address is
verified-domain-restricted, and **whether an email to an arbitrary external
address will actually arrive.**

## ASK

**ASK-B.1 and ASK-B.2 are RULED above.** Recorded in the prerequisite section.

**ASK-B.3** — On FILL-B.0: if re-enabling email requires a change Josh should
know about — a domain record, a key rotation, a config flag with a reason behind
it — surface it before flipping it. ⚠️ **Something disabled it deliberately;
find out what before undoing it.**

---

# Cross-cutting

**FILL-X.1** — Every migration this spec requires, with purpose. ⚠️ **If none,
say none.** Josh needs to know before the build whether another attended
production push is coming.

**FILL-X.2** — ⚠️ **Part A ships to production unverified, by ruling.** State
plainly what is untested and what the field test needs to cover. **Green means no
regression, not a working feature.**

## ⚠️ Any figure this spec names is an APPROXIMATION — correct it

**A lesson from S106, one session old.** The award prompt spec said the projected
total was _"the bid at the line's default subcontractor markup."_ That is true
only on fixed-price. On cost-plus and T&M an **instrument rate in force overrides
the estimate default** — a $10k bid on a 10% cost-plus lands at $11,000, not the
$12,000 the default implies. CC caught it. **Implemented as written, the prompt
would have shown a figure wrong by the whole difference on every non-fixed job,
at the moment of a money decision.** A dormant line-level discount that wakes on
award was a second thing the spec never mentioned.

⚠️ **So: where this spec names a figure, a formula, or "the X used for Y", treat
it as Josh's approximation of the mechanism, not as the specification of it.
Measure the real one and CORRECT THE SPEC. Do not implement the spec's wording
over the code's behaviour, and do not silently reconcile the two — report the
correction.**

**FILL-X.0** — List every figure or formula this spec names, and whether
measurement confirmed or corrected it.

## Standing constraints

**Push the feature branch to origin after every commit.** `main` stays Josh's;
never push to `main`, never merge. ⚠️ **A Codespace restart destroyed 11 unpushed
commits in S105.**

**Commit path-scoped after every unit. Never `git add -A`.**

**Migrations: rebuild-test only. NEVER production.** Verify the CLI link before
every `db push` — ⚠️ **the CLI can reach production.** ⚠️ **The ledger can lie —
check the object.** ⚠️ **And a constraint derived from rebuild-test's rows can
fail on production's:** `20261540000000` aborted on two orphan rows nobody had
measured. **Count on production before proposing a constraint.**

**Type-check is necessary and not sufficient. `next build` must pass.**

**A test that passes on zero rows is a failure.** State the row count each live
test exercised. Read the printed exit line, never a wrapper's echo.

⚠️ **MCP `apply_migration` strips comments from function bodies** on
rebuild-test, so its deployed objects no longer byte-match their files. Hash
comparisons there are noise until re-synced.

⚠️ **Do not hand-write probes that touch credentials.** Use the app's own path.

⚠️ **A Codespace rebuild removes Claude Code** —
`npm install -g @anthropic-ai/claude-code`.

---

# AUDIT — run before any build

1. Every FILL filled, or one line saying why not. State counts found and filled.
2. Every ASK has a recorded ruling, with the alternative it beat.
3. No measurement contradicts a RULED line.
4. ⚠️ **FILL-A.6 is answered.** If held shots do not survive backgrounding, the
   "nothing lost" ruling is not met and ASK-A.2 is ruled before the build.
5. ⚠️ **FILL-A.8's failure table exists.** It replaces test coverage for Part A;
   without it, Part A ships blind.
6. ⚠️ **FILL-B.1 is exact** — every piece marked shipped-and-tested,
   shipped-and-untested, or not built. The scope is what is not the first.
7. ⚠️ **FILL-B.0 is answered and email is working** before the end-to-end test is
   attempted. Email is disabled today; re-enabling it is a prerequisite, and
   something disabled it deliberately.
8. ⚠️ **FILL-B.7 is answered** — a real email to a real address that silently
   does not arrive wastes the test.
9. ⚠️ **The anonymous page's PAYLOAD carries no money** — checked on the wire,
   not in the renderer.
10. ⚠️ **FILL-X.0 lists every figure this spec named and whether measurement
    confirmed or corrected it.** The S106 award prompt's projected total was
    wrong as specified; assume at least one here is too.
11. ⚠️ **The route-floor test exists and FAILS if the admin client moves above
    the session read.** Ruled to be built this session, not filed.
12. Anything still unknown that the build will need.
