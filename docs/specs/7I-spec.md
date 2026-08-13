# Module 7I — Contracts — BUILD SPEC — **rev 4**

> # ✅ AUDITED [S145] against `b267ed1` — the five DANGEROUS items are corrected
>
> _Superseded banner, quoted rather than deleted:_
>
> > _"⚠️ **STALE PROVENANCE — AUDIT BEFORE BUILDING.** Verified against `d395c01`. The branch is now
> > at `97a2aec`, 13 commits later. Committed deliberately (Josh, S99) so the design survives; the
> > schema claims below are not current and an audit is owed before any build. Do not treat a
> > `[VERIFIED]` tag here as current without re-checking it against HEAD."_
>
> **The audit was performed at S144 and its findings applied at S145.** What changed, all corrected
> in place with the superseded text quoted:
>
> | Where | Was | Now |
> | --- | --- | --- |
> | **§4.3** | "unchanged since baseline… NO role floor" | S133's read floor added `role <> ALL ('subcontractor','client')` to both SELECTs |
> | **§4.3** | "an assigned PM can update `contract_value`" | **Refused by column-scope trigger** on both tables |
> | **§4.3 / §8** | the S97 `999999` demo as live evidence | the column it exploited was **dropped** (`20260812000000`) |
> | **§8** | "the gate is UI-only… over an open database" | **REWRITTEN** — the floor shipped at S97; the database agrees with the ruling |
> | **§14** | "the notification system does not exist" | `notifications` + `notify()` both ship |
> | §9 · §0.2 #1 · §3.4 · §7.1 · §7.5c · §5.1a | various | citations refreshed; 7F's engine, signatory columns and `legal_description` are all **built** |
>
> **The rulings in this document are untouched.** Only claims about the repo were corrected, and
> every one of them moved in 7I's favour except §4.3's, which narrowed what a PM can do.
>
> ⚠️ **Still true, and the reason this banner is not simply deleted:** a `[VERIFIED]` tag records
> what a past session read. **The tags below were verified at `d395c01` unless a `[S145]` note says
> otherwise.** S144 checked all 17 plus the banner's five; the remaining tagged claims are
> unchecked. Re-verify anything you build on.
>
> **Five known-stale areas, found before committing. This is the audit's starting point, not its end:**
>
> | #   | Section                      | What changed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
> | --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
> | 1   | **§8 Roles**                 | Argues 7I's gate is _"a UI gate over an open database"_ and cites `GATED.md:122`'s PM write as live evidence. **`FINANCIAL-RLS-FLOOR` has landed** — `20260806000000`, `…08…`, `…09…`, `…10…_tier2`. **The reasoning is obsolete; the Owner/Admin ruling still stands.**                                                                                                                                                                                                                                           |
> | 2   | **§4.3, §10.6**              | **`projects.contract_value` was DROPPED** (`20260812000000`), replaced by **`project_financials`** (`20260811000000`). §4.3's bolded claim that an assigned PM can read and write contract value is **false now**: both contract tables carry column-scope triggers — `20260808000000` (`subcontractor_contracts`) and `20260809000000:133–164` (`client_contracts`) — freezing `contract_value`, `retainage_percent`, `retainage_shape`, `signed_doc_file_id`, `executed_date` and `member_id` below Owner/Admin. |
> | 3   | **§3.2 BUILD TRAP**          | **Invoice email is BUILT** — `apps/web/app/api/invoices/[id]/send/route.ts`, `20260807000000_7d_invoice_email.sql`. It already carries the `getResend()` try/catch (`:168`). The warning about copying the proposal route is spent, and 7F's "invoice email lands first" dependency is **satisfied**.                                                                                                                                                                                                              |
> | 4   | **§11.4 + countersignature** | 7I writes `subcontractor_contracts.executed_date` at countersignature — now trigger-frozen below Owner/Admin. **It still works**, because the trigger early-returns on `auth.uid() IS NULL` and 7I signs through the service-role client. **That bypass is now load-bearing and must be asserted by test, not assumed.**                                                                                                                                                                                           |
> | 5   | **`invoices.due_date`**      | Now written (`20260813000000_invoice_due_date_frozen.sql`). Anything here or in the payment-schedule brief saying nothing writes it is wrong.                                                                                                                                                                                                                                                                                                                                                                      |
>
> **Not yet assessed:** `20260814000000_sub_retainage_passthrough.sql` (bears on §6.3's retainage
> printing) and `20260815000000_7e_payment_reminders.sql` (uncommitted in the working tree at the time
> of writing).
>
> ---
>
> **Repo path:** `docs/specs/7I-spec.md`. Written **S99, 2026-08-02**.
>
> **Verified against** `origin/feature/113c-award-commitment-spec` @ **`d395c01`** — **not `28829de`**;
> the branch moved 4 commits after the S98 docs were written (§0.1). Every schema, service, RLS and
> file:line claim was read from that tree. Absence claims were confirmed by grepping **all 47**
> migrations plus `packages/shared/types/database.ts`, never from a single `CREATE TABLE`.
>
> **rev 4.** The client contract is an **ESTIMATE-STAGE** document (§5); the client payment schedule
> is a **separate module**, not a 7I feature (§7.2). Rev 4 closes seven of rev 3's ten open items.
>
> **Status: design-complete.** Three items remain open (§14) and none of them blocks a build stage.
> The sub half is design-complete but **gated** (§9). The only external prerequisite is 7F.
>
> **Tags:** `[S99]` ruled by Josh this session · `[S98]` carried from `claude/S98-7F-decisions-ruled` ·
> `[VERIFIED]` read from the repo at `d395c01` · `[CORRECTION]` a claim the repo contradicts.

---

## §0 — Repo state and corrections

### §0.1 — Branch

HEAD is **`d395c01`**. `28829de` is an ancestor, 4 commits back (`e1f43c4`, `3b7fcda`, `1f36996`,
`d395c01`). Schema delta: one migration, `20260805000000_7e_settlement_revert.sql`, plus a
`database.ts` regen. `main` is at `46bb643`; `bfe5635` is on it, so the signature claim holds (§3.4).

### §0.2 — `[CORRECTION]` Claims the repo contradicts

| #   | Claim                                                                          | Repo at `d395c01`                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Read `docs/specs/7f2-spec.md`                                                  | ~~**Not in the repo.** 7F2 exists only as the project doc `claude/7f2-spec`; the repo carries `7f1-spec.md`, which 7F2 supersedes. **The document engine is uncommitted design, not code.**~~ **REVERSED [S145]:** `docs/specs/7f2-spec.md` **is** in the repo, `7f1-spec.md` is gone, and **the engine SHIPPED at S141** (`20260922000000` + the `lien-release*` services). §1's "consumes it rather than rebuilding it" is now literal. |
| 2   | `subcontractor_contracts` comes from "7C / 113c"                               | **Module 5A baseline**, `20260704211000:438`. 7C and 113c only `ALTER` it.                                                                                                                                                                        |
| 3   | The payment schedule printing inside the sub-contract is "recorded in 113c §7" | **It is not.** §7 is `113c-spec.md:285–293` and says nothing about it; all 35 "schedule" hits in that file are data/RPC/editor-level. Josh ruled it in this session `[S99]`, so it is now real — but as **net-new**, not as a restatement (§6.3). |
| 4   | "Service triple … per CLAUDE.md"                                               | CLAUDE.md documents a **pair** (`:308–321`); `-shared.ts` is undocumented de-facto convention. And **`contracts.ts` / `contracts-client.ts` already exist** (§11.1).                                                                              |
| 5   | "Money: `numeric(12,2)`, matching 7C/7D/7E"                                    | Not a CLAUDE.md rule — its only precision rule is `NUMERIC(10,6)` for AI cost columns (`:294`); `numeric(12,2)` is **"PROPOSED (not locked)"** (`7A-spec.md:183`). Both contract tables ship **bare `numeric`** (§10.6).                          |
| 6   | _(rev 2)_ STATE.md as current repo state                                       | **Ten sessions stale** (`STATE.md:3`, S87). Module 7 reads `⚪ NOT STARTED` (`:19`); "All 32 migration files" (`:113`) against an actual **47**. **`GATED.md` is the live register.**                                                             |

---

## §1 — Scope

7I owns the **contract document** — templating, fill, signature, delivery, storage, tracking — in two
directions that, after this session's rulings, **live at different stages of the lifecycle and share
almost nothing but the engine**.

|           | **Client contract**                                                            | **Sub contract**                                                        |
| --------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Stage     | **ESTIMATE** — pre-conversion `[S99]`                                          | **PROJECT** — post-conversion                                           |
| Created   | at proposal send                                                               | at estimate→project conversion (as a draft row + a badge)               |
| Sent      | **always with the proposal**, never separately `[S99, v1]`                     | manually, after project setup                                           |
| Signed by | the client, in the estimate's signing flow                                     | the sub                                                                 |
| Optional? | **Yes** — per-company toggle `[S99]`                                           | Governed by the existing `requires_formal_contract`                     |
| Reads     | `estimates`, `contacts`, `contact_addresses`, `companies` — **not `projects`** | `subcontractor_contracts`, `projects`, `company_members`, 7C stage rows |

> **[S145] 7I OWNS THE SUB-CONTRACT AGREEMENT — recorded here because 7I's own text never said so.**
> `113c-spec.md` §7 assigned it to 7F until S140; `7f2-spec.md` §1 declared that superseded at S98
> and the amendment landed at S141 (`113c-spec.md:50-51`, `:289`). The split as it now stands:
> **7F owns the document ENGINE** — PDF overlay, box maps, `renderRelease()`, template CRUD — and
> **7I owns both contract agreements**, client and sub, consuming that engine. Gate 1 is unmoved:
> the sub-facing e-signature (§6.5) is still behind it.

**The contract _records_ already ship from 5A and are not rebuilt** (§4). 7I supplies the document and
signing layer they lack.

### §1.1 — `[S99 — RULED]` The client contract

1. **A separate generated document**, not the signed proposal, with **its own signature ceremony**.
2. **Optional per company** — a toggle in Company Settings, beside the templates. Off by default; when
   off, nothing about contracts appears and the signed proposal remains the client contract, exactly
   as today.
3. **When on, it always goes out WITH the proposal/estimate.** Never after, never standalone. Josh:
   _"when a contract is going to be used (toggle selected) it send with the proposal/estimate. Then,
   both will be signed by the time it converts."_
4. **v1 only.** The "send after the proposal is signed" and "send separately" paths from the earlier
   ruling are **withdrawn for v1** — Josh: _"stick with A for v1."_

**Why (3) matters more than it looks:** it removes an entire class of state collision. See §5.1.

### §1.2 — Out of scope

- **Lien releases** — 7F. **The document engine** — funded by 7F, consumed here (§2).
- **The payment-schedule data** — 7C/113c own it. 7I prints it and never writes a stage row.
- **Contract value as a stored number** — 7B derives at read (`module7-architecture.md:152`).
- **Invoice email** — 7D's gap. Not 7I's.
- **A new contract per change order** — `[S99]` _"a new contract is not needed for a CO."_ COs flow
  through 5D and 7B as today.

---

## §2 — The document engine

`claude/7f2-spec` §3: uploaded PDF + placed boxes → value resolution → stamp → render → sign → store
→ track. Each box is `{page, x, y, width, height, kind, mapping}` with **position and size stored as
fractions of page width/height**, multiplied by the PDF's point dimensions at generate time. Three box
kinds: **value**, **signature**, **custom**.

**7I reuses that model without modification.** It builds no second engine.

### §2.1 — `[S99 — RULED]` Option B: 7I gets its own template tables

Josh ruled **B** — 7I ships `contract_templates` / `contract_template_boxes` rather than generalising
7F's `lien_release_templates`. Plus a **`document_kind`** column, and **separate template sets** for
client and sub `[S99, D-8]`.

**The cost of B, stated plainly so it is managed rather than discovered:** two tables, two CRUD
surfaces, and the risk of two box-placement UIs drifting apart.

> **BUILD REQUIREMENT — the box-placement UI is ONE component.** The tables differ; the box model does
> not. `{page, x, y, width, height}` as fractions, three kinds, identical interaction. Build the
> placement editor once, parameterised by template id and value catalog, and mount it from both
> settings surfaces. **This is what keeps B from becoming a genuine fork.**

### §2.2 — `[S99 — RULED]` Text overflow WARNS. It never silently alters the value.

Josh: _"warn user of overflow. we must make all boxes large enough that this is a rare occurrence."_

- At **render**, if a resolved value does not fit its box at the template's font size, **surface a
  warning to the user naming the field and the template**, and do not proceed silently.
- **No silent shrink-to-fit. No silent truncation.** The user resizes the box, edits the value (every
  value is editable before render, §5.4/§6.4), or accepts.
- At **box placement**, warn when a box is drawn smaller than a sensible floor for its mapped value.
- **This ruling propagates to 7F** — `7f2-spec` §3.1 is the same open item and now has the same
  answer. See the amendment note.

### §2.3 — Rendering and artifacts: use the CO model

Two stamping patterns ship and they are **not** equivalent `[VERIFIED]`:

|           | Proposal                                                                                   | Change order                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Method    | post-render `pdf-lib` compositing, `proposal-service.ts:36`                                | **native render**, no compositing, `co-pdf-service.ts:13–26`                                                         |
| Placement | **hardcoded absolute coordinates** — `margin=48`, `baselineY=96`, fit to 180×48 (`:57–68`) | rendered by `co-template.tsx`                                                                                        |
| Artifacts | one signed PDF                                                                             | **two, both retained** — v1 contractor-signed, v2 fully signed; v1 never overwritten (`signed-artifact-spec.md:212`) |

7I's _stamping_ is 7F's box overlay. 7I's **artifact policy is the CO's**: a contract has two
signatures, so **v1 = contractor-signed (generated at send), v2 = fully executed (generated at
countersignature). Both retained.** `signed-artifact-spec.md:194`: _"generate and persist at each
signature event. Never on demand."_ `:199` — regenerating later _"produces a document the signer never
saw."_

---

## §3 — Shipped infrastructure. Do not rebuild any of it.

### §3.1 — Tokenized signing — in production twice `[VERIFIED]`

`signing_sessions` (`baseline_schema.sql:1459–1484`) and `co_signing_sessions`
(`20260704215000:235–259`). Both carry `token` (unique), `status` ∈
`pending|completed|declined|expired|invalidated`, `recipient_email`, `expires_at`, `signed_at`,
`signature_type` ∈ `draw|type`, `signature_data` (base64 PNG), `signer_name`, `declined_at`,
`decline_notes`, `signer_ip`, `signer_user_agent`, `consent_given`, `consent_text`.
`signing_sessions` adds `decline_reason` with a six-value CHECK (`:1481`).

The mechanism, exactly:

- **Token = `randomUUID()`**, cleartext (`signing-service.ts:43`, `co-signing-service.ts:46`). **The
  token IS the credential** (`co-signing-service.ts:15–19`).
- **No anon access exists anywhere.** Zero `TO anon` policies, zero anon grants, zero SECURITY DEFINER
  signing RPCs. One SELECT-only policy per table, `TO authenticated`, manager-scoped
  (`baseline_schema.sql:3723`, `20260704215000:427–433`). **Every public-flow write goes through
  `getSupabaseAdmin()`** (`apps/web/lib/supabase-admin.ts:10–18`), which bypasses RLS. Deliberate —
  `20260704215000:424–425`.
- **Middleware does not cover the signing routes** — `middleware.ts:92–93` matches only
  `/dashboard/:path*`, `/sign-in`, `/sign-up`.
- **Single-active-link invariant** — prior pending sessions invalidated _before_ minting
  (`proposals/send/route.ts:100`, `change-orders/[id]/send/route.ts:186`).
- **Audit capture happens in the API route** — `x-forwarded-for` first hop + `user-agent`
  (`api/sign/[token]/complete/route.ts:27,33–34` and three siblings).
- **Compare-and-swap on every flip** — `.eq('status','pending')` (`signing-service.ts:210,282`).
- **Render → store → then flip rows.** `signing-service.ts:176–177`: _"if this fails the session stays
  pending and the client can retry."_
- **Post-signature side effects never roll back the signature** (`co-signing-service.ts:188–208`).

### §3.2 — Email

`email-service.ts` (`import 'server-only'`) — `getResend()` `:17`, `buildSenderAddress()` `:26`,
`replaceTemplateVariables()` `:46`, `logEmail()` `:104`, `sendEmail()` `:148`. Sender:
`"${company.name} <${company.slug}@rafterworks.com>"` `:27`. No retry, by design `:145–147`.

Two mandatory follow-ons, both with precedent:

1. **`email_logs` needs a new nullable FK per flow.** `signing_session_id` could not be reused for COs
   (wrong FK target), so `20260710120000:81–85` added `change_order_id` + `co_signing_session_id`,
   both `ON DELETE SET NULL`. 7I does the same for `contract_signing_sessions`.
2. **`email_type` is an FK lookup, not a CHECK** (`20260720000000`). New types are **INSERTs**.

> **BUILD TRAP — copy the CO route, not the proposal route.** `getResend()` **throws** when
> `RESEND_API_KEY` is unset (`email-service.ts:19–20`). The CO route wraps it
> (`change-orders/[id]/send/route.ts:265–289`); **the proposal route does not** — `:146` calls it
> bare, so the throw skips the invalidation branch at `:178–182` and leaves **a live orphaned signing
> link for an email never sent.** 7I extends the proposal route (§5.3) and **must fix this on the way
> through**, because with a contract attached the blast radius doubles.

### §3.3 — Storage

`public.files` — `baseline_schema.sql:1367`. Category CHECK at `:1388` **already allows `'contracts'`**
alongside `photos`, `plans`, `permits`, `invoices`, `change_orders`, `daily_logs`, `receipts`, `other`.
**No constraint change needed.** `[VERIFIED]`

Path precedents: `{company_id}/proposals/{uuid}-{n}-signed.pdf` (`proposal-service.ts:119–120`);
`{company_id}/change-orders/{uuid}-{n}-{variant}.pdf` (`co-pdf-service.ts:61–62`).
**7I uses `{company_id}/contracts/{uuid}-{ref}-{variant}.pdf`.** The CO version sets `project_id` on
the `files` row (`:76–78`); the proposal version passes `null` (`proposal-service.ts:141`) because no
project exists. **The client contract is in the proposal's position — `project_id` is `null` at
generate time and is backfilled at conversion** (§5.6). The sub contract sets it.

### §3.4 — Contractor signature — BUILT

| Piece                                 | Status                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------- |
| `companies.contractor_signature_path` | **LIVE on `main`** — `20260710120000:71`, `bfe5635`, `database.ts:787` |
| Capture UI                            | `settings-form.tsx:43`                                                 |
| Upload/persist                        | `company-client.ts:160–183`                                            |
| In production                         | `api/change-orders/[id]/send/route.ts:92,121,130`                      |

Mode columns on `change_orders`: `contractor_signature_mode` (`saved_image`|`typed_name`),
`contractor_signature_ref`, `contractor_signature_name`. **7I reuses this shape verbatim.**

~~`companies.signatory_name` / `signatory_title` are **net-new and unbuilt**~~ — **CORRECTED
[S145]: BOTH ARE LIVE**, shipped by 7F at `20260922000000`. 7I reads them; it does not add them.
The superseded absence claim was: "zero hits across all
migrations and all `.ts` `[VERIFIED]`. **They belong to 7F** (`7f2-spec` §10.2). **7I consumes them and
must not add them** — a duplicate-column collision is exactly the failure `20260710120000` created for
`email_logs.signing_session_id`. One signatory per company `[S98]`.

---

## §4 — The contract records

### §4.1 — `client_contracts` — `20260704211000:349–366`

```
project_id              uuid NOT NULL → projects(id)
status                  text NOT NULL DEFAULT 'draft'  CHECK draft|sent|signed|void   (:365)
contract_value          numeric                         -- no precision, §10.6
signed_proposal_file_id uuid → files(id)
executed_date           date
notes                   text
```

Triggers present (`:381`, `:395`). Indexes on `company_id`, `project_id`.

**Written by conversion** — `20260731030000:128–138` (live version):

```sql
v_is_signed := (v_estimate.signed_proposal_file_id IS NOT NULL)
               OR (v_estimate.accepted_at IS NOT NULL);          -- :96
INSERT INTO client_contracts (...) VALUES (
  ..., CASE WHEN v_is_signed THEN 'signed' ELSE 'draft' END,
  v_contract_value, v_estimate.signed_proposal_file_id,
  v_estimate.accepted_at::date, auth.uid() );
```

**`status` here means "the proposal was accepted."** Under §1.1(3) that is _also_ true of the
contract, because both are signed before conversion. **That is the whole reason the estimate-stage
ruling matters** — see §5.1.

### §4.2 — `subcontractor_contracts` — `20260704211000:438–457` + two ALTERs

```
project_id  NOT NULL → projects       member_id NOT NULL → company_members
scope_of_work text     -- NOT `scope`
contract_value numeric                signed_doc_file_id uuid → files
status text NOT NULL DEFAULT 'draft'  CHECK draft|sent|signed|void   (:456)
executed_date date                    notes text
-- 20260729010000:341–345
retainage_shape text CHECK NULL OR IN ('percent_across','final_hold')
retainage_percent numeric(5,2) CHECK NULL OR >= 0     -- no upper bound
-- 20260731030000:35–36
requires_formal_contract boolean NOT NULL DEFAULT false
```

**Created at award**, one row per winning bid — `20260731030000:213–221`. Populated: `project_id`,
`member_id`, `contract_value` = winning `bid_amount`, `status='draft'`,
`requires_formal_contract=false`, `scope_of_work` = the winning line's **name**, **`signed_doc_file_id`
= the winning bid's `bid_document_file_id`**.

Left NULL: `executed_date`, `notes`, `retainage_shape`. ~~`retainage_percent`~~ — **CORRECTED
[S145]: `retainage_percent` is PRE-FILLED on insert.**
`20260814000000_sub_retainage_passthrough.sql` (S97) added a BEFORE INSERT trigger that copies
`projects.retainage_percent` onto a new sub-contract — pass-through, INSERT-only, existing rows
untouched. A new contract therefore arrives with a retainage rate already set, which §6.3's
"do not print an unenforced retainage term" guard must account for. **And no schedule** —
`:19–20`: _"NO committed dollars, NO schedule — a draft has no expense rows."_ This is exactly why
Josh ruled the sub contract **cannot be sent at conversion** (§6.2).

> **`signed_doc_file_id` is occupied by the bid PDF at award, before any signature exists.** It is
> **not** a free slot for 7I's executed artifact. 7I stores its own (§10.4).

### §4.3 — RLS on both tables — **REWRITTEN [S145]. The S99 reading is false on two counts.**

> ## ⚠️ SUPERSEDED [S145] — quoted in full, then corrected
>
> _"**`[VERIFIED]`** Unchanged since baseline — grepped all migrations for later policy changes:
> **none**._
>
> ```
> SELECT : company_id = get_my_company_id() AND can_view_project(project_id)   -- NO role floor
> INSERT : owner|admin OR (project_manager AND is_assigned_to_project(project_id))
> UPDATE : owner|admin OR (project_manager AND is_assigned_to_project(project_id))
> ```
>
> _`client_contracts` `:400–431`; `subcontractor_contracts` `:494–524`._
>
> _**An assigned PM can already read, insert and update both rows — including `contract_value` —
> today.** Demonstrated at S97, `GATED.md:122`: "A PM rewrote `contract_value` to 999999 on an
> assigned project."_
>
> **Both bolded claims were true at `d395c01` and are false at HEAD.** This is the section a
> builder would have read to decide 7I's permissions, on a legal document.

**The live policy set, read from `pg_policies` at `b267ed1` [S145]:**

```
SELECT : company_id = get_my_company_id()
         AND get_my_role() <> ALL (ARRAY['subcontractor','client'])   -- ROLE FLOOR, since S133
         AND can_view_project(project_id)
INSERT : owner|admin OR (project_manager AND is_assigned_to_project(project_id))
UPDATE : owner|admin OR (project_manager AND is_assigned_to_project(project_id))
```

**Correction 1 — the SELECT policies DID change.** S133's subcontractor read floor
(`20260912000000_subcontractor_project_read_floor.sql`) added
`get_my_role() <> ALL (ARRAY['subcontractor','client'])` to both. The "no role floor" annotation is
wrong, and "unchanged since baseline" is wrong.

**Correction 2 — a PM CANNOT write `contract_value`, and has not been able to since S97.** RLS
admits the UPDATE; a **column-scope trigger then refuses it**. Read from `pg_get_functiondef`:

| Trigger | Freezes below Owner/Admin |
| --- | --- |
| `enforce_client_contracts_column_scope` (`20260809000000`) | `contract_value`, `signed_proposal_file_id`, `executed_date` |
| `enforce_subcontractor_contracts_column_scope` (`20260808000000`) | `contract_value`, `retainage_percent`, `retainage_shape`, `signed_doc_file_id`, `executed_date`, `member_id` |

Both raise *"The financial terms of a … contract are Owner/Admin only."* Both early-return on
`auth.uid() IS NULL`, so service-role paths are unaffected — see §11.4, where that bypass is
load-bearing.

**Correction 3 — the S97 demo no longer exists to cite.** That write was against
**`projects.contract_value`**, which `20260812000000_drop_projects_contract_value.sql` **DROPPED**;
the figure lives on `project_financials` (`20260811000000`), which is Owner/Admin by RLS. So the
evidence is dead in both places at once: the column is gone, and the tables the spec pointed at are
trigger-frozen.

**What an assigned PM can still do:** read both rows, insert them, and update their non-financial
columns (`scope_of_work`, `notes`, `status`). That is the real surface 7I must reason from.

See §8 for the role ruling this supports.

---

## §5 — The client contract: an ESTIMATE-STAGE document `[S99]`

### §5.1 — Why this removes the status collision

Rev 1 assumed a project-stage contract and hit a hard conflict: conversion already stamps
`client_contracts.status='signed'` and `executed_date` from the **proposal's** acceptance, before any
contract document could exist.

Under §1.1(3) the conflict does not arise. **Both signatures land on the estimate, before conversion.**
`v_is_signed` is true because the proposal was signed; the contract was signed in the same ceremony;
`status='signed'` at conversion is accurate for both. **7I never writes `client_contracts.status` and
never amends the conversion status logic.**

> **`[RULED — Josh, S145: option (ii), ACCEPT IT]` §5.1a — the one residual edge.**
> The Contracts panel shows the contract's own state; conversion is not amended. Option (i) — teaching
> `v_is_signed` about the contract toggle — is **recorded as owed**, not taken: it would be the
> **sixth** redefinition of `convert_estimate_to_project` across six migrations, and S143 proved what
> happens when a function body drifts from the migration a spec cites.
>
> ⚠️ **[S145] AND THIS CITATION IS ITSELF STALE BY TWO MIGRATIONS.** The live owner of
> `convert_estimate_to_project` is **`20260817000000_drop_budgeted_amount.sql`**, not
> `20260731030000`. The chain is `20260704212000` → `20260730010000` → `20260731030000` →
> `20260811010000` → `20260817000000`. The `v_is_signed` predicate is **byte-identical** across all
> five and the live function knows nothing of any contract toggle (verified against `pg_proc`), so
> the edge below is real and unchanged — but anyone amending the cited migration would be editing a
> superseded body.
>
> _Superseded citation, quoted:_ `v_is_signed` (`20260731030000:96`) tests
> **proposal** signals only. If the toggle is on and the client signs the proposal but **declines or
> ignores the contract**, conversion still stamps `'signed'`. Two ways: (i) amend `v_is_signed` to also
> require the contract signature when the toggle was on for that estimate, or (ii) accept it and let
> the Contracts panel show the contract's own state. **(i) is a Module 5 RPC change; (ii) is free.**

### §5.2 — `[S99 — RULED]` The toggle is TWO-LEVEL

Josh: _"the toggle should live as a master in company settings with the templates **and on each
proposal for the user to decide if they want a contract or not**."_

| Level            | Column                                                              | Meaning                                                                                               |
| ---------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Master**       | `companies.client_contracts_enabled boolean NOT NULL DEFAULT false` | The company uses client contracts at all. Off → the whole surface is hidden and behaviour is today's. |
| **Per proposal** | `estimates.include_client_contract boolean NOT NULL DEFAULT false`  | _This_ job gets one. Only offered when the master is on.                                              |

**The per-proposal toggle is the trigger for everything conditional in this spec.** It is what surfaces
the estimate-side fields (§7.5b), what makes them required at send, and what tells
`api/proposals/send/route.ts` to render and attach a second PDF. One flag, read in three places —
rather than three independent conditions that can drift apart.

- Templates are `contract_templates` rows with `document_kind = 'client_contract'`, **a separate set
  from sub templates** `[S99]`.
- **`[RESOLVED §5.2a]`** Templates remain **authorable while the master toggle is off** — only the send
  flow is gated. It lets a company set up before going live, and it is reversible.

### §5.3 — Send: the contract rides the proposal

`apps/web/app/api/proposals/send/route.ts` today: Owner/Admin `:40–45` → status must be `draft|review`
`:67` → contact email required or 422 `:79–84` → invalidate prior sessions `:100` → create session
`:103` → `generateProposalPDF` `:117` → template vars `:124–143` → `sendEmail` `:146–163` with the
**unsigned proposal PDF** attached `:157–162` → `logEmail` `:165–176` → flip estimate to `sent` via the
**RLS client** `:194–197`.

**7I extends this route.** When `client_contracts_enabled` and a client-contract template is selected:

1. Resolve values (§7), **show the user every value and let them edit** before anything renders
   `[S98 §3.3, carried]`, and **warn on any overflow** (§2.2).
2. Stamp the contractor signature from `companies.contractor_signature_path`, render **v1**, store it.
3. Attach **both** PDFs to the one email. One email, one link, one ceremony.
4. `logEmail` records the contract type (new `email_types` row).

**Ordering:** render and store the contract **before** the estimate status flip, matching
`signing-service.ts:176–177`. **And wrap `sendEmail` in try/catch** — §3.2's trap.

> **`[OPEN — JOSH] §5.3a` — one signature or two?** The client receives one email with two documents.
> Does the signing page capture **one signature applied to both**, or **two separate signature steps**
> in the one session? _(Suggested: two steps in one session — the client explicitly signs each
> instrument, which is what a contract deserves, and it costs one extra pane. But this is a legal-feel
> question, not a build one.)_

### §5.4 — Sign

Extends `apps/web/app/sign/[token]/` and `signing-service.ts`. **No new signing primitive** — same
service-role client, same token validation (`getActiveSessionByToken`, `signing-service.ts:67–81`:
no row / `status !== 'pending'` / expired, all collapsing to one generic error card), same
compare-and-swap, same route-level IP + user-agent capture.

On completion: render **v2** (fully executed), store it, write the signed file reference to the
estimate (§10.3), then flip the session. **Both artifacts retained.**

- **Expiry: 30 days default, user-editable at send** `[S99]`. Note the proposal side currently derives
  expiry from `estimates.expiration_days` (`proposals/send/route.ts:96–97`). With one shared session,
  **the session's expiry stays the proposal's** — the contract inherits it. `[Recorded, not a
question: one link cannot have two expiries.]`
- **Decline:** the client half uses the existing `signing_sessions.decline_reason` CHECK
  (`baseline_schema.sql:1481`). Free text is the **sub** ruling (§6.5).

### §5.5 — Notary path

`[S99]` The user chooses **per send**: electronic signature, or **notary needed**. On the notary path
FrameFocus renders the signature area blank, the company prints/notarizes/uploads the executed copy,
and **both files are retained** — the generated blank and the notarized upload. Only the upload is
legally operative; the pair is the audit trail. Mirrors 7F's notary handling.

On the client half at estimate stage, the notary path means the proposal still sends normally and the
contract is delivered for wet signature. **`[OPEN — JOSH] §5.5a`** — does choosing notary suppress the
tokenized contract-signature step while keeping the proposal's, or does the whole email go
non-tokenized? _(Suggested: proposal keeps its link; the contract simply carries no signature box.)_

### §5.6 — Conversion carries it forward

`convert_estimate_to_project` must carry the executed contract file into `client_contracts` the same
way it carries `signed_proposal_file_id` today (`20260731030000:135`). That is a **Module 5 RPC
amendment** — see the amendment note. Also: the `files` row was created with `project_id = null`
(§3.3); **backfill it at conversion**, as the proposal artifact should be and is not.

---

## §6 — The sub contract: a PROJECT-STAGE document

### §6.1 — `[S99 — RULED]` Created at conversion, sent later, surfaced as a badge

Josh: _"when estimate is converted to project. At that point it is added as a task for the user to
send. cannot send right away because user has to set up project, input retainage, if any, add payment
schedule, etc."_ — and, on how that task is represented: **B, a to-do indicator on the Contracts
panel. No `tasks` row.**

> **Why B is the right call, recorded so it is not revisited:** `tasks` is real
> (`20260704213000:63`) and already carries `change_order_id` with the FK wired as an explicit "5B
> forward hook" (`20260704215000:313–319`), so a task-linked-to-a-contract has precedent. **But
> nothing auto-creates a task anywhere on the platform** — zero `INSERT INTO tasks` across all 47
> migrations `[VERIFIED]`. Option A would have made 7I the first, and grown the conversion RPC an
> INSERT. B keeps it inside 7I.

**The badge needs no new column on the sub side.** It is derived, and the derivation **already
ships**:

```
requires_formal_contract = true  AND  status <> 'signed'
```

That is exactly `getFormalContractWarning` (`payables-client.ts:98,101`) and `budget.ts:145`'s
`awaitingContracts` set. **7I reuses both.** The badge is a second presentation of a predicate the
codebase already computes.

### §6.2 — Send

Manual, from the project's Contracts panel, once the schedule exists. **A contract cannot be generated
at award** — `20260731030000:19–20`: a draft has no expense rows, so there is no schedule to print
(§6.3), and no retainage yet.

Delivery is `[S99]` per-send choice: **electronic signature** (tokenized link — **gated, §9**) or
**notary needed** (send the PDF, upload the executed copy back — **not gated**).

### §6.3 — `[S99 — RULED]` The payment schedule prints inside the sub contract

> **This is net-new, not a restatement.** `113c-spec.md` contains no such statement; all 35 "schedule"
> hits are data/RPC/editor-level. Josh ruled it this session. 113c is owed the amendment (see notes).

**The trace** `[VERIFIED]` — there is **no payment-schedule table**. A sub's schedule _is_ a set of
`expenses` rows:

| Field        | Source                                                                                 |
| ------------ | -------------------------------------------------------------------------------------- |
| link         | `expenses.sub_contract_id` → `subcontractor_contracts(id)` — `20260729010000:45`       |
| stage name   | `expenses.stage_label` text, nullable, free text — `:47`. **The only stage identity.** |
| stage amount | `expenses.amount` (base column)                                                        |
| retainage    | `subcontractor_contracts.retainage_shape` / `retainage_percent` — `:341–345`           |

Written by **`setup_payment_schedule`** — superseded original at `20260729010000:475–573`, authoritative
`CREATE OR REPLACE` at `20260730010000_money_representation.sql:1195–1313`. Signature
`(p_sub_contract_id, p_stages jsonb, p_retainage_shape, p_retainage_percent)`, SECURITY **INVOKER**.
Inserts one `expenses` row per stage `:1279–1285` (`state='committed'`, `expense_date = CURRENT_DATE`,
`status` defaulting to `'pending'`); sets retainage on the contract `:1300–1303`. Client wrapper
`payables-client.ts:173–226`. Revise path: `revise_sub_contract_schedule`, `20260731050000:36`
replaced by `20260731060000:62`.

> **BUILD REQUIREMENT — read via `getSubSchedule`, never via the list path.**
> `getSubSchedule(subContractId)` (`payables.ts:136–164`) orders `created_at` **ASC** and is correct —
> **and has zero callers.** The Contracts page uses `getBillsAndCommitments`, which sorts **DESC**
> (`payables.ts:80–84`); every stage from one setup call shares `expense_date = CURRENT_DATE`, so the
> tiebreak is `created_at` DESC. **The panel renders stages newest-first today.** A contract built
> from the page's data would print "Final" first. **There is no stage-order column** — grepped
> `stage_order|stage_sequence|sort_order|stage_index|sequence_number` across all migrations,
> `database.ts` and `apps/web/lib/`: no hit on `expenses`. `created_at` ASC is the only ordering.

> **BUILD GUARD — do not print an unenforced retainage term.** `retainage_shape = 'final_hold'` is
> accepted by the CHECK and **acted on nowhere**: the only withholding branch,
> `record_expense_payment` `20260729010000:678–687`, fires on `'percent_across'` only. And
> `contracts-panel.tsx:885–886` renders `"({percent}% across payments)"` **regardless of shape**. 7I
> must branch on the actual shape, and **must not print a percentage for `final_hold`.**

**Snapshot, do not re-derive.** The rendered schedule is frozen into the artifact and into
`filled_values` (§10.4). A revise after signature must never silently change what the sub signed.

### §6.4 — Review and edit

Same as the client half: every resolved value is shown and editable before render `[S98 §3.3]`, with
overflow warnings (§2.2).

### §6.5 — Sign

Tokenized path mirrors §3.1 exactly, at `/sign-contract/[token]`. **Decline is free text for subs**
`[S99]` — no reason-code CHECK, matching `co_signing_sessions`' shape rather than
`signing_sessions`'. **Expiry 30 days, user-editable** `[S99]`; the sub contract has its own session,
so unlike the client half it genuinely controls its own expiry.

On completion: render v2, store, set `subcontractor_contracts.status = 'signed'` and `executed_date`
(company timezone, §11.3). **That is what finally makes `requires_formal_contract` mean something
observed** — `GATED.md:25–27`.

---

## §7 — Value catalog — mapped against a real contract

`[S99]` Josh supplied **`Contractor Agreement BLANK.docx`** — Worth Properties' live client agreement.
Every fill-in blank in it was read and mapped. This section is now grounded in a real instrument
rather than assumed.

### §7.0 — The blanks in Josh's contract, and where each resolves

| Blank in the document                                    | Source                                                                                                                                                               | Status                                |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `("Owner")` — party name                                 | `contacts` via `estimates.contact_id`; `company_name`, else `first_name + ' ' + last_name` (**both NOT NULL**, so the fallback can never be empty — keep that order) | ✅                                    |
| `at the following location: ____` — Premises/Project     | `contact_addresses` via `estimates.contact_address_id`                                                                                                               | ✅ _(nullable — see the guard below)_ |
| Effective Date                                           | execution date, **company timezone** (§11.3)                                                                                                                         | ✅ _(see §7.0a)_                      |
| `ISSUED TO CUSTOMER:` (Exhibit C)                        | same owner name                                                                                                                                                      | ✅                                    |
| Contractor `By:` + `Date:`                               | `companies.contractor_signature_path` + company-timezone date                                                                                                        | ✅                                    |
| §3B `within _______ (__) calendar days`                  | **nothing**                                                                                                                                                          | ❌ §7.3a                              |
| Owner `Printed Name:` ×2, signature ×2                   | one signer only                                                                                                                                                      | ❌ §7.3b                              |
| Owner-as-entity `Title:`                                 | `contacts` has no title column `[VERIFIED]`                                                                                                                          | ❌ §7.3c                              |
| §12B `______ Initial`                                    | nothing captures an initial                                                                                                                                          | ❌ §7.3d                              |
| Exhibit B — Progress Payment Schedule                    | **declared dependency**, §7.2                                                                                                                                        | ⏸                                     |
| Exhibit D — Plans and Specifications                     | attachment, §7.4                                                                                                                                                     | ✅ once §7.4 builds                   |
| ~~Exhibit A — Scope of Work + Good Faith Cost Estimate~~ | **`[S99]` Josh is removing it from the document.**                                                                                                                   | —                                     |

> **`[S99]` Exhibit A is being removed.** Flagged for Josh, not actioned here: **§1 (`Work… more fully
described in Exhibit A`) and §4B (`the Good Faith Cost Estimate of the Scope of the Work, as set
forth on Exhibit A`) both reference it in the body**, and §2's Contract Documents list enumerates it.
> Removing the exhibit means those three clauses need rewording too, or they point at nothing. That is
> Josh's document to edit — under overlay-only FrameFocus authors no legal text.

#### §7.0a — `[S99 — RULED]` Effective Date = the date all parties sign

The document as written said _"the date it is **last signed by Contractor**"_ — which inverts 7I's
order, since the contractor signs first at send (v1) and the client countersigns (v2). That wording
would have made the Effective Date the _send_ date, predating the client's signature.

**Josh is rewording the clause to "the date all parties sign."** `[S99]` Consequence, and it is a
simplification worth stating: **`Effective Date`, `executed_date`, and the countersignature date are
one event and one value.** The resolver emits a single company-timezone date (§11.3) for all three.
No two-date mapping, no reconciliation.

### §7.1 — Values confirmed available `[VERIFIED]`

| Key                                 | Client (estimate stage)                                                                                                    | Sub (project stage)                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Contractor name / address / license | `companies.name`, `address_line1/2`, `city`, `state`, `zip`, `license_number`                                              | same                                                                   |
| Signatory name / title              | ~~7F, unbuilt~~ **LIVE [S145]** — `companies.signatory_name` / `signatory_title`, shipped `20260922000000`                 | same                                                                   |
| Counterparty                        | `contacts` via `estimates.contact_id` (**NOT NULL**) — `company_name`, else `first_name + ' ' + last_name` (both NOT NULL) | `company_members.display_name` via `subcontractor_contracts.member_id` |
| Property address                    | `contact_addresses` via `estimates.contact_address_id` — **nullable**                                                      | via `projects.contact_address_id` — **nullable**                       |
| Scope                               | `estimates.scope_summary`, `scope_sections`                                                                                | `subcontractor_contracts.scope_of_work`                                |
| Contract value                      | `estimates.grand_total` (or `projected_value` for cost-plus/T&M, money-rep P11)                                            | `subcontractor_contracts.contract_value`                               |
| Contract type                       | `estimates.contract_type` — money-rep P4, the type lives on the instrument                                                 | project-level                                                          |
| Payment schedule                    | _(n/a — client stages are 7D's invoicing schedule, not printed here)_                                                      | **§6.3**                                                               |
| Retainage                           | _(n/a in v1)_                                                                                                              | `retainage_shape` / `retainage_percent`, §6.3 guard                    |
| Estimated timeframe                 | **`[GAP]` — see below**                                                                                                    | `projects.start_date` / `target_end_date` `[VERIFIED]`                 |
| Terms                               | `estimates.terms_sections`                                                                                                 | —                                                                      |
| Date                                | generation date, **company timezone** (§11.3)                                                                              | same                                                                   |

> **BUILD GUARD — the property address is nullable on both sides.** `estimates.contact_address_id` and
> `projects.contact_address_id` are both nullable `[VERIFIED]`. If the template places a property-address
> box, **generation must refuse rather than render a blank required field** — 7F's rule, same reasoning.

### §7.2 — `[S99]` Exhibit B — the client payment schedule is a DECLARED DEPENDENCY, not 7I's

Josh: _"payment schedule has not been established yet. That is something that should be added to the
estimate. Then it should ship with an estimate, regardless of contract. if user leaves it blank, the
client doesn't see anything. when payment schedule it made and estimate converts to project, the
invoices are derived from that with the ability to edit."_

**`[S99 — RULED]` This is specced separately.** It spans four modules — capture on the estimate (M4),
render in the proposal (4F), carry at conversion (M5), derive invoices (7D) — and it **reverses a
locked 7D boundary**:

> `20260802000000_7d_invoicing.sql:30` — _"NO draw-schedule object (§1 v1 boundary — the user types
> each draw)."_
> `7d1-spec.md:97–102` — _"**v1 scope boundary (locked):** … there is no automatic draw schedule and
> no draw-schedule object in v1."_
> `7d1-spec.md:107–112` — _"[S97 — recorded, deliberately NOT resolved: **Josh's own contracts carry a
> > milestone percentage schedule in the agreement itself** (trace G), while v1 keeps no draw-schedule
> > object — he types each draw by hand. A stored draw schedule is a deferred enhancement alongside the
> > AIA work, **not a v1 change**.]"_ `[All three VERIFIED verbatim.]`

Trace G (`7d1-spec.md:901–910`) already carries Josh's real numbers: $14,413.75 — deposit 10%, permit
approval 30%, rough-in 25%, cabinets 25%, substantial completion 10%.

**7I's relationship to it is one sentence: 7I renders the estimate's payment schedule as Exhibit B and
owns nothing about it.** No capture UI, no derivation, no invoice seeding.

> **This dependency STRENGTHENS the estimate-stage ruling rather than threatening it.** Because the
> schedule lives on the estimate, Exhibit B exists at proposal send and the contract assembles
> complete. Had the schedule been project-stage, §1.1(3) would have had to be reopened.

**Sequencing:** the schedule spec is not a blocker for 7I stages 1, 3 or 4 (§13). It blocks only the
Exhibit B box on a client-contract template. Starting brief: `claude/S99-payment-schedule-brief`.

### §7.3 — `[GAP]` Four values Josh's contract needs that nothing supplies

#### §7.3a — Substantial Completion duration, in calendar days

§3B: _"achieve Substantial Completion of the Work within ********\_\_\_******** (\_\_) calendar days
following the later of (i) Date of Commencement; or (ii) issuance of all permits."_

**Not derivable from `start_date` / `target_end_date`.** The clock starts at Date of Commencement,
which §3A puts _"within ninety (90) business days after the date of Acceptance"_ — an unknown offset at
signing. A date range cannot produce this number.

**Net-new: `estimates.substantial_completion_days integer`** (§10.3). It is printed **twice** — spelled
out and as a numeral — so the resolver emits both from one value (`120` → `"one hundred twenty"` and
`"120"`). Two value keys, one column.

#### §7.3b — `[S99 — RULED]` ONE signature

The block carries `OWNER [IF INDIVIDUAL(S)]` with two signature + `Printed Name:` pairs, and Exhibit C
ends with two `(Customer)` lines. **Josh ruled one signature is needed.**

**This is the cheapest possible answer and it costs nothing to build:** `signing_sessions` already
supports exactly one signer `[VERIFIED` — one `recipient_email` (NOT NULL), one `signer_name`, one
`signature_data`, one `signer_ip`, one `signer_user_agent`]. **No schema change, no second session, no
partially-signed state, and the audit trail stays unambiguous** — one IP, one user agent, one signer.

**And it collapses §5.3a.** With one signer and one `signature_data`, the client's single signature
applies to **both** the proposal and the contract in the one session. Two signature slots would have
been needed for two separate acts; one is what ships.

> **Build note, not a question:** the second `Printed Name:` / signature line on Josh's form simply
> renders blank. It is on the page because his PDF has it. Under overlay-only FrameFocus places no box
> there and authors nothing — the line is available for wet signature if a second owner ever needs it.

#### §7.3c — `[S99 — RULED]` `OWNER [IF A LEGAL ENTITY]` is manual entry

Josh: _"leave as a manual entry."_ → **`custom` boxes**, company-labelled and hand-filled, which is
exactly what that box kind exists for (`7f2-spec` §3, ruled required at `S98-7F-decisions-ruled` §8.5).

**No `contacts.title` column. No schema change.** Entity owners are the minority path, and a column
would sit null on nearly every row.

> **`[CORRECTION]` — a claim I could not confirm, recorded so it is not repeated.** It was suggested
> this field comes from 7F. **It does not.** 7F's `signer_title` / `companies.signatory_title` is the
> **"Its:" line on the Florida statutory form** — _the contractor's own_ authorized signatory, signing
> on behalf of the lienor company (`7F-field-inventory` §4.5: `SETTINGS → authorized-signatory
record`; `7F-template-definitions` box #10). The owner-entity `Title:` here is the **client's**
> signer — different party, different table, and `contacts` carries no title column at all
> `[VERIFIED` — full column list read from `database.ts`]. Two similarly-named fields on two sides of
> the transaction. **7F supplies nothing here.**

#### §7.3d — `[S99 — RULED]` Initials: typed **and** drawn

§12B requires the Owner's initials on the Chapter 558 notice-and-cure clause, separately from the
signature. Josh: _"offer typed initials as well as drawn."_

**Mirror the shipped signature capture exactly** — `signature_type ∈ ('draw','type')`
(`baseline_schema.sql:1482`), with typed input rasterized client-side to a PNG data URL before submit,
the same way `typedToDataUrl` does at `signing-client.tsx:51–62`. **One code path serves both modes**,
which is why the proposal flow does it this way.

Storage: `initial_data` + `initial_type` on the signing session, beside `signature_data` /
`signature_type`. Rendered into any box of kind `initial` — **a fourth box kind is warranted here**,
because unlike a scaled-down signature it carries its own captured value and must be distinguishable in
the audit trail. **This propagates to 7F's engine** (see the amendment note).

### §7.4 — `[S99 — RULED]` Attachments

Josh: _"provide a method for attachments."_ Exhibit D (Plans and Specifications) is the named case;
the document itself says it _"shall become part of this Agreement when received by Contractor"_, so
attachments can arrive **after** execution.

```
contract_document_attachments
  contract_document_id  uuid NOT NULL → contract_documents(id)
  file_id               uuid NOT NULL → files(id)
  label                 text NOT NULL      -- e.g. "Exhibit D — Plans and Specifications"
  sort_order            integer NOT NULL
  attached_after_execution boolean NOT NULL DEFAULT false
```

- **Attached before send** → merged into the rendered PDF, in `sort_order`, after the agreement body.
  `pdf-lib` concatenates page ranges; no new dependency.
- **Attached after execution** → **never merged into the executed artifact.** v2 is frozen
  (`signed-artifact-spec.md:194,199`). It is stored as a linked file with
  `attached_after_execution = true`, so the record shows what arrived later without rewriting what was
  signed. **This is the rule that keeps the artifact honest.**
- Non-PDF uploads are stored and linked but not merged.

### §7.5 — `[S99 — RULED]` Project-level contract values move to the estimate side, conditionally

Josh, this session:

> _"when contract is selected, the user will have to set the values that would have been set when the
> project is created. Those values should be moved to the estimate side and input then, **but only
> when a contract is selected**."_

This generalises what was an open gap about "estimated timeframe" into a rule, and it is the right
one: **a contract cannot print a value the system does not have yet.** Under §1.1(3) the contract is
generated at proposal send, so anything it needs must exist on the estimate at that moment.

#### §7.5a — Exactly which values these are `[VERIFIED]`

Diffed the `projects` and `estimates` column sets from `packages/shared/types/database.ts`. Ten
`projects` columns have no estimate counterpart:

```
actual_end_date  change_order_sequence  contract_value  project_internal_seq  project_number
project_type     retainage_percent      source_estimate_id  start_date        target_end_date
```

Sorting them by whether a contract could print them:

| Column                                                                                  | Contract-relevant?                                                                   | Action                                                                                  |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `start_date`                                                                            | **Yes** — the timeframe Josh named at D-1                                            | **Move to the estimate**                                                                |
| `target_end_date`                                                                       | **Yes** — same                                                                       | **Move to the estimate**                                                                |
| `retainage_percent`                                                                     | **`[CORRECTION]`** — see below                                                       | **Move, as an OPTION**                                                                  |
| `project_type`                                                                          | **`[S99 — RULED]` No.** _"no project type needed."_ Josh's contract never prints it. | **Dropped**                                                                             |
| `legal_description` _(7F net-new on `projects`)_                                        | **`[S99 — RULED]` Yes** — see below                                                  | **Move: net-new `estimates.legal_description`**                                         |
| `contract_value`                                                                        | No move needed                                                                       | already `estimates.grand_total`, or `projected_value` for cost-plus/T&M (money-rep P11) |
| `actual_end_date`                                                                       | No — post-hoc, cannot exist at contract time                                         | —                                                                                       |
| `project_number`, `project_internal_seq`, `change_order_sequence`, `source_estimate_id` | No — internal sequencing                                                             | —                                                                                       |

Everything else a contract needs is **already shared** between the two tables: `name`, `contact_id`,
`contact_address_id`, `scope_summary`, `scope_sections`, `terms_sections`, `cover_letter`, `tax_rate`,
`internal_notes` `[VERIFIED]`.

> **`[CORRECTION]` — my earlier justification for `retainage_percent` was wrong.** Rev 2 asserted _"a
> client contract states retainage terms."_ **Josh's actual contract contains no retainage clause at
> all** — it uses a 35% deposit (§4B) plus progress payments instead. The column moves anyway, but on
> the correct basis: **`[S99]` Josh — _"provide retainage percent as option for other users."_** It is
> optional, nullable, and unused by Worth Properties' own instrument. **Do not build any UI that
> implies it is required.**

#### §7.5c — `[S99 — RULED]` `legal_description` needs an estimate-side twin

Josh: _"this is also added in 7f-lien. give users the ability to use the field in the contract."_

**The 7F half is BUILT [S145]** — `projects.legal_description` is live (`20260922000000`), so the
twin below is the only half still owed. _Superseded wording: "The 7F half is confirmed `[VERIFIED]`
— `7f2-spec` §10.1 **adds**"._ For the record, that section reads: `7f2-spec` §10.1 adds
`projects.legal_description text
NULL`, user-entered on project overview/detail, printing alongside the address. _(Note this reverses
S98's earlier D6 recommendation of "no column in v1", which the S98 build spec already superseded.)_

**But a project does not exist when the client contract generates** (§1.1(3)). So making the field
usable in the contract requires a twin: **`estimates.legal_description text NULL`** (§10.3), carried
into `projects` at conversion alongside the other movers (§7.5b).

> **`[CORRECTION]` — this reverses my own rev-3 call.** Rev 3 ruled it "not in v1" on the grounds that
> Josh's contract identifies the Premises by street address. That reasoning was sound for _his_ form
> and wrong for the ruling, which is about **giving users the ability** to use the field. Also
> withdrawn: rev 3's claim that this had to be decided "before 7F's migration lands." **There is no
> coupling** — `projects.legal_description` and `estimates.legal_description` are different tables, and
> either can land first.

#### §7.5b — How it behaves

- **Net-new nullable columns on `estimates`** (§10.3), captured on the estimate form.
- **Conditionally surfaced and conditionally required:** the fields appear only when
  `companies.client_contracts_enabled` is on **and** the user has selected a contract template for
  that estimate. **Off → the estimate form is unchanged, byte for byte.** This is Josh's _"but only
  when a contract is selected"_ and it is a hard requirement, not a nicety.
- **`[BUILD GUARD]` Required at SEND, not at estimate create.** Same reasoning 7F applies to invoices:
  gate the moment the document leaves the building, not the moment the record is created. An estimate
  in `draft` may carry blanks; `api/proposals/send/route.ts` refuses to send a contract with an unfilled
  required value box, exactly as generation refuses a blank property address (§7).
- **Conversion carries them into `projects`.** `convert_estimate_to_project` does **not** set
  `start_date`, `target_end_date` or `retainage_percent` today `[VERIFIED` — they are absent from the
  `projects` INSERT at `20260731030000:110–125`, which is why they are entered post-conversion now`]`.
  With the toggle on they are already answered, so **conversion copies them across and the user is not
  asked twice.** With the toggle off, behaviour is unchanged. **This is a Module 5 RPC amendment** —
  see the amendment note.
- **The estimate stays the source of truth for what was signed.** If a value changes on the project
  afterwards, the contract artifact and its `filled_values` snapshot (§10.4) do not move. The client
  signed what the client saw.

---

## §8 — Roles — `[S99 — RULED: Owner/Admin only]` · **reasoning REWRITTEN [S145]**

> ## ⚠️ THE THIRD LEG WAS SUPERSEDED BY EVENTS. Quoted, then replaced.
>
> _"**But the gate is UI-only.** `CLAUDE.md:403`: 'the **DB-level floor is NOT yet in place**… treat
> the floor as UI-only and defense-in-depth-incomplete.' The shipped RLS on both contract tables
> admits an assigned PM to SELECT/INSERT/UPDATE (§4.3), and S97 proved a PM writing `contract_value`
> (`GATED.md:122`). **7I's role gate is a UI gate over an open database, and the spec says so rather
> than pretending otherwise.** The fix is the named `FINANCIAL-RLS-FLOOR` follow-up — not 7I's."_
>
> **Every sentence of that is now false**, and it is the most dangerous paragraph in the document:
> a builder following it either skips a database gate believing one pointless, or finds the triggers
> and stops trusting the spec.
>
> | The claim | HEAD |
> | --- | --- |
> | `CLAUDE.md:403` says the floor is not in place | **That line does not exist.** `CLAUDE.md:556` reads: *"three of the four figure families are now DB-enforced as well. The previous text here — 'the DB-level floor is NOT yet in place' — is superseded."* Both cited offsets (401, 403) now land in the Service Layer Pattern section. |
> | RLS admits a PM to write contract value | **Refused by column-scope trigger** on both tables — §4.3. |
> | S97 proved a PM writing `contract_value` | **Against a dropped column** (`projects.contract_value`, `20260812000000`). |
> | The fix is the FINANCIAL-RLS-FLOOR follow-up | **It landed** — `20260806000000` and its three parts, S97. |

**The ruling is unchanged: Owner/Admin only.** Two of the three original legs survive intact, and the
third now argues the opposite way.

- **The Financial Visibility Floor argument is VALID here, unlike in 7F.** `CLAUDE.md`'s S97 carve-out
  admits a PM to _"the amounts ON an invoice they can reach"_ but states it _"does **NOT** extend to
  contract value… which remain Owner/Admin on **every surface**."_ A contract displays contract value.
  **7F had to strike this reasoning; 7I does not.** Do not "fix" this gate by analogy to 7F.
  _(Cited by section, not by line number — the line moved once already.)_
- **money-rep P9** widens PM to actual **and committed** and leaves sell/budget figures Owner/Admin —
  it does not reach contract value either.
- **And the database already agrees.** `FINANCIAL-RLS-FLOOR` shipped at S97; `project_financials`
  holds contract value behind an Owner/Admin policy; both contract tables freeze their financial
  columns below Owner/Admin. **7I's Owner/Admin gate is therefore consistent with a floor that is
  already enforced, not a UI veneer over an open table.**

**New 7I tables get Owner/Admin-only RLS for SELECT as well as write**, deliberately narrower than
7E's payment tables (which admit `project_manager` on SELECT). **This is now the same shape 7F
shipped** (`20260922000000` — Owner/Admin on all three lien-release tables, SELECT included), so it
is the house pattern for legal documents rather than an outlier needing its own defence.

> **[S145] And 7I's own writes need a database guard too — `[C5 — RULED]`.** `contracts-panel.tsx:145`
> already voids a client contract through `updateClientContract`, and **`status` is not among the
> columns either column-scope trigger freezes** — so an assigned PM can void a contract today with no
> database opinion at all. That is the invoice-void defect class (S143, `20260923000000`) on a legal
> document. 7I ships `enforce_contract_void_authority` alongside its tables.

---

## §9 — Gate 1 — **citations refreshed [S145]; the conclusion is unchanged and better founded**

> **[S145] Gate 1 was RE-SCOPED at S140** and every line number this section quoted has moved.
> _Superseded citations: `GATED.md:15–46`, `:23–35`, `:42–44`._ The re-scope happened because Gate 1's
> opening sentence — *"nothing that puts a FrameFocus surface in front of someone outside the company
> ships"* — had become false: `/sign/[token]`, `/sign-co/[token]` and 7D's invoice email had all
> shipped under it.
>
> **That re-scope strengthens this section rather than weakening it.** Gate 1 now states positively
> what it still protects, and item 3 is *"NEW, RECURRING external surfaces — a surface aimed at a
> party the platform does not email today, **most notably subcontractors** (113c stage 6 below)"*
> (`GATED.md:49`). 7I's sub e-signature is not merely still named — it is now the **paradigm case**.

Gate 1 blocks, by name (`GATED.md:58`): _"#113(c) stage 6 — 7F sub-contract template + sub-facing
e-signature… This is also what gives the 'contract isn't signed' state real backing."_
**That is §6 described exactly.** Unblockers: **RESEND secret, domain cutover, login branding**
(`GATED.md:77–80`).

The honest comparison the brief asked for:

- **Mechanically, nothing distinguishes it** from the two live cases. Tokenized external signing ships
  twice (`signed-artifact-spec.md:62`), and the RESEND block is **environmental, not architectural** —
  `email-service.ts:19–20` is the only gate in the codebase; no feature flag, no allowlist.
- **Administratively, everything does.** 7F's sub-inbound was deferred _by inference_, which is why
  S98 could reason it back in. **7I's sub e-signature is a named line item inside the gate.** A spec
  does not overturn a gate — `signed-artifact-spec.md:64`.

**What this means for the build, and it is the sequencing spine:**

| Half                                       | Gated?                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| **Client contract** (§5)                   | **No.** Proposals already mail tokenized links to clients in merged production code. |
| **Sub contract — notary path** (§6.2)      | **No.** Send the PDF, upload the executed copy back. Zero external surface.          |
| **Sub contract — e-signature path** (§6.5) | **Yes.** Named in Gate 1.                                                            |

**`[S99]` Josh chose both delivery options, so the sub half builds in two stages: notary first, the
tokenized link when Gate 1 clears.** Nothing else waits.

---

## §10 — Schema

### §10.1 — `companies`

```sql
ALTER TABLE public.companies
  ADD COLUMN client_contracts_enabled boolean NOT NULL DEFAULT false;
```

> **NOT here:** `signatory_name` / `signatory_title` — **7F's** (§3.4).
> **`companies` is a known trigger holdover** — missing `companies_set_updated_by`, and
> `company-client.ts` sets `updated_at` explicitly (`CLAUDE.md:280`). **Do not copy that pattern.**

### §10.2 — `contract_templates` + `contract_template_boxes` `[S99 — option B]`

Per-tenant, per `CLAUDE.md:221–266`: standard columns, the **three column defaults**
(`company_id`/`created_by`/`updated_by` — `:237–239`; omit them and the client INSERT sends
`company_id = NULL`, RLS fails, and you get a 403 that does not point at the cause, `:242`), the
`{table}_updated_at` + `set_{table}_updated_by` trigger pair **in the same migration** (`:248–263`),
RLS, soft delete.

```
contract_templates
  name              text NOT NULL
  document_kind     text NOT NULL CHECK IN ('client_contract','sub_contract')   [S99]
  pdf_file_id       uuid → files(id)          -- category 'contracts', §3.3
  is_default        boolean NOT NULL DEFAULT false
  -- NO type/is_final. Those are lien-release axes and do not exist here.

contract_template_boxes
  template_id  uuid NOT NULL → contract_templates(id)
  page         int NOT NULL
  x, y, width, height   numeric NOT NULL     -- FRACTIONS of page w/h. Never points.
  kind         text NOT NULL CHECK IN ('value','signature','initial','custom')   -- 'initial' §7.3d
  value_key    text        -- when kind='value'
  custom_label text        -- when kind='custom'
```

Shape-check `value_key`/`custom_label` against `kind`, following the `invoices_void_shape_check`
precedent.

### §10.3 — `estimates` — carrying the client contract

```sql
ALTER TABLE public.estimates
  ADD COLUMN signed_contract_file_id uuid REFERENCES public.files(id);
```

The exact parallel of `estimates.signed_proposal_file_id` `[VERIFIED — present in `database.ts`
estimates Row]`. Written at contract signature (§5.4), read by conversion (§5.6).

**Plus the project-level values Josh moved to the estimate side** `[S99, §7.1]` — all nullable, so an
estimate with the toggle off is unaffected:

```sql
ALTER TABLE public.estimates
  ADD COLUMN start_date        date,
  ADD COLUMN target_end_date   date,
  ADD COLUMN retainage_percent numeric(5,2)
      CHECK (retainage_percent IS NULL OR (retainage_percent >= 0 AND retainage_percent <= 100)),
  ADD COLUMN legal_description text,   -- §7.5c, twin of 7F's projects.legal_description
  ADD COLUMN substantial_completion_days integer
      CHECK (substantial_completion_days IS NULL OR substantial_completion_days > 0),  -- §7.3a
  ADD COLUMN include_client_contract boolean NOT NULL DEFAULT false;  -- §5.2, the per-proposal toggle
```

> **`project_type` is NOT here** — `[S99 — RULED]` _"no project type needed."_ Dropped from rev 3's
> provisional list.

> **`retainage_percent` gets the 0–100 bound that `subcontractor_contracts.retainage_percent` lacks**
> (`20260729010000:344–345` is `>= 0` only). Match 7D's invoice-side check
> (`20260802000000:203–204`), not 7C's. **Do not propagate the looser constraint into a new column.**

> **This touches Module 4's table**, and §7.1b touches Module 5's conversion RPC. Coordinate both
> before the migration lands — the same caution 7F carries for `projects.legal_description`.

### §10.4 — `contract_documents`

One row per generated contract, either direction. Keeps 7I out of Module 5's columns (§11.4).

```
template_id            uuid NOT NULL → contract_templates(id)
document_kind          text NOT NULL CHECK IN ('client_contract','sub_contract')
estimate_id            uuid → estimates(id)                  -- client half
sub_contract_id        uuid → subcontractor_contracts(id)    -- sub half
project_id             uuid → projects(id)                   -- null until conversion on the client half
   -- shape check: exactly one of estimate_id / sub_contract_id is NOT NULL,
   --              matched to document_kind
status                 text NOT NULL DEFAULT 'draft'
                       CHECK IN ('draft','sent','signed','notarized','declined','voided')
delivery_mode          text NOT NULL CHECK IN ('esignature','notary')       [S99]
generated_pdf_file_id  uuid → files(id)   -- v1, contractor-signed
executed_pdf_file_id   uuid → files(id)   -- v2, fully executed / notarized upload
   -- BOTH retained, always. v1 is never overwritten.
filled_values          jsonb NOT NULL     -- the snapshot, including the printed schedule (§6.3)
void_reason, voided_by, voided_at         -- shape-checked, invoices_void_shape_check precedent
supersedes_document_id uuid → contract_documents(id)
```

**Money columns: none.** 7I stores no amount — the value is inside `filled_values` as rendered text
and lives authoritatively on the source row.

### §10.5 — `contract_signing_sessions` — **one table** _(my call; Josh deferred)_

Shape copied verbatim from `co_signing_sessions` (`20260704215000:235–259`), keyed to
`contract_document_id` instead of `change_order_id`. One table rather than two: the two directions run
the identical ceremony, and the direction is already carried by `contract_documents.document_kind`.

- **`initial_data text` + `initial_type text CHECK IN ('draw','type')`** beside `signature_data` /
  `signature_type` `[S99, §7.3d]`. Typed initials rasterize client-side before submit, exactly as
  `typedToDataUrl` does at `signing-client.tsx:51–62`, so one server path serves both modes.
- `decline_notes` free text, **no reason-code CHECK** `[S99 — sub ruling; applied to both]`.
- `expires_at` — 30-day default, user-editable `[S99]`. On the client half the contract shares the
  proposal's session and therefore the proposal's expiry (§5.4).
- **RLS: SELECT only, `TO authenticated`, Owner/Admin. No INSERT/UPDATE/DELETE policy** — every write
  goes through the service-role client. This is the shipped pattern and it is deliberate
  (`20260704215000:424–425`).

**Plus** (§3.2): two nullable `ON DELETE SET NULL` FKs on `email_logs`, and INSERTs into `email_types`.

### §10.6 — `[GAP]` `contract_value` is bare `numeric`

`client_contracts.contract_value numeric` (`20260704211000:361`) and
`subcontractor_contracts.contract_value numeric` (`:450`) — no precision or scale, against
`numeric(12,2)` everywhere in 7C/7D/7E. Also `retainage_percent numeric(5,2)` is bounded `>= 0` with
**no upper bound** (`20260729010000:344–345`) while 7D's invoice-side check bounds 0–100
(`20260802000000:203–204`).

**7I must not fix either.** These are Module 5 columns; 7B derives contract value at read. **7I formats
defensively at render** — `numeric` accepts arbitrary scale, so a raw value can print with more
decimals than a legal document should show.

---

## §11 — Conventions

### §11.1 — `[CORRECTION]` The service files already exist

| File                  | Exports `[VERIFIED]`                                                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contracts.ts`        | `ContractStatus`, `ClientContract`, `SubcontractorContract`, `CONTRACT_STATUS_LABELS` `:17`, `getClientContracts` `:29`, `getSubcontractorContracts` `:44` |
| `contracts-client.ts` | `createClientContract` `:9`, `updateClientContract` `:29`, `createSubcontractorContract` `:43`, `updateSubcontractorContract` `:65`                        |
| `contracts-shared.ts` | **does not exist**                                                                                                                                         |

UI exists too — `apps/web/app/dashboard/projects/[id]/contracts/page.tsx` + `contracts-panel.tsx`,
which **already renders a "Client Contract" block** (`:193`, empty state `:199`) and a void action
(`:145`).

**7I extends these. It does not create them.** It adds `contracts-shared.ts` — pure, **no supabase
import**. That leg guards the client-bundle boundary: a _value_ import from the server file pulls
`next/headers` into the client bundle and **`tsc` does not catch it**. Precedent: `invoices-shared.ts`,
`payables-shared.ts`, `payments-shared.ts`, `instrument-rates-shared.ts`. **Not in CLAUDE.md** — §0.2
row 4.

### §11.2 — Per-tenant tables

`CLAUDE.md:221–266`, summarised in §10.2. Service-layer contract `:268–274`: **never set `updated_at`
or `updated_by` in update payloads** — the triggers do it.

### §11.3 — Dates are COMPANY-TIMEZONE dates

`executed_date` on a contract is legally operative. The ruling is **Josh, S97**, at
`TECH_DEBT.md:53` — **not in CLAUDE.md** (grepped: zero hits for `timezone`/`America/`):

> _"`new Date().toISOString().slice(0,10)` yields the **UTC** calendar day, so after ~20:00 EDT it
> returns **tomorrow**… **calendar dates use the company timezone.** Correct idiom:
> `Intl.DateTimeFormat('en-CA', { timeZone })` — see `todayInZone` (`instrument-rates-shared.ts`) and
> `companyToday` (`invoices-shared.ts`)."_

Fallback is the column default `America/New_York`, **never UTC** (`TECH_DEBT.md:59`).
`companies.timezone` is live (`database.ts:831`). 7D took four commits to get here (`54e623a`,
`09ec8cd`, `3b45988`, `07c3f38`). **Use `companyToday`. Never a naive `new Date()`.**

### §11.4 — What 7I must never write

- **`contract_value`, anywhere.** 7B derives at read.
- **`client_contracts.status` or `executed_date`.** Conversion owns them (§5.1).
- **Any `expenses` row.** The schedule is 7C/113c's. 7I reads it and never writes a stage.
- **Any 7D invoice money column.** `invoices_immutability` freezes them at send.

---

## §12 — Acceptance criteria

1. With `client_contracts_enabled` **off**, nothing about client contracts appears anywhere and
   behaviour is byte-identical to today.
2. With it **on** and a template selected, sending a proposal sends **one email with two PDFs** — the
   proposal and the contractor-signed contract (v1).
3. The client signs through the estimate's existing signing session. **No second link, no second
   email.** Both artifacts (v1, v2) are retained; v1 is never overwritten.
   3a. **The per-proposal toggle drives everything conditional.** Turning it on surfaces the estimate-side
   fields (`start_date`, `target_end_date`, `retainage_percent`, `legal_description`,
   `substantial_completion_days`), makes them required at send, and tells the send route to attach a
   second PDF. **Leaving it off leaves the estimate form byte-identical to today.** Conversion copies
   the answered values into `projects`, so the user is never asked twice.
   3b. **One client signature covers both documents.** One signer, one `signature_data`, one IP, one user
   agent. No second session, no partially-signed state.
   3c. **Initials capture typed or drawn**, mirroring `signature_type`, and render into `initial` boxes.
4. At conversion, `client_contracts.status='signed'` is accurate because both instruments were signed
   pre-conversion, and the executed contract file is carried forward. **7I writes neither column.**
5. A sub contract row and a **badge** — not a `tasks` row — appear at conversion. The badge derives
   from `requires_formal_contract = true AND status <> 'signed'`, reusing
   `getFormalContractWarning` / `budget.ts:145`.
6. A sub contract **cannot** be generated before its schedule exists.
7. The printed sub schedule is ordered `created_at` **ASC** via `getSubSchedule` — never via the
   DESC-sorted list path — and is snapshotted into `filled_values`.
8. A `final_hold` retainage prints as a final hold, **never as a percentage across payments**.
9. Every auto-filled value is visible and editable before render.
10. A value that will not fit its box **warns the user**. Nothing is silently shrunk or truncated.
11. The contractor signature stamps from `companies.contractor_signature_path`. **No new signature
    capture is built.**
12. On the notary path both files are retained — the generated blank and the notarized upload.
13. A sub countersignature sets `status='signed'` and `executed_date` on the **company timezone**, and
    the advisory `requires_formal_contract` warning goes quiet because the signature is now observed.
14. **No unsigned contract blocks any money action.** `module7-architecture.md:266` (P2) and
    `:640` — _"'Clear for payment' is a notification, not a gate."_
15. **A PM cannot** generate, send, or void a contract of either kind. _(UI gate; the DB floor is the
    separate `FINANCIAL-RLS-FLOOR` follow-up — §8.)_
16. 7I writes no `contract_value`, no `client_contracts.status`, no `expenses` row, no invoice money
    column.
17. **Attachments** can be added before send (merged into the rendered PDF in `sort_order`) or after
    execution (**linked, never merged** — the executed artifact is frozen).
18. `substantial_completion_days` prints **both** spelled-out and as a numeral from one stored value.
19. **Exhibit B renders the estimate's payment schedule and 7I owns none of it** — no capture, no
    derivation, no invoice seeding.

---

## §13 — Build sequencing

**Hard prerequisites 7I cannot supply:**

1. **7F's document engine** — template CRUD, PDF upload, the box-placement component, the renderer.
   7I is a **consumer**; it is the first Module 7 sub-module that is not a leaf.
2. **`companies.signatory_name` / `signatory_title`** — 7F's two columns (§3.4).

**Order:**

| Stage | Contents                                                                                                         | Blocked by                                                 |
| ----- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1     | Company Settings: toggle, `contract_templates` CRUD, box placement, both kinds; attachments (§7.4)               | 7F                                                         |
| 2     | **Client half** — proposals/send extension, render v1, one email two PDFs, sign, v2, carry-forward at conversion | 7F. **Not Gate 1.**                                        |
| 3     | **Sub half, notary path** — generate, print, upload executed copy                                                | stage 1. **Not Gate 1.**                                   |
| 4     | **Sub half, e-signature** — `/sign-contract/[token]`                                                             | **Gate 1** (RESEND secret, domain cutover, login branding) |
| 5     | **Exhibit B box on client templates**                                                                            | the **payment-schedule spec** (§7.2) — a separate module   |

**Not a prerequisite:** invoice email (that gates 7F's conditional release, not 7I), and the
payment-schedule module — which blocks **only** stage 5. Stages 1–4 proceed without it.

---

## §14 — Open items, consolidated

| #   | Item                                                              | §     | Gates                                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `v_is_signed` edge — proposal signed, contract not                | §5.1a | a Module 5 RPC change, or nothing. **Now narrower:** with the per-proposal toggle (§5.2), the RPC can test `estimates.include_client_contract` and require the contract signature only when it was actually requested. |
| 2   | Notary path on the client half — does the proposal keep its link? | §5.5a | the send route. _(Suggested: yes — the contract simply carries no signature box.)_                                                                                                                                     |
| 3   | The rest of the value catalog                                     | §7    | template box maps. Josh's contract is fully mapped; other companies' forms are not.                                                                                                                                    |

**Everything else is ruled.** Rev 3 carried ten open items; seven were closed this session
(§7.0a, §7.3b, §7.3c, §7.3d, §5.2a, §5.3a — collapsed by the one-signature ruling — §7.5a's
`project_type`, and §7.5c's `legal_description`).

**Not open, recorded so they are not reopened:** ~~the notification system does not exist (no tables,
no event bus; `incident-notify.ts` is a bespoke 6C emailer) — **7I may name events and cannot deliver
them**.~~

> **⚠️ CORRECTED [S145] — 7I CAN deliver events.** The quoted claim was true at `d395c01` and is
> false at HEAD: `notifications` shipped in `20260905000000_notifications_core.sql` and `notify()`
> lives at `apps/web/lib/notify/notify.ts:149`, with delivery on both surfaces. This is the
> identical stale claim S140 found in `7f2-spec.md` §8.1 — a spec instructing a builder **not** to
> deliver an event it now can. Any 7I event (contract sent, signed, declined, voided) uses
> `notify()`; nothing bespoke is needed. A change order never spawns a new contract `[S99]`. One session table, not two _(my call,
§10.5)_.

---

## §15 — Provenance

- **`[S99]` Josh ruled this session:** client contract is a separate optional document with its own
  ceremony, toggled in Company Settings beside the templates · **option B**, own template tables plus
  `document_kind`, and an estimated-timeframe field · **per-send choice of e-signature or notary** ·
  the client contract **always ships with the proposal**, signed pre-conversion, other paths withdrawn
  for v1 · the client signs it · **the payment schedule prints inside the sub contract** · the sub
  contract is created at conversion and surfaced as a **badge, not a task row**, and cannot be sent
  until the project is set up · **Owner/Admin only** · **separate template sets** · free-text decline
  for subs · 30-day editable expiry · **overflow warns the user; boxes must be sized so it is rare** ·
  a CO never spawns a new contract · **project-level values a contract needs move to the estimate
  side, surfaced only when a contract is selected** (§7.5) · Exhibit A removed from the document ·
  **attachments are a required 7I feature** (§7.4) · retainage percent is an **option for other
  companies**, not a Worth Properties need · **the client payment schedule is specced separately**
  (§7.2).
- **`[S99]` Josh supplied `Contractor Agreement BLANK.docx`**, Worth Properties' live client
  agreement. Every blank in it was read and mapped (§7.0).
- **`[S99]` rev 4 rulings:** **one signature** (§7.3b) · owner-as-entity block is **manual entry**,
  custom boxes, no `contacts.title` (§7.3c) · initials **typed and drawn** (§7.3d) · **two-level
  toggle** — master in Company Settings plus a per-proposal choice, which becomes the single trigger
  for everything conditional (§5.2) · **no `project_type`** (§7.5a) · **`legal_description` gets an
  estimate-side twin** (§7.5c) · **Effective Date = the date all parties sign**, Josh rewording the
  clause, collapsing three dates into one event (§7.0a).
- **Four corrections issued against my own earlier revisions**, listed so the reasoning is auditable:
  1. rev 2's `retainage_percent` justification — I claimed client contracts state retainage terms;
     Josh's does not (§7.5a).
  2. rev 2's Exhibit B worry — I feared a project-stage schedule would unwind the estimate-stage
     ruling; putting the schedule on the estimate strengthens it (§7.2).
  3. rev 3's `legal_description` "not in v1" — sound for Josh's own form, wrong for the ruling, which
     is about giving users the ability to use the field (§7.5c).
  4. rev 3's "decide before 7F's migration lands" — **there is no coupling.** Different tables; either
     can land first (§7.5c).
- **One claim from Josh I could not confirm, and pushed back on:** that the owner-entity `Title:`
  comes from 7F. It does not — 7F's `signer_title` is the **contractor's** authorized signatory on the
  Florida form's "Its:" line, not the client's. Two similarly-named fields on opposite sides of the
  transaction. Josh then ruled it manual entry, which is where it lands regardless (§7.3c).
- **`[S98]` carried:** contracts get their own Module 7 spec; overlay-only document posture; one
  signatory per company; every field manually overridable before render.
- **All schema, service, RLS and file:line claims** read from `feature/113c-award-commitment-spec` @
  **`d395c01`** this session; absence claims confirmed across all 47 migrations plus `database.ts`.
- **Six prompt/prior-doc claims corrected** (§0.2). **Nothing has been committed; no repo file was
  modified.**
