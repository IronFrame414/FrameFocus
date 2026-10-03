# OPEN WORK — the index and every spec, in one file

⚠️ **This file exists because the specs previously lived in a place Claude Code CANNOT READ.** Every
spec that was in the project knowledge base is reproduced here, in full, as repo content. **Cite
sections of THIS file in prompts. Never cite a `claude/…` path to CC.**

**Assembled 2026-10-02. `origin/main` was `91fa32e1` when the index was last updated — ⚠️ verify.**

⚠️ **This index does NOT mirror `TECH_DEBT.md`** in the repo root. That is the project's own tracker
with its own numbering, and merging the two would create competing lists. **Open work lives in both
places.**

## Contents

| § | item |
| --- | --- |
| **1** | The queue — what order, and what is blocked |
| **2** | Member removal — does it cut data access? ⚠️ SECURITY |
| **3** | Performance fix build — round 1, the ruled order |
| **4** | Photo viewer, and timeclock location |
| **5** | Daily log — two changes |
| **6** | Working calendar — standard holidays |
| **7** | Payroll defect — segment type on an approved day |
| **8** | CI conventions — standing, every session |
| **9** | Build F — project overview job-details block |
| **10** | Build C — CI serialization |
| **11** | `feature/s114-c5-multi-upload` — audit, then merge or discard |
| **12** | Closed, not built — recorded so it is not re-raised |

---

# § 1 — THE QUEUE

⚠️ **These are SEPARATE builds. The split is deliberate. A build ships whole or not at all.**

| # | item | § | state |
| --- | --- | --- | --- |
| 1 | **S124 Parts 1 + 3** — timesheets → QuickBooks push | — | ⚠️ **BLOCKED — the sandbox connection is dead and reconnecting needs Josh's hands on a login screen** |
| 2 | **Member removal / data access** | § 2 | ⚠️ **SECURITY. Needs rebuild-test. Outranks the performance work.** One live test answers it |
| 3 | **Performance fix round 1 — THE TWO DEFECTS FIRST** | § 3 | ruled |
| 4 | **Photo viewer + timeclock location** | § 4 | ruled, partly gated |
| 5 | **Daily log — the two changes** | § 5 | ruled, partly undiagnosed |
| 6 | **Working calendar standard holidays** | § 6 | ruled but for one default |
| 7 | **Payroll segment-type defect** | § 7 | ⚠️ **needs Josh's payroll ruling before behaviour changes** |
| 8 | **`feature/s114-c5-multi-upload`** | § 11 | audit first; discard is a legitimate outcome |
| 9 | **Build C — CI serialization** | § 10 | not started |
| 10 | **Build F — project overview job details** | § 9 | spec'd, verified |
| 11 | **Performance — the TIMING half of the audit** | § 3 | ⚠️ **needs a QUIET system** |

**Also outstanding:** `feature/s125-perf-audit-static` carries the performance audit report and
**has never been merged.** ⚠️ **Merge it when CI traffic allows, so it is not stranded the way S122's
report was.** Docs-only — it carries `[skip ci]`.

## What is DONE — do not rebuild, do not re-ask

**S121** closed 2026-09-30, eight parts, migrations `20262117000000`–`20262121000000`.

**S122** closed 2026-10-02 06:24. Nine parts plus three cleanup items, migrations `20262126`–`20262131`
on production. Covers **Build A** (cleanup), **Build D** (Critical Path) and **Build E** (invoice
dollar amounts). ⚠️ **Build E's pinned-line rule is now precedent** — *a deliberate act is visibly
marked and always reversible* — reused by the Critical Path constraint marking.

**S123** closed 2026-10-02 14:19 — the Critical Path close-out, all four items merged. Migrations
`20262132` and `20262133` on production, verified by object (MATCH ×8 and ×9).

| item | merged | what shipped |
| --- | --- | --- |
| **D-4** | `30869f3c` | the template stamp as one SQL function in one transaction, with a per-project lock. A forced failure leaves 0 tasks, 0 phases, 0 links, 0 history rows; the retry needs no cleanup; two at once, exactly one wins |
| **D-2** | `f28cf36c` | the disclaimer already said "these dates" — a unit test now pins the sentence and forbids "figures" in it |
| **D-3** | `69c02a7e` | the unreachable list decided and the saver's report row written INSIDE the save; sends afterwards via `waitUntil` (`@vercel/functions`); every recipient gets an `email_logs` row, including any the 60-second limit stops |
| **D-1** | `bec91ec4` | ONE client schedule — Critical Path jobs fed by `client_critical_path` (now carrying task dates), others by `client_schedule` (untouched, md5 proven unchanged); List ⇄ Gantt as a URL parameter resolved server-side; the client Gantt its own bars-only drawing; the disclaimer on every schedule, both views |

⚠️ **The disclaimer is LIVE-FACING on ordinary jobs as of that merge.** Both gates for turning
Critical Path on a real job are on production.

**S124** — **Part 0** (Resend pacing, 0.6s, `5a78a648`) and **Part 2** (the on/off switch, `81fe1efc`,
migration on production, off for both companies, Owner-only, never backfills) are **merged**.
**Parts 1 and 3** are parked on `feature/s124-p1-push` (`9e08c3dc`), unmerged, migration not on
production.

**S125** closed 2026-10-02 17:53 — the performance audit's **static half only**. Nothing merged,
nothing fixed, no timings taken.

### S123's two close-out decisions — RULED [Josh, 2026-10-02 14:25]

**Q-D1 — task status on ordinary jobs: A, leave it.** ⚠️ **This corrects an earlier error.** It was
asserted that ordinary jobs show task status today. **They do not** — `client_schedule` returns the
field and the page never rendered it. ⚠️ **A function returning a field is not the page showing it.**

**Q-D3 — Resend's rate limit: B, pace the sends.** Shipped as S124 Part 0.

---

# § 2 — ⚠️ SECURITY: does removing a member actually cut their data access?

**Found 2026-10-02 by S125, the performance audit. It is a SECURITY question that surfaced in a
performance review, and it outranks the performance work.**

⚠️ **THIS IS A LEAD, NOT A FINDING.** Code and migrations were read; **no database was queried.**
Every line below is to be verified, not believed. ⚠️ **Do not fix anything until it is confirmed;
there may be nothing to fix.**

Tracked as `#1-s125perf`, to be converted to the next free `TECH_DEBT.md` number when the S125 branch
lands.

## What was observed

**`get_my_company_id()` — the function every access rule uses to resolve a caller's company — reads
`profiles`, NOT `company_members`.**

| path | what it does | apparent effect on data access |
| --- | --- | --- |
| **Removal from the team page** | marks the **profile** deleted, and bans the login | ⚠️ **Probably cuts access immediately** — `get_my_company_id()` only accepts profiles not marked deleted, and the stored-files rule repeats that check |
| **Deactivation recorded ONLY on `company_members`** | leaves the profile intact | ⚠️ **Appears to cut NOTHING** — the company lookup never reads `company_members`, so the person would resolve to the company and keep full data access |

⚠️ **The second state is not hypothetical — S109's tests confirm it exists.** What is unknown is
**which screen can produce it for a member who has a login.**

⚠️ **AND THE EXPOSURE IS NOT TIME-LIMITED.** The ban applied by team-page removal blocks new sign-ins
and token refreshes but does not end tokens already issued — that is the known one-hour gap. **The
`company_members`-only path is different: if the lead is right, access would persist indefinitely,
because nothing in the access rules ever consults the table that was changed.**

**No existing test checks a removed member's data access.** (Test *titles* were searched, not bodies —
a differently named test could exist.)

## ⚠️ Why this outranks the performance queue

The platform is multi-tenant with a live paying customer. "Someone removed from a company may still be
able to read that company's data" is a different class of problem from "a screen takes two seconds."
**It is also cheap to settle** — one live test on rebuild-test answers it either way.

## How to settle it

**Remove a member each way and, on their still-valid token, attempt:**

1. A **read** of company data.
2. A **write**.
3. A **file download** from storage.
4. A **privileged database function** call.

**For each path, state the result by object with row counts.** ⚠️ **Write the negatives WITHOUT
returning rows** — an `.insert().select()` makes Postgres check the new row against the SELECT policy,
so the test passes whether or not the write arm exists.

**Then establish which screens and API routes can produce a `company_members`-only deactivation for a
member who has a login.** ⚠️ **If no shipped path can produce it, the exposure is latent rather than
live — which changes the urgency, not the fix.**

**Leave a test behind either way.** The absence of any test for this is part of what made it
invisible.

## ⚠️ It also gates a performance decision

S125's **finding 16b** — dropping the Auth-server check on office pages in favour of a local token
check — was deferred pending exactly this answer. **16a (removing the duplicate check, no security
change) proceeds regardless.**

⚠️ **If removal does NOT cut access immediately, 16b must not be built at all**, because the
Auth-server call would then be doing real work rather than protecting only a page redirect.

---

# § 3 — PERFORMANCE FIX BUILD, ROUND 1

**Region is NOT the problem.** Production Supabase is `us-east-1`; Vercel functions run in `iad1`.
⚠️ **The one hypothesis that could have explained everything at once is dead**, which means the
findings are the answer.

**The biggest field problem is FEEDBACK, not speed.** None of the 169 pages has a `loading.tsx` and
nothing streams, so the old screen sits frozen until the new one is completely ready.

> **[Josh, 2026-10-02]** *"near instant is important. we don't have time or patience to wait for
> software to load while in the field or office. that will cause this to fail as something people
> want to work with before they even give it a real shot."*

⚠️ **This is an ADOPTION problem, not a tuning problem.**

## ⚠️ Two of the findings are DEFECTS, not slowness [Josh, RULED]

- **A second tap on clock-in gives a raw database error.** The most-used action in the app.
- **A second tap on punch create makes a DUPLICATE ITEM.** ⚠️ **A live data bug, true today**, which
  went unnoticed because it looks like a slow screen rather than a defect.

⚠️ **THESE MUST LAND EVEN IF NOTHING ELSE IN THE FIX BUILD DOES.**

## The ruled order [Josh, 2026-10-02]

1. **The two defects above.**
2. The rest of findings 1–2: buttons stay disabled until the screen catches up, progress on
   code-triggered navigation, loading screens on the most-used field screens.
3. The query fixes (5, 7, 8, 10). ⚠️ **These are TIME BOMBS, not current pain** — `/m/logs` reads
   every daily log the company has ever written, the schedule reads every event ever scheduled. Fine
   on today's data, unusable in a year. **"Second" does not mean "optional".**
4. **Finding 11 (the dashboard profitability rollup) goes SEPARATELY** — it changes how money figures
   are calculated and needs the role tests. `#136` class.

## Rulings attached to specific findings

- **Finding 4 — photo thumbnails go through a PROXY ROUTE**, not longer-lived signed links.
  ⚠️ **S157's ruling is NARROWED, not overturned** — it rejected re-checking authorisation because
  that meant "a round trip on every photo thumbnail", and through the proxy it is a round trip per
  cache MISS. The premise differs, so the conclusion does not carry. ⚠️ **HARD CONDITION: the cache
  header must be `private`, PROVEN BY TEST. A `public` header lets Vercel's CDN serve one company's
  thumbnail to another.**
- **Finding 9 — photos keep FULL RESOLUTION on upload.** ⚠️ **Construction photos are EVIDENCE** —
  concealed conditions, water intrusion, defective work — and detail destroyed at capture cannot be
  recovered. The fix for slow LTE uploads is to stop the crew WAITING: thumbnail on the device, queue
  the full-resolution upload, let them move on. ⚠️ **iOS has no background sync, so "move on" means
  inside the app — the indicator must say so**, or a foreman pockets the phone and assumes it sent.
- **F-2 — caching rarely-changing data: yes, but its own reviewed change, after the fixes above.**
  ⚠️ **The cache key includes `company_id`, with a negative test returning no rows and a sabotage that
  must go red. A cross-tenant cache leak is worse than any amount of slow.**
- **The false comment in `middleware.ts:389-390`** ("Every API request now runs getUser()", untrue
  since S116) is corrected in the first fix build, and the corrected comment records that it misled
  the 2026-09-29 reading.
- **Finding 16 — 79 pages make a duplicate Auth-server check that blocks their own queries.**
  **16a (use the layout's shared check — no security change) proceeds. 16b (local token check instead
  of the Auth server) is DEFERRED** pending § 2. ⚠️ **If removal does not cut access immediately, 16b
  must not be built at all.**

## ⚠️ Settled, does not reopen

**`staleTimes` / disabling the client router cache.** Measured at S121 as **49 → 301 ms unthrottled
and 49 → 2,308 ms on Slow 3G**; the branch was deleted by ruling; the stale-data symptom is solved
better by `router.refresh()` after mutations. ⚠️ **A proposal to disable the router cache is a finding
to REJECT, not to evaluate.**

## ⚠️ The TIMING half of the audit needs a quiet system

Any timing taken while migrations, CI runs or a sync worker are active measures those, not the
application. **The September performance diagnosis this audit exists to replace was exactly that kind
of confident wrong number.**

---

# § 4 — PHOTO VIEWER, AND TIMECLOCK LOCATION

[Josh, 2026-10-02] ⚠️ **ITS OWN BUILD.** Two unrelated areas in one document because they were raised
together. **They can ship as separate parts; Part B needs no migration at all.**

## PART A — THE PHOTO VIEWER

### A-1 — Multi-select, with bulk share and delete. Desktop and mobile.

Checkboxes on every photo in the grid. Selected photos can be **shared** or **deleted** together.

#### ⚠️ A-1a — Delete: RULED [Josh, 2026-10-02] — option A

**Owner/Admin only. SOFT delete. Recoverable.**

⚠️ **The reason, recorded so it is not relaxed later:** construction photos are **evidence** —
concealed conditions, water intrusion, defective work — and kept at full resolution for exactly that
reason. **A checkbox column puts "select all → delete" one mis-tap from the photos that matter in a
dispute two years later.** Soft delete and a narrow role are what make the convenience safe.

#### ⚠️⚠️ A-1a-i — THE TRASH MUST BE VISIBLE BEFORE BULK DELETE SHIPS. THIS GATES A-1.

> **[Josh, 2026-10-02]** *"the trash isn't rendering anywhere."*

⚠️ **"Soft delete, recoverable" is FALSE today.** If nothing in the product lists deleted items, a
soft delete and a hard delete are indistinguishable **from the user's side** — the row vanishes and
there is no way back without SQL. **The entire safety argument for choosing option A evaporates.**

**The repo already knows this failure.** `contacts.ts` records it in its own words: a `getTrash()`
reader was added at S158 because *"without it a soft delete was indistinguishable from a hard one from
the user's side — the row vanished and nothing in the product listed it."* ⚠️ **The same gap appears to
exist for photos and files, and Josh says it is missing everywhere.**

**So, in order:**

1. ⚠️ **ESTABLISH THE SCOPE FIRST.** Which entities soft-delete, and which of those have a trash view
   a user can actually reach? Josh said "anywhere", so **check broadly — contacts, files/photos,
   projects, tasks, contacts' addresses — and report the matrix.** It may be one gap or many.
2. **Build the trash view for photos**, with restore.
3. ⚠️ **ONLY THEN ship bulk delete.**

⚠️ **Shipping bulk delete before the trash renders would be shipping a feature whose stated protection
does not exist.** If the build runs out of road, **the trash ships and bulk delete waits** — never the
other way round.

⚠️ **Also establish what already happened:** are there photos (or anything else) soft-deleted today
that nobody can see or restore? **Count them and say so.** That is a live data question, not a design
one.

**Follow the shipped pattern:** a separate `getTrash()`-style reader filtering `is_deleted = true`,
per `CLAUDE.md`'s trash-bin pattern. ⚠️ **Soft delete is enforced in the SERVICE layer, not RLS** —
`RLS does NOT filter is_deleted`. **Bounded, and ordered by the column it is bounded on** — an
unbounded `select('*')` is the M1-03 / M2-06 / M3-05 shape, and `.limit()` without `ORDER BY` is the
other half of that trap.

#### A-1b — Share: three destinations

| destination | surface | what it is |
| --- | --- | --- |
| **Client portal** | both | set `client_visible` on the file |
| **Text / OS share sheet** | mobile only | the existing `shareImages()` |
| **Email, or a share link** | both | see A-1c |

**Client portal** needs no new mechanism. ⚠️ `files_select_client` requires **`client_visible` AND
`is_client_of_project` AND `client_has_full_access()`** — so a documents-only client still sees
nothing, and **the UI must not promise otherwise.**

**Text** on mobile uses `lib/share-image.ts` as it stands. ⚠️ **It shares FILE BYTES and refuses to
fall back to sharing a URL. Do not change that** — see A-1c.

#### ⚠️ A-1c — The share link. RULED [Josh, 2026-10-02].

> *"it can offer to email to an active client portal or to send a link. the link should open on
> ezcontractorbinder.com but not require any sign in or anything. if someone chooses to share the
> link, they can."*

**A deliberately public, unauthenticated link. Anyone holding the URL can open the photo.**

##### ⚠️⚠️ THE DISTINCTION THAT MAKES THIS SAFE — DO NOT COLLAPSE IT

**This is NOT a Supabase signed URL, and the S121 ruling in `lib/share-image.ts` still stands
unchanged.** That ruling refuses to put a signed URL in a share sheet because such a URL is a
*"time-limited bearer credential to a private project file… no login, no RLS, no audit"*, and
**nothing can revoke it once it exists.**

**What Josh ruled is a different object: an APP-ISSUED TOKEN that the application resolves.**

| | Supabase signed URL ❌ | app share link ✅ |
| --- | --- | --- |
| who resolves it | Supabase storage | **the app** |
| can be revoked | **no** | **yes** |
| can be expired early | no | yes |
| scope | the storage object | **one photo** |
| leaves an audit trail | no | **yes** |

⚠️ **The public page NEVER exposes the storage URL.** It streams the bytes through the app, the same
way the thumbnail proxy ruled for S125's finding 4. **A share page that redirects to a signed URL has
handed out the credential and defeated the whole design.**

**Precedent in this repo:** `/sign-co/[token]` and the bid tokens. Follow that shape.

##### What the build must include

- **A share-link record** per link: the file, who created it, when, an expiry, and a revoked-at.
- ⚠️ **A list of active links with a one-click REVOKE.** A link that cannot be turned off is the thing
  that bites. **Not optional, not a later enhancement.**
- **Default expiry: 90 days**, extendable and revocable. ⚠️ **NOT RULED BY JOSH — he must choose.**
- **Log the views.** Who created it and when it was opened. The audit trail is half of what makes this
  better than a signed URL.

##### ⚠️ What the public page MUST NOT SHOW

**The photo, the company's name, and the date. Nothing else.**

⚠️ **No project name. No site address. No client name. No task, note, or description.**

**Why:** the URL is forwardable by design. **A stranger holding it must not learn whose house is being
renovated, where it is, or what is wrong with it.** That is Josh's client's privacy, not Josh's, and it
is the detail most likely to be added later "for context" by someone who has not read this paragraph.

**Decide and state:** whether the shared image is the **marked-up** version when markup exists. The
portal already resolves `display_path` to `<path>.markup.jpg` in that case, and the same reasoning
probably applies — ⚠️ **but a marked-up photo may carry annotations never meant for an outsider. State
the choice; do not inherit it silently.**

### A-2 — Desktop opens straight into markup. Add a button instead.

Viewing and annotating are different intentions, and today one implies the other. **Open in view mode;
markup behind an explicit control.**

### A-3 — Desktop images are too large

> *"1 portrait photo from a cell phone is 2 full screens."*

**Fit the image to the viewport.** ⚠️ **Portrait photos from a phone are the common case, not the edge
case** — size to the available height, not the width.

### A-4 — Desktop single view is missing date, time and who took it

**Mobile already shows it; desktop does not.** Add the same three to the desktop single-image view.
⚠️ **Read how mobile renders them and match it** rather than writing a second formatter — the repo has
been bitten before by two surfaces formatting the same value differently (`captureGps`, S106).

### A-5 — Desktop needs next / previous

Buttons on the single-image view. ⚠️ **Keyboard arrows too** — it costs nothing and it is what anyone
reviewing a day's photos on a desktop will reach for.

⚠️ **S125 finding: the photo viewer RELOADS THE WHOLE GALLERY ON EVERY SWIPE.** Adding next/previous
to desktop multiplies that. **Check it before building, or this feature makes a known defect worse.**

## PART B — TIMECLOCK LOCATION

### ⚠️ B-1 — The location IS already captured. This is a RENDERING gap.

`[VERIFIED]` Every clock event writes `gps_in` / `gps_out` as **jsonb with three states**, built
deliberately at D-34 / S106:

| state | meaning |
| --- | --- |
| **coordinates** | a fix was obtained |
| **a reason** — `permission_denied`, `position_unavailable`, `timeout`, `unsupported`, with the browser's own `error_code` | capture was **attempted and failed** |
| **NULL** | capture was **never attempted** — `gps_clock_mode = 'off'`, or a legacy row |

⚠️ **NO MIGRATION. The data is there and nothing displays it on the review/approve screens.**

**What to render — and the three states must stay distinct:**

- **A fix** → show it, with a link to a map.
- **A failure** → ⚠️ **show the REASON, in plain words.** "Location permission denied" and "no signal
  at the jobsite" are a policy question and a site condition respectively, and **D-34 exists precisely
  so they stop looking alike.** Collapsing them back into "no location" throws away the distinction
  the data was built to carry.
- **NULL** → show nothing. ⚠️ **It means never attempted. It does not mean failed.**

**Show it where hours are reviewed and approved** — both clock-in and clock-out, on the desktop review
screen and the week sheet.

### ⚠️ B-2 — "It asks permission every time." NOT DIAGNOSED.

**Restated:** the browser prompts for location on every clock event rather than once.

⚠️ **Do not start from a theory.** A browser geolocation grant is per-origin and is supposed to
persist, so repeated prompting points at something specific. **Reproduce it first, on the device and
browser where Josh sees it, and say which.**

Worth checking, none of them assertions: whether it happens in the installed PWA, the browser tab, or
both; whether iOS treats a standalone PWA's grant as per-launch; whether the Permissions API could be
queried for existing state instead of calling `getCurrentPosition()` cold; and whether anything in the
app's own flow discards the grant.

⚠️ **Some of this may not be fixable in the app** — if iOS re-prompts per launch for a standalone PWA,
that is OS behaviour. **Say so plainly if that is the finding, rather than shipping a change that does
not help.**

⚠️ **DO NOT WEAKEN `captureGps()` WHILE FIXING THIS.** Its rules are load-bearing: it **never
rejects**, it **never blocks a clock event**, and it **always records a reason** rather than resolving
undefined. A clock-in that fails or stalls because of a location change is far worse than a prompt.

## Order within this build

1. ⚠️ **The trash scope matrix, and the count of anything already soft-deleted and unreachable**
   (A-1a-i). Findings only.
2. **The photo trash view, with restore.**
3. **A-2 through A-5** — small, independent, no migration. Ship early so a restart leaves Josh better
   off.
4. **B-1** — the location render. No migration.
5. **A-1 bulk select**, share to portal and text, and bulk delete. ⚠️ **Gated on 2.**
6. **A-1c the share link** — the largest piece and the only one with a new public surface.
7. **B-2** — investigate, then report before changing anything.

## Still open

- **The share link's default expiry** (90 days proposed, not ruled).
- **Whether a shared photo shows the marked-up version** when markup exists.
- **B-2's cause** — unknown until reproduced.
- **How wide the missing-trash gap is** — unknown until the matrix is built.

---

# § 5 — DAILY LOG, TWO CHANGES

[Josh, 2026-10-02, from the `/m` daily log close-out screen] ⚠️ **ITS OWN BUILD.**

## 1 — The bottom tab bar floats up from the bottom edge

**[Josh]** *"the bar at the bottom raises from the normal position. So far this is the only page that I
have noticed."*

**Observed** on the `/m` daily log close-out screen: the tab row (Projects · Timeclock · camera ·
photos · Chat · Field) sits with a band of empty white below it instead of against the bottom edge.

⚠️ **NOT DIAGNOSED. Do not start from a theory.** The useful narrowing is Josh's own: he has seen it on
this page only, which points at something in **this page's layout** rather than the shared mobile
chrome — otherwise every `/m` screen would do it. **Reproduce it first, then find the cause.**

Things worth checking, none of them assertions: the page's own bottom padding or min-height; a
viewport-unit height interacting with iOS browser chrome; `env(safe-area-inset-bottom)` applied twice;
and whether it appears only **after** a date picker has been opened — the screenshot was taken on a
form full of date fields, and an on-screen picker dismissing can leave a scroll or inset artifact.

⚠️ **Prove the fix at 402px on a real iPhone, not only in a desktop browser's device mode.** The S121
mobile work set that precedent and this is exactly the class of defect device mode misses.

## 2 — Replace box C ("Next two days") with a client-facing photo

**[Josh]** *"remove the contents of box c. The current contents are redundant or useless. Replace it
with 'client facing photo' require at least 1 photo and automatically set it so a client can see it."*

### ⚠️ Box C is not merely redundant — it is WRONG

On the screenshot of 2026-10-02, **both** date fields read **"Oct 2, 2026"** — Tomorrow — Date and Day
after — Date showing *today*, not tomorrow and not the day after. **Recorded because it changes the
reading:** this is a broken field being removed, not a working feature being dropped.

### ⚠️ Removing it has a downstream consumer — CHECK THIS FIRST

`apps/web/lib/daily-logs/daily-log-template.tsx` renders the daily log PDF and its `DailyLogPdfData`
carries **`tasksTomorrow: string | null`**. ⚠️ **If box C feeds that field, deleting the input leaves
the PDF with an empty section** — the half-removal that looks finished on screen and wrong on paper.
**Trace every consumer of box C's fields before removing the inputs.**

⚠️ **Do NOT drop columns that hold live data.** Stop collecting, hide the inputs, and state what
happens to rows already carrying values. A column drop is a separate, later decision.

### RULED [Josh, 2026-10-02]: required, with a stated reason to skip — option B

**The daily log cannot be sent without either at least one client-facing photo, or a one-tap reason for
having none** (inspection day, weather, no site access, or similar).

⚠️ **Why not a hard requirement with no escape.** On a day with no visible progress — waiting on an
inspector, waiting on material, demo already shot — a foreman either cannot close out or **takes a
filler photo to get past the gate. A filler photo reaching a client is worse than no photo**, because
it is the client's evidence of what was done that day. The recorded reason gives Josh the same
guarantee without manufacturing a picture of a wall.

**The chosen reason is stored and appears on the log**, so a day with no client photo still explains
itself.

### ⚠️ The visibility mechanism already exists — no new schema

`[VERIFIED]` `files.client_visible` plus RLS `files_select_client`, which requires **`client_visible`
AND `is_client_of_project` AND `client_has_full_access()`**. The portal already lists client-visible
images through `getPortalPhotos()`, which filters to `image/%`.

**So "automatically visible" means setting `client_visible = true` on that photo's `files` row.**

⚠️ **Two consequences to surface in the UI, not discover later:**

1. **A documents-only client still sees nothing.** `client_has_full_access()` is part of the gate. The
   flag being set does **not** guarantee a given client sees the photo — that depends on the access
   level they were given. **Do not label the control in a way that promises otherwise.**
2. **If the photo is marked up, the client sees the MARKED-UP version**, not the original —
   `display_path` resolves to `<path>.markup.jpg` when `markup_data` exists. Existing portal
   behaviour, almost certainly what is wanted on a progress shot, but it must not surprise anyone.

### Open for the build to decide and state

- **A dedicated photo slot, or a pick from the day's existing photos?** The close-out already requires
  4–5 internal photos. Josh's wording reads as a dedicated slot. ⚠️ **Whichever is built, the
  client-facing photo must be distinguishable from the internal ones** — a crew member must never be
  unsure which pictures the client can see.
- **Does the client photo also appear in the daily log PDF**, and is it marked there as the
  client-facing one?
- **More than one allowed?** "At least 1" sets a floor, not a ceiling.

---

# § 6 — WORKING CALENDAR, STANDARD HOLIDAYS

[Josh, 2026-10-01] A Critical Path follow-on, raised against the shipped Working Calendar tab
(Company Settings → Working Calendar), which S122 Part 1 delivered with working days and a
date-plus-name holiday form.

## The request

[Josh] *"this should have a checkbox for standard bank holidays"* — then, on seeing the first design:
⚠️ *"these holidays must update each year. that makes setting a date and manually labeling a holiday
risky."*

**That second remark is the governing constraint and it overturned the first design.**

## ⚠️ Why a stored date is the wrong shape

A row reading `2026-05-25 / Memorial Day` is correct for exactly one year. In May 2027 the schedule
counts that day as a working day, every Critical Path finish date is a day early, and **nothing on
screen explains why.** A quietly wrong date is worse than a missing feature — a client may be shown a
projected finish.

**The standard holidays are therefore stored as RULES, resolved per year.** Two kinds:

| kind | example | stored as |
| --- | --- | --- |
| fixed date | Independence Day | month + day |
| nth weekday | Memorial Day | last Monday of May |

## RULED — which holidays [Josh: option A, 2026-10-01]

**Seven, the construction-standard set — not the eleven federal ones.**

1. New Year's Day — Jan 1
2. Memorial Day — last Monday in May
3. Independence Day — Jul 4
4. Labor Day — first Monday in September
5. Thanksgiving — fourth Thursday in November
6. Day after Thanksgiving — the Friday following
7. Christmas Day — Dec 25

⚠️ **DELIBERATELY EXCLUDED: MLK Day, Presidents' Day, Juneteenth, Columbus Day, Veterans Day.** Banks
close for those; most GC crews work them. Recorded so nobody "completes the list" later.

**The reasoning, because the asymmetry is not obvious.** A *missing* holiday makes the finish date too
early, so a client is promised a date that gets missed. An *extra* holiday makes it too late, which is
the safer error — **but only until someone notices the schedule says the crew is off on a day they are
framing, and then the Critical Path tab stops being believed.** Distrust is the worse outcome, so the
default is the set that is right without editing for the most companies.

A company that does close on Veterans Day adds it. ⚠️ **That is why per-holiday control is required,
not a single all-or-nothing switch.**

## The screen

**The Holidays section becomes two parts.**

### 1. Standard holidays — seven named rules, each with its own checkbox

- Each row names the holiday **and shows the date it resolves to for the current year**, so the user
  can see exactly what ticking it does.
- ⚠️ **Unticking is not deleting.** The row stays, visibly off. A deleted row is a decision nobody can
  see a year later; an unticked one explains itself.
- Default when Critical Path is first turned on for a company: ⚠️ **NOT RULED — all seven on, or all
  seven off.** On is the better default if the finish date should err late; off is the better default
  if nothing should silently change a company's dates.

### 2. Other closures — the existing date-and-name form, unchanged

For genuine one-offs: a hurricane day, a client site shutdown, a company event. ⚠️ **Holidays already
entered by hand stay here as one-offs.** They are not migrated into rules and not deleted.

## ⚠️ Weekend observance — ruled by default, flag if wrong

When a fixed-date holiday falls on a day the company does not work, **nothing happens and nothing
needs to.** Jul 4 on a Saturday costs a Monday-to-Friday company no working day, so no shift is
computed.

⚠️ **The shift only matters for a company that works Saturdays.** For them the default is: **the
holiday removes its actual calendar date and nothing else.** If they want the Friday or Monday instead,
they add it as a one-off closure.

**Do not build a general observance-shift engine.** It is a rule most users never hit, and getting it
subtly wrong moves dates for everyone.

## ⚠️ Ticking a holiday moves live finish dates

The working calendar is a **recompute trigger** — Q9, and the gap found around project start dates. On
a company with active Critical Path jobs, **ticking a standard holiday re-dates every one of them at
once.**

⚠️ **It must state the consequence before it applies**, the same way a drag does under Q19: how many
projects are affected and how far each finish moves. **A settings screen that silently re-dates every
live job is the worst version of this feature.**

## What this needs

- A rule representation on the holidays table (kind, month, day, weekday, ordinal) **or** a second
  table beside the existing one. ⚠️ **Decide which; do not overload the date column with a sentinel.**
- Year resolution in the engine's calendar lookup, not in the UI — ⚠️ **the engine is the only thing
  that may decide whether a day is worked.** A UI that resolves dates itself is a second source of
  truth.
- The seven rules seeded as company-scoped rows, per the standard per-tenant pattern.
- The preview described above.

---

# § 7 — ⚠️ PAYROLL DEFECT: a segment-type change leaves an approved day approved

**Found 2026-10-02 by S124, outside its build. Not fixed. Not yet in `TECH_DEBT.md`.**

## What happens

**An Owner or Admin changes ONLY a segment's TYPE on an approved day — work ↔ break — and the day
stays approved, even though the PAID hours change.**

## ⚠️ Why this matters: it is the same hole S122 Part 0-B-4 closed, through a different door

Part 0-B-4 (`1c7684b9`) made an **hours** change on an approved day return it to pending **on every
path**, audited, with one shared "Hours changed" notice. The principle it established: **paid hours
cannot change on an approved day without that day going back for approval.**

⚠️ **A work ↔ break change does not touch the clock times — so it does not look like an hours change —
but it changes what is PAID.** Breaks are paid or unpaid per `companies.breaks_paid` /
`paid_break_cap_minutes`. **Flipping a segment's type can move paid hours without tripping the guard
built to catch exactly that.**

⚠️ **Approval is what authorises payroll.** A day that stays approved while its paid total moves is a
day somebody is paid from without anyone re-approving the number.

## What a fix has to do

- **Treat a segment-type change on an approved day exactly as 0-B-4 treats an hours change:** return
  the day to pending, on **every** path that can change a type.
- ⚠️ **Find every path first.** 0-B-4's lesson was that one path reopened the day and another did not —
  "two paths, two rules, one dataset." **Enumerate them before changing any.**
- **Audit it**, and reuse 0-B-4's existing notice rather than adding a second one.
- **Negative test per excluded role**, written without returning rows, with its own sabotage that must
  go red.

## ⚠️ Before fixing, establish whether it has already happened

**Count the approved days on production whose segment types were changed after approval.** If any
exist, their paid totals may differ from what was approved. ⚠️ **That is a payroll question for Josh,
not something to correct silently.**

## Sequencing

⚠️ **Payroll authority — stop-rule territory. It needs its own ruling from Josh before anyone changes
behaviour**, the same way 0-B-4 did.

**Small. It fits naturally alongside the next timesheet work** rather than needing a session of its
own — but it must not be folded into a build whose own scope could crowd it out.

---

# § 8 — CI CONVENTIONS — standing, for every session

[Josh, 2026-10-02] *"it seems a lot of the CIs being run could be cut in half. future prompts should
consolidate."*

⚠️ **Include this in every build prompt from here on.**

## The observation

**Every part currently costs TWO runs at ~50 minutes each:**

| run | what it tests |
| --- | --- |
| the **branch** run | the code |
| the **`main`** run, triggered automatically by the merge | **usually the identical tree, again** |

Observed 2026-10-02: S124 Part 0 → CI #617 (branch, 52m) then #618 (main, 46m). Part 2 → #619
(branch, 50m) then #620 (main). S123 D-1 → #615 then #616. **Roughly an hour of waiting per part, half
of it re-testing bytes already proven green.**

⚠️ **And the redundant run is the one that CAUSES COLLISIONS.** Build C's first failure mode is "a
branch run started near a merge collides by default" — **the thing it collides with is the merge run.**
Removing the redundant run removes that collision class with it.

## ⚠️ VERIFY THIS FIRST, ONCE, BEFORE ADOPTING

**Does branch protection on `main` require a passing status check?**

- **If it does**, a merge commit cannot carry `[skip ci]` and rule 1 does not apply. Say so and fall
  back to rule 2.
- **If it does not**, rule 1 applies.

⚠️ **Verify it; do not assume either way.** State the answer in the report so the next session does not
re-litigate it.

## Rule 1 — a merge to `main` carries `[skip ci]` when TREE IDENTITY IS PROVEN

**The proof** (S123 used it as a merge condition): show that the merge commit's tree is byte-identical
to the commit CI tested, e.g. `git diff --name-only <tested> <merge-head>` returning nothing outside
`docs/`.

- **Tree identical → the main run tests the same bytes. Merge with `[skip ci]`, and state the proof in
  the report.**
- ⚠️ **Tree NOT identical — a real merge resolving conflicts, or anything changed after CI — the main
  run is REQUIRED. Run it.**

⚠️ **The exemption is the PROOF, not the convention.** A merge skipping CI without the identity proof
printed is exactly the "clean pass that proved nothing" failure this project keeps finding. **No proof,
no skip.**

## Rule 2 — stack, within the existing limits

One run on a stacked head tests the whole stack. S123 did this: D-2 → D-3 → D-1, one run on the stacked
head (#615) covering all three.

**The limits stay as they are:**
- ⚠️ **Never stack migration-carrying work with work that carries none.**
- ⚠️ **Two deep, no more.**
- ⚠️ **A part still ships whole or not at all** — stacking changes when CI runs, never what "done"
  means.

## Rule 3 — docs and report commits never trigger CI

Already the practice: `[skip ci]` on every docs-only commit. ⚠️ **Keep it, and keep committing often —
the Codespace has timed out five times in three days.** Frequent commits cost nothing when they skip
CI.

## What this does NOT address

⚠️ **A run still takes 34–55 minutes.** That is Build C's territory — the shared rebuild-test database,
fixture collisions, connection exhaustion, and whatever makes the suite itself slow. **These
conventions reduce the NUMBER of runs; they do not make a run faster.**

---

# § 9 — BUILD F: project overview, job-details block

[Josh, 2026-10-01] Touches `projects`, `estimates`, `contacts`, `project_financials` and the
estimate→project conversion RPC.

**Verified before anything was spec'd:** the site address already exists
(`projects.contact_address_id`, with RLS deciding visibility); contract type already exists
(`projects.project_type`); the mobile overview already renders both — ⚠️ **confirm which overview page
is in scope**; `building_dept` is **already** a contact type (seven values — ⚠️ **do not narrow the
mobile "All" filter**); ⚠️ **`projects.contract_value` DOES NOT EXIST**, it lives in
`project_financials`; ⚠️ **a project can be created WITHOUT an estimate.**

**Already columns, no migration:** address · contract type · client · start / target completion /
actual end · retainage % (⚠️ **optional — no UI may imply it is required**) · source estimate.
**Project number is already on the page.** ⚠️ **Critical Path now computes `start_date` and
`target_end_date` — this block must not become a second write path to them.**

**Net-new:**
- **F-1** `projects.legal_description` (⚠️ **verify it actually landed**).
- **F-2** ⚠️ **contract-type details are MONEY — the cost-plus fee percentage and T&M rate basis go on
  `project_financials`, NOT `projects`**, or they ship in the payload to every foreman (`#136`).
- **F-3** `projects.building_dept_contact_id` — ⚠️ **a second FK**, plus a website field (⚠️
  **unverified whether `contacts.website` exists**).
- **F-4** ⚠️ **a "permit required" checkbox on BOTH the estimate Details tab AND the new-project
  form** — it distinguishes *no permit needed* from *permit not pulled yet*.
- **F-5** ⚠️ **`convert_estimate_to_project` must be amended** — it does not copy `start_date`,
  `target_end_date` or `retainage_percent`, so the permit checkbox is useless without it.

---

# § 10 — BUILD C: CI serialization

⚠️ **TWO distinct failure modes share one root cause — every CI run uses the single rebuild-test
database.**

**1 — Fixture collision.** Every merge to `main` triggers its own run, so a branch run started near a
merge collides by default. Cost ~3 hours on 2026-09-30. ⚠️ **`main` can carry a red badge from a
collision rather than a defect.**

**2 — Connection exhaustion.** ⚠️ **rebuild-test can run out of connections and red a run that has the
database entirely to itself** — 03:18Z on 2026-10-01, no overlapping run. **Check timestamps before
calling a red a collision.**

**The cost nobody has measured:** a migration cannot be applied to rebuild-test while CI is using it,
so database work queues behind CI runs at **34–55 minutes each**. That is the dominant cost of every
build and it is invisible in any single session's report.

---

# § 11 — `feature/s114-c5-multi-upload` — audit, then merge or discard

⚠️ **RULED [Josh, 2026-10-02]:** *"this should be merged. im guessing it will need an audit since a lot
of code has been built since it was first made."*

**The only branch carrying code not on `main`**, kept through three branch audits at `6409738e`.
⚠️ **It was REVERTED once and S121 carried a stop rule naming it** — *"whose original revert reason
still applies."* **Nobody has established whether that reason still holds.** Find the revert, quote the
reason, test it against today's `main`, then merge, rebuild or discard.

⚠️ **Discard is a legitimate outcome** — a merge for its own sake reintroduces whatever caused it.

---

# § 12 — CLOSED, NOT BUILT — recorded so it is not re-raised

**`NEXT_PUBLIC_APP_URL` capitalization.** ⚠️ **RULED [Josh, 2026-10-02]: NO CHANGE** — *"its working as
is."* Recorded only so a future session does not "fix" a working configuration; note that anything else
comparing that URL as an exact, case-sensitive string would hit the same wall.