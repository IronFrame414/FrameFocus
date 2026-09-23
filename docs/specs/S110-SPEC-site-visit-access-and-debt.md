# S110 — SPEC (skeleton) — site-visit access, desktop path, and carried debt

**Status: INCOMPLETE. This is a scaffold, not a spec.**

**RULED** = settled by Josh. **FILL-n** = CC measures and fills in place. **ASK-n** = Phase 2.

⚠️ **A FILL you cannot fill must say why, in one line. Never delete a marker.**
⚠️ **If a measurement contradicts a RULED line, STOP and report — do not reconcile it.**
⚠️ **Section A overturns rulings that are enforced in the DATABASE and shipped to production on
2026-09-23. Read `docs/sessions/S108-report.md` Step 5 before touching it.**

---

## Why these together

Section A is a ruling change Josh made after using the site-visit feature on a real job. Everything
after it is debt carried out of S109, plus two defects found in the S109 click-test. A is the
largest and riskiest; it goes last so nothing else is in flight on the same surfaces.

**FILL-0** — `main`'s tip, the branch, whether the tree is clean. Confirm `20261700000000` and
`20261710000000` are on production and that `main` carries the S109 merge and the photo-regression
fix (`fd5a1a5a`).

---

# SECTION A — site-visit access, rewritten [RULING CHANGE]

## What is deployed today, and is being changed

`20261690000000_site_visit_freeze_at_send.sql` (on production since 2026-09-23):

- `site_visit_access()` drops the office arm past `draft`/`review`.
- `enforce_site_visit_freeze()` BEFORE INSERT **or** UPDATE on all four `site_visit_*` tables,
  **service role included**. After send, nothing may be written at all.
- S108 ASK-A8: at **promotion** the recorder loses every write.
- The SELECT policies give a crew member only the rows **they created**.

> Superseded, quoted rather than deleted — S108's rule was: *"the freeze drops the office arm past
> draft/review … DELETE deliberately untriggered … an unresolved blocker after send stays open,
> permanently."*

## RULED [Josh, 2026-09-23]

⚠️ **Three changes, and the third is the one that breaks the current trigger's shape.**

1. **Read and edit widen to any internal employee.** Owner, admin, project manager, foreman and
   crew may read the site-visit notes, measurements, blockers and photos of **any** site visit in
   their company, and edit them, while the estimate is `site_visit`, `draft` or `review`.
   **Never subcontractors. Never clients.**
2. **The lock is at SEND, not at promotion.** A recorder does not lose anything at promotion any
   more. The estimate becoming a draft changes nothing about who may write.
3. ⚠️ **The lock covers only the material that existed at the moment of send. ADDING stays open at
   every status, including after send.** A note, measurement, blocker, photo or voice note added
   after a send is new material and is not retroactively frozen.

**FILL-A.1** — ⚠️ **The freeze predicate.** The current trigger is status-based; the ruling is
time-based. Measure whether `estimates.sent_at` is a reliable cutoff: is it set once on first send,
or rewritten on resend, void-and-reissue, or a status change back and forth? Name every writer of
`estimates.sent_at`. **If it is rewritten, a row frozen yesterday could thaw** — state that plainly
and propose the alternative (a per-row `frozen_at` stamped by the send path, or a
`site_visits.frozen_at`).

**FILL-A.2** — Rewrite the trigger. It must permit INSERT always and refuse UPDATE/DELETE of a row
that predates the send. ⚠️ **The service-role arm was deliberate — S108 proved it refuses a
service-role write. State whether it stays.**

**FILL-A.3** — ⚠️ **Rows created AFTER a send: who may edit them, and until when?** The ruling says
they are not frozen. Say whether they freeze on a later send, never, or on some other event. This
is not stated in the ruling; propose and mark it **ASK-A.C**.

**FILL-A.4** — The SELECT policies. Widening read to every internal employee changes four policies.
⚠️ **Confirm against the Financial Visibility Floor that no `site_visit_*` table carries a money
column and that nothing joins one to `estimates` in a way that ships a figure.** S108's live test
asserted "no money key on any row" — extend it rather than replace it.

**FILL-A.5** — ⚠️ **Photos are `files` rows, OUTSIDE the four tables.** The freeze trigger has never
covered them, and the files route refuses uploads to a non-draft estimate. Ruling 3 says adding
must work after send. State exactly what the files route does today for a sent estimate and what it
must do. **This is a route change, and the route is the only access control — see
`s107-estimate-files-route-order.test.ts`, which must be EXTENDED, not replaced.**

**FILL-A.6** — `visitEraPhotos()` cuts at `promoted_at` (S108 ruling 4). If material may be added
after send, state what the Site Visit tab shows and how it distinguishes what was found on site
from what was added later. ⚠️ **Do not silently widen the cutoff** — quote the superseded ruling.

**FILL-A.7** — Every live test that encodes the behaviour being overturned. `s108-site-visit.live.ts`
is 29 cases and several assert refusals that must now succeed. **Invert them in place with the
superseded assertion quoted. Do not delete a test.**

**FILL-A.8** — Production row counts for any new constraint, and the count of `site_visit_*` rows on
estimates past `review`. **Give Josh the query.**

**ASK-A.A** — Should read really be company-wide for foreman and crew, or scoped to the recorder
plus the office? Josh said "any employee"; state the exposure it creates and let him confirm.

**ASK-A.B** — After send, may any employee add, or only the recorder and the office?

**ASK-A.C** — On FILL-A.3: when, if ever, does a post-send addition itself freeze?

---

# SECTION B — a desktop path to site visits

## What exists today
A record page at `/dashboard/estimates/site-visits/[id]`, and a panel of open visits above the
Estimates list. **There is no navigation entry and no list.** Josh: *"there is no path to access
site visit on desktop."*

## RULED [Josh]
- A site visit must be reachable on desktop without knowing a URL.

**FILL-B.1** — Where it belongs in the desktop navigation, measured against how the sidebar is
built today. A top-level entry, a child of Estimates, or a tab on the Estimates page.

**FILL-B.2** — What the list shows and who may see it. ⚠️ **It must respect Section A's read
rule** — build B after A, or state the dependency.

**ASK-B.A** — ⚠️ **May a site visit be CREATED from the desktop?** Recording is mobile-only by
design (S108). Creating at a computer is new capability, not a missing link. Josh decides.

---

# SECTION C — the mobile path to `/m/account`

`/m/account` works when typed and **nothing links to it** — the same defect `#162` was filed for,
one level down. Josh found it on the installed PWA.

**FILL-C.1** — Where the `/m` navigation would put it, and why it is not there now. CC's S109 report
claims a Settings link reading *"Your name and password →"* was built. ⚠️ **Verify that claim
against the tree; if the link exists, find why it is unreachable in the installed app rather than
adding a second one.**

**RULED** — Every internal employee and every subcontractor must reach it from inside `/m`.

---

# SECTION D — S109 click-test defects

**D1 — no reorder for the rows inside a line item.** S108 built drag handles on line **items**.
`estimate_line_rows` carries `sort_order` and never got a handle, so the four rows inside a line
cannot be reordered.

**FILL-D1** — Whether `reorder_estimate_lines()` can carry rows or a second RPC is owed; whether
the containment trigger governs a row move the same way it governs a line move.

**D2 — clicking a drag grip does not focus it.** Tab-then-arrow works; click-then-arrow does
nothing. ⚠️ **CC's `e2e/desktop-row-activation-s109.spec.ts` T2 asserts "handle focused" after a
click and passes.** Measure how the test focuses the handle versus what a real click does. **This
is the campaign's named failure class; name it in the report.**

---

# SECTION E — carried from S109

**E1 — `/reset-password` accepts any live session with no current password.** It must keep working
for the emailed recovery link, whose user does not know the password. **ASK-E.A**: how the two are
told apart — the JWT's `amr` recovery method, or another mechanism CC measures. ⚠️ **Getting this
wrong breaks the only recovery path on production.**

**E2 — catalog rows.** The vendor `product_url` link sits on the item name while the rest of the row
opens Edit, so one row has two destinations. **ASK-E.B**: move the vendor link to its own control,
or leave it.

**E3 — `#161`'s remaining file-sheet sites**, listed by name in its `TECH_DEBT.md` status line:
lien releases, contract and lien templates, delivery photos, receipts, **the client portal**,
signing activity, the PO PDF. ⚠️ **The portal is client-facing — state what a client may reach
through a sheet that they could not reach before.**

**E4 — `#1-deliv`.** Closable now that its classification is recorded, or does the Stripe
event-shape gap keep it open? **ASK-E.C** — Josh's call.

---

# SECTION F — the regression guard

On 2026-09-23 the `#161` change removed `url` from the estimate files list response.
`site-visit-record.tsx` read that field, so every site-visit photo and voice-note player went blank
on production. CC's own account: its search for consumers of that route was **truncated by
`head -10`, and this file was the eleventh hit.** Its new test then asserted the list carries no
`url`, locking the break in.

**RULED** — A change to a route's response contract must not be able to break a consumer silently
again.

**FILL-F.1** — Propose the guard and measure it. The repo already uses an **explicit allowlist**
for this shape (the migrations that restate `notifications_type_check`, `s123-still-clocked-in`):
a test naming every consumer of the estimate files route, which fails when a new one appears.
⚠️ **A guard that passes today and could never fail is worthless — prove it fires by adding a
consumer.**

**FILL-F.2** — Whether any other route in the app has more than one consumer and a recently changed
response shape. ⚠️ **Do not truncate the search. State the command and the full result count.**

---

# SECTION G — Josh's items, listed so they are not lost

CC prepares; **CC executes none of these.**

**FILL-G.1** — `SCHEMA_DRIFT_COMPANY_ID` is unset in Vercel, so the daily drift cron notifies nobody.
Give Josh the production query for the company id and the exact variable to set.

**FILL-G.2** — The seed script reports Company B slug drift: live `ridgeline-builders-test-co-2`,
expected `ridgeline-test-co-2`. It matched by name. State the risk and the one-line fix.

**FILL-G.3** — The S108 EST-107 query was never run. Restate it for Josh, and say what a NULL
`promoted_at` on a `draft` row would mean.

**Also outstanding, no work owed here:** the two Resend keys exposed in the S103 transcript
(deferred seven times); QuickBooks production connect (Vercel has no `QBO_*`); the three old
production tenants `bishop-contracting`, `test-const`, `bis-contracting`; a real-jobsite site-visit
test; iOS print from the file sheet.

---

# SECTION H — language: a per-user setting, `/m` in Spanish, and reading what the crew wrote

Josh has Spanish-speaking field staff. Today they navigate an English app and type Spanish that he
cannot read. `#158` in `TECH_DEBT_IDEAS.md` filed this as a deferred decision in S108; this section
is the decision.

## RULED [Josh, 2026-09-23]

1. **A language toggle in account settings**, per user, on both `/dashboard/account` and
   `/m/account`. A worker's account is set to Spanish and stays that way.
2. ⚠️ **System text is translated on `/m` ONLY, for now.** `/dashboard` chrome stays English.
   The whole product is a later campaign; do not start it here.
3. ⚠️ **User-entered text is translated for the READER, wherever it is displayed — `/m` AND
   `/dashboard`.** A crew member types Spanish; Josh opens the same record on a desktop and reads
   English. **This is the point of the section**; a `/m`-only translation of user content would
   deliver none of the value.
4. **Spanish and English only.** Do not build a general locale framework for languages nobody has.
5. ⚠️ **EVERYTHING CLIENT-FACING IS ENGLISH.** Proposals, contracts, lien releases, invoices, the
   client portal and every outbound client email render in English and are never translated, and
   never localise to a viewer's setting. A machine-translated contract is a legal instrument nobody
   reviewed. **This is a hard boundary, not a default.**

**FILL-H.1** — Whether ANY i18n mechanism exists in the tree today (`grep` for `i18n`, `intl`,
`locale`, `t(`). ⚠️ **State the command and the full count — do not truncate.** Expect none; say so
plainly if so, because it makes this new infrastructure rather than an extension.

**FILL-H.2** — Every user-facing string under `app/m/` and the components it mounts, counted.
⚠️ **`SiteVisitRecord` is mounted by BOTH `/m` and two desktop pages** (S109 measured this). A
component shared across surfaces cannot read a surface-level locale — state how it resolves the
reader's language instead.

**FILL-H.3** — ⚠️ **Which stored text counts as "user-entered".** Name every field, table by table:
site-visit notes, measurements' labels, blockers, voice-note transcripts, chat messages, punch
items, daily logs, change-order descriptions, estimate line names, internal notes. **For each, say
whether a reader outside the company could ever see it** — that decides whether a translation is an
internal convenience or something client-facing.

**FILL-H.4** — ⚠️ **Where translation happens, and what is stored.** Two shapes, and the cost and
correctness differ:
- **on write** — translate once at save, store both, read is free, but a later model improvement
  never reaches old rows and every save costs money even if nobody reads it;
- **on read** — translate per viewer, cache the result keyed by source text and target language, so
  cost follows actual reading.
Measure both against real row counts and propose one. ⚠️ **The ORIGINAL IS NEVER OVERWRITTEN** —
this follows S108's voice ruling, which keeps `transcript_machine` beside the editable `transcript`
and keeps the spoken language at capture.

**FILL-H.5** — The voice interaction, stated: a Spanish voice note already transcribes to Spanish by
ruling. Translation sits ON TOP of the transcript and does not change transcription. Confirm the
S108 assertion that no `language` parameter and no `/audio/translations` call is ever used.

**FILL-H.6** — Cost. Per the Module 3H rule: log to an `ai_*_logs` table, log the requested model,
write a cost row **on failure too**. Estimate monthly cost from real `/m` row volumes, not guesses.
⚠️ **Do not assert a price you did not read from OpenAI's current pricing page; say so if unread.**

**FILL-H.7** — ⚠️ **A guard against rot.** Every new `/m` screen will add English strings unless
something stops it. Propose the mechanism and **prove it fires by adding a hardcoded string.**
A guard that cannot fail is worthless.

**FILL-H.8** — What a Spanish-speaking user sees when translation fails or is pending: the original,
never a blank. State it for each surface.

**FILL-H.9** — ⚠️ **The residual case RULED line 5 does not settle, and it is a real one.** A crew
member types Spanish into a field that later appears on a CLIENT-FACING document — an estimate line
name, a scope note that flows to a proposal, a change-order description. The document must be
English, and the stored text is Spanish.

Name every field where that can happen. Then state the three candidate behaviours and propose one:
the document prints the Spanish as typed; the document prints a machine translation; or the app
refuses to send until a person supplies English. ⚠️ **Do not choose silently — this decides whether
a machine translation can reach a client's contract, which RULED line 5 exists to prevent.**
Mark it **ASK-H.D**.

**ASK-H.B** — Is the original always shown beside the translation, or only on request?

**ASK-H.C** — On FILL-H.4: translate on write and store, or translate on read and cache.

**ASK-H.D** — On FILL-H.9: what a client-facing document does with Spanish source text.

---

# Cross-cutting

**FILL-X.1** — Every migration this spec requires, with purpose and a **production** row count for
any new constraint. ⚠️ **Rebuild-test only. Josh applies to production, attended, BEFORE the merge**
— a merge to `main` deploys.

**FILL-X.2** — Build order, with dependencies stated. C, D and E are independent. B depends on A's
read rule. F should land early so it guards the rest. ⚠️ **H comes last** — `SiteVisitRecord` is one
component on three pages and Section A rewrites it, so translating its strings first means doing
the work twice.

## Standing constraints
Branch from `main`, commit path-scoped, never `git add -A`, push after every commit. Migrations
rebuild-test only; verify the CLI link first; never MCP `apply_migration`. `next build` must pass —
type-check alone is not enough. Read the printed exit line, never a wrapper's echo. A test that
passes on zero rows is a failure. Nothing touches production.

---

# AUDIT — before the build

1. Every FILL filled or one line why not; every ASK ruled with the alternative it beat.
2. No measurement contradicts a RULED line, and each superseded ruling is quoted, not deleted.
3. ⚠️ **Section A is proven by sabotage on the UI half and by paired controls on the database
   half** — every refusal sits beside a case that must succeed, so no refusal passes vacuously.
4. ⚠️ **A crew member still reads no money.** The S108 assertion is extended, not replaced.
5. ⚠️ **Section F's guard is proven to fire.**
6. Every migration named, with its production row count.
7. Every test that encoded overturned behaviour is inverted in place, none deleted.
8. ⚠️ **Section H: a test proves no client-facing document, email or portal page can render a
   translation, and it fails when that is made possible.** RULED line 5 is worth nothing if only
   the code says it.
9. ⚠️ **Section H's anti-rot guard is proven to fire** by adding a hardcoded `/m` string.