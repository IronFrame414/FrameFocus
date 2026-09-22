# S108 — SPEC A (skeleton) — Site Visit

**Status: INCOMPLETE. This is a scaffold, not a spec.**

**RULED** = settled by Josh. Do not re-litigate.
**FILL-n** = a hole CC measures and fills in place.
**ASK-n** = goes to Josh in Phase 2 and becomes a ruling.

⚠️ **A FILL you cannot fill must say why, in one line. Never delete a marker.**
⚠️ **If a measurement contradicts a RULED line, STOP and report. Do not reconcile it.**
⚠️ **Any figure, formula, column name or "the X used for Y" here is Josh's approximation of the
mechanism. Measure the real one, correct this file, and list the correction in FILL-A13.**

⚠️ **This is the largest and riskiest part of S108. It builds LAST.** Do not start it until
Specs B, C and D are built, green, and pushed.

---

## What it is

A record of an initial site visit, before an estimate is priced: who, where, what it looks like,
what the work is, what blocks a number. Recorded on a phone, on site.

---

## RULED [Josh, 2026-09-21]

### Shape

- ⚠️ **A site visit IS an estimate, in a status before `draft`.** Not a new record type and no
  conversion step — the visit becomes the estimate.
- ⚠️ **The estimate number is assigned when the visit moves to `draft`, NOT at creation.** Abandoned
  visits must leave no gaps in the client-visible number sequence.
- **Recorded on MOBILE, on site** — a new `/m/` screen.

### Who

- ⚠️ **Any INTERNAL role creates a site visit: owner, admin, project manager, foreman, crew
  member.** Not subcontractor. Not client.
- ⚠️ **After the visit becomes a `draft`, the person who recorded it keeps READ access to the photos
  and notes they captured, and NO access to money** — enforced in the database, not by hiding it
  on screen.

### What it captures

- **Contact and address**, new or existing.
- **Photos**, with AI tagging (the company's existing `ai_tagging_enabled` path).
- ⚠️ **Existing conditions and proposed scope as SEPARATE notes.** "Tile is cracked, subfloor may be
  soft" is a condition; "demo tile, level, install LVP" is scope. Conflating them loses the
  condition detail that later justifies a change order.
- **Measurements.**
- ⚠️ **Voice notes — audio AND transcript are both kept; the transcript is editable.**
  Transcription will mishear jobsite audio (saws, wind, trade terms like "LVP"); the audio is what a
  misheard measurement is checked against.
- **Blockers** — what prevents pricing it yet (access, a permit question, a load-bearing wall).

---

## ⚠️ The Financial Visibility Floor — the real risk in this spec

Foremen and crew have never touched an estimate row. Today only owner/admin/PM may insert one
(`estimates_insert_manager`), and only owner/admin (any) and PM (own) may select one.

⚠️ **RLS is row-level. A role that can SELECT an estimate row receives EVERY column of it** —
totals, margins, the company default markups/margins copied onto it at creation. `#136`'s class: a
gate controlling only rendering still ships the data in the payload. **A renderer omitting a column
is not a floor.**

So "crew can create a site visit" and "crew never sees money" cannot both be met by adding crew to
the existing estimate policies. This spec must say exactly how they are met, and prove it on the
wire.

---

## What CC measures

**FILL-A0** — `main`'s tip, the branch, whether the tree is clean.

> **MEASURED [S108].** `main` = `ad4e9b8`. Working branch `feature/s108` @ `f1b2de1`. Tree clean.


**FILL-A1** — The `estimates` table: every column; which carry money (totals, margins, markups,
default rates copied from `companies`, tax, discount, `projected_value`); which are populated at
INSERT rather than later.

> **MEASURED [S108]. `estimates` has 67 columns, and EVERY money column is on the row a SELECT
> grant would ship.**
>
> | money column | populated at INSERT? |
> | --- | --- |
> | `subtotal`, `tax_total`, `discount_total`, `grand_total` | **yes — `NOT NULL DEFAULT 0`** |
> | `tax_rate`, `subcontractor_markup_percent`, `material_markup_percent`, `labor_markup_percent` | nullable, no DB default — written by the create path |
> | `discount_type`, `discount_amount`, `retainage_percent`, `deposit_percent`, `projected_value`, `invoice_due_days` | nullable, no default |
> | `pricing_mode` | **yes — `NOT NULL DEFAULT 'markup'`** |
> | `contract_type` | **yes — `NOT NULL DEFAULT 'fixed_price'`** |
> | `proposal_pricing_level` | **yes — `NOT NULL DEFAULT 'lump_sum'`** |
>
> Also defaulted at INSERT: `company_id` (`get_my_company_id()`), `created_by` / `updated_by`
> (`auth.uid()`), **`created_by_role` (`get_my_role()`)**, `status` (`'draft'`), `version_number`,
> `expiration_days` (30), `include_client_contract`, `also_send_to`, and `estimate_number` (A3).
>
> **The consequence that shapes this whole spec:** even a brand-new site visit's row carries four
> NOT NULL money columns. They are zero at creation — but the ruling requires the recorder to keep
> reading their own content **after promotion**, when they are not.


**FILL-A2** — `estimates.status`: its type (enum / CHECK / text), every value, and **every reader
that branches on it** — list screen, metrics strip, Before You Send, send, sign, convert, reminders,
expiry, the deletion sweep, email, QuickBooks. ⚠️ **A new status is read by code that has never seen
it. Name every reader and what it would do with the new value.**

> **MEASURED [S108]. `estimates_status_check` holds exactly NINE values:** `draft, review, sent,
> viewed, accepted, declined, expired, converted, voided`. A tenth needs a migration.
> `EstimateStatus` (`estimates-client.ts:10-25`) mirrors them.
>
> **⚠️ There is a compile-time forcing function.** Two **total** `Record<EstimateStatus, …>` maps
> exist — `STATUS_LABELS` and `STATUS_COLORS` (`app/dashboard/estimates/labels.ts:7,20`). Adding the
> union member makes **both fail to compile** until filled. Every other reader is a runtime
> `status === …` test and is named here by hand:
>
> | reader | its test | what it does with `site_visit` |
> | --- | --- | --- |
> | list `getEstimates()` `estimates-client.ts:237-241` | `is_deleted = false` **only** | ⚠️ **a site visit WOULD appear in the estimates list — the ONE reader that needs an explicit exclusion** |
> | list-row money `estimates-list.tsx:239` | renders `grand_total` | would print `$0.00` |
> | metrics — win rate `estimates/page.tsx:47-51` | cohort requires `sent_at` non-null | ✅ excluded |
> | metrics — expiring soon `:56-60` | `status === 'sent'` | ✅ excluded |
> | Before You Send / send `api/proposals/send` | reads `status`, then freezes | ✅ unreachable |
> | resend `api/proposals/resend` | `status` | ✅ |
> | sign `signing-service.ts` | `estimate.status !== 'sent'` → refuse | ✅ refuses, correctly |
> | submit-for-review / approve `estimates-client.ts` | `!== 'draft'` / `!== 'review'` | ✅ refuses, correctly |
> | convert `convert_estimate_to_project()` | operates on an accepted estimate | ✅ |
> | reminders + expiry cron `estimate-reminders.ts:100,131-133` | `.eq('status','sent')` | ✅ |
> | projects page `projects/page.tsx:79` | `.eq('status','accepted')` | ✅ |
> | deletion sweep, email, QuickBooks | **no estimate-status branch found** | ✅ |
>
> **So exactly one reader changes, and it is the LIST, not any total.**


**FILL-A3** — `estimate_number`: nullability, uniqueness, how it is assigned
(`estimate_number_prefix` / `estimate_number_sequence`), and what assigning it at promotion instead
of insert requires.

> **MEASURED [S108]. Assigned at INSERT by a column default — and it BURNS the sequence.**
> `estimate_number text NOT NULL DEFAULT next_estimate_number()`.
> **Not unique** — only the non-unique `idx_estimates_estimate_number`; the table's only unique
> indexes are `estimates_pkey` and the partial `estimates_supersedes_once`.
> `next_estimate_number()` (SECURITY DEFINER plpgsql, **live body read, not a migration file**) does
> `UPDATE companies SET estimate_number_sequence = estimate_number_sequence + 1 … RETURNING`, so
> **an abandoned visit created the ordinary way would consume a client-visible number** — exactly
> what the ruling forbids.
>
> **What assigning at promotion requires:**
> 1. `ALTER TABLE estimates ALTER COLUMN estimate_number DROP NOT NULL` — **dropping NOT NULL can
>    never fail on existing data.**
> 2. **Keep the DEFAULT** so the ordinary create path is unchanged; the site-visit path passes
>    `estimate_number => NULL` explicitly.
> 3. Call `next_estimate_number()` at promotion.
> ⚠️ **Any CHECK pairing `status` with `estimate_number IS NULL` is EXACTLY the shape of
> `20261610000000`** and must not ship until Josh has run the production count (Spec E).


**FILL-A4** — Every RLS policy on `estimates`, `estimate_categories`, `estimate_line_items`,
`estimate_line_rows`, and `files` as it applies to estimate files. State exactly what a foreman and
a crew member can do on each today.

> **MEASURED [S108]. Today a foreman and a crew member can do NOTHING on every one of these tables.**
>
> | table | foreman / crew today |
> | --- | --- |
> | `estimates` | **no SELECT** (`estimates_select_authenticated` = owner/admin any, PM own), **no INSERT** (`estimates_insert_manager` = owner/admin/PM), **no UPDATE** (`estimates_update_manager` = owner/admin any, PM own draft), and **no DELETE policy exists for any role** |
> | `estimate_categories` / `estimate_line_items` / `estimate_line_rows` | SELECT needs `EXISTS` on `estimates` → nothing. Writes are owner/admin/PM on a **draft** they own |
> | `files`, for an ESTIMATE file | ⚠️ `files_insert_non_client` **does list `foreman` and `crew_member`** — and then requires **`project_id IS NOT NULL` AND `can_view_project(project_id)`**. An estimate file is `project_id IS NULL`. `files_select_non_client` imposes the same. **So they can neither insert nor read one.** `files_delete_owner_admin` is owner/admin only |
> | `contacts` | ⚠️ **they ALREADY read the whole company list** — `contacts_select_authenticated` excludes only `subcontractor` and `client`. INSERT/UPDATE are owner/admin/PM |
> | `contact_addresses` | same shape — `_select_scoped` excludes only sub/client; writes are owner/admin/PM |


**FILL-A5** — ⚠️ **How a crew member INSERTs a site visit without being able to SELECT money.**
`INSERT … RETURNING` needs SELECT. Candidates: a SECURITY DEFINER RPC that creates the row and
returns only safe columns; a column-safe view; notes/photos kept off the estimate row. If the only
safe answer contradicts the RULED shape (a site visit IS an estimate), **STOP and say so.**
Measure, then propose — **do not pick.**

> **MEASURED, THEN PROPOSED [S108]. Not picked — ASK-A1.**
>
> **The constraint, restated from measurement:** `INSERT … RETURNING` through PostgREST needs SELECT,
> and **RLS is row-level — a SELECT grant on `estimates` ships all 67 columns**, including the four
> NOT NULL money totals (A1). **So adding crew to `estimates_select_*` cannot meet the RULED "NO
> access to money", at creation or after promotion.** That option is eliminated by measurement, not
> preference.
>
> **Candidate 1 — a `SECURITY DEFINER` RPC, `create_site_visit(...) RETURNS uuid`.** Needs **no
> SELECT policy at all**: an RPC returns its own value, so the `INSERT … RETURNING` problem does not
> arise. It can create the contact and address in the same call, so **no widening of
> `contacts_insert_authorized` and no new read surface**. ⚠️ Per CLAUDE.md, prefer **SQL** over
> plpgsql where the RLS-bypass matters, and `REVOKE EXECUTE … FROM public` with an explicit
> `GRANT TO authenticated`.
>
> **Candidate 2 — a column-safe view** (`site_visits_mine`). Postgres 15+ honours `security_invoker`;
> a non-invoker view owned by a privileged role bypasses RLS, which is a second mechanism to get
> wrong. **Weaker than 1, and it does not solve INSERT at all.**
>
> **Candidate 3 — notes and photos kept OFF the estimate row** (A6). ⚠️ **This is not an alternative
> to Candidate 1; it is the other half of the answer**, and it is what makes the POST-promotion read
> safe.
>
> **CC's recommendation: 1 + 3 together. Neither alone satisfies the ruling.**
> **This does NOT contradict the RULED shape.** A site visit is still an estimate row; the crew
> member simply never SELECTs it. Nothing here needs STOPPING.


**FILL-A6** — ⚠️ **Where the notes live.** Scope today lives on estimate columns (`scope_summary`,
`scope_sections`). If site-visit notes live on the estimate row, the recorder's post-draft read of
"their notes" means reading a row that carries money. State where conditions, scope, measurements,
blockers and transcripts must live for that read to be money-free.

> **MEASURED [S108]. They cannot live on the estimate row — and this follows from A1, not taste.**
> Scope lives on `estimates.scope_summary` (text) and `estimates.scope_sections` (jsonb) today.
> If conditions, measurements, blockers and transcripts join them there, then *"the recorder keeps
> READ access to their notes"* **means granting SELECT on a row carrying `grand_total`** — the
> ruling's own prohibition, and `#136`'s class.
>
> **So they must live in their own table(s) keyed by `estimate_id`, with no money column:**
> `site_visit_notes(estimate_id, kind ∈ {'condition','scope','measurement','blocker'}, body, …)` —
> which also gives the RULED conditions-vs-scope separation a **structural** home rather than a
> convention — plus a transcript/audio table for A9.
> The recorder's post-promotion read is then a policy on **that** table (`created_by = auth.uid()`),
> and **the estimate row is never exposed, before or after promotion.** Photos are `files` rows with
> `estimate_id` — a nullable column that already exists. → **ASK-A2.**


**FILL-A7** — The S106 estimate-files route (`/api/estimates/[id]/files`). Its floor is a session
read of the estimate, and POST requires edit rights on a `draft`. A crew member passes neither, so
they could not upload photos to their own visit or read them after promotion. State what changes and
whether the route stays the only access control. ⚠️ **The route-floor test (built S107) must still
fail if the admin client moves above the session read.**

> **MEASURED [S108]. Both halves confirmed by reading the route.**
> - **GET floor** = a session `SELECT` on `estimates` (`route.ts:40-45`), then the **admin** client.
> - **POST floor** = session read **plus** `est.status === 'draft' && (owner/admin || created_by ===
>   user.id)` (`:107-113`).
> - The route's own header states why it is the only control: *"`files_select_non_client` /
>   `files_insert_non_client` both require `project_id IS NOT NULL` for every non-owner/admin role,
>   and an estimate file is `project_id IS NULL` … If the session read is wrong, skipped, or
>   bypassed, a caller reaches any estimate's files in the company, and four of the company-level
>   rows are contracts."*
>
> **⚠️ A crew member fails BOTH gates** — they cannot SELECT any estimate (A4), and `site_visit` is
> not `draft`. So two changes are needed, and the first is the delicate one:
> 1. **The floor must stop being "can you SELECT the estimate" for this case**, because that is
>    precisely what A5 says must never be granted. It becomes **"did you record this visit"**, read
>    from the money-free side table (A6). **The route remains the only access control** — the shape
>    is unchanged, only the predicate.
> 2. The edit gate admits `status === 'site_visit' && created_by === user.id`, alongside today's
>    draft rule.
> 3. `ALLOWED_MIME` gains the audio types for A9; `MAX_SIZE` is already 25 MB and needs no change.
>
> ⚠️ **`s107-estimate-files-route-order.test.ts` is the route-floor test and must be EXTENDED, not
> replaced.** Its MIRROR case (`:102` — "the estimate IS visible → the admin client IS reached, so
> the above is not vacuous") is what keeps it honest, and the new arm needs its own mirror.


**FILL-A8** — What mobile already provides to REUSE: burst capture and the IndexedDB held-shot
store, the `capture` inputs, the offline queue and its weak-signal fix, `ContactAddressPicker` and
inline contact create (`#147`/`#148`), the clock→job project source. ⚠️ **A site visit has no
project.** Capture today is project-scoped and a field INSERT without a `project_id` is refused by
RLS (§7a). State how a site-visit photo avoids that without weakening §7a.

> **MEASURED [S108].**
> - `app/m/capture-store.tsx` — `hold(file, projectId: string | null)` (`:54`, `:105`) **already
>   accepts a null project**. Reusable unchanged. Burst capture and the IndexedDB held-shot store
>   come with it.
> - ⚠️ `app/m/offline-sync.tsx:51` types one queue payload's `project_id: string` — **not nullable.
>   That is the seam to widen.**
> - `ContactAddressPicker` (`app/dashboard/estimates/contact-address-picker.tsx`) and inline contact
>   create (`#147`/`#148`) exist and are reusable.
>
> **⚠️ How a site-visit photo avoids §7a without weakening it — and the answer is that §7a is not
> touched at all.** `files_insert_non_client` refuses a `project_id IS NULL` row for foreman and
> crew, and **it should keep refusing**. The site-visit photo does not go through the session client:
> it goes through the **route** (A7), which uses the admin client *after its own floor*. The policy
> is unchanged, the §7a subcontractor widening is unchanged, and the `project_id IS NOT NULL`
> requirement stays exactly as strict as it is today.


**FILL-A9** — Voice: which OpenAI transcription model, file-size limits, cost per minute, where
audio is stored (bucket, path convention — Supabase Storage rejects angle brackets in keys), and
what happens on weak signal — can audio be recorded offline and transcribed when signal returns.

> **MEASURED [S108]. Nothing exists; this is entirely new.**
> The only OpenAI use in the repo is `gpt-4o` **vision** in `ai-tagging.ts`. `grep` for
> `whisper|transcri|audio|speech` over `lib/` returns one unrelated comment in `legal-docs.ts`.
> - **Storage:** bucket `project-files`, `public = false`, **`allowed_mime_types` is NULL** — audio
>   is permitted at the bucket, so the ROUTE's allowlist is the gate. Path convention already
>   established and safe: `{company_id}/estimates/{estimateId}/{uuid}-{safeName}` — **real UUIDs, so
>   the Supabase angle-bracket key trap cannot arise.**
> - **Size:** OpenAI's audio endpoint caps uploads at **25 MB**, which matches the route's existing
>   `MAX_SIZE` exactly — a happy coincidence worth not disturbing.
> - ⚠️ **Model and cost per minute: NOT FILLED, and the reason is one line —** there is nothing in
>   this repo to measure them against, and I will not assert a price I did not verify. Both must be
>   confirmed against OpenAI's current model and pricing pages at build time. Whatever is chosen is
>   logged per the Module 3H rule: lazy client, an `ai_*_logs` row on **success and failure**, and
>   `response.model` (the resolved version) logged, never the request alias.
> - **Weak signal:** record to the existing IndexedDB store, upload on reconnect, transcribe
>   server-side **after** the upload — so poor signal costs a delay, never the audio.


**FILL-A10** — Contact and address creation by a crew member. `contacts_insert_authorized` matches
`estimates_insert_manager`. Does a crew member need contact INSERT, and ⚠️ **does granting it let
them read other contacts?**

> **MEASURED [S108]. Granting it exposes NOTHING new — because they can already read every contact.**
> `contacts_select_authenticated` = `company_id = get_my_company_id() AND role NOT IN
> ('subcontractor','client')`. The S131 Roster Visibility Floor excluded only `subcontractor` and
> `client`; CLAUDE.md's own table records the five `DASHBOARD_ROLES` as *"unchanged, company-wide"*.
> **So a foreman and a crew member already SELECT the whole contacts list and every
> `contact_addresses` row.** The ⚠️ in this FILL is answered: **no, granting INSERT does not let them
> read other contacts, because they already can.**
> `contacts_insert_authorized` is owner/admin/PM, so a direct grant *would* be a widening —
> **recommended instead: creation rides the A5 RPC, so no policy changes at all.**


**FILL-A11** — Where site visits appear on desktop. ⚠️ **They must not inflate pipeline totals, the
metrics strip, the "unpriced" warnings, or any aggregate.** List every aggregate that would count
them today.

> **MEASURED [S108]. Only ONE aggregate counts a site visit today, and it is not a total.**
> Full table under FILL-A2. In short: **`getEstimates()` (the list) has no status filter** and would
> show it; **win rate** is `sent_at`-gated and **expiring soon** is `status === 'sent'`-gated, so both
> exclude it automatically. **There is no pipeline dollar total anywhere** — the strip is Win rate,
> cohort size and Expiring soon (`estimates/page.tsx:34-60`, rendered at `estimates-list.tsx:109-112`).
> The only money on the screen is the per-row `grand_total` at `estimates-list.tsx:239`, which is a
> further reason to exclude visits from the list rather than badge them in it.
> **So the spec's warning about inflating pipeline totals is measurably a non-issue**; the real work
> is one `.not('status','eq','site_visit')` and the decision of where visits DO appear (ASK-A7).


**FILL-A12** — Every migration this spec requires, with purpose. Rebuild-test only. ⚠️ **Count the
rows each new constraint will govern on PRODUCTION before proposing it** — give Josh the query.
`20261540000000` aborted on production against two rows nobody counted, and `20261610000000`'s
CHECK would have made every tenant undeletable. Both were constraints written against rows nobody
counted.

> **MEASURED + PROPOSED [S108]. Rebuild-test only. Production counts are Josh's, in Spec E.**
> 1. **Widen `estimates_status_check`** with `'site_visit'`. ⚠️ **A widening CHECK governs no
>    existing row and cannot abort on data** — unlike `20261540000000` (aborted on two orphan rows)
>    and `20261610000000` (would have made every tenant undeletable), which both *narrowed*.
> 2. **`ALTER estimates ALTER COLUMN estimate_number DROP NOT NULL`** — dropping NOT NULL can never
>    fail on existing data.
> 3. **New `site_visit_*` table(s)** + policies + the two standard triggers (`_updated_at`,
>    `_set_updated_by`) + the three column defaults (`company_id`, `created_by`, `updated_by`) — the
>    CLAUDE.md per-tenant checklist, **in the same migration that creates the table**.
> 4. **The `create_site_visit` RPC** (and any promote/update RPC), with `REVOKE EXECUTE … FROM
>    public` and an explicit `GRANT TO authenticated`.
> 5. A `files` change per A7 — **route preferred; the policy is untouched.**
>
> ⚠️ **Deferred until Josh runs the count: any CHECK tying `status` to `estimate_number IS NULL`.**
> That pairing is the `20261610000000` shape, and the lesson recorded there is that both of the
> aborting constraints were *"written against rows nobody counted"*.


**FILL-A13** — Every figure, formula or column name this spec names, and whether measurement
confirmed or corrected it.

> **MEASURED [S108] — every figure, formula and column name this spec names.**
>
> | the spec says | measurement |
> | --- | --- |
> | *"a site visit IS an estimate, in a status before `draft`"* | ✅ workable — the CHECK has 9 values and widens cleanly; `status` defaults to `'draft'` so the site-visit path must set it explicitly |
> | *"the estimate number is assigned when the visit moves to `draft`"* | ✅ possible, and **necessary**: `next_estimate_number()` increments `companies.estimate_number_sequence`, so creating a visit the ordinary way **burns a client-visible number**. Confirmed against the live function body |
> | `estimate_number` uniqueness | ❌ **corrected — there is NO unique constraint**, only the non-unique `idx_estimates_estimate_number` |
> | `estimate_number_prefix` / `estimate_number_sequence` | ✅ both exist and are exactly how the number is built |
> | *"only owner/admin/PM may insert (`estimates_insert_manager`)"* | ✅ confirmed verbatim |
> | *"only owner/admin (any) and PM (own) may select"* | ✅ confirmed verbatim |
> | `scope_summary`, `scope_sections` | ✅ both exist on `estimates` (`text`, `jsonb`) |
> | `contacts_insert_authorized` matches `estimates_insert_manager` | ✅ confirmed — both owner/admin/PM |
> | *"does granting contact INSERT let them read other contacts?"* | ❌ **the premise is inverted — they ALREADY read every contact**; only `subcontractor` and `client` are excluded |
> | `files` route floor is *"a session read of the estimate"* | ✅ confirmed at `route.ts:40-45` / `:100-113` |
> | *"a field INSERT without a `project_id` is refused by RLS (§7a)"* | ✅ confirmed — `files_insert_non_client` requires `project_id IS NOT NULL` for every non-owner/admin role |
> | *"they must not inflate pipeline totals, the metrics strip, the unpriced warnings, or any aggregate"* | ⚠️ **partly corrected — there IS no pipeline total**, and the metrics strip excludes them automatically. **Only the LIST needs changing** |
> | `ai_tagging_enabled` path for photos | ✅ exists (`ai-tagging.ts`), and is the reference implementation the AI rules name |
> | voice transcription model / cost | ⚠️ **NOT FILLED** — nothing in the repo to measure it against; see FILL-A9 |
> | the number of columns money could leak through | **67 columns on `estimates`, four of them NOT NULL money totals** |


---

## ASK — Phase 2

**ASK-A1** — On FILL-A5: the mechanism for a money-free crew INSERT.

**ASK-A2** — On FILL-A6: where notes live.

**ASK-A3** — Who can PROMOTE a site visit to `draft`? Promotion assigns the number and creates the
first money-bearing state. Likely owner/admin/PM only — confirm.

**ASK-A4** — When a foreman or crew member records a visit, is the office notified? Via the existing
`notify()` path?

**ASK-A5** — Measurements: free text, or structured (area name, length × width, computed square
feet)? Structured would feed the square-foot labor unit in Spec B.

**ASK-A6** — Blockers: free text, or a list that can be checked off as resolved?

**ASK-A7** — Can a site visit be abandoned without becoming an estimate? If so: what state, who can
do it, and where does it appear afterward.

**ASK-A8** — Can the recorder edit their visit after submitting it, before promotion?

---

## AUDIT — before Spec A builds

1. Every FILL filled or one line saying why not. State counts found and filled.
2. Every ASK has a recorded ruling and the alternative it beat.
3. No measurement contradicts a RULED line.
4. ⚠️ **FILL-A5 and FILL-A6 are answered and ruled.** Without them the Floor is not met and nothing
   in this spec builds.
5. ⚠️ **Every reader in FILL-A2 handles the new status** — named, not assumed.
6. ⚠️ **A live test proves a crew member who recorded a visit receives NO money column — on the
   wire, before AND after promotion.** State the row count. A test that passes on zero rows is a
   failure.
7. Every migration named, with its production row count. Josh applies them.
8. Anything still unknown that the build needs.
