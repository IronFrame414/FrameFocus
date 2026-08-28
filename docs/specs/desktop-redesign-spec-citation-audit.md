# Desktop Redesign Spec — Citation Audit (Phase A)

> **Audited against:** `main @ ee2feaa` (2026-08-28). Read-only pass; the spec itself is not edited.
> **Spec:** `docs/specs/desktop-redesign-spec.md` (1358 lines, committed `6ab116e`).
> **Method:** every file path, `file:line`, schema claim, line count and cross-reference checked
> against the working tree; schema against `packages/shared/types/database.ts` and the **latest**
> migration touching each object; commits against `git log`. Six parallel read-only audit passes,
> with independent re-measurement of any ❌/⚠️ before it entered this file.

## Verdict key
✅ accurate · ⚠️ drifted (correction given) · ❌ wrong (explained)

---

## 0. Summary counts

| Category | ✅ | ⚠️ | ❌ |
| --- | --- | --- | --- |
| File paths (every path the spec names) | all exist | 1 (timesheets path is a redirect stub; real page under `timeclock/`) | 0 missing |
| `file:line` citations (~25 checked) | ~23 exact | 2 drifted (`invoice-delivery-panel` :175→:177; `7i_contracts` :504→:503–504) | 0 pointing at wrong code |
| Schema claims (columns, nullability, CHECKs, policies, triggers, RPCs) | ~75 verified | 2 (files policies now **6** not 5; `completed_at` is on `subcontractor_contracts`) | 0 |
| Line-count claims | 7 exact (8, 282, 77, 215, 33, 20, spec 1358) | 3 drifted (+2, +2, +3) | 0 |
| Commits cited (`6f8e3c0`, `296fb34`, `1718c24`, `6fc72ab`, `8de9b4d`, `04b67f4`) | 6/6 exist | — | — |
| Cross-references (§6b.2, §8b, §9.1 …) | all resolve | — | 0 dangling |
| Prose/verification claims | most | R10 match counts re-measured (§5.6) | **2** — header "one outstanding" (floor shipped); §3 R8 "lib/notify verified empty" (`push.ts:29`) |
| **Staleness from the invoice floor shipping** (`2ff9966` + `0f5d37e`, post-spec) | — | **header + §1 R2 + §7.1 + parts of §8.8.3/§8.8.4** — correction sheet in §2 below | — |

**The single most consequential error:** none of the spec's citations point at the *wrong* code.
The consequential staleness is the known one — **the invoice floor has shipped** (§2 below) — plus
one genuine ❌ the audit found: **§3 R8's "verified empty on old-brand strings" is false for
`lib/notify`** — `apps/web/lib/notify/push.ts:29` still carries
`'mailto:support@frameFocus.app'` as the VAPID-subject fallback (§5.3 below).

---

## 1. Header / §0 — session-verified claims

| Claim | Verdict | Evidence |
| --- | --- | --- |
| Handoff committed, 4 files | ✅ | `docs/handoffs/EZContractorBinder_Desktop_handoff/` — README.md, EZNav.dc.html, the UI .dc.html, support.js |
| `main` moved `6f8e3c0` → `296fb34` → `1718c24` → `6fc72ab` | ✅ | all four commits exist with the described subjects |
| README says **40 screens** (brief said 34) | ✅ | "40 screens" appears twice in the README |
| Design badge says **18 flat tabs**, actual is **17** | ✅ | "18 flat tabs" in the .dc.html; `TABS` in `project-header.tsx` has exactly 17 entries, and the 6-section mapping accounts for all 17 (1+4+5+4+2+1) |
| Header line 17: invoice floor "**one outstanding** (§7.1)" | ❌ **now false** | shipped at `2ff9966` (+ migration `20261038000000_invoice_payment_floor.sql`), tests reconciled at `0f5d37e`. Both post-date the spec. |

---

## 2. THE INVOICE FLOOR HAS SHIPPED — what §1, §7.1, §8.8.3, §8.8.4 must now say

`2ff9966` ("fix: a PM sees only invoices they authored; payments become Owner/Admin") changed four
files: `invoices/page.tsx`, `payments/page.tsx`, `project-header.tsx`, and new migration
`supabase/migrations/20261038000000_invoice_payment_floor.sql` (156 lines). `0f5d37e` inverted five
live suites. Everything below is confirmed against those files on `main`.

### §1 R2 — the role table's two "becoming" arrows have become
- **Payments**: `project-header.tsx:52-54` now gates `['owner', 'admin']`. The table's
  "owner · admin · project_manager → becoming owner · admin" is history.
- **Invoices**: the TABS roles array **stays** `['owner', 'admin', 'project_manager']`
  (`project-header.tsx:41-43`) — correct, because the scoping is authorship at the database, not a
  role cut at the tab. The tab renders for a PM; RLS shows them only their own invoices.

### §7.1 — "How it gets built — not in the restyle" is built
- The migration exists and follows the predicted S121 shape **with one deliberate deviation the
  spec must record: the floor keys on `author_member_id`, NOT `created_by`.** The migration header
  (lines 31–39) explains why: `created_by` is NULL on 10 of 18 live invoices, so S121's key would
  have hidden them from everyone. `author_member_id` is never NULL.
- The old `project-header.tsx` comment citing "7D §12 / 7E P-3" is **gone** — replaced by a
  comment quoting and superseding that rationale (the spec's ⚠️ asked for exactly this; it happened).
- Payments RLS: no PM arm remains on `client_payments`, `client_payment_applications`,
  `retainage_releases` (migration lines ~93–114). The PM keeps write on their own invoices because
  Postgres matches UPDATE through the SELECT policy — the same mechanism §8b measured, this time
  used deliberately.
- **Still owed from §7.1's checklist (not done by the fix commit):**
  - `money-representation.md` — the S97 §12a carve-out amendment. **Not amended**; the file's
    last commit predates the floor, and its header still reads "FULLY LOCKED, no carve-outs" while
    7D `§12a` (7d1-spec.md:942) still states the superseded carve-out. The Floor documents
    currently disagree with the Floor, which §7.1 explicitly warned against.
  - The saved-invoice-PDFs check (`files_select_non_client` behaviour on invoice-category files
    for a PM) — no evidence either way in the fix commit; still open.

### §8.8.3 Invoices — statements now false
- "Collected ✅ computed — but in 7E" / billing-progress row: the summary cards on
  `invoices/page.tsx` are now gated `canSeeContractValue` (Owner/Admin); a PM sees **no**
  aggregates on the list, and the list itself shows only their authored invoices.
- The presentation_level warning "a PM who can reach a draft can change it until send" survives,
  but "reach" now means **their own draft** only.

### §8.8.4 Payments — statements now false
- Everything in this section describing what a PM sees is moot: `payments/page.tsx:46` redirects
  non-Owner/Admin. The four-bucket ruling, retainage exclusion, reminder relabel etc. all stand —
  as **Owner/Admin-only** screens.

---

## 3. §1 / §4 / §S1 / §S4 — nav and sections

| Claim | Verdict | Evidence |
| --- | --- | --- |
| `project-header.tsx` — TABS declared + rendered in one file | ✅ | TABS at :24–102, rendered via `visibleTabs.map()` :117–198 |
| `layout.tsx` renders `<ProjectHeader>`; no second render site | ✅ | layout.tsx:37–41; tree-wide grep: only comments in `deliveries/page.tsx:9`; **`profitability/page.tsx` has no ProjectHeader mention at all** (spec said comment-only mention — ⚠️ half-drifted: the deliveries comment exists, the profitability one does not) |
| Chat carries no `roles` entry | ✅ | :101 `{ slug: 'chat', label: 'Chat' }`, ruling comment at :91–95 |
| §S1 `costs/page.tsx` 8-line redirect, cite :7 | ✅ | 8 lines; `redirect(...)` at line 7 |
| NAV_ITEMS 14 items, 3 sections, gates (Estimates/Cost Catalog o/a/pm, Settings o/a, Billing owner) | ✅ | dashboard-shell.tsx :79–168; all four gates verified |
| Styling facts: `bg-brand-500 rounded-[9px]`, icon 17/1.9, gap 11px, badge 9+, sticky `h-screen`, `w-[236px]`, `px-3 py-[10px]` | ✅ | :220–236, :277 |
| §S4: `:362` emits constructed `data-testid={\`nav-section-${key}\`}`; header inside `items.length === 0 ? null` | ✅ | still line 362; guard at :354–355 |
| `e2e/desktop-ffnav.spec.ts` asserts Owner 14/3, Admin −Billing, PM keeps both, foreman = crew | ✅ | apps/web/e2e/desktop-ffnav.spec.ts :58–128 |
| §7.1 cites `20260806000000_financial_rls_floor.sql:56` collision text | ✅ | line 56 verbatim |
| `20260830000000_change_order_read_floor.sql` "PM SCOPE IS AUTHORED-BY" | ✅ | line 5 |

Phase C's three deltas (228px, ring, 9px 11px) are confirmed **not yet applied** — the tree still
has the "Now" column values, as expected.

---

## 4. §2 — design tokens

| Claim | Verdict | Evidence |
| --- | --- | --- |
| `theme.ts`: navy `#14213d`, primary `#2f49d1` | ✅ | apps/web/lib/theme.ts:9,12 |
| `cardBorder`/`pageBg` near-identical shades exist | ✅ | :19 `#f4f6f9`, :21 `#e6e9ef` |
| `dangerAlt` = `#c0362c` | ✅ | :42 |
| No purple/purpleBg/rowTint*/attentionCardStyle tokens today | ✅ | absent from theme.ts |
| `tailwind.config.ts`: exactly three palettes; brand 11 stops, accent 10 | ✅ | :16–73; brand 50–950, accent 50–900 |
| accent.500 `#f59e0b`; m6m.canvas `#0d1220`; m6m.danger `#c0362c` | ✅ | :37, :65, :59 |
| m6m comment "would silently repaint the field app" | ✅ | :51–52 verbatim |
| `brand.logoAmber` `#EDA122` | ✅ | brand.ts:103 |
| `brand.ts` themeColor/backgroundColor both `#14213d`; never-alias argument; splash-assumption flag | ✅ | :69, :82; argument :22–39; flag :73–81 |
| Sidebar styled via `bg-brand-900` / `bg-brand-500` / `text-brand-200` classes | ✅ | dashboard-shell.tsx:277, :220–221 |
| Auth pages ride the brand scale | ✅ | sign-in-form.tsx, sign-up, forgot-password, reset-password all use `brand-*` classes |

---

## 5. §3 — branding

| Claim | Verdict | Evidence |
| --- | --- | --- |
| `brand.ts` name/shortName correct | ✅ | :51, :62 |
| R8 "verified empty on old-brand strings … `lib/notify`" | ❌ | **`apps/web/lib/notify/push.ts:29`: `'mailto:support@frameFocus.app'`** — VAPID-subject fallback (used when `VAPID_SUBJECT` env is unset). Sent to push services, not rendered to users, but it is an old-brand string in a file set R8 claims was verified empty. One-line fix; belongs with the token pass or as its own commit. |
| R9 logo pipelines: invoice-data, proposal-data, spec-sheet-data, co-signing-service fetch `logo_url`; lien-releases.ts does not | ✅ | all five verified |
| `manifest.webmanifest/route.ts` comment re portal manifest — spec marked **Unverified** | ✅ **now verified** | `app/portal/layout.tsx:64` sets `manifest: '/portal.webmanifest'` and `app/portal.webmanifest/route.ts` serves it. The spec's open question can be closed. |
| R10 match counts (~470 total; sessions 85, specs 30, archive 16, handoffs 6, migrations 5; ~150 import lines) | ⚠️ | Re-measured on `main`: any-case "framefocus" = **458 files** (sessions **84**, specs **30**, archive **16**, handoffs **8** — the two new handoffs added since, migrations **5**). `@framefocus` package scope = 273 files; **319 import lines** (spec said ~150 — undercount, but the substance of R10 — build-time identifier, defer — is unaffected). |
| `crew-manifest.ts:66` literal description under the no-literals banner; `brand.ts` has no `description` field | ✅ | crew-manifest.ts:66, banner :34; field absent |

---

## 6. §5 / §6 / §8.1–§8.7 — build order, margin, list screens

| Claim | Verdict | Evidence |
| --- | --- | --- |
| P2 `04b67f4` / §8c.1 `8de9b4d` exist as described | ✅ | both on main with matching subjects/files |
| P3 `estimates.viewed_at` + status `'viewed'` — zero writers | ✅ | database.ts:3213; CHECK incl. 'viewed' (20260704212000:20); no writer in apps/web or SQL |
| §6 `getProfitabilityReport` single call site `profitability/page.tsx:47` | ✅ | still :47 (tests aside) |
| `getRevisedContractMap` in contract-value.ts, behind `canSeeFinancials` | ✅ | contract-value.ts:520; projects/page.tsx:45,51 |
| `signed_sell_amount` persisted on selections | ✅ | database.ts:7258 |
| §8.1 `projects-list.tsx` 282 lines; `phases` migration "name + sort order only" | ✅ | exact; 20260704213000 verified |
| §8.2 five estimate migrations, none view-related | ✅ | recounted |
| §8.3 line counts 77 / 215 / 352 | ⚠️ | 77 ✅, 215 ✅, contact-detail-sheet.tsx **354** (+2) |
| §8.3 both Jobs arms (`projects.contact_id` + `project_contacts`); `client_access_state` four CHECK values; `profiles.contact_id`; `invitations.contact_id` | ✅ | database.ts:5602/5480/5196/4108; CHECK in 20261017000000 |
| §8.4 `insurance_expiry` written at subcontractor-form.tsx:100 / sub-edit-form.tsx:135; desktop renders it nowhere else | ✅ | both lines exact; dashboard grep clean |
| §8.4 compliance: doc_type CHECK; `expiration_date` nullable; `member_id` NOT NULL; BEFORE INSERT trigger; `compliance/${memberId}` path | ✅ | 20260729010000; database.ts:7457/7462; 20260731000000:120; payables-client.ts:759 |
| §8.4 "compliance insert admits OA" (vs sub-create OAP) | ✅ **latest-wins trap survived** | the 7C migration's policy admits O/A/PM, but `20260921000000_compliance_owner_admin_floor.sql` supersedes it to Owner/Admin. The spec matches the **live** policy. |
| §8.4 `getExpiringCompliance()` type-blind; `deriveComplianceStatus` four states; `complianceToday()` | ✅ | payables.ts:235–254 |
| §8.5 burden inputs: `burden_multiplier numeric(6,3) DEFAULT 1.0`; `fixed_burden_per_hour`; effective-dated `member_pay_rates`; pay-rate-section.tsx:104–106 and :76 | ✅ | 20260728010000:324; database.ts:1193/4980; both line cites exact |
| §8.5 "timesheets/page.tsx already does it right" | ⚠️ path shorthand | the real page is `dashboard/timeclock/timesheets/page.tsx` (calls `getSessionsForReview` + `weeklyHoursSummary`); `dashboard/timesheets/page.tsx` is a 16-line S85 redirect stub. Claim true in substance. |
| §8.5 `team/page.tsx` 33 lines, fetches nothing; merged-row inputs (`invitations.role`/`email`) exist | ✅ | exact |
| §8.6 `last_verified_at` stored/editable/rendered; `estimate_line_rows` has **no** `estimate_id` (two-hop via `estimate_line_items.line_item_id`); `selection_options.catalog_item_id` | ✅ | database.ts:2036/2897–2920/6997 |
| §8.7 terms/scope JSONB shapes (Zod); no deposit column; `source_deposit_invoice_id`; `retainage_percent` real; no `default_scope_sections`; `estimate_sub_bids.is_winner` + `set_winning_bid` RPC | ✅ | validation/estimate.ts; database.ts:3192/4353/8941 |
| §8.7 Bidding tab 523 lines | ⚠️ | bidding-tab.tsx is **525** (+2) |

---

## 7. §8.8 — Money

| Claim | Verdict | Evidence |
| --- | --- | --- |
| `payments-view.tsx:142` invoices base, 4 uses | ✅ | :142; used :245, :252, :355, :412 |
| `invoice-delivery-panel.tsx:175` lien-releases link | ⚠️ | now **:177** (+2) |
| §8.8.1 rollup fields; margin fixed-price + O/A on page; `getJobCostRollup().labor.totalCost`; `costToDate` = actual+committed; `budgetColumnsFor` 7/5 columns; instrument→cost-code grouping; watch-list feasibility (signed-subcontract, allowance, labor rows all resolvable in budget.ts); `selection_subcategory` | ✅ | budget.ts:13/51/221/257–270/334–363; budget/page.tsx:75–79/112/172/175; invoices-shared.ts:478–490 |
| §8.8.1 "~13 loops … safe to move" | ✅ in substance | one top-level `Promise.all` + in-memory reshaping; no DB call in a loop on the page |
| §8.8.2 CO schema: `schedule_impact_days` nullable; sent_at/signed_at; no `is_credit`, no negative CHECK; billing timing not on CO (`invoice_lines.source_change_order_id`); no punch/file FK; `reference_photo_file_id` no reverse link | ✅ | database.ts:230–299/4353/5741 |
| §8.8.2 redaction: `canSeeCoMoney` + `redactCo()` field lists | ✅ | co-redaction.ts:65–92 — CO_MONEY_KEYS exactly net_delta + 3 markup percents + tax_rate; line-item/line-row keys as spec states |
| §8.8.3 `presentation_level` 3 CHECK values, default lump_sum, no column RLS; number-on-send BEFORE trigger, drafts NULL; three billing modes; left-to-bill fixed-price-only on detail | ✅ | database.ts:4490; 20260802 migration; invoices detail page |
| §8.8.4 four aging buckets; retainage outside aging; immutability trigger (`client_payments_column_scope`); **no DELETE policy**; `client_refunds` source+status, owner auto/admin pends; credit derived; reminders per-client, default `[3,7,14]` + off | ✅ | payments-shared.ts:140–146; 20260804000000:397–399, :679 |
| §8.8.4 nothing writes `invoices.due_date` (P-1) | ✅ | only tests write it |
| §8.8.5 `ProfitHeadline` four fields; `computeHeadline()` earned/billed − actualCost; no cost-to-complete; no zero-cost caveat; six caveat codes exact | ✅ | packages/shared/utils/profitability.ts:184–260 |
| §8.8.5 `project_budget_amounts` has no sell column | ✅ | database.ts:5333–5380 |

---

## 8. §8.9 / §8b — Documents and the contract-value exposure

| Claim | Verdict | Evidence |
| --- | --- | --- |
| Storage path + "category lives in the column" comment | ✅ | files-client.ts |
| `files.category` 14-value CHECK (latest = `20261036000000`) | ✅ | all 14 values verified |
| Upload picker exposes 9 | ✅ | upload-form.tsx CATEGORIES |
| `files_select_client` arm; staff arm ignores flag | ✅ | 20261019000000 |
| "five policies carry it" | ⚠️ | now **six** — `files_insert_client` added by `20261021000000_m9_client_writes.sql` (M9, S175). Count drifted, conclusion ("RLS only, no page gate") unchanged. |
| `files.version` default 1 + `supersedes_id` stored, never rendered; `file-row.tsx` field list | ✅ | database.ts; file-row.tsx |
| Trash: restore five-role, permanent delete O/A + UI hides | ✅ | service + trash-row.tsx `canPermanentDelete`; RLS delete policy O/A |
| AiTagEditor max 4 ungated; auto-tag gated `ai_tagging_enabled` → `add_on_disabled` | ✅ | ai-tag-editor.tsx MAX_TAGS=4; ai-tagging.ts |
| Photos: 20-line desktop stub; mobile gallery (3-col, day-grouped, lightbox); desktop markup editor 6 tools/9 colours/4 widths; `.markup.jpg` from original; chips present (log/punch/delivery) + missing (safety, marked-up); no `client_visible` toggle anywhere | ✅ | photos/page.tsx = 20 lines; /m/p/[projectId]/photos; markup-editor.tsx (note: the **mobile** markup canvas is a smaller tool — 5 tools/5 colours/slider — the spec's claims are about the desktop editor and hold) |
| `contracts-panel.tsx` 1,376 lines | ⚠️ | **1,379** (+3) |
| `contract_template_boxes` columns; BoxMapEditor shared | ✅ | database.ts; `components/box-map/box-map-editor.tsx` used by both `contract-settings-form.tsx` and `lien-release-settings-form.tsx` |
| 7I layer: `contract_documents.status` + per-recipient `contract_signing_sessions`, no denormalised flag | ✅ | database.ts |
| `projectHasUnsignedContract()` "DECOUPLE, DO NOT GATE" | ✅ | migration comment verified |
| Lien gate reason struck-at-S98 comment; type × is_final; no logo in release PDF; `getTemplates('client_outbound')` | ✅ | verbatim comment found |
| `20260925000000_7f_sub_inbound.sql` schema-only; `lien_releases_subject_check` keyed on direction | ✅ | header + constraint verified; no sub_inbound UI/service reads exist |
| "`completed_at` was added" | ⚠️ clarify | the column is on **`subcontractor_contracts`**, not `lien_releases`. The spec's sentence is ambiguous about the table; the build should read it as sub-contracts. |
| §8b: Contracts TABS entry no roles; `contract_value` rendered ungated; floor policy `20260912000000…subcontractor_project_read_floor.sql:129–149`; `portal.ts:347`; write-guard triggers `20260809…part3.sql:155` and `20260926…7i_contracts.sql:504` | ✅ | all verified; the 7i cite is the condition at :503–504 (within-line drift only) |
| §8b checkpoint honoured: `client_contracts.contract_value` still exists; **no** `client_contract_amounts` anywhere | ✅ | database.ts + migration grep — the checkpointed fix has not partially landed |
| Tests `s97ct-floor3` 4a/4b, `s145` C4 exist | ✅ | s97ct-floor3.live.ts, s145-contracts.live.ts |

---

## 9. §8.10 — Estimate detail

| Claim | Verdict | Evidence |
| --- | --- | --- |
| Eight tabs, no Review & Send; Files `disabled: true`; Cover Sheet present; order per code | ✅ | estimate-builder.tsx:55–64 — Details, Items, Terms, Scope of Work, Bidding, Files (disabled), Cover Sheet, Notes |
| Tab state client `useState`, not URL | ✅ | :77 |
| Preview route `[id]/proposal/`; send in Details right-rail | ✅ | route exists |
| Autosave contract (per-field on blur → `recalculateEstimateTotals` → `reload()`); `canEdit = status === 'draft'`; triple-backed freeze | ✅ | estimate-builder.tsx:124–137 + service/RLS/trigger |
| §8.10.3: no history/event table; dead `DEFAULT 'v1.1'` zero writers; no scope↔category key; no cap column | ✅ | baseline_schema.sql:1321; database.ts |
| §8.10.4 rows (email_logs, signing_sessions, SigningActivity O/A, counters, `expiration_days` NOT NULL default, `proposal_pricing_level` 5 values, mark-as-sent, no send-me-a-test, `reminder_schedule` semantics, contract-section PM read-only, `pricing_mode`, `markup_percent` null-inherit, `internal_notes` whole-blob carry via convert RPC) | ✅ all | migration 20261025000000:404 for the notes carry; rest verified in database.ts / components |
| §8.10.5: foreman cannot reach estimates; RLS o/a/pm with PM arm `created_by`-scoped | ✅ | estimates/page.tsx:21 + policy |
| §8.10.6 (PM instrument-rates open question) | — | left open, as the spec itself says; needs a live PM sign-in |

## 10. §8.11 — Settings · Notifications · Expenses

| Claim | Verdict | Evidence |
| --- | --- | --- |
| Seven stacked forms behind O/A redirect | ✅ | settings/page.tsx:112, :180–210 (7 forms) |
| One signature serves CO + lien; type-your-name canvas built | ✅ | consumers verified |
| `contractor_signature_mode/name/ref` not written by the form — **consumer found** | ✅ closed | written/read by the CO signing path (`change-orders-client.ts`, `co-signing-service.ts`). The spec's "find its consumer before touching this form" now has its answer. |
| Estimating/Proposals/Time-Tracking/Accounting/Documents rows (both triples, `default_terms_sections` order, `next_estimate_number()`, hardcoded template variables, `week_starts_on` dynamic + TECH_DEBT #92, `session_rate_snapshots` freeze via SECURITY DEFINER trigger, `gl_account_*` **not** snapshotted, `seed_lien_release_templates()` no-PDF seeding, `client_contracts_enabled` gates send only) | ✅ all | TECH_DEBT.md #92 verbatim; `gl_account_{labor,material,other,subcontractor}` confirmed at database.ts:1194–1197 |
| Notifications: no `notification_preferences` table; quiet-hours cols; `push_subscriptions` wired | ✅ | database.ts |
| §8.11.2: **15 stored types, exact set matches** the ruled chip mapping's universe; starred/read_at stored; one `getUnreadCount()`; no category column; All·Unread·Starred only; no roll-up code | ✅ | notify.ts:76–100 — the 15 names match the spec's chip tables exactly |
| §8.11.3: `expenses.project_id` NOT NULL ("not on any job yet" impossible — mockup wrong, as ruled); no expense→invoice link; duplicate-check keys exist, no code; "Retainage release is Owner only" verbatim; `approve_expense` exact-sum + recompute, never writes `qb_*`; qb columns + gl columns exist; no export service; `closeout_reason`; crew excluded from Bills | ✅ all | database.ts + RPC bodies |

## 11. §8.12 — the five destinations

| Claim | Verdict | Evidence |
| --- | --- | --- |
| §8.12.1 already-built list (findOverlaps, live board 30s, week/month toggle, `can_approve_member`, OT derived, `workedHoursByProject`) | ✅ all | verified |
| §8.12.2 gaps (`phases` bare — no estimate_id/dates/weight; no company-wide money rollup; no event table; `tasks` has no hours column; company timeline new; no `hold_reason`) | ✅ all | database.ts phases/tasks column lists confirmed bare |
| §8.12.3 on-site badge = GPS captured, no geofence | ✅ | M6M D-34 posture confirmed |
| §8.12.4 Billing (owner-only; seats enforced; storage never measured; QB stub; AI add-on real; **portal logo renders unconditionally** — `portal.ts:220–227` fetches `logo_url` with no gate, so the $19 add-on would sell what ships free, as ruled) | ✅ | verified |
| §8.12.4 retention: `RETENTION_DAYS_TRIAL = 14` (lifecycle.ts:30); cancellation-path comment **"cancellation gets 30 days and is a different path that is not built here"** (lifecycle.ts:28–29) | ✅ | verbatim — note the code comment says **30**, the mockup says 90, and **neither is a built path**; Josh's 90-day ruling is a feature build, exactly as the spec says |
| §8.12.5 `runDailyLogMissing` narrower question, service-role client | ✅ | verified |

## 12. §8c — the two fixes and the logged items

| Claim | Verdict | Evidence |
| --- | --- | --- |
| §8c.1 tz fix: `8de9b4d`, `dashboard.ts` only, `companyToday(timezone)` | ✅ | dashboard.ts:7,52 — imports and uses `companyToday` from `@framefocus/shared/utils/dates`, with the "complianceToday() fix; the shared companyToday() is that pattern" comment at :50 |
| §8c.2 N+1 fix: `04b67f4`, five files, per-row functions kept | ✅ | commit verified |
| Logged: `app/m/expenses/page.tsx:145` N+1 | ✅ line exact | `getExpenseReceipts(e.id)` inside the map at :145, with an acceptance comment at :138–141 |
| Logged: `app/m/subs/page.tsx:20–22` stale policy comment | ✅ lines exact | verbatim match |

## 13. §9.3 — the dialog-sweep coverage gap, made explicit

**What was deliberately left unconverted: the five `prompt()` value-collectors.** All 54 `confirm()`
and all 20 `alert()` call sites were converted; `prompt()` returns a value and needs cancellation
handling, which the binary overlay does not do. Filed as **`#1-dialogsweep`** in the S175 item 9
battery record and left untouched on purpose:

| File | Line | Collects |
| --- | --- | --- |
| `settings/contract-settings-form.tsx` | 309 | new form name |
| `settings/lien-release-settings-form.tsx` | 106 | new form name |
| `estimates/[id]/items-tab.tsx` | 203 | a typed value |
| `projects/[id]/lien-releases/releases-panel.tsx` | 85 | void reason |
| `projects/[id]/files/[fileId]/markup/markup-editor.tsx` | 92 | text-tool content |

**Redesign consequence:** any Phase-4+ restyle touching these five screens meets an unstyled native
`prompt()`. The two settings forms and the markup editor are all in this pass's later steps. Either
`#1-dialogsweep` grows a value-collecting overlay first, or the restyle ships five native dialogs —
that is a sequencing decision for Josh, not something Phase B–D touches.

## 14. Cross-references and internal contradictions

**Cross-references — all resolve to what they claim:** §1 R2→§7.1 · §5's §8.x table → all sections
exist · §5b.9 → §6b.7/§8.12.4/§8.11.1/§8.12.3 (all four captions present as described) ·
§8.1→§6b.2 · §8.8.5→§6b.3 · §8.11.3→§6b.6 · §8.9.3→§8b · §8.8.1→§9.1 · §6b.1↔§3 R10. No dangling
references found.

**Internal contradictions:** one family, already known — everything that describes the invoice
floor as future (§ header line 17, §1 R2's "becoming" arrows, §7.1's build plan, §8.8.3/§8.8.4's
PM-visible descriptions). All were true when written; `2ff9966`/`0f5d37e` overtook them. §2 of this
audit is the correction sheet. No *other* section contradicts a section elsewhere in the spec.

**Follow-ups the audit surfaced (not spec errors, and none block Phase B):**
1. **`money-representation.md` and `7d1-spec.md` §12a still state the overturned S97 carve-out.**
   §7.1 and §9.2 both oblige that amendment; the fix commit did not make it. Doc-only, but the
   Floor documents currently disagree with the shipped Floor.
2. **`push.ts:29` old-brand VAPID fallback** — one-line change, natural rider on Phase B or its own
   commit.
3. **Saved invoice PDFs for a PM** (§7.1's ⚠️) — whether `files_select_non_client` shows a PM
   invoice-category files for invoices they cannot read. Not checked by the fix commit; needs a
   live probe.
4. §8.10.6's PM instrument-rates question — still open, needs a PM sign-in on rebuild-test.
