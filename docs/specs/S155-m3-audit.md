# Module 3 — Document & File Management — system audit, pass 3 of 11 — **S155**

> **Read-only audit. No application code, service or schema was changed.** This pass committed
> `apps/web/test/s155-m3-audit.live.ts` and this document.
> **Date:** 2026-08-18. **Branch:** `feature/s155-m3-m4-audit`. **Base:** `main` @ `2c36759`.
>
> Structure and standing rules: `docs/specs/SYSTEM-AUDIT.md` §0.
>
> **[LIVE]** = read from `framefocus-rebuild-test` via `scripts/live-sql.mjs` or a real user session.
> **[REPO]** = files at the base commit. **[UNVERIFIED]** = could not check; not asserted.

---

## §0 — What makes M3 different

**M1 is the table everything writes config into. M2 is the table everything points at. M3 is the
only module with a SECOND ENFORCEMENT SURFACE.**

Every other module is guarded by one thing: RLS on its tables. M3 is guarded by two — RLS on
`files`, and RLS on `storage.objects` — and **they are written separately, in different migrations,
in different shapes.** One is a category-and-project floor over a row; the other is a regex over a
folder path. Nothing keeps them in agreement.

**They do not agree.** That is M3-01, and it is the finding this pass exists for.

**Scale of the fan-in [LIVE]: 23 foreign keys point at `files`** — the widest in the system so far,
from contracts, change orders, invoices, lien releases, estimates, daily logs, deliveries, safety
incidents, punch items, compliance documents, chat photos and AI tag logs.

---

## §0a — STATUS AFTER S157 — every finding closed out

> **This audit was written findings-only. S157 is the fix pass.** **Original text is left intact
> below** — this repo lost a live TECH_DEBT record at `53c7353` by deleting an entry instead of
> closing it. Read the finding first, then this table.

| # | S155 severity | S157 outcome | Commit |
| --- | --- | --- | --- |
| **M3-01** | REACHABLE | ✅ **FIXED, and WIDER than the finding** — storage RLS now delegates to `files` RLS on **SELECT and UPDATE**. ⚠️ A follow-up was needed for the markup derivative — see §0c | `c05ded0`, `77f43ec` |
| **M3-02** | REACHABLE | ✅ **FIXED** — both halves row-counted, and a real delete proven to still succeed | `39f8f14` |
| **M3-03** | REACHABLE | ✅ **FIXED** — all four writers import `applied()`/`DISCARDED`; **fourth module, first to import rather than copy** | `39f8f14` |
| **M3-04** | LATENT | ✅ **RULED AND APPLIED** — `SIGNED_URL_TTL_SECONDS = 7200`, one home, sweep clean | `39f8f14` |
| **M3-05** | LATENT | ✅ **FIXED** — `getFiles()` bounded and totally ordered, page reads parallelised, **and a second bug found while doing it** | `39f8f14` |
| **M3-06** | LATENT | 📌 **VERIFIED AND REPORTED, not built** — see §0c. The shape holds, and M3-01 changed what M9 must do | — |

### §0b — M3-01 was fixed by DELEGATION, and it reaches further than the audit proposed

The audit offered two shapes and recommended (b). **(b) shipped, in a cheaper form than the audit
imagined.** It does not route downloads through a server route; it makes the storage policy *ask the
table*:

```sql
get_my_role() = ANY (ARRAY['owner','admin'])
OR EXISTS (SELECT 1 FROM files f WHERE f.file_path = objects.name)
```

The `EXISTS` is a plain subquery evaluated as the calling user, so **`files` RLS filters it**. The
category floor is therefore stated **once**, on the table, and storage inherits every future change
to it. No second copy, no folder-regex inference, and `open-file.tsx` and the desktop file rows keep
going direct — the disruption the audit warned (b) would cause did not materialise.

**Three things the fix pass established that the audit had not:**

1. **⚠️ `UPDATE` carried the same hole, and it was arguably worse.**
   `project_files_update_non_client` had the identical missing category floor, so an assigned crew
   member could **overwrite the bytes of an invoice PDF** while the table refused them the row.
   Proven live before the change against a fixture. Aligning the read and leaving the write open
   would have re-created the divergence, so both were done. **`INSERT` was deliberately left
   alone** — on upload the `files` row does not exist yet, and `files_insert_non_client` already
   carries the floor one layer up.
2. **`files` had ELEVEN indexes and none on `file_path`.** The new policies join on exactly that
   column, once per object. `idx_files_file_path` ships in the same migration; without it every
   signed-URL mint becomes a sequential scan.
3. **Exactly one object in the bucket has no `files` row** — `{company}/signatures/signature.png`,
   the saved contractor signature. It is read for PDF generation through the **admin client**, which
   bypasses RLS entirely, and previewed in Settings by owner/admin, who keep the company-folder
   short-circuit. **Nothing lost it.** 105 objects checked.

**Proof:** `s157-m3-m4-fixes.live.ts` A1–A6, and `s155-m3-audit.live.ts` F1b/F1c inverted.

### §0c — M3-06 `client_visible`: verified, and M3-01 changed the M9 job

**The shape holds.** `files.client_visible` is `boolean NOT NULL DEFAULT false` [LIVE, S157], and
**every one of the 108 rows is `false`** — the flag has never been set by any surface, in any
category. So 9-spec.md §6's *"Default is false, so nothing leaks by omission"* is true today, and
M9 inherits no dirty values. The audit's warning — *"whoever builds M9 must audit the existing
values rather than trust them"* — is **discharged: there are none to audit.** If that changes
before M9 is built, re-check rather than trusting this paragraph.

Still true, and still M9's to close: **no policy reads the flag.** Neither `files_select_non_client`
nor the storage policy mentions it [LIVE], and `9-spec.md` §S records that the client SELECT arm on
`files` is what is missing.

> ### ⚠️ AND M3-01 CHANGED WHAT M9 HAS TO DO — this is the important part of this section.
>
> **Storage now follows the table.** Before S157 those were two separate grants, and M9 would have
> had to write a client arm on `files` **and** a matching one on `storage.objects`, keeping them
> in agreement — exactly the divergence M3-01 existed to fix.
>
> **After S157, adding a client arm to `files_select_non_client` grants the BYTES automatically.**
> That is the right default and it is also a loaded gun: a client arm that is one clause too wide
> exposes the objects the same instant, with no second policy to review. `9-spec.md` §S already
> warns that permissive policies are **OR'd** so a new narrow policy narrows nothing (the S131
> roster-floor trap); with delegation in place that warning now covers storage too.
>
> ### ⚠️ AND THE DERIVATIVE PROBLEM WAS NOT HYPOTHETICAL — IT WAS ALREADY BREAKING M6.
>
> This section originally read *"whoever builds M9's file grant must decide how the derivative path
> is authorised — recorded here, not solved."* **Playwright disagreed within the hour.**
>
> One `files` row resolves to TWO images — the original and the flattened markup derivative at
> `{original}.markup.jpg` — and **the derivative has no `files` row of its own**, deliberately
> (§6.1: a second `category='photos'` row would make every annotated photo appear twice). So the
> first delegation could not see it, and `m-photos.spec.ts` went from 42 passed to **5 failed**.
>
> **The symptom is the one that matters.** A-23f and A-23g did not error — they **fell back to the
> unannotated original**. A photo annotated on one surface rendering as a plain photo with no
> indication the markup existed is *exactly* the silent loss `CLAUDE.md`'s PARITY ruling was written
> about (`#129`). The markup save also failed on the SECOND save, because overwriting an existing
> derivative object is an UPDATE on storage.
>
> **Fixed by `20261008000000_m3_storage_markup_derivatives.sql`:** a caller reaches the derivative
> exactly when they reach the ORIGINAL it was flattened from. The path is deterministic, so
> stripping the 11-character suffix yields the original's `file_path` and the check stays an
> equality lookup on `idx_files_file_path`. **Not a blanket exemption for the suffix** — `A8` proves
> the derivative of an *invoice* is still refused.
>
> **So M9's precondition is now half-met rather than open.** The mechanism exists and is proven; what
> remains M9's is the *client* arm on `files`, and it inherits the derivative clause for free. Had
> this not surfaced here, M9 would have granted a client the row and served them the **unannotated**
> photo — the same silent-loss shape, on the surface where it matters most.
>
> **The lesson, recorded because it generalises past this bug:** the audit reasoned correctly to a
> risk and filed it for a future module, while the same defect was live in a shipped one. **A risk
> that a future module will hit is worth checking against the modules that already exist.**

### §0d — the signed-URL sweep Josh asked for, in full

**Every `createSignedUrl`/`createSignedUrls` site in the repo, and whether anything outlives its TTL:**

| Site | Bucket | TTL before | TTL after | Held anywhere? |
| --- | --- | --- | --- | --- |
| `api/files/signed-url/route.ts` | project-files | 3600 | **7200** | no — returned to the caller |
| `lib/services/files.ts` `signedUrlFor` / `getSignedUrl` | project-files | 3600 | **7200** | no |
| `lib/services/files-client.ts` `getFileSignedUrlClient` | project-files | 300 | **7200** | no |
| `lib/services/daily-logs-client.ts` | project-files | 3600 | **7200** | no |
| `lib/services/signing-activity-client.ts` | project-files | 3600 | **7200** | no |
| `dashboard/expenses/page.tsx` | project-files | 3600 | **7200** | no — render only |
| `field-ops/[projectId]/deliveries/d/[deliveryId]/page.tsx` | project-files | 3600 | **7200** | no |
| `field-ops/[projectId]/daily-logs/[logId]/page.tsx` | project-files | 3600 | **7200** | no |
| `field-ops/safety/[incidentId]/page.tsx` | project-files | 3600 | **7200** | no |
| `lib/services/company-client.ts` `getContractorSignatureUrl` | project-files | 600 | **600 — unchanged** | no |
| `api/trial/export/[id]/route.ts` | **exports** | 3600 | **3600 — unchanged** | no |

**✅ NOTHING EMBEDS A SIGNED URL ANYWHERE LONGER-LIVED THAN ITS TTL.** Checked specifically, because
a two-hour expiry would break such a surface silently:

- **Emails** — no template receives a storage URL. Proposal, CO and invoice mails carry the document
  as an **attachment**, and the only link they contain is the `/sign/<token>` signing URL, which is
  a `signing_sessions` row with its own expiry and nothing to do with storage.
- **Generated PDFs** — the templates embed image **bytes**, not URLs: `co-data.ts` downloads the
  saved signature through the admin client and hands the template an `imageDataUri`, and the company
  logo comes from the **public** `company-logos` bucket. Both are TTL-independent.
- **Stored records** — no column holds a signed URL.

**The two exclusions are deliberate and now say so in place.** `getContractorSignatureUrl` stays at
600s (an owner/admin Settings preview, rendered immediately — shorter is strictly better, and
raising it would weaken for nothing). The trial export is a different bucket, minted with the admin
client for an immediate download, so `SIGNED_URL_TTL_SECONDS` does not govern it.

### §0e — M3-05's fix uncovered a second defect

Bounding `getFiles()` was routine. **The trash page was not.** It asked for `include_deleted: true`
and then filtered `is_deleted` **in memory** — so it pulled every LIVE file in the project to render
the deleted ones (the M2-06 shape), and **once a `limit` existed the deleted rows could have been
pushed out of the response entirely by live ones.** A fix that would have quietly broken the trash
view if the over-fetch had not been noticed. `getFiles()` grew an `only_deleted` filter and the page
now asks the database for what it wants.

The ordering was also made total: `created_at` alone is not a total order — seeded rows share
timestamps — and an unstable order makes a paged read drop or repeat rows.

---

## §1 — Findings, most severe first

Severity: **REACHABLE TODAY** · **LATENT** · **THEORETICAL**.

---

### **M3-01 — a crew member cannot see an invoice's file row, and can download its PDF** — REACHABLE TODAY

**What it is [LIVE].** Two policies, two shapes, one disagreement:

| Surface | Gate for anyone below owner/admin |
| --- | --- |
| `files_select_non_client` (table) | `project_id IS NOT NULL` **AND** `can_view_project()` **AND a CATEGORY FLOOR** — `contracts`, `change_orders` and `invoices` are excluded, except `invoices` for a PM |
| `project_files_select_non_client` (storage) | company folder **AND** `role <> 'client'` **AND** folder segment 2 is a project uuid the caller is **assigned** to — **and no category floor whatsoever** |

The category floor exists on the row and **does not exist on the bytes**.

**Evidence [LIVE]** — `s155-m3-audit.live.ts` **F1**, under real JWTs, against **existing seeded
data rather than a fixture built to order**, because the point is that it is reachable today:

- **F1a** — crew reads `[]` from `files` for an `invoices` row. The floor works.
- **F1b** — the same crew session mints a signed URL for that file's path. No error.
- **F1c** — **the URL serves the PDF: HTTP 200, non-empty body.** Not a paperwork problem.
- **F1d** — the same crew member *can* read a `photos` row on the same project, so this is not a
  blanket denial being circumvented; **the difference between the two surfaces is the category floor
  and nothing else.**

**Why it is narrow, and why that is fragile rather than reassuring.** The leak only reaches
categories whose storage path is `{company}/{project_uuid}/…`. Live paths [LIVE]:

| Category | Path shape | Segment 2 a project uuid? | Reachable? |
| --- | --- | --- | --- |
| `invoices` | `{company}/{project}/…` | **yes** | ⚠️ **YES** |
| `daily_logs`, `deliveries`, `photos`, `receipts`, `safety` | `{company}/{project}/…` | yes | not floored on the table either — consistent |
| `contracts` | `{company}/contracts/templates/…` | no | fails closed |
| `change_orders` | `{company}/change-orders/…` | no | fails closed |
| `lien_releases` | `{company}/lien-releases/…` | no | fails closed |

**So the exposure today is exactly one category — `invoices` — and it is the money one.** **F1e**
pins the closed cases, because the thing standing between this finding and a much larger one is a
*naming convention in a path string*. Any future change that moves contracts or change orders under
a project folder widens this silently, with no policy edit and no review.

**⚠️ And the signed-URL route inherits it by design.** `api/files/signed-url/route.ts` has no auth
check of its own — deliberately, and its header explains why at length: *"`signedUrlFor` uses the
USER'S RLS-scoped server client … a caller cannot sign a path they cannot read."* **That reasoning
is correct and the premise is false**, because "a path they cannot read" is decided by the storage
policy, not the table policy. The route is not wrong; it is downstream of the divergence.

**Proposed fix — needs a ruling on which surface is authoritative.** Two shapes:

- **(a) Put the category floor in the storage policy too.** Duplicates the rule in a second place
  and in a different language (a folder regex cannot see `files.category`), so it would have to
  infer category from the path — which is what already makes this fragile.
- **(b) Stop serving these bytes through storage RLS at all.** Route downloads for floored
  categories through a server route that reads the `files` row first and signs with the service
  role only if the table policy admits the caller. **One authority, the table, and the bucket
  becomes private to the server.**

**Recommend (b).** *Authority belongs in the database* is the standing principle, and the database
already expresses this rule once, correctly, on `files`. (a) makes a second copy of a floor in a
language that cannot express it. ⚠️ **(b) is a real change** — it moves every download through a
route and away from direct storage access, and `m/p/[projectId]/files/open-file.tsx` and the desktop
file rows both go direct today.

---

### **M3-02 — `permanentDeleteFile()` reports success having deleted nothing** — REACHABLE TODAY

**What it is [REPO, `files-client.ts:340-370`].** The function looks up `file_path`, calls
`storage.remove()`, checks `storageError`, calls `.delete()` on the row, checks `deleteError`, and
returns `{ success: true }`. **Neither call errors when RLS refuses:**

**Evidence [LIVE]**, as a crew member — `s155-m3-audit.live.ts` **F4**:

| Step | Result |
| --- | --- |
| `storage.remove([path])` | `error: null`, **0 objects removed** |
| `files.delete().eq('id', …)` | `error: null`, **0 rows** |
| row afterwards | **still present** |

So the caller is told the file is **permanently gone**, on the one operation in M3 that is genuinely
irreversible. It is the `#1-s146` / M1-01 / M2-03 shape — **third module, fourth appearance** — with
the added wrinkle that it also applies to the **storage API**, where an empty `data` array is the
refusal.

**Bounded today by role alignment, not by the code.** `files_delete_owner_admin` and
`project_files_delete_owner_admin` are both owner/admin, so the two refusals coincide and no
partial delete occurs. **If they ever diverge — as the SELECT pair already has (M3-01) — the
comment at `:355` becomes wrong**: *"Delete storage blob first — if row delete fails after, we have
an orphan row but no orphan bytes."* That reasoning assumes the storage delete **succeeded**.

**Proposed fix.** Row-count both halves: `.select('id')` on the DELETE through `applied()`
(`mutation-result.ts`, which S154 created and M3 does not import), and check
`removed.data.length === paths.length` on the storage call. **Unambiguous; no ruling needed.**

---

### **M3-03 — M3's four UPDATE-shaped writers have no row-count guard** — REACHABLE TODAY

`files-client.ts` — `updateFile` `:302`, `softDeleteFile` `:314`, `restoreFile` `:330`,
`toggleFavorite` `:375`. All four check `error` and nothing else. **`mutation-result.ts` exists as of
S154 and this file does not import it.**

**Evidence [LIVE]** — **F3a/F3b**: a crew member's `updateFile()` and `toggleFavorite()` both return
`{ success: true }` while the row does not move. **F3c** proves the probes are not vacuous — the
Owner's identical call succeeds and the value changes.

**The running tally, because the pattern is the point:** `#1-s146` (contracts, S146) → M1-01
(companies, 1 of 8 guarded, S152) → M2-03 (contacts, 0 of 3, S154) → **M3-03 (files, 0 of 4)**. The
shared helper now exists; **nothing makes a new service use it.**

**Proposed fix.** Import `applied()`/`DISCARDED` and guard all four. **Unambiguous.** Worth pairing
with **M3-02**, same file.

**⚠️ Worth a separate thought, not a finding:** four modules have now shipped this. A lint rule, or a
service-layer wrapper that makes the guard the default rather than the diligent choice, would end
the class. That is a proposal for Josh, not something to infer.

---

### **M3-04 — a signed URL outlives the access that minted it** — LATENT (policy question, not a bug)

**Evidence [LIVE]** — **F2a**: mint a URL as an assigned crew member, revoke the assignment, and
**minting is refused while the already-minted URL still serves the file.**

This is inherent to signed URLs — they are bearer tokens, and Supabase cannot revoke one. What makes
it worth recording is the **duration chosen**: `api/files/signed-url/route.ts:52` mints for
**3600 seconds**. So removing someone from a project, or off the company, leaves **up to an hour** of
continued access to anything they had already opened.

**No fix proposed; it needs a decision, not a patch.** The lever is the TTL. 3600s is generous for a
click-to-open flow where the browser follows the URL within seconds. **Recommend considering 60–300s
for the interactive path**, keeping longer TTLs only where something genuinely holds a URL (an email
link, a PDF embed). ⚠️ **Check the consumers before shortening it** — `open-file.tsx` and the desktop
file rows may hold a URL across a render.

---

### **M3-05 — `getFiles()` is an unbounded `select('*')`, and the page fetches serially** — LATENT (efficiency)

`files.ts:46-49` — `select('*')`, no limit, ordered by `created_at`. Filtered by `project_id` at the
call site, so it is bounded *in practice* by project size rather than by the query. **M2-06's shape,
one module over.**

`projects/[id]/files/page.tsx:8-9` awaits `getFiles()` then `getActiveTags()` **in series** — two
independent reads, one after the other. **M1-03's shape**, smaller: two round trips, not five.

**Index coverage is good and is not the problem [LIVE]:** eleven indexes on `files`, including
partial indexes on all five optional parent FKs (`daily_log_id`, `safety_incident_id`,
`delivery_item_id`, `delivery_id`, `invoice_id`) and a partial on `(company_id, is_favorite)`.
**This is the best-indexed table audited so far** — recorded in §2.

**Proposed fix.** `Promise.all` the two page reads; bound and paginate `getFiles()` when a project's
file count justifies it. **Unambiguous; low urgency.**

---

### **M3-06 — `client_visible` is a flag with no reader, and M9 depends on it** — LATENT

`files.client_visible` is `boolean NOT NULL DEFAULT false` **[LIVE]**. It is **written** by
`daily-logs-client.ts:228` (*"flag only in v1 — portal enforcement is M9"*) and by the punch and
safety paths. **Nothing reads it for access control** — neither `files_select_non_client` nor
`project_files_select_non_client` mentions it **[LIVE]**.

That is correct today, because the only role it would gate is `client`, and **both policies already
refuse `client` outright**. So the flag is inert and fails safe.

**Why it is filed:** `9-spec.md:235` — *"Files | **YES, but must be tagged** — same gate as photos"*.
M9's file visibility is specified as resting on this flag, and **M9 is unbuilt**. When it is built,
`client_visible` becomes load-bearing on a column that has been accumulating values for sessions
with no enforcement behind it. **Whoever builds M9 must audit the existing values rather than trust
them** — a flag nothing enforces is a flag nothing has been careful about.

**No fix now.** Recorded as an M9 precondition, the same way M2-04 was.

---

## §2 — Checked and found sound

| # | Checked | Result |
| --- | --- | --- |
| **V1** | A file with `project_id IS NULL` | **Owner/admin only on BOTH surfaces**, and they agree here — the table requires `project_id IS NOT NULL` for lower roles, and the storage regex fails on a non-uuid segment. Asserted by **V1**. |
| **V2** | The trash-bin convention | **`files` is the reference implementation CLAUDE.md says it is.** `files_select_non_client` carries **no** `is_deleted` clause, so **M2-02 does not exist here** — a soft-deleted file stays readable and `restoreFile()` can reach it. Asserted by **V2**, which soft-deletes and restores a real row. |
| **V3** | Index coverage | Eleven indexes [LIVE], including partials on all five optional parent FKs. **No missing-index finding at any plausible scale.** |
| **V4** | The signed-URL route's error contract | **Correct, and better than most.** TECH_DEBT `#142`'s fix holds: a 4xx from storage returns **403** with a message naming no unverified cause, while the **log** carries storage's status, code and the failing check by name. This is the CLAUDE.md rule implemented properly. |
| **V5** | Storage `DELETE` alignment | `files_delete_owner_admin` and `project_files_delete_owner_admin` are **both** owner/admin, so M3-02's two refusals coincide and no half-delete occurs today. |
| **V6** | `client` is refused on both surfaces | `get_my_role() <> 'client'` appears in both `files_select_non_client` and `project_files_select_non_client` [LIVE]. The M2-01 shape (floored on one surface, open on the other) **does not apply to the client role** — only to categories. |
| **V7** | FK delete rules into `files` | 23 FKs [LIVE]. No `CASCADE` from a document table onto `files` except `estimate_files` and `chat_message_photos` (junctions, correct); the money and legal parents use `SET NULL` or `NO ACTION`, so a deleted file never takes a contract or an invoice with it. |

---

## §3 — What I could NOT verify

1. **Page-load and render times.** Not measured, not estimated. M3-05 counts round trips.
2. **Production.** Not linked. Every "[LIVE]" means rebuild-test.
3. **Whether the `invoices` storage path shape is deliberate or incidental.** Contracts and change
   orders live under a *literal* folder and invoices under a *project* folder, which is what makes
   M3-01 reach exactly one category. I did not trace which migration chose each convention or
   whether anyone decided it. **The finding stands on the outcome; the explanation is [UNVERIFIED].**
4. **`markup_data` and the two markup editors (`#129`).** M3 owns the column and CLAUDE.md's PARITY
   ruling was written about it. **Not re-probed this pass** — S154's fixes did not touch it, and it
   was ruled closed at the time. It deserves a look from M6's side, since the mobile editor is M6's
   surface.
5. **The AI auto-tag path** (`api/files/auto-tag`, `ai-tagging.ts`, `ai_tag_logs`). Not audited —
   it is an OpenAI-calling surface and probing it spends money on a live key. Recorded rather than
   half-checked.
6. **Whether any consumer of the 23 FKs assumes a file row still exists.** I mapped the FKs and their
   delete rules (V7) but did **not** trace each consumer's null handling. The `SET NULL` rules mean
   several columns can become null under a permanent delete; **whether every reader handles that is
   unverified.**
7. **Storage bucket configuration** — size limits, allowed MIME types, public/private flags. Readable
   through the Management API but not through `live-sql.mjs`, and not checked.

---

## §4 — Grouped for ruling

Six findings, **three decisions**.

| Group | Findings | Decision needed |
| --- | --- | --- |
| **A — the two enforcement surfaces** | **M3-01**, and **M3-04** as the same question about duration | **The one that matters.** Which surface is authoritative for a floored category: duplicate the floor into storage (a), or stop serving those bytes through storage RLS and route them through the table (b)? **Recommend (b).** M3-04's TTL is the same conversation — how long a grant, once given, should survive. |
| **B — the guard, fourth appearance** | **M3-02**, **M3-03** | Mechanical, one file. Guard the four writers and both halves of the permanent delete. **The real question is whether to stop the class** — four modules have now shipped it, and the shared helper existing has not been enough. |
| **C — efficiency and the M9 precondition** | **M3-05**, **M3-06** | No ruling needed on M3-05. **M3-06 is a note for whoever builds M9:** `client_visible` becomes load-bearing then, and its existing values were written with nothing enforcing them. |

---

## §5 — Provenance

- **[LIVE]** at S155 via `scripts/live-sql.mjs` (`pg_policies` on `public` **and** `storage`,
  `pg_constraint`, `pg_indexes`, `information_schema`) and real user sessions in
  `apps/web/test/s155-m3-audit.live.ts` (12/12).
- **[REPO]** at `2c36759`: `files.ts`, `files-client.ts`, `api/files/signed-url/route.ts`,
  `projects/[id]/files/page.tsx`, `daily-logs-client.ts`, `9-spec.md`.
