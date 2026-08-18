# Module 2 — Contacts & CRM — system audit, pass 2 of 11 — **S153**

> **Read-only audit. No application code, service or schema was changed.** This pass committed
> `apps/web/test/s153-m2-audit.live.ts` and this document.
> **Date:** 2026-08-18. **Branch:** `feature/s153-m2-audit`. **Base:** `main` @ `a56baac`.
>
> Structure and standing rules: `docs/specs/SYSTEM-AUDIT.md` §0. M2's dependency map and the
> coverage ledger live there.
>
> **[LIVE]** = read from `framefocus-rebuild-test` via `scripts/live-sql.mjs` or a real user session.
> **[REPO]** = files at the base commit. **[UNVERIFIED]** = could not check; not asserted.

---

## §0 — What this pass was looking for

**Efficient and robust.** Everything below is measured against those two words.

- **Efficient** — least work necessary, and *stays* fast as tenants grow.
- **Robust** — does not lie, does not silently lose data, does not depend on a condition nobody
  enforces. **Correctness that only holds today is not robustness.**

**M1 was the table everything writes config into. M2 is the table everything points at** — contacts
are the counterparty identity for estimates, projects, invoices, contracts and the unbuilt portal.
Nine foreign keys land here **[LIVE]**.

### The headline

**M2's two flagship destructive operations do not work, and one of its two tables leaks.**

Deleting a contact has never once succeeded on this database — 0 of 22 rows carry `is_deleted` —
and the button is wired to a live UI. Separately, the S131 Roster Visibility Floor was applied to
`contacts` and not to `contact_addresses`, so the roles that are floored out of seeing a client's
*name* can read their *street address*.

---

## §1 — Findings, most severe first

Severity: **REACHABLE TODAY** · **LATENT** (mechanism real, something incidental prevents it) ·
**THEORETICAL**.

---

### **M2-01 — a subcontractor or client can read every client's street address, while being floored out of the contact itself** — REACHABLE TODAY

**What it is [LIVE].** Two policies on two tables in one module, disagreeing:

| Policy | `qual` |
| --- | --- |
| `contacts_select_authenticated` | `company_id = get_my_company_id() AND is_deleted = false AND get_my_role() <> ALL (ARRAY['subcontractor','client'])` |
| `contact_addresses_select_authenticated` | `company_id = get_my_company_id()` — **and nothing else** |

The S131 Roster Visibility Floor gives `subcontractor` **no** contacts and `client` **no** contacts.
`contact_addresses` carries no role floor at all, so both roles read **every address row in the
company**.

**Evidence [LIVE]** — `s153-m2-audit.live.ts` **F1**: under real JWTs, a subcontractor reads `[]`
from `contacts` and the full `address_line1, city, state, zip` of that same contact from
`contact_addresses`. **F1c** repeats it for `client`, the role S131 was strictest about. **F1d**
shows the count a subcontractor sees equals the company's entire address table — this is not one
fixture row.

**Why this is the most serious finding here.** S131 exists because a subcontractor and a client each
signed in and read the company's full contacts list. The fix floored `contacts`, `subcontractors`
and the two roster tables. **The addresses hanging off those contacts were missed**, and an address
is arguably the more sensitive half — a client's home address is what a floored role now reads,
without the name attached. `contact_addresses` was created by migration `20260821...`-era work
**after** the floor's design, which is the likeliest reason it was not in the sweep. **[UNVERIFIED]
— I did not trace the migration order to confirm that explanation, only the outcome.**

**Proposed fix.** Add the same role floor to `contact_addresses_select_authenticated`. **Do not
copy `contacts`' policy wholesale** — it also carries the `is_deleted = false` clause that causes
**M2-02**, and copying it would propagate that defect to a second table.

**Needs a ruling only on scope:** the floor's *shape* is settled by S131; what is open is whether an
assigned subcontractor should see the job-site address of a project they are working on. Today the
answer is "yes, and every other address too". A narrower answer exists (`project_id`-scoped) and is
a bigger change. **Recommend: apply the S131 floor as-is now, and treat job-site visibility for
assigned subs as a separate question** — it is M6/M7 territory, not M2's.

---

### **M2-02 — soft delete is IMPOSSIBLE on `contacts` and `subcontractors`. Not irreversible — impossible.** — REACHABLE TODAY

**⚠️ This is not the finding I set out to write, and the difference matters.** The hypothesis was
the one the trash-bin convention warns about: a soft-deleted contact becomes unreadable and
therefore unrestorable. Probing it showed something worse — **the soft delete never happens at
all.**

**What it is.**

- `contacts_select_authenticated` carries **`AND is_deleted = false`** **[LIVE]**.
- CLAUDE.md's trash-bin pattern is explicit that it must not: *"RLS policies do not filter on
  `is_deleted`. Filtering is enforced in the service layer, not in RLS. This is deliberate: a
  restore-from-trash flow must be able to read soft-deleted rows."*
- PostgREST's UPDATE returns rows, so the **new** row must still satisfy the SELECT policy. A row
  with `is_deleted = true` cannot. Postgres answers **`42501 — new row violates row-level security
  policy for table "contacts"`**.

**Isolated column by column [LIVE], as Owner:**

| Write | Result |
| --- | --- |
| `last_name = 'Y'` | ✅ |
| `status = 'archived'` | ✅ |
| `deleted_at = now()` | ✅ |
| **`is_deleted = true`** | ❌ **`42501` — new row violates RLS** |

**The feature is live and reachable.** `contacts-list.tsx:39` calls `deleteContact()` behind a
confirm dialog, and `:44` shows the failure as `alert(result.error)` — **the user is shown the raw
Postgres string**, which also violates CLAUDE.md's rule that a client message may be generic while
the log is specific.

**Corroboration that it has never worked [LIVE]:** **0 of 22** contacts carry `is_deleted = true`.
So do 0 subcontractors, and 0 contact_addresses.

**It is a pattern, not a one-off.** `subcontractors_select_authenticated` carries the same clause
and `subcontractors-client.ts` soft-deletes identically — **F2b** proves that path fails the same
way. **F2c** proves `contact_addresses` does it *correctly* (no `is_deleted` in its SELECT policy,
and a soft-deleted address stays readable), which is what rules out "deliberate design": one module,
two tables, opposite answers.

**Two more tables carry the same clause and were not probed** [LIVE, `pg_policies`]:
`invitations_select_owner_admin`, and two storage `objects` policies. **See §3 — unverified.**

**A compounding second defect, in the service layer.** Even with the policy fixed, restore would
still be impossible: `getContact(id)` filters `.eq('is_deleted', false)` (`contacts.ts:46`),
directly against the convention's own words — *"`get{Entity}(id)` … does **not** filter
`is_deleted`. It must return soft-deleted rows so a restore flow can fetch a deleted record by id."*
**And there is no `getTrash()`/`listDeleted()` for contacts at all**, so no trash UI exists to
restore into.

**Proposed fix — three parts, one decision.**

1. Drop `AND is_deleted = false` from `contacts_select_authenticated` and
   `subcontractors_select_authenticated`; keep the company and role clauses.
2. Confirm every list path already filters `is_deleted` in the service layer. `getContacts()`
   (`contacts.ts:24`) and `listContactOptions()` (`contacts-client.ts:61`) both do **[REPO]**, so
   this is a verification step and not new work — **but it must be verified per surface before the
   policy moves, because the policy is currently the only thing enforcing it on any path that
   forgot.**
3. Remove the `is_deleted` filter from `getContact(id)`, per the convention.

**Needs a ruling**, because step 1 widens a SELECT policy on a shipped table and step 2 is the part
that makes that safe. **This is one decision covering both tables** — see §4 Group A.

---

### **M2-03 — `updateContact()` and `deleteContact()` report a refused write as success** — REACHABLE TODAY

**What it is [REPO].** `contacts-client.ts:23` and `:38` both `.update(...).eq('id', id)` with no
`.select()` and no row count, then `return { success: true }` if `error` is null. This is `#1-s146`'s
shape and **M1-01's exact shape one module later** — the fix S152 shipped across all eight
`companies` writers was never brought here.

`contact-addresses-client.ts:61` (`updatePrimaryAddress`'s UPDATE branch) is the third.

**M2's ratio: 0 of 3 UPDATE-shaped writers guarded.** (M1's was 1 of 8.) The INSERT-shaped writers
are fine — `createContact` and `createAddress` both `.select('id').single()`, and an RLS-refused
INSERT raises a real error regardless.

**Reachable, and the shape is sharper than M1's.** `contacts_update_authorized` admits
**owner/admin/project_manager only**, so foreman, crew, subcontractor and client are all refused —
and any of them reaching an edit surface is told the save worked. **F3a/F3b** prove it under a real
crew JWT; **F3c** proves the probes are not vacuous by showing the Owner's identical call succeeds.

**⚠️ The two findings interact, and the result is perverse.** Because of **M2-02**, `deleteContact()`
**errors** for an Owner (who may delete) and **reports success** for a crew member (who may not,
so their UPDATE matches zero rows and never reaches the WITH CHECK). **The role that cannot delete
is told it worked; the role that should be able to is told it failed.**

**Proposed fix.** The `applied()` / `DISCARDED` pair already exists in `company-client.ts` and
`contracts-client.ts`. **It is now written twice; a third copy is the wrong answer** — lift it into
a shared module and have all three import it. **Unambiguous; no ruling needed** beyond where the
shared helper should live.

---

### **M2-04 — `contacts.email` is nullable, unconstrained, unvalidated, and the UI actively writes NULL** — LATENT, and load-bearing for M9

**What it is.** No `NOT NULL`, no `CHECK`, **no Zod schema — there is no contact validation file at
all** (`packages/shared/validation/` has `contact-address.ts` and no `contact.ts`) **[REPO]**. The
form's input is `type="email"` with no `required`, and `contact-form.tsx:68` writes
`form.email.trim() || null` — **an empty box is stored as NULL by design**.

22 of 22 live rows have an email **[LIVE]**, which is precisely the *true-by-luck* shape this pass
was told to hunt.

**Evidence [LIVE]** — **F4a** creates a client contact with a NULL email through the service role;
**F4b** repeats it as a real Owner through RLS, because the service role bypasses RLS and F4a alone
would not establish that a user can do it.

**What already handles it correctly, and is worth recording:** `api/proposals/send/route.ts:79`
guards `if (!contact?.email)` before sending **[REPO]**. The send path is careful.

**What does not:** `proposal-data.ts:272` passes `contact.email` straight into the rendered proposal
document with no guard **[REPO]** — a null prints as an empty field on a client-facing PDF rather
than refusing, which is the opposite of 7I's stated discipline for a missing property address
(*"generation refuses rather than rendering a blank required field"*, `contracts-shared.ts:129`).

**Why it is filed as latent-but-important: M9 rests on it.** `9-spec.md` §3 R1 — *"Username is the
email; the client sets their own password"* — and the invite is contractor-controlled. **A client
contact with no email is a client who cannot be invited to the portal**, and nothing today stops one
being created. M9 is specced and unbuilt, so this is free to fix now and expensive to discover
during that build.

**Proposed fix — needs a ruling on strictness, not on direction.** Three options, increasingly
strict: (a) a Zod schema requiring email for `contact_type = 'client'` only; (b) the same plus a
partial `CHECK` in the database (`contact_type <> 'client' OR email IS NOT NULL`); (c) `NOT NULL`
outright. **Recommend (b)** — *authority belongs in the database* is a standing principle here, a
lead or an inspector genuinely may have no email, and a partial CHECK expresses exactly that.
⚠️ **(b) and (c) must be `NOT VALID`** or they will fail against any existing row that violates them;
none does today, but that is luck, not a guarantee, and production has not been read.

---

### **M2-05 — two unreconciled `vendor` concepts** — LATENT (modelling), **flagged by the M9 audit and still open**

**What it is [LIVE].**

| Table | Column | Allowed values |
| --- | --- | --- |
| `contacts` | `contact_type` | `lead`, `client`, **`vendor`**, `architect`, `inspector`, `building_dept`, `other_external` |
| `subcontractors` | `sub_type` | `subcontractor`, **`vendor`** |

Nothing reconciles them. There is no FK, no shared key, and no uniqueness across the pair.

**Live state:** 1 vendor in `contacts`, 1 vendor in `subcontractors`, **no name overlap** — so no
duplicate exists *yet*. True by luck again.

**The consequence, which is what makes it more than tidiness.** The two tables feed different
halves of the platform:

- `contacts` → estimates, projects, `project_contacts`, invoices, the portal. **A vendor here cannot
  be paid** — 7C's payables resolve through `subcontractors.member_id → company_members`.
- `subcontractors` → POs, bills, payments, lien releases, compliance. **A vendor here cannot be a
  project contact** — nothing joins it to `project_contacts`.

So a real-world vendor that both supplies materials and appears on a project needs **two records
with no link**, and `#105` already records that there is *"no identity join between
`company_members` and `subcontractors`, and no uniqueness guard on names anywhere on the
platform"*.

**Do not resolve this unilaterally — it is a modelling decision.** Three shapes exist and they are
not equivalent: merge `vendor` into one table; keep both and add an explicit link; or rule that
`contacts.vendor` is deprecated and vendors live only in `subcontractors`. **Recommend the third as
the cheapest to state and the easiest to enforce** (a partial CHECK excluding `'vendor'` from
`contacts.contact_type`, plus a migration for the one live row), **but Josh's intent recorded at
`#105` — "prohibit exact duplicate names platform-wide" — points at a broader answer**, and this
should be decided with `#105` rather than before it.

---

### **M2-06 — `getContacts()` is an unbounded `select('*')` and the list is filtered in the browser** — LATENT (efficiency)

**What it is [REPO].** `contacts.ts:22-26` — `select('*')` on `contacts`, no `limit`, no pagination,
ordered by `last_name`. The result is handed to `ContactsList`, a client component, which filters by
search term **in the browser** (`contacts-list.tsx:28-34`).

At 22 rows this is invisible. At 10,000 contacts it ships **34 columns × 10,000 rows** through the
RSC payload on every visit to `/dashboard/contacts`, to render a page showing a screenful.

**Also:** `select('*')` means every future column on `contacts` joins that payload automatically —
including `qb_customer_id`, which has **zero writers in the application** **[REPO]** and is
presumably 7G scaffolding.

**Index coverage is fine and is not the problem [LIVE]:** `idx_contacts_company_id`,
`idx_contacts_contact_type` and `idx_contacts_status` all exist as `(company_id, …)` composites.
There is no index on `last_name` (the sort) or `email` (the search), which would matter only once
the query is bounded — **fixing the pagination first is the right order.**

**Not measured, and not estimated:** page-load and render time. No page was rendered. §3.

**Proposed fix.** Server-side pagination plus server-side search, and an explicit column list
instead of `*`. **Unambiguous; no ruling needed** — but it is a UI change as much as a query change,
so it is larger than it looks.

---

### **M2-07 — three read paths return `[]` on error, so a failure is indistinguishable from "none"** — LATENT (robustness)

`getContacts()` (`contacts.ts:35`), `listContactOptions()` (`contacts-client.ts:64`) and
`listAddressesForContact()` (`contact-addresses-client.ts:104`) all `if (error) return []`.

A transient failure, an RLS refusal or a schema error all render as **"this company has no
contacts"** — or, in the estimate builder's address picker, as a contact with no addresses, which is
the input to the `contact_address_id` a proposal and a lien release later print. It does not lie
about data it *has*; it lies about data it *could not fetch*, which is the same class.

**Proposed fix.** Return the error and let the caller decide, or at minimum log server-side with the
route and failing check, per CLAUDE.md's API rule (*"Every error response logs the real cause
server-side … The client message may be generic; the log never is"*). **Unambiguous.**

---

### **M2-08 — `contact_addresses` permits hard DELETE; `contacts` does not** — LATENT (consistency)

**[LIVE]** `contact_addresses_delete_authorized` exists (`FOR DELETE`, owner/admin/PM). `contacts`
has **no** DELETE policy, consistent with the trash-bin pattern. So one M2 table can be hard-deleted
and the other cannot.

**Bounded by FK, which is why this is latent and not reachable damage:**
`estimates.contact_address_id` and `projects.contact_address_id` are both `NO ACTION` **[LIVE]**, so
an address referenced by either refuses to delete. **An unreferenced address is hard-deletable**,
bypassing the trash-bin pattern entirely.

**Proposed fix.** Drop the DELETE policy, matching `contacts` and every other per-tenant table.
**Needs a one-line ruling** — it is possible the policy is deliberate, though nothing in the repo
says so.

---

### **M2-09 — `updatePrimaryAddress()` is a lookup-then-write race** — THEORETICAL

`contact-addresses-client.ts:45-73` selects the existing primary, then either updates it or inserts
a new one. Two concurrent calls could both find none and both insert.

**The database catches it [LIVE]:** `idx_contact_addresses_one_primary` is
`UNIQUE (contact_id) WHERE is_primary = true AND is_deleted = false`. The second insert fails
loudly rather than creating two primaries. **Authority is in the right place**; the service just
reports it as a raw error.

**No fix proposed.** Recorded so a later pass does not re-derive it, and so nobody "fixes" the race
by removing the index.

---

## §2 — Checked and found sound (so pass 3 does not re-derive it)

| # | Checked | Result |
| --- | --- | --- |
| **V1** | Downstream writes into M2 tables | **One, and it is guarded.** `project-contacts-client.ts:50` (M5's inline contact-create) uses `.insert(...).select('id').single()`, which surfaces an RLS refusal. M2's ratio is 1 of 1 — better than M1's 1 of 8. |
| **V2** | M2's INSERT/UPDATE policies are **faster** than the platform norm | `contacts_insert_authorized` and `contacts_update_authorized` use **inline uncorrelated `profiles` subqueries** rather than `get_my_*()`. Measured [LIVE], 10k rows: inline **2.36 ms** vs `get_my_company_id()` **153.9 ms** — Postgres hoists the subquery to an InitPlan automatically. **See §5.** |
| **V3** | The proposal send path with a null contact email | **Guarded** — `api/proposals/send/route.ts:79` refuses before sending. |
| **V4** | `idx_contact_addresses_one_primary` | Present, UNIQUE, partial on `(contact_id) WHERE is_primary AND NOT is_deleted` — makes M2-09 harmless. |
| **V5** | M2 index coverage on FK and filter columns | `contacts`: company_id, (company_id, contact_type), (company_id, status). `contact_addresses`: company_id, contact_id. **No missing-index finding at any plausible scale** — M2-06 is about payload size, not lookup. |
| **V6** | By-id address reads not filtering `is_deleted` (`proposal-data.ts:129`, `lien-releases.ts:143`, `:427`) | **Correct as written.** The trash-bin convention says a by-id fetch must not filter, and a document should print the address that was chosen. Not a defect. |
| **V7** | `contacts` standard triggers | `contacts_updated_at`, `contacts_set_updated_by` and `contacts_qb_scope` all present [LIVE] — M1's missing-trigger problem does not exist here. |
| **V8** | FK delete rules into M2 | Nine FKs [LIVE]. `contact_addresses.contact_id` and `client_reminder_settings.contact_id` CASCADE; the other seven NO ACTION. No `SET NULL` anywhere, so no silent orphaning. |

---

## §3 — What I could NOT verify

1. **Page-load and render time.** No page was rendered or timed. **M2-06 counts columns and rows,
   which is a static fact; it does not claim a millisecond cost.**
2. **Production.** Not linked, never read. Every "[LIVE]" here means rebuild-test.
3. **The other three tables carrying `is_deleted = false` in a SELECT policy** — `invitations`, and
   two storage `objects` policies **[LIVE, `pg_policies`]**. **I did not probe whether their
   soft-delete paths fail the way M2-02's do**, and I found no `is_deleted: true` writer for
   `invitations` in the service layer, so it may not have one. **This is the single largest loose
   thread from this pass** and belongs to M1's and M3's edges.
4. **Why `contact_addresses` was missed by the S131 floor.** I confirmed the outcome, not the cause.
   The migration-order explanation in M2-01 is a hypothesis.
5. **The exact PostgREST mechanism behind M2-02.** The behaviour is proven column by column; the
   attribution to "UPDATE returns rows, so SELECT policies apply to the new row" is **inferred from
   the error text and the isolation result**, not from reading PostgREST. **The proposed fix is the
   same under any mechanism**, so this did not block the finding.
6. **Whether any contact list surface would over-return once the RLS `is_deleted` filter is
   removed.** I checked the two obvious readers and both filter in the service layer. **I did not
   sweep every consumer**, and M2-02's step 2 exists precisely because that sweep is owed before the
   policy moves.
7. **`tag_options`** — 0 rows [LIVE]. Any probe would have passed vacuously, so none was written.

---

## §4 — Grouped for ruling

Nine findings, **four decisions**.

| Group | Findings | Decision needed |
| --- | --- | --- |
| **A — the soft-delete convention** | **M2-02**, and **M2-08** as its consistency cousin | **The big one.** Remove `is_deleted = false` from the `contacts` and `subcontractors` SELECT policies, sweep the list surfaces first, drop `getContact`'s filter, and decide whether `contact_addresses` keeps its DELETE policy. **One ruling, two tables, and it restores a documented convention rather than inventing one.** |
| **B — the roster floor gap** | **M2-01** | Apply S131's floor to `contact_addresses`. Settled in shape; open only on whether an assigned subcontractor should see a job-site address — **recommend deferring that to M6/M7 and flooring now**. ⚠️ **Sequence after A, or copying `contacts`' policy will propagate A's defect.** |
| **C — the guard and the error paths** | **M2-03**, **M2-07** | Mechanical. The one real question is **where the shared `applied()`/`DISCARDED` helper lives** — it is now written twice and a third copy is the wrong answer. |
| **D — identity and the vendor model** | **M2-04**, **M2-05** | Both are "what is a counterparty". Strictness on `contacts.email` (recommend a partial `CHECK`, `NOT VALID`) and the two `vendor` concepts. **Decide M2-05 with `#105`, not before it.** |

**M2-06 (pagination)** and **M2-09 (race, already caught by the index)** need no ruling — the first
is unambiguous work, the second is recorded and closed.

---

## §5 — One result worth carrying to every later pass

**M2's INSERT/UPDATE policies are ~65× faster than the platform norm, by accident.**

Pass 1 (`S152-rls-helper-measurement.md`) established that `(SELECT helper())` hoists a
zero-argument helper to a single InitPlan, and that 0 of 273 policies used that form.

**That count was right about the syntax and understated the situation.** `contacts_insert_authorized`
and `contacts_update_authorized` do not call the helpers at all — they inline the lookup:

```sql
company_id = (SELECT profiles.company_id FROM profiles
              WHERE profiles.user_id = auth.uid() AND profiles.is_deleted = false LIMIT 1)
AND EXISTS (SELECT 1 FROM profiles WHERE ... AND profiles.role = ANY (ARRAY['owner','admin','project_manager']))
```

Both subqueries are **uncorrelated**, so Postgres already evaluates them **once per query**.
Measured **[LIVE]**, 10,000 rows:

| Form | Time |
| --- | --- |
| control | 3.50 ms |
| **inline `profiles` subquery (M2's form)** | **2.36 ms** |
| **inline `EXISTS` role check (M2's form)** | **2.48 ms** |
| `get_my_company_id()` | 153.9 ms |
| `get_my_role()` | 128.6 ms |

**Three things follow.**

1. **The repo already contains a working, shipped example of the conversion pass 1 recommended.**
   Anyone converting the hot policies has a precedent to copy instead of a pattern to invent.
2. **`contacts` itself has both patterns, the wrong way round.** Its **SELECT** policy — the one paid
   on every read — uses the slow helper form (`get_my_company_id()` + `get_my_role()`, ~22 µs/row);
   its write policies use the fast one. The hot path got the slow pattern.
3. **The duplication is still a real robustness cost**, and this does not excuse it: M2's policies
   restate `get_my_company_id()`'s and `get_my_role()`'s logic inline, so a change to either helper
   will not reach them. **The right end state is the helper *wrapped* — `(SELECT get_my_role())` —
   which is both fast and single-sourced.** M2 demonstrates the speed; it should not be copied as
   the way to get it.

---

## §6 — Provenance

- **[LIVE]** at S153 via `scripts/live-sql.mjs` (`pg_policies`, `pg_constraint`, `pg_indexes`,
  `pg_trigger`, `pg_stat_user_tables`, `information_schema`, `EXPLAIN ANALYZE`) and real user
  sessions in `apps/web/test/s153-m2-audit.live.ts` (13/13, two consecutive clean runs, zero
  fixture leakage).
- **[REPO]** at `a56baac`: `contacts.ts`, `contacts-client.ts`, `contact-addresses-client.ts`,
  `contacts-list.tsx`, `contact-form.tsx`, `contacts/page.tsx`, `proposal-data.ts`,
  `api/proposals/send/route.ts`, `project-contacts-client.ts`, `9-spec.md`.
- **Not consulted for scoping:** `STATE.md`'s module table, which is stale.
