# Settings · Notifications · Expenses — inventory (READ-ONLY)

> Facts for the desktop-redesign spec across three areas. **Nothing designed, nothing changed.**
> Every claim carries a path; a line number where it is one line.

**Branch:** `main` · **HEAD:** `1718c24 merge: client portal reopen spec, canonical seed spec (S175 items 8)`
Baseline `main`, working tree clean.

**Rendering reality:** `settings/page.tsx` renders **seven form components stacked** (Owner/Admin
redirect, `page.tsx:108`). The mockup's tabs are the redesign; the Documents tab hosts **two** forms
(Lien + Contracts), and the **Notifications tab has no form today** (see A3-Notifications). All seven
forms write the **`companies`** row except Lien/Contracts, which also write template tables.

---

## PART A — Settings

### A1 · Field inventory (per tab)

#### 1. Company — `settings-form.tsx` (613) · **manual "Save Settings"**

| Field | Column | Notes |
| --- | --- | --- |
| Name | `name` | required |
| Trade type | `trade_type` | select |
| License number | `license_number` | |
| Email | `email` | Reply-To on outbound + prints on letterhead |
| Phone / Website | `phone` / `website` | |
| Address 1/2, City, State, ZIP | `address_line1/2, city, state, zip` | |
| Logo | `logo_url` | URL; bucket `company-logos`, `{companyId}/logo.{ext}`; PNG/JPEG ≤2 MB |
| Signature (upload) | `contractor_signature_path` | path; bucket `project-files`, `{companyId}/signatures/signature.{ext}` ≤2 MB |
| Signature (typed name) | `contractor_signature_path` | **built** — canvas renders a script-font transparent PNG (`settings-form.tsx:177-208, 406-431`), saved through the same upload path |

Save: single `handleSave()` → `updateCompany()` (`:69, 609`); logo/signature uploads are separate async handlers (`:96, 129`).

#### 2. Estimating — `estimating-settings-form.tsx` (488) · **autosave (1s debounce, per field)**

| Field | Column |
| --- | --- |
| Estimate number prefix | `estimate_number_prefix` |
| Next number (read-only) | `estimate_number_sequence` (display `{prefix}-{seq+1}` padded 3) |
| Pricing mode | `default_pricing_mode` (`markup`\|`margin`) |
| Sub/Material/Labor **markup** % | `default_{subcontractor,material,labor}_markup_percent` |
| Sub/Material/Labor **margin** % | `default_{subcontractor,material,labor}_margin_percent` |
| Default tax rate % | `default_tax_rate` |
| Default labor rate $ | `default_labor_rate` |
| Default terms sections | `default_terms_sections` (JSONB `{name,content}[]`, **order preserved**) |

Save trigger `scheduleSave()` (`:86`); terms save as a unit on any change/reorder.

#### 3. Proposals & Email — `proposal-settings-form.tsx` (426) · **autosave (1s debounce)**

| Field | Column |
| --- | --- |
| Brand color | `brand_color` (hex) |
| Default proposal detail | `default_proposal_pricing_level` (5-value) |
| Default expiration days | `default_expiration_days` |
| Proposal email subject / body | `default_proposal_email_subject` / `_body` |
| Reminder email subject / body | `default_reminder_email_subject` / `_body` |
| Reminder schedule (day chips) | `default_reminder_schedule` (JSONB int[] days, sorted) |

Save trigger `scheduleSave()` (`:64`).

#### 4. Time Tracking — `time-tracking-settings-form.tsx` (322) · **autosave (1s debounce)**

| Field | Column |
| --- | --- |
| Week starts on | `week_starts_on` (UI offers 0=Sun / 1=Mon only) |
| OT threshold hours | `ot_threshold_hours` |
| Breaks paid | `breaks_paid` |
| Paid break cap minutes | `paid_break_cap_minutes` (disabled when breaks_paid=false) |
| GPS clock mode | `gps_clock_mode` (`off`/`capture`/`enforce`) |

Save trigger `scheduleSave()` (`:85`).

#### 5. Accounting — `gl-mapping-settings-form.tsx` (158) · **manual "Save"**

| Field | Column | Notes |
| --- | --- | --- |
| Labor / Material / Subcontractor / Other GL account | `gl_account_labor` / `_material` / `_subcontractor` / `_other` | free-text QB paths, **no validation** |
| Fixed labor burden $/hr | `fixed_burden_per_hour` | ≥0; applies to members on "company fixed" burden source |

Save `handleSave()` → `updateGLMappingSettings()` (`:56, 152`).

#### 6. Documents — Lien (`lien-release-settings-form.tsx`, 377) + Contracts (`contract-settings-form.tsx`, 525)

**Lien signatory:** `signatory_name`, `signatory_title` (on `companies`, via `updateCompany()` `:92`); signature **image reused** from Company (`contractor_signature_path`). **Release forms table** → `lien_release_templates` (`name, type` conditional/unconditional, `is_final`, `jurisdiction_state`, `pdf_file_id`, `is_default`) + box map `lien_release_template_boxes` (shared `BoxMapEditor`; kinds value/signature/custom).

**Contracts:** master toggle `client_contracts_enabled`; **two sets keyed on `document_kind`** (`client_contract` / `sub_contract`) → `contract_templates` (`name, pdf_file_id, is_default`) + `contract_template_boxes` (kinds value/signature/initial/custom, signature/initial require a `party`). One default per `(company_id, document_kind)` (partial unique index + BEFORE trigger).

#### 7. Notifications tab — **no form exists** (see A3-Notifications).

### A2 · Save-model inconsistency — **confirmed true**

| Form | Model | Trigger |
| --- | --- | --- |
| **Company** | **manual button** | `settings-form.tsx:609` |
| **Accounting** | **manual button** | `gl-mapping-settings-form.tsx:152` |
| Estimating / Proposals / Time Tracking | autosave (1s debounce, per field) | `:86` / `:64` / `:85` |
| Lien / Contracts | mixed — inline per-row + shared box editor | `:92,186` / `:145,192` |

⚠️ The mockup caption ("Company saves on demand; every other tab autosaves") is **not quite right** —
**Accounting also uses a manual Save button**, not autosave. Company differs because it bundles the
address/identity fields into one write **and** carries two independent async **file uploads** (logo,
signature) — a per-field autosave would fight the upload handlers.

### A3 · Per-tab specifics

**Company** — Logo `logo_url` (bucket `company-logos`); signature `contractor_signature_path` (bucket
`project-files`, `{companyId}/signatures/…`). **The same `contractor_signature_path` is applied to change
orders and lien releases** (reused by `api/change-orders/[id]/send/route.ts`, `api/lien-releases/generate/route.ts`,
`lien-release-pdf-service.ts`, `changes/[coId]/page.tsx`) — one signature, all documents. **"Type your name"
generation is built** (script-font transparent PNG, `settings-form.tsx:177-208`). Prints on client docs:
logo (invoice/CO/estimate/letterhead), email (Reply-To), phone/website/address (letterhead), signature (CO/lien).
⚠️ `companies` also carries `contractor_signature_mode/name/ref` (a newer typed-signature triple) — the
form writes only `contractor_signature_path`; the `_mode/name/ref` columns' consumer is not in these forms (see UNKNOWNS).

**Estimating** — Prefix `estimate_number_prefix` + `estimate_number_sequence`; next number allocated by
`next_estimate_number()` at estimate creation (column default, atomic/company-scoped). **Both markup AND
margin triples are stored**; `default_pricing_mode` selects which triple `createEstimate` seeds onto a new
estimate (`estimates-client.ts:305-317`). `default_tax_rate`, `default_labor_rate`. `default_terms_sections`
JSONB — **order stored** (array order, reorder buttons rewrite the array).

**Proposals & Email** — Substitution by `replaceTemplateVariables()` (`email-service.ts:83`, regex `{{var}}`,
unknown tokens pass through) **at send time**; the variable list is **hardcoded** per email type
(`proposal-defaults.ts` — proposal/reminder/CO/invoice each have their own token set), **not stored/configurable**.
`brand_color` — column exists; exact render sites (proposal HTML/PDF/email) not pinned in the form (UNKNOWN).
Subject/body stored per company (`default_proposal_email_subject/body`, `default_reminder_email_subject/body`).
Reminder day-chips **are** `default_reminder_schedule` (same column).

**Time Tracking** — Columns `week_starts_on`, `ot_threshold_hours`, `breaks_paid`, `paid_break_cap_minutes`.
**GPS mode = `gps_clock_mode` ∈ `off`/`capture`/`enforce`** (default `capture`, CHECK `20260721050000:51`).
The mockup's "Require = enforce, desktop behaves like Capture" — `enforce` is documented mobile-only-future
(`time-tracking-settings-form.tsx:10`); **whether desktop clock-in actually downgrades enforce→capture is in
the clock-in path, not verified here** (UNKNOWN). **Payroll-week change:** `week_starts_on` is read
dynamically (`company.ts:120`) and **OT is derived at read time, not stored** — so changing it **re-groups all
past time and re-derives OT** (form caption; TECH_DEBT #92). Approved weeks keep their approval *record*, but
totals re-display under the new grouping.

**Accounting** — Four free-text `gl_account_*` (no validation; consumed by the future 7G connector at export
time). **Fixed burden freeze IS enforced** — not in this form (agent marked UNKNOWN), but via the
**`session_rate_snapshots`** append-only table: a SECURITY-DEFINER trigger `snapshot_session_rate()` freezes
`hourly_rate`, `burden_multiplier`, `fixed_burden_per_hour`, `burden_source` per session **at approval**
(`20260728010000:411-475`, system-write-only `20261012000000`), and `expenses.ts:316` reads the snapshot, not
the live company value. `company-client.ts:62` states the change is forward-only. So already-approved time keeps
its frozen burden; a later `fixed_burden_per_hour` change hits only future approvals.

**Documents** — Signatory `signatory_name`/`signatory_title`. **The four release forms ARE seeded per company**
(agent said "no seeding" — corrected): backfill for existing companies + a `seed_lien_release_templates()`
signup trigger for new ones (`20260922000000:481-499`), pre-**named** (Conditional / Unconditional / Unconditional
Final / Conditional Final), **no PDF**. **"No form uploaded"** = `pdf_file_id IS NULL` → the type cannot generate/issue
until the company uploads its own PDF and places boxes (the liability posture). `client_contracts_enabled` gates
**only the send flow**; forms stay authorable while off (`page.tsx:129-137`, read unconditionally), so with it off
"proposals send exactly as today." Sub agreements (`document_kind='sub_contract'`) **are authorable now; sending
arrives later** — confirmed (`contract-settings-form.tsx:256`).

**Notifications (settings tab)** — **Delivery preferences per type do not exist** — no `notification_preferences`
table, no per-type app/email toggle on `profiles` or `companies`. What exists: `companies.notify_hours_start/end`
(a quiet-hours window) and a `push_subscriptions` table. **"Roll up repeats" is not implemented.** **Web push IS
wired** — `PushEnrolment` (`notifications/page.tsx:66`) registers a `/dashboard` push-only service worker (the `/m`
copy registers the `/m` worker). So the mockup's Notifications tab is **largely net-new** (quiet-hours + push exist; per-type routing does not).

---

## PART B — Notifications page (`notifications/page.tsx`)

1. **Types (15)** — `mention, assignment, incident, signed, reminders_exhausted, discrepancy, timesheet_ready,
   daily_log_missing, still_clocked_in, contract_signed, punch_assigned, low_stock, trial_warning,
   selection_approved, selection_denied` (`notify.ts:76-100`; CHECK `20261027000000:12-13`). Each raised by a
   `notify()` call at its source event.
2. **Category chips (Everything·Signatures·Money·Field·Account)** — **would be new.** There is **no `category`
   column** on `notifications` (columns: `type, title, body, link_key, link_params, project_id, read_at, starred,
   expires_at, created_at, recipient_profile_id, company_id, source_id, source_table, updated_at`). The only
   grouping key is `type`; mapping the 15 types → 5 buckets is unbuilt. Today's page filters are only **All ·
   Unread · Starred** ("No type filter in v1", `page.tsx:14`).
3. **"Needs a decision from you"** — **not a stored state.** No `severity`/`priority`/`state` column. It would be
   **derived** from `type` (e.g. `selection_approved/denied`, `discrepancy`, `timesheet_ready`).
4. **Roll-up ("3 more … Expand")** — **not implemented.** `NotificationList` renders a flat list; no grouping code.
5. **Starred / mark-read** — **stored per notification:** `starred` (bool) and `read_at` (timestamptz).
6. **Unread count** — `getUnreadCount()` = unread **and** unexpired (`notifications.ts:96`). **Same source as the
   sidebar badge** — both `dashboard/layout.tsx:69` and `m/layout.tsx:107` call it.

---

## PART C — Expenses

**Schema:** `expenses` — `project_id` **NOT NULL**; `state` ∈ `committed`/`actual`; `status` ∈
`pending`/`approved`/`rejected`; plus `supplier, expense_date, amount, cost_category (material/subcontractor/other),
sub_contract_id, purchase_order_id, stage_label, due_date, awaiting_paper, is_retainage, closed_out_at/by,
closeout_reason, approved_by/at, rejected_by/at/note, qb_push_status/qb_bill_id/qb_synced_at (7G stubs),
source_segment_id`. `expense_allocations` (`expense_id, budget_item_id, amount`, UNIQUE(expense,budget_item),
`source_selection_id`). `expense_payments` (`paid_date, amount (gross), retainage_withheld, retainage_percent_applied,
method, over_stage`).

| # | Question | Finding |
| --- | --- | --- |
| 1 | **Receipts metrics** | **Spend this month** ✓ Σ amount, approved 7A receipts, month-to-date. **Awaiting approval** ✓ COUNT `status='pending'`. **Unbilled to client** ✗ **NOT BUILT** — no expense→invoice/delivery link, no client-billing column; needs new schema. **Missing receipts** ✓ `status='pending'` with no `files.expense_id` row. |
| 2 | **Bills & Commitments metrics** | **Committed open** ✓ Σ `committedRemaining = max(amount − Σ payments, 0)` over approved payable rows, `closed_out_at IS NULL`. **Paid to date** ✓ Σ `expense_payments.amount`. **Retainage held** ✓ same, filtered `is_retainage=true`. **Missing due dates** ✓ `awaiting_paper=true AND due_date IS NULL AND closed_out_at IS NULL`. All derivable. |
| 3 | **Retainage "ready to release"** | A row `is_retainage=true`, `status='approved'`, not closed out, `committedRemaining>0`. **Release is Owner-only** — `record_expense_payment` raises "Retainage release is Owner only"; UI gates the button on `isOwner` (`bills-tab.tsx:182`). |
| 4 | **Review queue / approve** | Queue = `status='pending'` (uniform gate; `expenses-page-client.tsx`). Approve = `approve_expense` RPC (Owner/Admin): validates ≥1 allocation summing **exactly** to amount, **deletes+reinserts** allocations, sets `status='approved'`, fires the recompute trigger. **"Posts to job cost" ✓** (updates `project_budget_items.actual_amount`/`committed_amount` via `recompute_budget_item_*`). **"Posts to QB export" — only infrastructure-ready:** `qb_*` columns exist but `approve_expense` never writes them; the export is Module **7G, not built.** |
| 5 | **"Not on any job yet"** | **Not a real state.** `expenses.project_id` is **NOT NULL** (`20260728010000`); every expense has a project. Reassignment is allowed (wrong-job fix) but never to NULL. |
| 6 | **Close out vs Settled** | **Settled** = read-time derive, `remaining ≤ 0 AND status='approved'` (`bills-tab.tsx:176`); the `state` column flips to `actual` as a marker but "settled" is computed, not stored. **Closed out** = explicit Owner/Admin action, `closed_out_at` set + `closeout_reason` required (`bills-tab.tsx:177`); removes the row from every committed Σ. Settled = all money accounted; closed-out = we're done with the commitment despite a shortfall. |

---

## PART D — cross-cutting

### D1 · Money reaching the wrong role

- **Expenses SELECT (`expenses_select_scoped`, `20260827000000`):** company-scoped, **excludes `subcontractor`**,
  and admits own-authored rows OR (owner/admin/pm/foreman/**crew** on `can_view_project`). So **crew & foreman see
  expense amounts (actual cost) on assigned-project expenses** — intentional under the Floor. **Bills tab** = `SEES_BILLS
  = owner/admin/pm/foreman` (`page.tsx:38`); **crew excluded from Bills.** **Reviewer** = owner/admin (`:39`).
  **Budgeted amounts** in the allocation picker are Owner/Admin-only (`review-popup`, S97). No unexpected leak in these
  three areas beyond the deliberate Floor. *(Cross-area note: a PO's committed `total_amount` is shown to any
  project-viewer incl. foreman/crew — logged in the PO inventory, not here.)*
- **`cost_catalog`** is floored to owner/admin/pm (relevant to Estimating, not these three areas).

### D2 · N+1 beyond the three already logged

- The three logged stand: settings box-map fetches per template (`settings/page.tsx:71` contracts, `:162` lien),
  and `expenses/page.tsx:79`. The `:71` pattern runs for **both** contract families (`client_contract` + `sub_contract`
  via `withBoxes`) — same defect, two callers, not a new one.
- Notifications page: single query, **no N+1**. **No new N+1 found** in notifications or expenses beyond those logged.

### D3 · Company defaults read at creation (forward-only — a later settings change does NOT rewrite existing records)

| Default | Read when | Lands on |
| --- | --- | --- |
| `default_pricing_mode` + selected markup/margin triple, `default_tax_rate`, `default_terms_sections`, `default_expiration_days`, `default_proposal_pricing_level` | estimate creation (`estimates-client.ts:296-331`) | the estimate row |
| `default_labor_rate` | adding a labor row (fixed-price) (`estimate-items-client.ts:82`) | the row's rate |
| `default_reminder_schedule`, `default_reminder_email_subject/body` | reminder send (`reminders.ts:31`) | the outbound email (per-estimate `reminder_schedule` can override) |
| `fixed_burden_per_hour` + `burden_multiplier` | **time approval** (`snapshot_session_rate`) | `session_rate_snapshots` (frozen) |
| `estimate_number_prefix` / `_sequence` | estimate creation (`next_estimate_number()`) | the estimate number (prefix change ⇒ future numbers only) |
| per-contract `retainage_shape`/`percent` (not a company default) | payment (`record_expense_payment`) | `expense_payments.retainage_percent_applied` (frozen) |

⚠️ **`gl_account_*` are NOT snapshotted** — read at 7G export time, so a mapping change **is** retroactive to all
future exports. The spec should say GL mapping is live, unlike the frozen burden/retainage.

---

## UNKNOWNS (and what was tried)

| # | Unknown | Tried |
| --- | --- | --- |
| 1 | Consumer of `companies.contractor_signature_mode/name/ref` (a newer triple beside `contractor_signature_path`). The Company form writes only `_path`; the newer columns' reader isn't in these forms. Did not grep the CO/lien generate routes for the `_mode/name/ref` variant. |
| 2 | Whether desktop clock-in actually downgrades `gps_clock_mode='enforce'` to capture behaviour. Confirmed the three CHECK values and the form comment; did not read the clock-in/time-entry path. |
| 3 | Exact render sites of `brand_color` (proposal HTML / PDF / email CSS). Confirmed the column + save; did not trace the render. |
| 4 | Whether approved weeks are fully insulated from an OT re-derive after a `week_starts_on` change. Confirmed OT is derived at read time (`company.ts:120`) and rate/burden freeze via `session_rate_snapshots`; did not find a stored OT-grouping snapshot, so approved-week OT totals may re-display under the new grouping (TECH_DEBT #92). |
| 5 | The QB export (Module 7G) — `qb_*` columns exist on `expenses` but no export service writes them in the current tree. |
