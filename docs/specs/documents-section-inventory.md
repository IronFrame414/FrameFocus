# Documents-section inventory — READ-ONLY fact base for the desktop redesign

> **Scope.** The four Documents sub-tabs at `dashboard/projects/[id]/`: **Files** (`files/`) ·
> **Photos** (`photos/`) · **Contracts** (`contracts/`) · **Lien Releases** (`lien-releases/`). Records
> what exists today; designs nothing, changes nothing.
>
> **Baseline caveat.** The spec's baseline is `main`. Gathered on branch
> **`feature/s175-clients-off-team`** at `ba61257` (`[S175] Item 6, step 7 — the battery…`). Anything
> `[S175]`-tagged (e.g. the `selections` file category, `20261036000000`) may be **ahead of `main`** —
> re-verify before locking. Line numbers were captured branch-current and drift with edits.
>
> **Convention.** Repo-relative paths. `files/page.tsx` = `apps/web/app/dashboard/projects/[id]/files/page.tsx`; API routes under `apps/web/app/api/…`; services under `apps/web/lib/services/…`; migrations under `supabase/migrations/…`.

---

## Headline: three tabs are built, one (Photos) is a surfacing job

| Tab | State today | Redesign shape |
| --- | --- | --- |
| **Files** | Built — flat file table, categories, trash, AI tags, revisions stored | **Restyle** (some stored fields not yet surfaced: revisions, client-visible toggle) |
| **Photos** | **20-line "coming soon" stub** — but a full **mobile** gallery + markup editor exist | **Surfacing job** — port `/m/p/[id]/photos/` to desktop; ~2 new filter chips |
| **Contracts** | Built — 1,376-line panel (client + sub agreements, schedules, box placement) | **Restyle** — plus a flagged Floor discrepancy (see E3) |
| **Lien Releases** | Built — client-outbound only; sub-inbound deferred | **Restyle**; the design's "sub lien releases" is **not built** (deferred) |

**The tab strip is centralized** (`layout.tsx:38-42` → `project-header.tsx` `TABS` at `:24-99`), so the
six-section regrouping edits those two files, not the four page bodies. **No Documents page hardcodes a
sibling tab's URL** (verified — Part E1).

---

# PART A — Photos: restyle, surfacing, or build?

**Verdict: SURFACING JOB.** The gallery, viewer, and markup editor all exist — on the **mobile** surface
and (for markup) on desktop. The desktop `photos` tab just doesn't mount them. ~80% is porting an
existing mobile gallery to desktop; ~20% is net-new (two filter chips, a client-visible toggle).

| # | Question | Finding | Evidence |
| --- | --- | --- | --- |
| 1 | What does `photos/page.tsx` render / link? | 20-line stub: "Photos — coming soon", "photos live under the Files tab". **Links nowhere.** | `photos/page.tsx:1-20` |
| 2 | Working gallery today, where? | ✅ **Mobile only.** 3-column grid, day-grouped, newest-first, at route **`/m/p/[projectId]/photos/`**: `photo-grid.tsx`, `photo-search.tsx`, `[fileId]/viewer.tsx` (lightbox), `[fileId]/markup/markup-canvas.tsx`. Service `photos.ts` / `photos-client.ts`. **Desktop has only the flat file table** (`files/page.tsx`) — no grid, no lightbox. | `app/m/p/[projectId]/photos/photo-grid.tsx:156`; `photos.ts:137` |
| 3 | Markup editor — tools & persistence | **Desktop editor exists & works** (`files/[fileId]/markup/markup-editor.tsx`). Tools (`:9`): `arrow, circle, rectangle, pen, text, select`. 9 colors (`:11-21`), 4 stroke widths `10/20/30/50` (`:22`). Persists to **`files.markup_data`** JSONB — `{version, imageWidth, imageHeight, shapes: MarkupShape[]}`. **Rasterises**: `flatten()` renders original→JPEG @92% to a `.markup.jpg` derivative (always from original, never a prior derivative — #129 D-31 pattern). | editor `:9-48`; `markup_data` baseline `20260101000000:1389`; `flatten()` `photos-client.ts:48-78` |
| 4 | Photos distinguishable from other files? | ✅ Two ways. **`files.category`** (baseline `:1388`, CHECK enum incl. `'photos'`); the mobile gallery filters `category='photos'` (`photos.ts:139`). Plus **MIME** — markup only accepts `image/*` (`markup/page.tsx:18`). | as cited |
| 5 | Six filter chips → stored data? | 4 chips exist on mobile today (`All / Daily logs / Deliveries / Punch`, `m/.../photos/page.tsx:32-37`). Mapping below. **Safety and Marked-up are data-ready but NOT rendered.** | table ↓ |
| 6 | Photo linked to its source? | ✅ **files → source** FKs (all `ON DELETE SET NULL`): `daily_log_id`, `safety_incident_id`, `delivery_id`, `delivery_item_id`, `expense_id`. **source → files** reverse: `punch_list_items.reference_photo_file_id` + `completion_photo_file_id`; `daily_logs.pdf_file_id`, `deliveries.pdf_file_id` (PDFs only, not photo lists). `safety_incidents` and `delivery_items` have **no reverse FK** (linked only via `files.*_id`). | FKs: `20260721080000`, `20260722010000`, `20260723020000`, `20260723000000`, `20260728010000`; reverse `20260704214000:88-89` |
| 7 | Lightbox "turn into work" actions | See table ↓ — mostly **not built**. | — |

**Filter-chip mapping (B/A5):**

| Chip | Stored basis | Status |
| --- | --- | --- |
| All | no filter | ✅ exists |
| Daily logs | `files.daily_log_id IS NOT NULL` | ✅ exists (chip rendered) |
| Punch | `file.id ∈ punch_list_items.reference_photo_file_id / completion_photo_file_id` (read-only join, D-15) | ✅ exists (chip rendered) |
| Deliveries | `files.delivery_id` / `files.delivery_item_id IS NOT NULL` | ✅ exists (chip rendered) |
| Safety | `files.safety_incident_id IS NOT NULL` | ⚠️ **data ready, chip NOT rendered** |
| Marked up | `files.markup_data IS NOT NULL` | ⚠️ **data ready, chip NOT rendered** |

**Lightbox actions (A7):**

| Element | Data/action today | Evidence |
| --- | --- | --- |
| "Client can see: No" | ✅ column **`files.client_visible`** (bool, default false; Owner/Admin set it; portal reads only `client_visible=true`). **No UI toggle** anywhere today. | `20260721070000_files_client_visible.sql:12`; portal read `20261019000000` |
| Tags | ✅ `ai_tags` — editable on **desktop** (`AiTagEditor`), read-only on mobile viewer. | `files/ai-tag-editor.tsx` |
| Create punch item (from photo) | ❌ **not built** in either surface. | — |
| Attach to change order | ❌ **not built** — `change_orders` has no file FK (confirmed in the Money inventory, B2.5). | — |
| Share with client | ⚠️ mobile viewer only (`shareImages`, Web Share API); no desktop action; `client_visible` flag exists but no UI. | mobile `viewer.tsx` |

**Net-new for a desktop Photos gallery:** (1) mount the mobile grid/viewer on desktop; (2) add Safety +
Marked-up chips (data ready); (3) expose the `client_visible` toggle (column + RLS ready); (4) the three
"turn into work" actions are genuine builds (create-punch, attach-to-CO have no backing data path today).

---

# PART B — Files

| # | Question | Finding | Evidence |
| --- | --- | --- | --- |
| 1 | Categories per-job / per-company / fixed? | ⚠️ **Fixed enum on `files.category`**, NOT per-job custom. 14 values (`photos, contracts, plans, permits, invoices, change_orders, daily_logs, receipts, safety, deliveries, compliance, lien_releases, selections, other`). A file sits in exactly one. The design's "rename/reorder/add your own" **does not exist**. Upload picker exposes only 9 (system-generated categories omitted). | CHECK `20261036000000_selection_spec_sheet.sql:64-71`; picker `files/upload/upload-form.tsx:8-18` |
| 2 | "Shared with client" — per-category / per-file? | **Per-FILE** boolean `files.client_visible`. Enforced by RLS `files_select_client` (`client_visible=true AND is_client_of_project(project_id) AND client_has_full_access()`). Staff read via `files_select_non_client` (role `<> 'client'`, ignores the flag). | col `20260721070000:12`; client policy `20261019000000_m9_client_read_arms.sql:179-187`; staff policy baseline `:3622` |
| 3 | Current-revision / superseded stored? | ✅ **`files.version` (int, default 1)** + **`files.supersedes_id` (uuid FK→files.id)**. Columns exist; **the files-page UI does not render the revision chain today** (`file-row.tsx:42-54` shows name/category/tags/size/date only). | baseline `:1390-1391`; UI gap `file-row.tsx:42-54` |
| 4 | Trash — soft delete + restore + roles? | ✅ Soft delete (`is_deleted`, `deleted_at`). **Restore** `restoreFile()` (roles owner/admin/pm/foreman/crew via `files_update_non_client`). **Permanent delete** `permanentDeleteFile()` — **owner/admin only** (`files_delete_owner_admin`); UI hides "Delete forever" unless owner/admin. | `files-client.ts:331-347, 349-417`; policies baseline `:3629, :3608`; UI `trash/page.tsx:27` |
| 5 | Role gates on the page? | ✅ **Confirmed: none on the main files page — RLS only** (no redirect). Trash page checks user+role for `canPermanentDelete`. Policies: `files_select_non_client` (baseline `:3622`), `files_select_client` (`20261019000000:179-187`), `files_insert_non_client` (`:3615`), `files_update_non_client` (`:3629`), `files_delete_owner_admin` (`:3608`). Client visibility decided entirely in RLS via the two SELECT arms. | as cited |
| 6 | AI tagging — what/gated/add-on? | `ai-tag-editor.tsx` edits `ai_tags` (max 4) via `updateFile`; **component itself ungated**. Auto-tagging on upload is gated: `autoTagFile()` checks **`companies.ai_tagging_enabled`** (the Billing add-on) and returns `add_on_disabled` if off. | `ai-tag-editor.tsx:1-161`; flag `20260101000000:1063`; gate `ai-tagging.ts:75-83` |

## PART C — Contracts (`contracts-panel.tsx`, 1,376 lines — largest client panel in the repo)

| # | Question | Finding | Evidence |
| --- | --- | --- | --- |
| 1 | Panel top-level structure | Two stacked cards + three components: **ContractsPanel** (`:70-434`) — Client Contract card (`:197-253`) then Subcontractor Contracts card (`:255-431`); **SubSchedulePanel** (`:466-987`, per-sub stages/payments/retainage/approval); **ScheduleSetupEditor** (`:989-1376`, stage/budget-line form). Panel-wide `editingSchedules` toggle (`:89`) opens all sub editors together. | contracts-panel.tsx as cited |
| 2 | Client vs sub agreements — one list or two? | **Two tables, two lists.** `client_contracts` (`ClientContract[]`, single card `:206-251`) and `subcontractor_contracts` (`SubcontractorContract[]`, counted card + per-row schedules `:265-416`). Shared status enum `'draft'\|'sent'\|'signed'\|'void'` (`contracts.ts:14`). | contracts-panel.tsx:49-50 |
| 3 | Box placement — where stored, shared with lien releases? | Coordinates in **`contract_template_boxes`** (`x, y, width, height, page, kind, party, value_key, custom_label`; `kind∈signature/initial/value/custom`, `party∈client/sub/null`). **UI is the shared `BoxMapEditor`** — the **same component** lien-release settings uses; mode-specific via `catalog`/`kinds`/`parties` props (Contracts: 4 kinds+party; Lien: 3 kinds, no party). | `contract-settings-form.tsx:422-434, 486-498`; shared editor `box-map/box-map-editor.tsx` |
| 4 | Signature status per party stored? | ⚠️ **Not on the contract rows.** Lives in the 7I document layer: `contract_documents.status` (`draft/sent/signed/notarized/declined/voided`) + **per-recipient** `contract_signing_sessions` (`signed_at, signer_name, signature_type, signature_data, declined_at…`). No denormalized "countersigned" flag; execution = `status IN ('signed','notarized')`. | `contracts.ts:115`; `20261002000000_7i_e1_contract_status_decoupling.sql:345` |
| 5 | `projectHasUnsignedContract()` — gates anything? | **Display only, no blocking.** SECURITY DEFINER boolean (PM-visible: reveals only that paperwork is outstanding, not terms/value). Sole caller: project overview warning (`projects/[id]/page.tsx:209`). Migration is explicit "DECOUPLE, DO NOT GATE" — conversion/invoicing/payments proceed regardless. | `contracts.ts:201-208`; SQL fn `20261002000000:325-349` |

## PART D — Lien Releases

| # | Question | Finding | Evidence |
| --- | --- | --- | --- |
| 1 | Owner/Admin gate — NOT the Financial Floor; the stated reason | ✅ Verbatim from the migration header: *"⚠️ The role gate here is NOT the Financial Visibility Floor, and must not be re-justified on it — that rationale was STRUCK at S98. The Floor's S97 carve-out already lets a PM see invoice totals and retainage, which IS the release amount… The reason is narrower and sufficient: **a release WAIVES LEGAL RIGHTS and voiding does not retrieve it.**"* | `20260922000000_7f_lien_releases.sql:11-16`; gate `lien-releases/page.tsx:37-38` |
| 2 | Four types — rows or two booleans? | **Two columns**, not a 4-value enum: **`type`** (`'conditional'\|'unconditional'`, CHECK `:260-261`) × **`is_final`** (bool, `:230`). Four combinations derived. | migration `:229-230`; `lien-releases-shared.ts:17` |
| 3 | Tied to an invoice? The two direct `invoices` reads | ✅ Yes, two reads in `page.tsx`: **(1)** release→invoice detail lookup `.in('id', invoiceIds)` (`:48-52`, for `invoice_number/amount_receivable/is_final/status`); **(2)** eligible-invoice list `.eq('project_id',id).in('status',['sent','paid'])` (`:58-64`, powers the "issue unconditional release" button). | `lien-releases/page.tsx:48-52, 58-64` |
| 4 | Direction — issues / collects-from-subs / both? | ⚠️ **CLIENT-OUTBOUND ONLY.** Panel gets `getTemplates('client_outbound')` (`page.tsx:43`); releases link to `invoices` (money owed by the client). Sub-inbound columns exist in schema (`expense_id`, `sub_contract_id`) **but are unreachable** — "CLIENT-OUTBOUND ONLY [ruling C0, S140]. Sub-inbound is deferred." **The design's "lien releases for subcontractors" is not built today.** | migration `:8-9`; `page.tsx:43`; `lien-releases.ts:40-50` |
| 5 | Does the release PDF fetch the company logo? | ⚠️ **No.** The generate route reads only `contractor_signature_path` (no `logo_url`) — unlike invoices/proposals which fetch `logo_url`. Per the migration: *"The uploaded PDF **is** the legal instrument"* — FrameFocus overlays values + signature into placed boxes and supplies no page content. So the **uploaded, box-mapped form is the whole instrument.** | `api/lien-releases/generate/route.ts:226-237`; `lien-release-pdf-service.ts:39`; migration `:14-18` |

---

# PART E — cross-cutting

**E1 — hardcoded sibling-tab URLs:** **None.** Files links only to its own sub-routes (`…/files/trash`,
`…/files/upload`, `files/page.tsx:29,43`); Contracts/Lien redirect only to the project root on gate-fail.
The Money-section pattern (`payments-view.tsx`→invoices) has no analogue here. The strip is centralized in
`layout.tsx` + `project-header.tsx`.

**E2 — N+1 queries:**

| Page | Verdict | Detail |
| --- | --- | --- |
| Files | ✅ clean | `getFiles` + `getActiveTags` in one `Promise.all` (`files/page.tsx:11-14`); row actions are click-driven, not per-render. |
| Photos | ✅ clean (stub) | Desktop page is a stub; mobile gallery batches. |
| Lien Releases | ✅ clean | Releases fetched by batched `.in('invoice_id', …)`; invoice reads are two batched queries. |
| **Contracts** | ⚠️ **N+1 in edit mode** | `listExpenseAllocations(s.id)` called **once per stage** — in a `Promise.all(stages.map(…))` on edit-mode open (`contracts-panel.tsx:553-567`) and again in the "Approve all" loop (`:621`). Fine at 3–5 stages, degrades at 15+. Not on the default read path. |

**E3 — money rendered without a role check:**

| Page | Verdict |
| --- | --- |
| Files / Photos / Lien Releases | ✅ safe. Files/Photos render no money. Lien money (`releases-panel.tsx:167,229,405`) sits behind the page's Owner/Admin gate. |
| **Contracts** | ⚠️ **FLAGGED — likely Floor discrepancy (report-only, not fixed).** The Contracts tab has **no `roles` entry** (`project-header.tsx:82`), and the panel renders `contract_value` with **no role check** (`contracts-panel.tsx:220` client, `:375` sub). **Verified at the DB:** `client_contracts_select_visible` and `subcontractor_contracts_select_visible` floor out **only `subcontractor` and `client`** (`20260912000000:129-149`) — so **`foreman` and `crew_member` can SELECT `contract_value`** and will see it on this tab. The Financial Visibility Floor holds contract value to Owner/Admin, but these two contract tables are floored only against sub/client, not against foreman/crew. Whether that is intended is a **ruling question** — logged, not resolved. |

**E4 — storage paths / category coupling:** Path template is
`${company_id}/${scope_segment}/${uuid}-${safe_filename}`, where `scope_segment` is the `project_id` (or a
company-scope segment for project-less files) — `files-client.ts:136-153`. **Not scoped by category** — an
explicit comment says so (`:139-140`: *"Category lives in the column, NOT the path — keeps category editable
without orphaning the storage location"*). The composed path is stored in `files.file_path` and re-read for
signed URLs (`:287`). **Changing a file's category cannot break its storage path.**

---

# UNKNOWNs / partials — what was tried

| Item | Status | Note |
| --- | --- | --- |
| **Contracts E3 — intended or not?** | Verified fact, unresolved ruling | Confirmed foreman/crew can read `contract_value` (RLS `20260912000000:129-149` floors only sub/client) and the tab/panel render it with no role gate. Whether the Floor *intends* to cover these tables for foreman/crew is a decision, not a fact — flagged for the spec author. |
| **Photos design chips (Safety, Marked-up)** | Data-ready, not rendered | Columns confirmed (`safety_incident_id`, `markup_data`); current mobile chip set is 4 (`m/.../photos/page.tsx:32-37`). Adding them is UI-only. |
| **Files custom categories** | Confirmed absent | Fixed CHECK enum (`20261036000000:64-71`); no `file_categories` table found. Design's per-job customization is net-new. |
| **Files revision UI** | Columns exist, UI absent | `version`/`supersedes_id` stored (baseline `:1390-1391`); `file-row.tsx` renders no chain. Surfacing job, not a schema change. |
| **Sub-inbound lien releases** | Deferred | Columns `expense_id`/`sub_contract_id` exist but unreachable; ruled client-outbound-only (S140 C0). |
| **Line numbers vs `main`** | Caveat | Captured on `feature/s175-clients-off-team @ ba61257`. Re-verify `[S175]` items (the `selections` category migration `20261036000000`, any selection-linked file code) against `main`. |

*Read-only inventory. Not committed.*
