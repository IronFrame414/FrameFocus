# S127 — UNATTENDED, IN THREE PHASES. Research, plan, then build.

Fresh context.

⚠️ **READ `docs/specs/OPEN-WORK-BUNDLE.md` FIRST.** It is one file holding the queue and every open
spec. It exists because those specs previously lived somewhere you cannot read. **Section numbers
below (§ 2, § 4, § 5 …) are sections of that file.**

⚠️ **WHERE THIS PROMPT AND THE BUNDLE DISAGREE, THIS PROMPT WINS.** Josh ruled eleven open questions
on 2026-10-02 at 21:16 ET, after the bundle was written. **§ RULINGS below is current; the bundle's
"still open" lines are not.**

⚠️ **The bundle is a claim. So is this prompt. So is any report.** Re-verify anything you build on.
Context files drift; git and the database are ground truth.

⚠️ **THIS SESSION IS `S127`. NOT S126** — `docs/sessions/S126-progress.md` already exists in the repo
from an earlier phase, as do S136–S148 and S180–S181. **Do not reuse any of those numbers.**

---

# ⚠️ THE THREE PHASES

> **[Josh, 2026-10-02]** *"the prompt should be 3 phases. 1 - research and plan. 2 - present plan and
> ask open questions. 3 - build"*

| phase | what happens | what is forbidden |
| --- | --- | --- |
| **1 — RESEARCH** | verify state, read code, run every `INVESTIGATE` item, count production rows | ⚠️ **NO application code changes. NO migrations. NO merges.** |
| **2 — PLAN** | present the plan and every open question, in plain text and in the report | ⚠️ **No building until the plan is written down** |
| **3 — BUILD** | work the queue in the planned order | ⚠️ **Nothing outside the plan** |

⚠️ **PHASE 1 IS NOT OPTIONAL AND IT IS NOT A SKIM.** Every session that went wrong on this project
went wrong by proposing before verifying. **The point of phase 1 is that phase 3 contains no
surprises.**

## ⚠️ How phase 2 works when nobody is reading — RULED

**Josh is away. A question asked and waited on is a session stalled for hours.**

1. **Present the plan in plain text in the chat AND write it into the report.** ⚠️ **Never an
   interactive picker** — Josh is not notified when one appears.
2. **List every open question** with your recommendation and what breaks either way.
3. **Then proceed into phase 3 on your own stated reading.** ⚠️ **Write in the report which reading
   you took and why, per question.**
4. ⚠️ **EXCEPT** where the answer is irreversible, could reasonably go either way, or hits a stop
   rule. **That item stops, unbuilt, with its decision written out. The rest of the queue
   continues.**

**Josh ruled eleven questions tonight, so phase 2 should have little left to ask. A long list of new
open questions means phase 1 found something real — say so plainly rather than burying it.**

---

# ⚠️ UNATTENDED — what it changes

> **[Josh, 2026-10-02 20:53 ET]** *"This will be unattended from here. build, report, commit often,
> merge to production."*

- ⚠️ **MERGE AND PRODUCTION AUTHORITY IS GRANTED** for items marked `BUILD`, **only with their proofs
  run and green and their production verification read back by object.** **Authority to merge is not
  permission to skip a proof.**
- ⚠️ **An item marked `INVESTIGATE` changes no behaviour.**
- ⚠️ **An item marked `DO NOT TOUCH` is not a judgement call.**
- ⚠️ **THE STOP RULES STILL STOP YOU.** Unattended is not unbounded.
- **Commit and push after every finding, every proof, every sabotage with its read-back, every
  production section, and every stop.** The Codespace has timed out five times in three days.
  **An uncommitted file is one timeout from gone.**

---

# PHASE 1 — RESEARCH AND PLAN

## ⚠️ 1.0 — FIRST ACTION, BEFORE ANYTHING, INCLUDING READING

**Run `ListAgents`.** If any other Claude Code session is live in **this checkout**, **STOP AND SAY
SO.** Two sessions in one checkout raced toward a single production migration on 2026-09-30 and only
stopped because one of them checked.

⚠️ **NO PEER IS EXPECTED ANYWHERE.** The second Codespace that ran the performance audit was closed on
2026-10-02 at ~21:20 ET, after its report was merged to `main`. **This is the only live session.**
**Any peer at all — in this checkout or another — stops you. Say so and stop.**

## 1.1 — The ground

`git fetch --prune`, then state:

1. `origin/main`'s SHA and subject, and the ref you are on. **It was `71a039d5` at 21:19 ET on
   2026-10-02** — ⚠️ **verify, do not assume.**
2. ⚠️ **Confirm `docs/specs/OPEN-WORK-BUNDLE.md` is on `main` and read it in full.** If it is
   missing, **stop the session and say so** — without it you are working from memory.
3. Verify from the log, **not from this table:**

| part | claimed SHA | claimed state |
| --- | --- | --- |
| S124 Part 0 — email pacing (0.6s) | `5a78a648` | merged |
| S124 Part 2 — the QB timesheet on/off switch | `81fe1efc` | merged, migration on production |
| S124 Parts 1 + 3 — push + re-push | `9e08c3dc` on `feature/s124-p1-push` | **NOT merged, migration NOT on production** |
| the S125 performance audit report | merged at `71a039d5` | **on `main`** |

## ⚠️ 1.2 — RESCUE S124's REPORT. It is not on `main`.

**A listing of `docs/sessions/` on `origin/main` taken at 21:19 ET shows `S124-sabotage-originals`
and NO `S124-report.md`.** The report exists only on a branch.

⚠️ **This is the second time this has happened** — S122's report was stranded the same way, and the
S125 report had to be merged by hand tonight for the same reason.

**Find it and bring it onto `main`:**

```
git log --all --pretty=format: --name-only -- '*S124*report*' | sort -u
```

**Merge it forward as a docs-only commit carrying `[skip ci]`.** ⚠️ **ONE report file. Do not create a
second, and do not leave two.**

## 1.3 — CI, verified once

⚠️ **Does branch protection on `main` require a passing status check?** **Verify it. Do not assume
either way.** The answer decides whether a merge can carry `[skip ci]` (§ 8 rule 1), and it goes in
the report so nobody re-litigates it.

## 1.4 — The investigations. These ARE phase 1.

Run all five. **Findings only — change nothing.**

**1.4a — § 2, the member-removal security question.** ⚠️ **This outranks everything else in the
queue.** Remove a member each way and, on their still-valid token, attempt a **read**, a **write**, a
**file download** from storage, and a **privileged function** call. **State every result by object
with row counts.** ⚠️ **Write the negatives WITHOUT returning rows** — an `.insert().select()` makes
Postgres check the new row against the SELECT policy, so the test passes whether or not the write arm
exists. **Then establish which shipped screens or API routes can produce a `company_members`-only
deactivation for a member who has a login.**

**1.4b — § 4 A-1a-i, the trash scope matrix.** Which entities soft-delete, and which have a trash view
a user can actually reach — contacts, files/photos, projects, tasks, addresses. ⚠️ **And count
anything already soft-deleted and unreachable on production.**

**1.4c — § 7, the payroll segment-type defect.** **Enumerate every path that can change a segment's
type**, and ⚠️ **count the approved days on production whose segment types were changed after
approval.**

**1.4d — § 5 item 1, the floating bottom bar.** Find the cause. ⚠️ **Not diagnosed — do not start from
a theory**, and the fix cannot be proven without a real iPhone at 402px, which needs Josh.

**1.4e — § 4 B-2, "it asks permission every time."** ⚠️ **Reproducing it needs Josh's device.**
Establish what you can from the code. ⚠️ **If the answer is that iOS re-prompts per launch for a
standalone PWA, say so plainly** rather than planning a change that does not help.

## 1.5 — Read before planning

For every `BUILD` item in phase 3: **find the files, the existing patterns, and the consumers.**
Specifically, before planning:

- ⚠️ **§ 5's box C — trace every consumer.** `apps/web/lib/daily-logs/daily-log-template.tsx` carries
  `tasksTomorrow` in `DailyLogPdfData`. **Deleting the input leaves the PDF with an empty section.**
- ⚠️ **§ 4 A-5 — the photo viewer RELOADS THE WHOLE GALLERY ON EVERY SWIPE** (S125). Adding
  next/previous multiplies it. **Confirm it before planning the feature.**
- ⚠️ **§ 3's duplicate-punch fix — count the duplicates already on production FIRST.** A migration
  adding a **unique constraint over existing production rows** is stop rule 2.
- ⚠️ **§ 6 — decide rule-columns-on-the-existing-table versus a second table**, and say which. **Do
  not overload the date column with a sentinel.**

**Commit and push phase 1's findings before phase 2. Push after each one.**

---

# PHASE 2 — THE PLAN

**Write it into the report and say it in the chat:**

1. **Every item, in build order**, with: what you will change, how many migrations, what you will
   prove, and what could break.
2. ⚠️ **1.4a's answer stated plainly — confirmed or not.** If confirmed, it goes above everything
   else.
3. **Anything phase 1 found that changes an item's scope or kills it outright.**
4. **Every remaining open question**, with your recommendation and what breaks either way.
5. ⚠️ **Which items you are NOT going to reach.** An honest short queue beats a plan that silently
   stops halfway.

**Then proceed per § "How phase 2 works when nobody is reading".**

---

# PHASE 3 — BUILD, in this order

## ⚠️ ITEM 1 — `BUILD` — the QuickBooks switch's "turned itself off" state

**Ruled:** build it ahead of S124 Parts 1 and 3; own branch, own migration. **Notify the Owner ONLY**
— only the Owner can turn it back on, and a notification to someone who cannot act diffuses
responsibility. **Notify only on an ACTUAL CHANGE** — a notice that nothing changed teaches people to
ignore the notice that something did.

- Record **that it was automatic, when, and why** — the real upstream cause (`needs_reauth`, repeated
  failure, whatever actually triggered it), not a generic string.
- Show it at `/dashboard/settings/accounting`. ⚠️ **"Off" alone is identical to a human having turned
  it off, and those need different responses. The screen states WHEN and WHY.**
- ⚠️ **It never turns the switch back on. It never backfills.**

**Proofs:** ⚠️ **sabotage the "already off" path and show ZERO notification rows, counting both ways.**
⚠️ **Sabotage the notify arm, confirm RED, restore, read back identical.** ⚠️ **Prove Owner-only by
COUNTING ROWS with the service role** — an Admin seeing nothing on screen is a render gate, which is
the `#136` mistake.

## ITEM 2 — § 2's fix, if 1.4a confirmed it — `BUILD BRANCH ONLY, DO NOT MERGE`

**RULED [Josh, #11]: build it, prove it, do not merge.**

⚠️ **`get_my_company_id()` is what every access rule depends on. A wrong change locks every user out
of every company, including the live paying customer's.** **Josh merges it himself.**

**Leave a test behind either way** — the absence of any test for this is part of what made it
invisible. **And record the consequence for `16b`:** ⚠️ **if removal does NOT cut access immediately,
16b must not be built at all.** `16a` proceeds regardless.

## ITEM 3 — `BUILD` — § 3, performance round 1, IN FULL

⚠️ **Josh [2026-10-02]: the remainder of S125 is in this session.** Each sub-item ships whole, in this
order:

**P-1 — the two DEFECTS. ⚠️ These must land even if nothing else does.**
- **A second tap on clock-in returns a raw database error.** The most-used action in the app.
- **A second tap on punch create makes a DUPLICATE ITEM.** ⚠️ **A live data bug, true today.**
- ⚠️ **Count existing production duplicates before reaching for a unique index** (stop rule 2). If
  duplicates exist, **report the count and fix it in the application layer instead.**
- ⚠️ **Do not weaken the clock-in path.** A clock-in that fails or stalls is far worse than an ugly
  error. `captureGps()` never rejects, never blocks a clock event, always records a reason.

**P-2 — feedback.** ⚠️ **None of the 169 pages has a `loading.tsx` and nothing streams, so the old
screen sits frozen until the new one is completely ready.** Buttons stay disabled until the screen
catches up; progress shown on code-triggered navigation; loading states on the most-used field screens
first — ⚠️ **ranked by field use, not by how bad a route looks in isolation.** A saving on the time
clock, opened twice a day by every crew member, beats a larger saving on a screen Josh opens monthly.

**P-3 — finding 4, photo thumbnails through a PROXY ROUTE.** ⚠️ **HARD CONDITION: the cache header
must be `private`, PROVEN BY TEST. A `public` header lets Vercel's CDN serve one company's thumbnail
to another.** ⚠️ **S157's ruling is NARROWED, not overturned** — it rejected re-checking authorisation
because that meant a round trip per thumbnail; through the proxy it is a round trip per cache MISS.

**P-4 — the query fixes, findings 5, 7, 8, 10.** ⚠️ **TIME BOMBS, not current pain** — `/m/logs` reads
every daily log the company has ever written; the schedule reads every event ever scheduled. Fine
today, unusable in a year. **"Second" does not mean "optional".** Bounded, and ordered by the column
they are bounded on — ⚠️ **`.limit()` without `ORDER BY` is half the trap.**

**P-5 — finding 16a: use the layout's shared Auth check.** **79 pages make a duplicate Auth-server
call that blocks their own queries.** ⚠️ **16a only — no security change. 16b is DEFERRED** and may be
dead depending on 1.4a.

**P-6 — Q5: correct the false comment at `middleware.ts:389-390`.** It claims *"Every API request now
runs getUser()"*, untrue since S116. ⚠️ **The corrected comment must record that this comment misled
the 2026-09-29 performance reading.** Its own small commit.

**P-7 — bundle weight.** ⚠️ **Heavy libraries loaded on routes that do not use them** — `pdf-lib`,
`@react-pdf/renderer`, the Gantt and chart code. **Dynamic import is the fix; the work is finding
WHERE.** The `/m` shell was measured at **226 KB gzipped**.

**P-8 — finding 9: uploads.** ⚠️ **Photos KEEP FULL RESOLUTION. Construction photos are EVIDENCE** —
concealed conditions, water intrusion, defective work — and detail destroyed at capture cannot be
recovered. **The fix is to stop the crew WAITING: thumbnail on the device, queue the full-resolution
upload, let them move on.** ⚠️ **iOS has no background sync, so "move on" means inside the app — the
indicator must SAY SO**, or a foreman pockets the phone and assumes it sent.

**P-9 — F-2, caching rarely-changing data.** ⚠️ **The cache key includes `company_id`, with a negative
test returning no rows and a sabotage that must go red. A cross-tenant cache leak is worse than any
amount of slow.**

⚠️ **NOT in P-anything: finding 11** (the dashboard profitability rollup) — it changes how money
figures are calculated, needs the role tests, and is `#136` class. **It goes alone, in its own
session.**

## ITEM 4 — § 4, the photo viewer and the clock location

**4a — `BUILD`: the photo trash view, with restore.** ⚠️ **Soft delete is enforced in the SERVICE
layer, not RLS — RLS does NOT filter `is_deleted`.** Follow the shipped `getTrash()` pattern per
`CLAUDE.md`. **Bounded, ordered by the column it is bounded on.**

**4b — `BUILD`: A-2 to A-5.** Open in view mode with markup behind an explicit control; fit portrait
photos to the viewport **height**, not the width; date, time and who took it on the desktop single
view — ⚠️ **matching how mobile already formats them, never a second formatter** (`captureGps`, S106);
next/previous with **keyboard arrows**.

**4c — `BUILD`: B-1, render the clock location.** ⚠️ **NO MIGRATION — the data is already there and
nothing displays it.** ⚠️ **The three states must stay distinct:** coordinates → show with a map link;
a failure → ⚠️ **the REASON in plain words** ("Location permission denied" is a policy question, "no
signal at the jobsite" is a site condition, and **D-34 exists precisely so they stop looking alike**);
**NULL → show nothing, it means never attempted.** **On both clock-in and clock-out, on the desktop
review screen and the week sheet.**

**4d — `BUILD`, GATED: A-1 bulk select, share to portal and text, bulk delete.** ⚠️ **Only after 4a
is MERGED and its restore PROVEN.** ⚠️ **Owner/Admin only, SOFT delete.** A checkbox column puts
"select all → delete" one mis-tap from the photos that matter in a dispute two years later. **If you
run out of road, the trash ships and bulk delete waits — never the other way round.**

⚠️ **The client-portal destination needs no new mechanism, but the gate is `client_visible` AND
`is_client_of_project` AND `client_has_full_access()`** — a documents-only client still sees nothing,
**and the UI must not promise otherwise.** ⚠️ **Mobile text share uses `lib/share-image.ts` as it
stands: it shares FILE BYTES and refuses to fall back to a URL. Do not change that.**

**4e — `BUILD`: A-1c, the public share link. ⚠️ NOW RULED AND AUTHORIZED.**

⚠️ **An APP-ISSUED TOKEN the application resolves — NOT a Supabase signed URL.** The S121 ruling in
`lib/share-image.ts` stands unchanged: a signed URL is a *"time-limited bearer credential to a private
project file… no login, no RLS, no audit"* and **nothing can revoke it once it exists.**

| | Supabase signed URL ❌ | app share link ✅ |
| --- | --- | --- |
| who resolves it | Supabase storage | **the app** |
| revocable | **no** | **yes** |
| scope | the storage object | **one photo** |
| audit trail | no | **yes** |

⚠️ **The public page NEVER exposes the storage URL — it streams the bytes through the app.** **A share
page that redirects to a signed URL has handed out the credential and defeated the entire design.**
**Precedent: `/sign-co/[token]` and the bid tokens. Follow that shape.**

**Must include:** a share-link record (file, creator, created-at, expiry, revoked-at) · ⚠️ **a list of
active links with ONE-CLICK REVOKE — not optional, not a later enhancement** · **view logging** ·
**default expiry 90 days** [RULED], extendable and revocable.

⚠️⚠️ **WHAT THE PUBLIC PAGE SHOWS — RULED, AND THE GATE ON SHIPPING IT:**

**The photo · the company LOGO · the company name · the date. NOTHING ELSE.**

⚠️ **NO project name. NO site address. NO client name. NO task, note or description.** The URL is
forwardable by design. **A stranger holding it must learn who took the photo, never whose house is
being renovated, where it is, or what is wrong with it.** That is Josh's client's privacy, not Josh's,
and it is the detail most likely to be added later "for context" by someone who has not read this
paragraph.

⚠️ **HARD GATE [Josh, #3]: this does not ship unless that list is PROVEN BY INSPECTING THE PAYLOAD,
not the screen.** A render-only gate still ships the data — that is the `#136` class and this project
has shipped it before.

⚠️ **The shared image is the MARKED-UP version when markup exists** [RULED, #2] — `display_path`
resolves to `<path>.markup.jpg`. ⚠️ **AND THE SHARE DIALOG MUST PREVIEW THE EXACT IMAGE THAT WILL BE
PUBLIC before the user confirms.** That preview is the safeguard; without it, internal annotations go
public blind. **Both halves ship together or neither does.**

## ITEM 5 — § 5, the daily log

**5a — `BUILD`: box C → the client-facing photo.** **RULED option B: at least one client-facing photo,
or a one-tap reason for having none** (inspection day, weather, no site access). **The reason is
stored and appears on the log.**

⚠️ **Why not a hard requirement:** on a day with no visible progress a foreman either cannot close out
or **takes a filler photo to get past the gate, and a filler photo reaching a client is worse than no
photo** — it is the client's evidence of what was done that day.

**RULED tonight:**
- **#4 — a DEDICATED photo slot**, not a tick on one of the close-out photos. ⚠️ **A crew member must
  never be unsure which pictures the client can see.**
- **#5 — it appears in the daily log PDF, marked as the client-facing one.**
- **#6 — more than one is allowed, no cap.** "At least 1" is a floor, not a ceiling.

⚠️ **No new schema** — `files.client_visible` plus `files_select_client` exist, and the portal lists
client-visible images through `getPortalPhotos()`. **"Automatically visible" means setting
`client_visible = true` on that photo's `files` row.** ⚠️ **But a documents-only client still sees
nothing, and a marked-up photo shows the client the MARKED-UP version.** Surface both in the UI rather
than discovering them later.

⚠️ **Do NOT drop columns holding live data.** Stop collecting, hide the inputs, **state what happens
to rows already carrying values.** A column drop is a separate, later decision.

**5b — `INVESTIGATE` ONLY: the floating bottom bar** (1.4d). ⚠️ **The fix must be proven at 402px on a
REAL iPhone, which needs Josh. Build nothing** — write the cause and the proposed fix.

## ITEM 6 — `BUILD` — § 6, the working-calendar standard holidays

**Seven rules, not dates. Each with its own checkbox, each showing the date it resolves to this year.**
⚠️ **Unticking is not deleting** — the row stays, visibly off. A deleted row is a decision nobody can
see a year later.

**The seven:** New Year's Day (Jan 1) · Memorial Day (last Monday in May) · Independence Day (Jul 4) ·
Labor Day (first Monday in September) · Thanksgiving (fourth Thursday in November) · the Friday after
Thanksgiving · Christmas Day (Dec 25).

⚠️ **DELIBERATELY EXCLUDED: MLK Day, Presidents' Day, Juneteenth, Columbus Day, Veterans Day.** Banks
close for those; most GC crews work them. **Recorded so nobody "completes the list" later.**

⚠️ **DEFAULT STATE — RULED [Josh, #7]: OFF for every EXISTING company. ON by default for any company
that enables Critical Path AFTER this ships.** Defaulting existing companies to on would re-date every
live Critical Path job the moment the feature deploys.

⚠️ **Ticking a holiday is a recompute trigger and MUST STATE ITS CONSEQUENCE BEFORE IT APPLIES** — how
many projects are affected and how far each finish moves. **A settings screen that silently re-dates
every live job is the worst version of this feature.**

⚠️ **Year resolution belongs in the engine's calendar lookup, NEVER in the UI.** The engine is the only
thing that may decide whether a day is worked; a UI that resolves dates itself is a second source of
truth.

⚠️ **Do not build a general observance-shift engine.** A fixed-date holiday landing on a non-working
day costs nothing and needs no shift. For a Saturday-working company the holiday removes its actual
calendar date and nothing else; **they add the Friday or Monday as a one-off closure if they want it.**

⚠️ **Do not migrate or delete holidays already entered by hand** — they stay as one-offs.

## ITEM 7 — `BUILD` — § 7, the payroll segment-type defect. ⚠️ NOW AUTHORIZED.

**RULED [Josh, #8]: build the fix.** A work ↔ break change on an approved day **returns the day to
pending, on EVERY path**, audited, **reusing 0-B-4's existing "Hours changed" notice rather than adding
a second one.**

⚠️ **The principle is already settled at 0-B-4: paid hours cannot change on an approved day without
that day going back for approval.** A type flip does not touch the clock times, so it does not look
like an hours change — **but breaks are paid or unpaid per `companies.breaks_paid` /
`paid_break_cap_minutes`, so it moves what is PAID without tripping the guard built to catch exactly
that.** ⚠️ **Approval is what authorises payroll.**

⚠️ **Enumerate every path FIRST** (1.4c). 0-B-4's lesson was that one path reopened the day and another
did not — *"two paths, two rules, one dataset."*

**Negative test per excluded role, written without returning rows, with its own sabotage that must go
red.**

⚠️ **RULED [Josh, #9]: existing production rows are REPORTED, NOT CORRECTED.** Count them, list the
days, **change nothing.** Returning already-paid days to pending could reopen payroll already run.
**That is Josh's call.**

## ITEM 8 — `BUILD`, CONDITIONAL — § 11, `feature/s114-c5-multi-upload`

**RULED [Josh, #10]:** **find the revert, quote the reason, and test it against today's `main`.**

- ⚠️ **If the revert reason is PROVEN DEAD → audit the branch, then merge it.**
- ⚠️ **If it still holds → STOP and report. DO NOT DISCARD.** Discarding code is permanent and stays
  Josh's decision.

**It is the only branch carrying code not on `main`, kept through three branch audits at `6409738e`,
and S121 carried a stop rule naming it** — *"whose original revert reason still applies."* **Nobody has
established whether that is true.**

---

# § RULINGS — Josh, 2026-10-02 21:16 ET. Do not re-ask these.

| # | question | ruling |
| --- | --- | --- |
| 1 | share link expiry | **90 days**, extendable, revocable |
| 2 | shared photo with markup | **the marked-up version**, with a mandatory pre-confirm preview |
| 3 | build the share link unattended | **yes**, gated on the payload proof; **plus the company LOGO on the public page** |
| 4 | daily log client photo | **a dedicated slot** |
| 5 | client photo in the PDF | **yes**, marked as client-facing |
| 6 | more than one client photo | **yes, no cap** |
| 7 | holiday default state | **off for existing companies, on for companies enabling Critical Path after this ships** |
| 8 | payroll segment-type fix | **build it** |
| 9 | existing affected production rows | **report only, correct nothing** |
| 10 | `s114-c5` branch | **merge if the revert reason is proven dead; stop if it holds; never discard** |
| 11 | the member-removal fix | **build and prove, DO NOT MERGE** |

---

# ⚠️ DO NOT TOUCH THIS SESSION

- ⚠️ **S124 Parts 1 and 3.** The sandbox connection is dead — Intuit refused the refresh with
  `invalid_grant` — and reconnecting needs Josh's hands on a login screen. **Leave
  `feature/s124-p1-push` alone: do not merge it, do not rebase it, do not push its migration.**
- ⚠️ **Any QuickBooks write at all**, sandbox or real.
- ⚠️ **§ 3 finding 11**, the dashboard profitability rollup — `#136` class, its own session.
- ⚠️ **§ 3 finding 16b** — gated on 1.4a, and possibly dead.
- ⚠️ **The TIMING half of the performance audit.** It needs a quiet system and you are the noise.
- ⚠️ **Build C (§ 10) and Build F (§ 9).** Not this session.
- ⚠️ **`staleTimes` / disabling the client router cache.** Settled at S121 by measurement
  (49 → 301 ms unthrottled, 49 → 2,308 ms on Slow 3G); the branch was deleted by ruling; the
  stale-data symptom is solved better by `router.refresh()` after mutations. ⚠️ **A proposal to
  disable it is a finding to REJECT, not to evaluate.**
- ⚠️ **`NEXT_PUBLIC_APP_URL` capitalization** — ruled NO CHANGE, *"its working as is."*

**When the queue is done: STOP.** ⚠️ **Reaching the end of the authorized work is a finish, not an
invitation to start something else.**

---

# ⚠️ CI — § 8, in force

- ⚠️ **Verify branch protection ONCE** (1.3) before relying on rule 1.
- **Rule 1:** a merge to `main` carries `[skip ci]` **only when tree identity is PROVEN** —
  `git diff --name-only <tested> <merge-head>` returning nothing outside `docs/`, **printed in the
  report.** ⚠️ **No proof, no skip. A real merge resolving conflicts REQUIRES the main run.**
- **Rule 2:** stack, **two deep maximum**, and ⚠️ **never stack migration-carrying work with work that
  carries none.**
- **Rule 3:** docs-only and report-only commits always carry `[skip ci]`.
- **Do not start a branch run near a merge run.** You cannot cancel a run (403).

**The two reds are not the same thing.** **Fixture collision** — a red that **overlapped** another run;
say so, **re-run alone**, do not count it as the first red. **Connection exhaustion** — rebuild-test
runs out of connections and reds a run that has the database **entirely to itself** (03:18Z on
2026-10-01, no overlapping run). ⚠️ **Check the timestamps before calling a red a collision.** Stop
rule 5 counts a **second** red on the **same** cause.

---

# Working rules

- One branch per item, cut from `main`. **Push after every commit.**
- ⚠️ **Commit path-scoped. Never `git add -A`.**
- ⚠️ **An item ships whole or not at all.** Unfinished when you run out of road = **stopped, unmerged,
  with a written state.** Josh's crew use production.
- ⚠️ **Verify by object. A prior report is a claim** — including this prompt.
- ⚠️ **Every sabotage must go red**, then be restored and read back identical. **A test that still
  passes after deliberate sabotage proves nothing.**
- ⚠️ **A test that passes on zero rows is a failure. State row counts.**
- ⚠️ **An e2e that passes on a page that never rendered is not a pass.**
- ⚠️ **Judge a deleted storage object by LISTING its folder, never `download()`.**
- ⚠️ **Never truncate an inspection with `head`.**
- ⚠️ **Name the ref every measurement was taken on.**
- No test deleted; superseded assertions quoted in place. Never reformat a file the repo does not
  already format.
- `next build` must pass and **the printed exit line read.**
- ⚠️ **End every turn with the CLI on rebuild-test**, read back — including a turn that stops.
  ⚠️ **Never `migration repair --status reverted`.**
- ⚠️ **One migration per section. A dry run listing anything but that one file is a stop.**
- ⚠️ **Production: verification BY OBJECT with every expected value stated BEFORE you query.**
- ⚠️ **This does not amend CLAUDE.md.**

---

# Stop rules

1. A production verification value that does not match its stated expectation.
2. ⚠️ **A migration adding a constraint over existing production rows.**
3. Anything weakening the Financial Visibility Floor (`#136`).
4. A dry run listing anything but the single file its section names.
5. CI red twice on the **same** cause.
6. ⚠️ **Any write toward QuickBooks, sandbox or real.**
7. ⚠️ **A token, or any part of one, reaching a log.** `apps/web/lib/quickbooks/tokens.ts` may not be
   logged — not the blob, not a token, not a prefix of one, **not in a debug line you intend to delete
   later.**
8. ⚠️ **Touching `feature/s124-p1-push`.**
9. ⚠️ **Shipping bulk photo delete before the trash view is merged and its restore proven.**
10. ⚠️ **Anything but the photo, the logo, the company name and the date in the public share page's
    PAYLOAD.**
11. ⚠️ **The share link shipping without one-click revoke, or without the pre-confirm preview.**
12. ⚠️ **Any change to `get_my_company_id()` reaching `main`.**
13. ⚠️ **Correcting, rather than reporting, an already-approved payroll day** (ruling #9).
14. ⚠️ **Discarding `feature/s114-c5-multi-upload`** (ruling #10).
15. ⚠️ **A sabotage that does not go red.**
16. ⚠️ **A second Claude Code session live in this checkout.**

**On any stop except 6, 7, 12 and 16:** relink to rebuild-test, prove it, write the state into the
report, commit, push. **Stop the ITEM, not the session** — then continue down the queue.

---

# The reports

**`docs/sessions/S124-report.md`** — rescued onto `main` in 1.2, then item 1 appended to it.

**`docs/sessions/S127-report.md`** — everything else. ⚠️ **Append and push as you go, not at the end.
Do not create a third report, and do not reuse S126.**

**Lead with, in this order:**

1. ⚠️ **`## WHAT JOSH DOES WHEN HE'S BACK`** — one numbered list, **one action per line, nothing
   bundled.** It must include **the QuickBooks sandbox reconnect**: the command to run in the
   Codespace verbatim, the URL, signing in as Sabal Point's **Owner**, choosing **"Sandbox Company US
   cc64"** (realm `9341457813274121`), **what he should see if it worked and what to check if it
   didn't.** Plus the real-iPhone proof for 5b, B-2's reproduction, and anything else needing his
   hands.
2. ⚠️ **1.4a's answer — the member-removal question, stated plainly, confirmed or not.** If confirmed,
   **above everything else**, with the unmerged fix branch named.
3. ⚠️ **What Josh must RULE**, each with the options and what breaks either way.
4. **The phase 2 plan as presented, and every deviation from it, with why.**

**Then, per item:** merged with its SHA and whether it is on production, or stopped and exactly where ·
every sabotage with its read-back and row counts · every production verification row against its stated
expectation · ⚠️ **every decision you took on your own reading, and why** · ⚠️ **everything deferred,
and why.**

**A gap stated is a gap. A gap unstated is a false clean bill.**