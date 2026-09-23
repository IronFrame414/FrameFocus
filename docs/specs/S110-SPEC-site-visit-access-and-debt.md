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

> **FILLED-0 [S110 Phase 1].** `main` = `origin/main` = **`8bce4311`** (`git rev-parse --short
> main origin/main` after `git fetch`). Tree clean at session start (`git status --short | wc -l`
> → 0). Branch **`feature/s110-site-visit-access`**, cut from `8bce4311`. `git merge-base
> --is-ancestor` confirms both **`d0e282e1`** (the S109 merge) and **`fd5a1a5a`** (the photo fix)
> are in `main`. CLI link: `supabase/.temp/linked-project.json` → `nmyphyhmfttxkdoposvf`
> (rebuild-test). **Production NOT measured by CC, and why:** `scripts/live-sql.mjs` refuses every
> ref but rebuild-test by design and the MCP is pinned to rebuild-test. On **rebuild-test**,
> `supabase_migrations.schema_migrations` holds `20261690000000`, `20261700000000`,
> `20261710000000` (3 of 3). For production the session prompt records "verified by object"; Josh
> can re-check with
> `select version from supabase_migrations.schema_migrations where version in ('20261700000000','20261710000000');` → 2 rows.

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

> **FILLED-A.1.** ⚠️ **`estimates.sent_at` is NOT a reliable cutoff — not because it is
> rewritten, but because a sent estimate can have NONE.**
>
> **Every writer, measured.** App code — `grep -rn "sent_at\s*[:=]" app lib components` (12
> hits, 3 on `estimates`): `app/api/proposals/send/route.ts:213`, `lib/services/estimates-client.ts:691`
> (Mark as Sent, draft only), `:774` (approve-and-send, review only). All three write `sent_at`
> in the SAME UPDATE as `status: 'sent'`. `app/api/proposals/resend/route.ts` reads `sent_at`
> (`:60`, `:136`) and **does not write it**. Database — `pg_proc` bodies containing `sent_at`
> on rebuild-test: **2** (`client_proposals`, read-only; `enforce_estimate_immutability`).
> Void-and-reissue does not mention it: the reissue is a NEW estimate with no `site_visits` row.
>
> **Once set, it cannot move.** `enforce_estimate_immutability` (latest body,
> `20261650000000` §3) keeps `sent_at` OUT of its allowlist, so any change past draft/review
> raises, and a sent estimate can never return to draft/review. **No thaw from rewriting.**
>
> **But it can be absent.** The same trigger lets `draft → accepted` (and any status) through
> when OLD is draft/review, and `signing-service.ts:258` writes `status: 'accepted'`. On
> rebuild-test **14 of 21** estimates past review have `sent_at IS NULL` (accepted 10/10,
> converted 3/7, voided 1/2, sent 0/2). **A predicate keyed on `sent_at` would treat every one of
> those as never sent, and their whole record would be editable.** That is the thaw, by a
> different road.
>
> **Proposal: `site_visits.frozen_at timestamptz`, stamped by the DATABASE, not by a send path.**
> An `AFTER UPDATE OF status ON estimates` trigger: when OLD.status ∈ {site_visit, draft, review}
> and NEW.status ∉ that set, `UPDATE site_visits SET frozen_at = coalesce(frozen_at, now())`.
> Keyed on the transition itself, so it fires for Send, Mark as Sent, approve-and-send, a direct
> acceptance, and any writer added later — no app path can forget it. Set once (`coalesce`).
> **Backfill:** every visit on an estimate already past review gets `frozen_at = now()` at
> migration time — deliberately NOT `sent_at`, so nothing that is frozen today can thaw (see
> FILL-A.8 for the count that would make the difference).

**FILL-A.2** — Rewrite the trigger. It must permit INSERT always and refuse UPDATE/DELETE of a row
that predates the send. ⚠️ **The service-role arm was deliberate — S108 proved it refuses a
service-role write. State whether it stays.**

> **FILLED-A.2.** `enforce_site_visit_freeze()` rewritten, still `BEFORE INSERT OR UPDATE` on
> all four tables, still `SECURITY DEFINER`:
>
> | op | rule |
> | --- | --- |
> | INSERT | **always admitted**, at every status (ruling 3). `NEW.created_at := now()` is forced, so a row cannot be backdated to look like pre-send evidence (no RPC sets it today; the service-role voice insert could). |
> | UPDATE, row with `OLD.created_at > frozen_at`, or `frozen_at IS NULL` | admitted (subject to ASK-A.C) — `created_at` itself may never change, so a post-send row cannot be backdated into the frozen set either. |
> | UPDATE, row with `OLD.created_at <= frozen_at` | refused 42501 — **except** the two shapes admitted today (an FK moving TO NULL by `ON DELETE SET NULL`) **plus one new one**: `site_visits.frozen_at` being stamped by the estimates trigger. |
> | soft DELETE | is an UPDATE of `is_deleted` → same rule. Hard DELETE stays untriggered (cascades), unchanged. |
>
> Frozen-ness is judged on `OLD.created_at` against the visit's `frozen_at`, read inside the
> trigger — not on the estimate's status. **The service-role arm STAYS**: the trigger ignores
> the caller's role, exactly as S108 built it, so `s108` 4.5d keeps its meaning (the service role
> is refused on a pre-send row) and gains a pair (the service role may INSERT after send).
>
> `site_visit_access()` also changes (ASK-A.A), and it is the gate every RPC and both voice
> routes consult. Proposed shape: it returns `'office'` (owner/admin/PM) or `'staff'`
> (foreman/crew) for any visit in the company, at every status — "may add" — and the per-row
> "may edit" is the trigger's `created_at` vs `frozen_at` test. The RPCs keep the
> `site_visit`-only guards they have for the header, finish, abandon and promote, which are
> about the visit, not the material.
>
> **One adjacent edge, proposed rather than decided:** a transcription still `pending` at the
> moment of send is refused today (S108 "known edges"), and would be refused under this rule too
> (the row predates `frozen_at`). Proposed: admit a service-role UPDATE that only moves
> `transcript_status` from `pending` and writes `transcript_machine / transcript /
> transcript_language / transcript_model / transcript_error / transcribed_at` — it records audio
> that existed at send, it does not edit evidence. **Folded into Q-A.C for Josh.**

**FILL-A.3** — ⚠️ **Rows created AFTER a send: who may edit them, and until when?** The ruling says
they are not frozen. Say whether they freeze on a later send, never, or on some other event. This
is not stated in the ruling; propose and mark it **ASK-A.C**.

> **FILLED-A.3.** There is **no "later send"** to hang it on: an estimate is sent once
> (`enforce_estimate_immutability` forbids returning to draft/review), Resend re-emails without
> touching status or `sent_at`, and a reissue is a different estimate with no visit. So the real
> choices are:
>
> - **(a) never** — a post-send addition stays editable forever by whoever may edit. Simplest;
>   but then the post-send material is never evidence, which is the reason the freeze exists.
> - **(b) the estimate's OUTCOME** — `frozen_at` moves forward (not `coalesce`) when the estimate
>   reaches `accepted`, `declined`, `expired` or `voided`. Everything that existed at that moment
>   freezes; anything added later is again open. Same mechanism, same trigger, one more
>   transition. `viewed` is deliberately NOT an event — it fires when the client opens the email,
>   which nobody on the crew controls or sees.
> - **(c) a correction window** — each post-send row is editable for N hours after creation.
>
> **Recommended: (b).** It is the ruling's own principle ("the lock covers the material that
> existed at the moment of X") applied at the next moment that matters, it needs no clock the
> crew cannot see, and it reuses the column and trigger (a) and the send already need.
> **→ ASK-A.C.**

**FILL-A.4** — The SELECT policies. Widening read to every internal employee changes four policies.
⚠️ **Confirm against the Financial Visibility Floor that no `site_visit_*` table carries a money
column and that nothing joins one to `estimates` in a way that ships a figure.** S108's live test
asserted "no money key on any row" — extend it rather than replace it.

> **FILLED-A.4.** **No money column on any `site_visit_*` table** — live on rebuild-test,
> `information_schema.columns where table_name like 'site_visit%'`: 4 tables, 67 columns; the only
> numerics are `length_ft`, `width_ft`, `square_feet` (measurements) and `duration_seconds`
> (voice). **Nothing joins one to `estimates`:** `lib/services/site-visits.ts` `VISIT_SELECT`
> embeds `contacts` and `contact_addresses` only, and its header says "NOTHING HERE READS
> `estimates`". The desktop pages read the estimate separately, on an office session.
>
> **The four policies**, live (`pg_policies`): `{site_visits, site_visit_notes,
> site_visit_measurements, site_visit_voice_notes}_select_scoped` — office company-wide;
> foreman/crew `AND created_by = auth.uid()` **per table**. (A consequence nobody wrote down: a
> crew recorder cannot read a note the OFFICE added to their own visit today.) The widening
> replaces the foreman/crew arm with company-wide; subcontractor and client stay out because the
> role list never names them. Proposed as ONE role list for all four so they cannot drift:
> `get_my_role() = ANY (ARRAY['owner','admin','project_manager','foreman','crew_member'])`.
>
> **The live test is extended:** the S108 `MONEY` list and `moneyKeys()` stay; the extended case
> reads, as a crew member who did NOT record it, another recorder's visit on all four tables and
> asserts non-zero rows **and** zero money keys, plus zero `estimates` rows — and a sub and a
> client read **0** on all four (the paired refusal).

**FILL-A.5** — ⚠️ **Photos are `files` rows, OUTSIDE the four tables.** The freeze trigger has never
covered them, and the files route refuses uploads to a non-draft estimate. Ruling 3 says adding
must work after send. State exactly what the files route does today for a sent estimate and what it
must do. **This is a route change, and the route is the only access control — see
`s107-estimate-files-route-order.test.ts`, which must be EXTENDED, not replaced.**

> **FILLED-A.5.** **Today** (`lib/site-visits/access.ts` `resolveEstimateFileAccess`, used by the
> list, upload, per-file `/url` and voice routes):
>
> | caller on a SENT estimate | read | upload |
> | --- | --- | --- |
> | owner / admin | every file (office arm) | **403** — `canUpload` is `draft` or `site_visit` only |
> | PM who owns the estimate | every file | 403 |
> | PM who does NOT own it | **404** unless they recorded the visit (office arm = `estimates_select_authenticated`, "PM own") | 403 |
> | foreman / crew recorder | own files only | 403 (`site_visit_access` ≠ recorder) |
> | foreman / crew non-recorder | 404 | 404 |
>
> Voice upload (`app/api/site-visits/[id]/voice/route.ts:34-39`) uses the same `canUpload`.
>
> ⚠️ **The Floor problem, and it is real.** The route's office arm lists **every** file on the
> estimate — and `ALLOWED_MIME` admits `application/pdf`. An estimate's Files tab is where an
> estimator drops a vendor quote or a sub's price sheet. On rebuild-test the one live estimate file
> is a PDF (category `other`, not on a visit). **Widening "read photos" to foreman and crew by
> widening this route's arms would hand them every PDF on the estimate — money on paper.** So the
> widening must be scoped to **site-visit material**, which `files` cannot identify today: there is
> no marker, only `estimate_id`, mime and time.
>
> **Proposed:** `files.site_visit_capture boolean NOT NULL DEFAULT false`, set by the route when
> the upload comes from `SiteVisitRecord` (a form field the record sends; the voice route always
> sets it). A new arm, **visit staff**: any internal role on an estimate that has a `site_visits`
> row may read files with `site_visit_capture = true` — and ONLY those — and may upload with the
> flag set at every status (ruling 3). The office arm is unchanged, so owner/admin still see
> every file and a non-owning PM gains site-visit material only. Backfill (on a DEFAULT-false
> column — no constraint, cannot abort): images and voice-note audio on estimates with a
> `site_visits` row, created at or before `promoted_at` (or with no promotion), plus every
> `site_visit_voice_notes.file_id`. **→ Q-A.D**, because it is new schema and it decides what
> "photos" means in ruling 1.
>
> **Freeze for files:** the trigger has never covered `files`. With `site_visit_capture`, a file
> whose `created_at <= frozen_at` must refuse soft-delete/rename — proposed as a small `BEFORE
> UPDATE` trigger on `files` scoped to `site_visit_capture = true`. (S108 "known edge": today an
> owner/admin can delete a visit photo after send through the Files tab.)
>
> **Tests:** `s107-estimate-files-route-order.test.ts` and `s109-estimate-file-url-order.test.ts`
> gain a mirror case per new arm (the admin client is never constructed before the session read
> passes; the staff arm's lookup is scoped to `site_visit_capture = true`); nothing removed.

**FILL-A.6** — `visitEraPhotos()` cuts at `promoted_at` (S108 ruling 4). If material may be added
after send, state what the Site Visit tab shows and how it distinguishes what was found on site
from what was added later. ⚠️ **Do not silently widen the cutoff** — quote the superseded ruling.

> **FILLED-A.6.** _Superseded, quoted from `lib/site-visits/photos.ts` (S108 ruling 4):_ _"THE
> CUTOFF IS PROMOTION (site_visits.promoted_at) … Promotion is the boundary the rest of the rules
> already use: it is where the recorder loses upload."_ Ruling 2 removes the premise — promotion
> no longer removes anything — so promotion stops being a meaningful boundary.
>
> **Proposed:** the Site Visit tab shows **site-visit material** (`site_visit_capture = true`,
> FILL-A.5) rather than "images before promotion", in two groups split at `frozen_at`:
> **"Captured before the estimate was sent"** and **"Added after it was sent"**, each item
> date-stamped. Before send there is one group. Notes, measurements, blockers and voice notes
> carry the same split and an "added {date}" line, because ruling 3 makes all five kinds
> addable after send. Photos an estimator adds from the ordinary Files tab stay in Files, which is
> what ruling 4 was protecting. **→ Q-A.D** (it depends on the marker).

**FILL-A.7** — Every live test that encodes the behaviour being overturned. `s108-site-visit.live.ts`
is 29 cases and several assert refusals that must now succeed. **Invert them in place with the
superseded assertion quoted. Do not delete a test.**

> **FILLED-A.7.** `grep -c "  it(" test/s108-site-visit.live.ts` → **29**. Cases whose
> assertion is overturned (invert in place, superseded text quoted):
>
> | case | asserts today | becomes |
> | --- | --- | --- |
> | **1.5a** | foreman (non-recorder) finish → 42501 | foreman **may** finish (ruling 1), sub still refused |
> | **2c** | foreman reads nothing, may not write | foreman reads the crew member's visit and may write (paired: sub/client 0) |
> | **4b** | recorder LOST note/measurement/upload after promotion | recorder keeps every write after promotion (ruling 2) |
> | **4b-ii** | recorder cannot finish after promotion (42501) | unchanged in effect — finish stays `site_visit`-only, error code 22023 for everyone; title re-worded |
> | **4.5c** | office refused **every** write after send; access NULL | office refused EDIT of pre-send rows; **INSERT succeeds**; access still answers |
> | **4.5d** | service role refused insert/update/title | service role refused UPDATE of pre-send rows; **INSERT succeeds** |
> | **4.5f** | recorder reads own record after send | unchanged, plus a non-recorder reads it too |
>
> Unchanged: 1a–1c, 1.5b–1.5e, 2a, 2b, 2d–2f, 3a–3b, 4a, 4c, 4.5a, 4.5b, 4.5e, 5a, 5b.
> Also swept by the S157 rule (grep for the table/function names across `test/` and `e2e/`):
> `s108-visit-era-photos.test.ts` (4 cases, cutoff = promotion → rewritten to the new split),
> `s109-site-visit-media.test.ts` (asserts "post-promotion photos … are not signed"),
> `e2e/m-site-visit.spec.ts` (**FROZEN banner and no add controls after send**; tab shows 1 photo
> after a post-promotion image), and `s107-estimate-files-route-order.test.ts` (recorder upload
> refused after promotion). All four encode overturned behaviour; each is inverted in place.

**FILL-A.8** — Production row counts for any new constraint, and the count of `site_visit_*` rows on
estimates past `review`. **Give Josh the query.**

> **FILLED-A.8.** **No new constraint** in Section A: `frozen_at` is a nullable column,
> `files.site_visit_capture` is `DEFAULT false` with no CHECK, and the triggers govern future
> writes only. Nothing can abort on apply. The backfill UPDATEs are the only statements that touch
> existing rows. **Rebuild-test today: 0 rows in every `site_visit_*` table** (the S108 suites
> clean up), and 14/21 estimates past review with `sent_at IS NULL`. Production, READ-ONLY, for
> Josh:
>
> ```sql
> -- 1. site-visit rows on estimates past review (S108 expected 0 — EST-107 is a draft)
> select 'visits' t, count(*) from site_visits x join estimates e on e.id=x.estimate_id where e.status not in ('site_visit','draft','review')
> union all select 'notes', count(*) from site_visit_notes x join estimates e on e.id=x.estimate_id where e.status not in ('site_visit','draft','review')
> union all select 'measurements', count(*) from site_visit_measurements x join estimates e on e.id=x.estimate_id where e.status not in ('site_visit','draft','review')
> union all select 'voice', count(*) from site_visit_voice_notes x join estimates e on e.id=x.estimate_id where e.status not in ('site_visit','draft','review');
> -- 2. would a sent_at cutoff have thawed anything? (rows newer than their estimate's sent_at)
> select count(*) from site_visit_notes n join estimates e on e.id=n.estimate_id
>  where e.status not in ('site_visit','draft','review') and (e.sent_at is null or n.created_at > e.sent_at);
> -- 3. the files the site_visit_capture backfill would mark
> select count(*) from files f join site_visits sv on sv.estimate_id=f.estimate_id
>  where not coalesce(f.is_deleted,false) and (f.mime_type like 'image/%' or f.mime_type like 'audio/%')
>    and (sv.promoted_at is null or f.created_at <= sv.promoted_at);
> ```

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

> **FILLED-B.1.** The sidebar is `NAV_ITEMS` in `app/dashboard/dashboard-shell.tsx` (~`:85`): a
> **flat list, no children**, three sections (top, Reference, Admin — S130 order), per-item
> `roles` filtered once (`:210`). Estimates is `['owner','admin','project_manager']`. Active
> highlight is by prefix, so `/dashboard/estimates/site-visits/…` already lights Estimates. The
> Estimates page redirects every other role to `/dashboard` (`page.tsx:62-64`), has no tabs (status
> chips only, `estimates-list.tsx:29-39`), and its list excludes visits
> (`estimates-client.ts:247`). **No `/dashboard/estimates/site-visits` index exists.** The record
> page redirects non-office roles to `/m/site-visits/[id]`.
>
> ⚠️ **Section A collides with this.** A widens read/edit to foreman and crew; every desktop road
> to a visit (sidebar, page, record page) sends them away. So:
> - desktop site visits stay **office-only** → an index at `/dashboard/estimates/site-visits`,
>   linked as a "Site visits" tab beside the Estimates list. No sidebar change.
> - desktop site visits reach **foreman and crew too** → a **top-level** item
>   `/dashboard/site-visits`, ungated like Field Ops, and the record page's redirect goes.
>
> **Recommended: top-level**, because Section A's whole point is that the office and the crew
> work on the same record, and PARITY [S122] says one feature behaves the same on both surfaces.
> **→ Q-B.B.**

**FILL-B.2** — What the list shows and who may see it. ⚠️ **It must respect Section A's read
rule** — build B after A, or state the dependency.

> **FILLED-B.2.** Today: the desktop panel is `listSiteVisits({ openOnly: true })`
> (`lib/services/site-visits.ts:42-50`) — not deleted, not promoted, newest first, badged
> Finished / Still recording, hidden when empty. `/m/site-visits` calls the same function with no
> filter and groups **Recording / Finished · waiting for the office / Became estimates**.
> **Proposed desktop list:** the same function and the same three groups (parity), rows = title,
> contact, address, date, state; promoted rows open the estimate for the office and the record for
> everyone else; no money; abandoned excluded. Visibility is whatever Section A's SELECT policy
> returns — the list adds no rule of its own. **Built after A.**

**ASK-B.A** — ⚠️ **May a site visit be CREATED from the desktop?** Recording is mobile-only by
design (S108). Creating at a computer is new capability, not a missing link. Josh decides.

> **Measured for ASK-B.A.** `POST /api/site-visits` → `create_site_visit` enforces role only (any
> internal role); **nothing restricts it to a phone**. The only form is `/m/site-visits/new`. The
> S108 ruling is `S108-SPEC-A-site-visit.md:34`: _"Recorded on MOBILE, on site — a new `/m/`
> screen."_ Desktop creation needs no DB or API change — a desktop form, or a link to the `/m`
> form.
>
> **ASK-B.B** (added) — top-level entry reaching foreman/crew, or office-only tab under Estimates
> (FILLED-B.1).

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

> **FILLED-F.1.** **Consumers, measured** — `grep -rnE "estimates/[^'\"\`]*/files" --include=*.ts
> --include=*.tsx app components lib e2e test` → **23** lines (5 are the routes' own log lines);
> cross-checked with `grep -rnE "api/estimates"` (26, the extra 2 unrelated routes) and a
> `/files`-suffix sweep outside `app/api` (31, none an estimate-files consumer). No helper builds
> the URL from a variable.
>
> | route | consumer files | app consumers |
> | --- | --- | --- |
> | `GET/POST /api/estimates/[id]/files` | **6** | `estimate-files-tab.tsx:57,88`, `site-visit-record.tsx:274`, `site-visits-client.ts:157` (POST) · plus `e2e/desktop-file-sheet-s109.spec.ts:147`, `test/s107-estimate-files-route-order.test.ts:87`, `test/s109-file-sheet.test.ts:105` |
> | `GET …/files/[fileId]/url` | **5** | `estimate-files-tab.tsx:45`, `lib/site-visits/media.ts:41` · plus 3 tests |
>
> **The precedent:** `test/s123-still-clocked-in.test.ts` — `grep -rl` over fixed folders, sorted,
> `toEqual` against a commented hand list; a new match fails naming it. Unit suite
> (`apps/web/vitest.config.ts`), which CI runs — the guard belongs there, not in the live suite.
>
> ⚠️ **A consumer-SET allowlist alone would NOT have caught S109.** `site-visit-record.tsx` was
> already a consumer; the break was a field removed from the response. So the guard is two layers:
> 1. **`lib/api-contracts.ts`** — per contract route: path pattern, the response's fields, and
>    each consumer file with the fields it reads. The test walks `app components lib e2e test`,
>    strips comments, and fails if the consumer set differs from the registry (fires on a NEW
>    consumer).
> 2. The same test reads the route's `.select('…')` and `NextResponse.json` keys, requires them
>    to equal the registered fields, and requires every field a consumer declares to be present.
>    Removing `url` would have forced an edit to the registry, and `site-visit-record.tsx`'s
>    declared `url` would have gone red — **the S109 case**.
> 3. And the type: the list's response type moves to `lib/` (Next rejects non-route exports from
>    `route.ts`), the route `satisfies` it, and `media.ts`'s hand-written `ListedFile` imports it,
>    so `tsc` also catches a removed field.
>
> **Does it fire** — a scratchpad prototype found exactly 6 and 5; an injected consumer reading
> `.url` made it 7. **The in-vitest proof (add a consumer → red; remove a field → red) is owed at
> build.** Limits, stated: a path built from a variable last segment
> (`selection-lifecycle.tsx:31`, `` `/api/selections/${id}/${path}` ``) or by concatenation is
> invisible to it; the registry forbids both for contract routes.

**FILL-F.2** — Whether any other route in the app has more than one consumer and a recently changed
response shape. ⚠️ **Do not truncate the search. State the command and the full result count.**

> **FILLED-F.2.** `find app/api -name route.ts | wc -l` → **99**. A script turned each route path
> into a regex (dynamic segments match `${…}` or a literal), counted consumer files plus module
> imports, and ran `git log --since=2026-08-23` per route (full output 177 lines, scratchpad
> `f2.out`). **41** routes have ≥2 consumer files counting tests, **13** have ≥2 non-test
> consumers, **44** changed in the window, **19** are in both. Every one of the 19 diffed at
> `NextResponse.json` / `.select`:
>
> | route | app consumers | response change |
> | --- | --- | --- |
> | `estimates/[id]/files` | 3 | **removed `url`, `file_path` (#161, `247f6088`) — S109, fixed** |
> | `estimates/[id]/files/[fileId]/url` | 2 | new route |
> | `files/signed-url` | 3 | additive (`?markup=1`), same `{url}` |
> | `stripe/checkout`, `stripe/portal` | 1 + allowlist | unchanged / `return_url` only |
> | `resubscribe/checkout`, `bid/[token]/files` | 1 | new route / GET added |
> | `selections/release` | 1 | additive (`emailed`, `emailError`) |
> | 11 others | ≤1 each | new routes, error text, additions |
>
> **No other route combines ≥2 app consumers with a response change that REMOVED anything.** Seed
> the registry with the two estimate-files routes and `files/signed-url` (3 consumers). Missed by
> the count and noted: `selections/[id]/{offer,reopen,revise,withdraw}` are called through a
> dynamic `${path}`; `offer` changed only additively and has one consumer.

---

# SECTION G — Josh's items, listed so they are not lost

CC prepares; **CC executes none of these.**

**FILL-G.1** — `SCHEMA_DRIFT_COMPANY_ID` is unset in Vercel, so the daily drift cron notifies nobody.
Give Josh the production query for the company id and the exact variable to set.

> **FILLED-G.1.** Read at `lib/services/schema-drift.ts:87`. Unset (`:200-204`): the cron still
> compares and `console.error`s drift, writes no notification, and says so in its response.
> Production company `worth-properties` (`S108-SPEC-C:31`, `S108-SPEC-E:179`). READ-ONLY:
> ```sql
> select c.id, c.name, c.slug, p.email as owner_email
> from companies c
> join profiles p on p.company_id = c.id and p.role = 'owner' and p.is_deleted = false
> where c.slug = 'worth-properties';
> ```
> One row, your email. **Vercel → Settings → Environment Variables → `SCHEMA_DRIFT_COMPANY_ID` =
> that `id`, environment Production**, then redeploy.

**FILL-G.2** — The seed script reports Company B slug drift: live `ridgeline-builders-test-co-2`,
expected `ridgeline-test-co-2`. It matched by name. State the risk and the one-line fix.

> **FILLED-G.2.** `scripts/seed-test-identities.mjs:49` `COMPANY_B_SLUG = 'ridgeline-test-co-2'`;
> `:265-287` look up by slug, fall back to exact name with `.maybeSingle()` **and discard the
> error**, then INSERT if both miss. Live: one company, `f079a1f4-…`, slug
> `ridgeline-builders-test-co-2` (matches `STATE.md`); slug is UNIQUE, **name is not**. **Risk:** a
> second row with that name makes `maybeSingle` error, the error is swallowed, and the script
> silently creates a NEW Company B — the S164 duplicate-tenant shape, where both halves of every
> isolation test pass in different companies. (Production is safe: `:22,35` refuse any URL but
> rebuild-test's.) **Fix, one line, no DB write:** `:49` →
> `const COMPANY_B_SLUG = 'ridgeline-builders-test-co-2';` — also the slug the signup trigger
> derives from the name (`20260917000000_company_slug_no_hex.sql:71`). Slug references: 4 + 4,
> only `:49` is code; the isolation tests resolve by name and are unaffected. **Josh's call per
> Section G — CC does not execute it.**

**FILL-G.3** — The S108 EST-107 query was never run. Restate it for Josh, and say what a NULL
`promoted_at` on a `draft` row would mean.

> **FILLED-G.3.** The query is verbatim in `docs/sessions/S108-report.md` (S108 FOLLOW-UP, Step 1),
> keyed on `e.id = 'd858b3c6-d86c-4c23-9a9b-f9ee7ef97678'`, read-only. Expected: `promoted_at`
> set and `promoter_is_est_author = true` → `promote_site_visit()` ran (its only writer) — most
> likely the owner tapping "Create estimate from this visit" as "finish". **A NULL `promoted_at`
> on a `draft` row** means the status was written outside that RPC — the only other road is a
> direct owner/admin UPDATE (`estimates_update_manager` admits `site_visit → draft`), which no
> app code issues — so S108's diagnosis would be wrong: **stop and report**.

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