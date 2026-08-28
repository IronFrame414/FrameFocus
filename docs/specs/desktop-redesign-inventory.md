# Desktop redesign — read-only screen inventory

> Gathered for the parallel spec-writing session. **Nothing in the repo was changed.** Every claim
> below carries a file path, and a line number where it is one line. Where a fact could not be
> established it says **UNKNOWN** and §UNKNOWNS at the end records what was tried.

---

## Step 0 — state

| | |
| --- | --- |
| Branch | `feature/s175-clients-off-team` |
| `git log --oneline -1` | `b798e13 [S175] Item 6, step 6 — both S168 items closed, the pending-invite finding filed, and the record` |
| Working tree | **clean** (`git status --porcelain` empty) |
| Expected baseline | `main` @ `6f8e3c0` |

⚠️ **This is NOT the expected baseline.** The session is on the S175 feature branch, six commits
into item 6, not on `main` @ `6f8e3c0`. Everything below describes `b798e13`. The spec will need
reconciling if `main` is the intended reference — in particular S175 items 6 and 9 (the dialog
sweep, §C12) are live work on this branch.

---

## PART A — page inventory

### A1 — `/dashboard/*` routes

Non-recursive file listing per route directory. "Split" = server `page.tsx` renders a `'use client'`
list/shell component.

| Route | Files (lines) | Server/client split? |
| --- | --- | --- |
| `/dashboard` (index) | `page.tsx` 234 · `layout.tsx` 90 · `dashboard-shell.tsx` 417 (client) · `schedule-card.tsx` 196 (client) · `register-push-sw.tsx` 49 (client) | **Yes** — server page + client `ScheduleCard`; nav shell is a separate client component |
| `/dashboard/contacts` | `page.tsx` 77 · `contacts-list.tsx` 215 (client) · `contact-detail-sheet.tsx` 352 (client) · `contact-form.tsx` 402 (client) | **Yes** — canonical shape |
| `/dashboard/subcontractors` | `page.tsx` 82 · `subcontractors-list.tsx` 209 (client) · `subcontractor-detail-sheet.tsx` 346 (client) · `subcontractor-form.tsx` 555 (client) | **Yes** — canonical shape |
| `/dashboard/team` | `page.tsx` 33 · `team-page-client.tsx` 282 (client) | **No** — page fetches *nothing*; it reads only the caller's role and hands it to the client, which fetches from the **browser** (`getTeamMembers`/`getPendingInvitations` against `supabase-browser`). The one route in this set that inverts the pattern. |
| `/dashboard/catalog` | `page.tsx` 53 · `catalog-list.tsx` 206 (client) · `catalog-form.tsx` 314 (client) · `catalog-labels.ts` 32 | **Partly** — server page fetches nothing but the role; `CatalogList` fetches client-side |
| `/dashboard/estimates` | `page.tsx` 61 · `estimates-list.tsx` 195 (client) · `clone-modal.tsx` 174 · `contact-address-picker.tsx` 225 · `inline-edit.tsx` 263 · `send-proposal-modal.tsx` 208 · `labels.ts` 62 | **Partly** — server page gates only; list fetches client-side |
| `/dashboard/estimates/[id]` | `page.tsx` 35 · `estimate-builder.tsx` 652 · `items-tab.tsx` 949 · `details-tab.tsx` 436 · `text-tabs.tsx` 496 · `bidding-tab.tsx` 523 · `contract-section.tsx` 240 · `convert-to-project.tsx` 317 · `signing-activity.tsx` 226 · `catalog-picker.tsx` 151 (all tabs client) | **Partly** — 35-line server gate over a **3 975-line client builder**. Largest client surface in the app. |
| `/dashboard/expenses` | `page.tsx` 115 · `expenses-page-client.tsx` 407 (client) · `bills-tab.tsx` 332 · `review-popup.tsx` 586 · `bill-form.tsx` 192 | **Yes** — heavy server fetch, one client shell |
| `/dashboard/notifications` | `page.tsx` 70 | **No** — renders shared `components/notifications/*` directly. `export const dynamic = 'force-dynamic'` at `:16`. |
| `/dashboard/schedule` | `page.tsx` 44 · `company-calendar.tsx` 26 (client) | **Yes** |
| `/dashboard/field-ops` | `page.tsx` 77 | **No** — server page renders the list inline |
| `/dashboard/timeclock` | `page.tsx` 68 · `timeclock-client.tsx` 758 (client) | **Yes** |
| `/dashboard/billing` | `page.tsx` 142 · `add-ons-section.tsx` 55 · `manage-subscription-button.tsx` 40 (both client) | **Partly** — page renders its own markup; clients are two buttons |
| `/dashboard/settings` | `page.tsx` 209 · `settings-form.tsx` 613 · `contract-settings-form.tsx` 525 · `estimating-settings-form.tsx` 488 · `proposal-settings-form.tsx` 426 · `lien-release-settings-form.tsx` 377 · `time-tracking-settings-form.tsx` 322 · `gl-mapping-settings-form.tsx` 158 (all forms client) | **Yes** — one server page feeding **seven** client forms, 2 909 client lines |

**Nested routes not in the brief** (they exist and will matter to a redesign):
`contacts/{new,trash,[id]}` · `subcontractors/{new,trash,[id]}` · `team/{[id],invite}` ·
`catalog/{new,[id]}` · `estimates/{new,[id]}` · `expenses/{new,trash}` · `field-ops/{safety,[projectId]}` ·
`timeclock/timesheets` (+ `/[sessionId]`) · `billing/{plans,success}` · `settings/tags` ·
`projects/{new,[id]}`. Also `/dashboard/timesheets/page.tsx` is a **redirect stub** to
`/dashboard/timeclock/timesheets`.

### A2 — `/dashboard/projects/[id]/*`

Shared chrome: `layout.tsx` 45 (server) · `project-header.tsx` 198 (client tab strip) ·
`status-control.tsx` 222 (client) · `rate-summary.tsx` 115 (server).

| Sub-route | Files (lines) | Split? |
| --- | --- | --- |
| `[id]` (Overview) | `page.tsx` 664 | **No** — one 664-line server page, no list component |
| `schedule` | `page.tsx` 58 · `schedule-panel.tsx` 687 · `task-form.tsx` 351 | **Yes** |
| `budget` | `page.tsx` **1110** · `rate-section.tsx` 257 (server) · `correct-rates.tsx` 333 · `renegotiate-rate.tsx` 272 · `apply-co-budget-button.tsx` 45 | **No** — the largest single page file in the repo; clients are action buttons only |
| `costs` | `page.tsx` 8 | **n/a — redirect** (see C1) |
| `changes` | `page.tsx` 85 · `changes-panel.tsx` 401 | **Yes** |
| `invoices` | `page.tsx` 322 · `new-invoice-button.tsx` 89 | **No** — page renders the table itself |
| `payments` | `page.tsx` 117 · `payments-view.tsx` 900 · `reminder-settings.tsx` 150 | **Yes** |
| `profitability` | `page.tsx` 333 | **No** |
| `files` | `page.tsx` 82 · `file-row.tsx` 67 · `file-row-actions.tsx` 87 · `ai-tag-editor.tsx` 161 · `favorite-toggle.tsx` 54 | **Partly** — server page renders `<table>`, rows are client |
| `photos` | `page.tsx` 20 | **No — stub.** "Photos — coming soon"; gallery lives under Files |
| `contracts` | `page.tsx` 52 · `contracts-panel.tsx` **1376** | **Yes** — largest client panel |
| `lien-releases` | `page.tsx` 85 · `releases-panel.tsx` 504 | **Yes** |
| `selections` | `page.tsx` 58 · `selections-tab.tsx` 367 (**server**) | **No** — `selections-tab.tsx` has no `'use client'` |
| `punch` | `page.tsx` 55 · `punch-panel.tsx` 505 | **Yes** |
| `deliveries` | `page.tsx` 71 | **No** — renders shared `components/field/deliveries-sections` |
| `contacts` | `page.tsx` 53 · `contacts-panel.tsx` 327 · `portal-panel.tsx` 206 | **Yes** — two client panels |
| `team` | `page.tsx` 42 · `team-panel.tsx` 218 | **Yes** |
| `chat` | `page.tsx` 60 | **No** — renders shared `components/chat/chat-tab` |

Nested under these: `changes/[coId]` · `files/{upload,[fileId],trash}` · `invoices/[invoiceId]` ·
`selections/[selectionId]`.

---

## PART B — what each server page fetches

**Gate legend.** `OAP` = `['owner','admin','project_manager']`, `OA` = `['owner','admin']`,
`OAPF` = `['owner','admin','project_manager','foreman']`.

### B1 — `/dashboard/*`

| Page | Service calls (source file) | Role gates (variable → exact list → what it gates) | Per-row derivation in a loop? |
| --- | --- | --- | --- |
| `page.tsx` (index) | `getDashboardData()` (`services/dashboard.ts`), `getCalendarEvents()` (`services/schedule.ts`), `getMyMember()` (`services/members.ts`) | `canSeeFinancials` = `owner\|admin` → Contract Value + Projected Value KPI cards, and the `$` caption on Awaiting Signature (`:38`, `:72`, `:83`, `:97`)<br>`canCreate` = OAP → "+ New Project" (`:39`)<br>`isCrew` = `crew_member\|subcontractor` → own-only calendar scope (`:40`) | Yes — `kpiCards` array built conditionally (`:53–110`); `getDashboardData` loops COs at `dashboard.ts:107,115,123` |
| `contacts/page.tsx` | `getContacts()` (`services/contacts.ts`) | inline OAP → "+ Add Contact" link (`:53`) and `canEdit` prop (`:73`). Trash link deliberately **ungated** (`:35–37`) | No |
| `subcontractors/page.tsx` | `getSubcontractors()` (`services/subcontractors.ts`) | inline OAP → "+ Add Sub / Vendor" (`:53`) and `canEdit` (`:73`)<br>`canSeeCompliance` = OA → the sheet's link to the profile page (`:78`) | No |
| `team/page.tsx` | **none** — reads `profiles.role` only | `profile.role` passed through as `userRole` (`:30`); the client derives `canManageTeam` = OA (`team-page-client.tsx:32`) → invite button + pending-invitations table | No (client-side) |
| `catalog/page.tsx` | **none** | `canManage` = OAP (`:20`) → "+ Add Item" and the `canManage` prop | No |
| `estimates/page.tsx` | **none** | **redirect** — `!OAP → /dashboard` (`:21–23`), §4.13 | No |
| `estimates/[id]/page.tsx` | **none** | **redirect** — `!OAP → /dashboard` (`:24–26`); role passed to the builder as a narrowed union (`:31`) | No |
| `expenses/page.tsx` | `getExpenses()`, `getExpenseReceipts()` (`services/expenses.ts`), `getBillsAndCommitments()` (`services/payables.ts`), `getProjects()` (`services/projects.ts`), `getMyMember()`, `getCompanyTimeSettings()` (`services/company.ts`) | `SEES_BILLS` = OAPF (`:38`) → `billRows` prop **and** payable rows stripped out of `expenses` (`:67–69`, #136)<br>`isReviewer` = OA (`:39`) → the Review tab's pre-signed receipts | **Yes, N+1** — `pending.map((e) => getExpenseReceipts(e.id))` (`:79`), one query per pending expense |
| `notifications/page.tsx` | `getNotifications(filter)` (`services/notifications.ts`) | **none, deliberately** (`:7–11`) — RLS `notifications_select_own` scopes it | No |
| `schedule/page.tsx` | `getCalendarEvents()`, `getMyMember()` | `isCrew` = `crew_member\|subcontractor` (`:25`) → own-assignments-only scope + subtitle copy | No |
| `field-ops/page.tsx` | `getProjects()`, `getProjectLogSummaries()` (`services/daily-logs.ts`) | **none** (ungated by S86 round-2 decision 6); RLS scopes | Yes — `visible.map()` joins each project to its summary (`:46–47`), but from one pre-fetched Map, no per-row query |
| `timeclock/page.tsx` | `getOpenSession()` (`services/time-tracking.ts`), `getProjects({status:'active'})`, `getMyMember()`, `getCompanyTimeSettings()` | `isSupervisor` = OAPF (`:32`) → the Timesheets tab strip only | No — one extra `tasks` read via `.in(taskIds)` (`:50`) |
| `billing/page.tsx` | `getSubscription()`, `getTrialDaysRemaining()` (`services/billing.ts`), `getAddOns()` (`services/add-ons.ts`) | **redirect** — `role !== 'owner' → /dashboard` (`:24–26`). Owner-only, per the Admin Role Principle | No |
| `settings/page.tsx` | `getCompanySettingsBundle()` (`services/company.ts`), `getTemplates('client_outbound')` (`services/lien-releases.ts`), `getContractTemplates('client_contract'\|'sub_contract')`, `getContractTemplateBoxes()` (`services/contracts.ts`), `getTemplateBoxes()` | **redirect** — `!OA → /dashboard` (`:108–110`) | **Yes, N+1 twice** — `withBoxes()` calls `getContractTemplateBoxes(t.id)` per template (`:71`) and `lienTemplatesWithBoxes` calls `getTemplateBoxes(t.id)` per template (`:162`) |

### B2 — `/dashboard/projects/[id]/*`

| Page | Service calls | Role gates | Per-row derivation? |
| --- | --- | --- | --- |
| `layout.tsx` | `getProject()` | `canManage` = OAP → header action button (`:38`) | No |
| `page.tsx` (Overview) | `getProject()`, `PROJECT_TYPE_LABELS`, `getChangeOrders()` (`services/change-orders.ts`), `getRevisedContract()` (`services/contract-value.ts`), `getPhases()`/`getTasks()`/`rollupPhases()` (`services/tasks.ts`), `getProjectAssignments()`, `projectHasUnsignedContract()` (`services/contracts.ts`) | `canTransition` = OAP (`:90`) → status control<br>`canSeeFinancials` = `owner\|admin` (`:91`) → two KPI cards (`:115`, `:131`), `<RateSummary>` (`:277`), a footer block (`:559`) | **Yes** — `for (const co of allCos.filter(c => c.status === 'sent'))` at `:159`; `rollups.map` `:288`; `openItems.map` `:466` |
| `schedule/page.tsx` | `getTasks()`, `getPhases()`, `getDependencies()`, `getCalendarEvents()`, `getInspections()` (`services/schedule.ts`), `getMembers()`, `getMyMember()` | `isCrew` (`:24`) → own-only **calendar** (task list stays full)<br>`canManage` = OAPF (`:38`) | No |
| `budget/page.tsx` | `getProject()`, `getBudgetRollup()` (`services/budget.ts`), `getProjectIncome()` (`services/project-income.ts`), `getDepositCredits()` (`services/deposit-credit.ts`), `getRevisedContract()` + siblings (`services/contract-value.ts`), `budgetColumnsFor()` (`services/invoices-shared.ts`), `getExpenses()`/`getJobCostRollup()` (`services/expenses.ts`), `getPayablesSummary()` (`services/payables.ts`), `getMembers()` | **redirect** — `!OAPF → /dashboard/projects/[id]` (`:98–99`)<br>`isOwnerAdmin` (`:101`) → `<RateSection>` (`:475`)<br>`seesCommitted` = `OA \|\| project_manager` (`:102`)<br>`columnPlan = budgetColumnsFor(role)` (`:181`) — Owner/Admin 7 cols, PM 5, Foreman 3 | **Yes** — instrument/group/line/income/payable/expense loops at `:420`, `:492`, `:547`, `:587`, `:609`, `:902`, `:913`, `:1002`, `:1024`, `:1051`, `:1084` |
| `costs/page.tsx` | none | none | **redirect only** |
| `changes/page.tsx` | `getChangeOrders()`, `getRevisedContract()`, `getProject()`, `redactCo()` (`lib/co-redaction.ts`) | `canManage` = OAP (`:35`) · `canDelete` = OA (`:36`) · `isFinanceRole` = OA (`:53`)<br>**`canSeeCoMoney(createdBy)` is per-ROW** (`:54–55`) — OA, or PM **and** `created_by === user.id`<br>`signedDelta` OA-only (`:73`); `canSeeSums` OA-only (`:82`) | **Yes, and it is load-bearing** — `changeOrders.map(co => redactCo(co, canSeeCoMoney(co.created_by)))` (`:67`), redaction at the RSC boundary |
| `invoices/page.tsx` | `getRevisedContract()`, `getProject()`, `getInvoices()` + 2 siblings (`services/invoices.ts`) | **redirect** — `!OAP` (`:93–94`)<br>`canSeeContractValue` = `owner\|admin` (`:124`) → the contract-value line (`:204`) | Yes — `flaggedIds` Set (`:106`), `invoices.map` (`:238`); no per-row query |
| `payments/page.tsx` | `getProject()`, `getMyMember()`, `getCompanyTimeSettings()`, `companyToday()`, `getProjectAging()`/`getProjectRetainageHeld()`/`getProjectPayments()`/`getOpenInvoices()`/`getRetainageRelease()`/`getJobPairing()`/`getClientRefunds()` (`services/payments.ts`), `getReminderSettings()` (`services/reminders.ts`) | **redirect** — `!OAP → project` (`:41–43`). Refunds are OA **by RLS**, so a PM simply receives none (`:63–64`) | Yes — `payments.map` + nested `applications.map` (`:81–93`), pure reshaping |
| `profitability/page.tsx` | `getProfitabilityReport()` (`services/profitability.ts`) | **redirect** — `!OA → project` (`:43–44`). Strictest page in the tree | Yes — `categories.map` (`:117`) |
| `files/page.tsx` | `getFiles()` (`services/files.ts`), `getActiveTags()` (`services/tag-options.ts`) | **none** — RLS only | Yes — `files.map` → `<FileRow>` (`:74`) |
| `photos/page.tsx` | none | none | Stub |
| `contracts/page.tsx` | `getClientContracts()`/`getSubcontractorContracts()` (`services/contracts.ts`), `getBillsAndCommitments()`, `getMembers()` | `canManage` = OAP (`:39`); raw `role` also passed to the panel (`:48`) | Yes — one grouping loop over payables (`:34–37`), explicitly avoids N+1 |
| `lien-releases/page.tsx` | `getReleasesForProject()`, `getTemplates()` (`services/lien-releases.ts`) + two direct `invoices` reads | **redirect** — `!OA → project` (`:37–39`). ⚠️ header at `:11–16` states this is **not** the Financial Floor — the reason is that a release waives legal rights | Yes — `.in(invoiceIds)` batch (`:48–53`), no N+1 |
| `selections/page.tsx` | `getProjectSelections()` (`services/selections.ts`) | **none** — every project-visible role, subs included (`:9–16`); money is floored in RLS + never passed | Yes — nested `areas.map`/`selections.map`/`options.map` strips money before the client boundary (`:34–55`) |
| `punch/page.tsx` | `getPunchLists()` (`services/punch.ts`), `getMembers()`, `getProjectAssignments()`, `getFiles()` | **none**; raw `role` passed to the panel (`:52`) | Yes — projections only (`:45`, `:50`, `:51`) |
| `deliveries/page.tsx` | `getProject()`, `getPurchaseOrders()`/`getOrderlessDeliveries()` (`services/deliveries.ts`) | `canCreatePo` = OAP (`:37`) → "+ New PO" only; check-in is ungated | No |
| `contacts/page.tsx` | `getProjectContacts()` (`services/project-contacts.ts`), `getContacts()`, `getPortalAccountsForProject()` (`services/client-portal.ts`) | `canManage` = OAP (`:31`)<br>`canManagePortal` = OA (`:36`) — **deliberately narrower**, mirrors `invitations_insert_owner_admin` | Yes — `allContacts.map` name concat (`:43`) |
| `team/page.tsx` | `getProjectAssignments()`, `getMembers()` | `canManage` = OAP (`:28`) | Yes — projection only |
| `chat/page.tsx` | none (reads `profiles.id`) | **none, and the absence is documented as the decision** (`:18–22`, ND-35/A-C27) | No |

---

## PART C — targeted questions

### C1 — routing: does `/costs` redirect to `/budget`?

**CONFIRMED.** `apps/web/app/dashboard/projects/[id]/costs/page.tsx:7` —
`redirect(\`/dashboard/projects/${params.id}/budget\`)`. The whole file is 8 lines. The
`project-header.tsx` comment is accurate: `project-header.tsx:21–22` — *"S93 (money representation
A-5/§7.2): Budget + Job Cost merged into ONE 'Budget & Cost' tab at the old Budget position; /costs
redirects here."* The tab strip carries `slug: 'budget'` (`project-header.tsx:28`); `costs` is not a
tab, only a surviving URL.

### C2 — Contacts (`14c`)

| Question | Answer |
| --- | --- |
| Project count / jobs list per contact fetched today? | **No — it would be new.** `getContacts()` (`services/contacts.ts:17–46`) is a bare `select('*')` on `contacts`. The list component receives only that array (`contacts-list.tsx:27–30`) and the detail sheet fetches only addresses (`contact-detail-sheet.tsx:8–11`). **Derivable, cheaply:** `projects.contact_id` is `string` (NOT NULL — `database.ts:5602`) plus the `project_contacts` junction (`database.ts:5480`). Both arms are needed — `getPortalAccountsForProject` (`client-portal.ts:296–310`) already walks exactly that pair and says why: *"`is_client_of_project()` honours both."* |
| Client-portal status per contact? | **Available, but not on `contacts` and not fetched on this screen.** The column is **`profiles.client_access_state`** (`database.ts:5194`), joined to the contact by **`profiles.contact_id`** (`database.ts:5196`). Values, from `20261017000000_m9_client_lifecycle.sql:131–136`: `active` · `deactivated` · `signed_documents_only` · `documents_for_signature`. **"Not invited" is a fourth, derived state** — no `profiles` row for that `contact_id`. `invitations.contact_id` (`database.ts:4108`) distinguishes *invited-but-not-accepted* from *never invited*. Reference derivation already written: `getPortalAccountsForProject()` (`client-portal.ts:290–350`) — but it is **project-scoped**, not a company-wide contacts-list read. A contacts-list version would be new. |

### C3 — Subs & Vendors (`14d`)

| Question | Answer |
| --- | --- |
| Insurance expiry stored? | **Yes — and in TWO independent places.** (1) `subcontractors.insurance_expiry` (`database.ts:7693`), a plain date on the sub row. (2) `subcontractor_compliance_documents` with `doc_type = 'coi'` and `expiration_date` (`database.ts:7456–7457`). See the divergence flag below. |
| W-9 on file stored? | **Yes**, as a compliance-document type. `doc_type` CHECK is `['coi','license','w9','other']` — `20260729010000_7c_accounts_payable.sql:383`. **⚠️ Keyed on `member_id`, not `subcontractor_id`** (`database.ts:7462`); the link is `subcontractors.member_id` (`database.ts:7696`), which is nullable — a sub with no member record can hold no compliance documents at all (`subcontractors/[id]/page.tsx:100–108`). Also: `subcontractor_financials.ein` (`database.ts:7631`) exists separately. |
| Open commitments per sub derivable? | **Derivable, and nothing derives it today.** The chain is `expenses.sub_contract_id` → `subcontractor_contracts.member_id` → `subcontractors.member_id`. `subcontractor_contracts.contract_value` (`database.ts:7528`) is the commitment; `getPayablesSummary()` (`payables.ts:101`) computes `committedRemaining` but **per project**, never per sub. **⚠️ Vendors cannot be aggregated the same way:** `purchase_orders.vendor_name` is free text with no FK (`database.ts:6002`), and `expenses.supplier` is likewise free text (`database.ts:3601`). Sub spend is joinable; vendor spend is string-matching. |
| 12-month spend per sub derivable? | **Derivable for subcontractors only**, from `expenses.expense_date` + `expenses.amount` filtered through `sub_contract_id`. No such rollup exists anywhere in `lib/services/`. Same vendor caveat as above. |
| Existing compliance-status derivation? | **It exists — this would NOT be new.** `deriveComplianceStatus(expiration_date, today)` (`services/payables-shared.ts:100`) returns `'current' \| 'expiring_soon' \| 'expired' \| 'no_expiry'` (`:88`). `getComplianceStatus(memberId)` (`payables.ts:209`) is per-sub; **`getExpiringCompliance()` (`payables.ts:238–255`) is already company-wide** and returns only `expiring_soon`/`expired` rows with the member joined — which is exactly *"2 subs have expired insurance"*, minus the count. "Today" is company-timezone (`complianceToday()`, `payables.ts:203`) — a UTC version was a real bug fixed at S140 (`payables.ts:192–202`). **Owner/Admin only by RLS** (`20260921000000_compliance_owner_admin_floor.sql`); the sub profile page skips the read for a PM rather than showing an empty list, and says why (`subcontractors/[id]/page.tsx:50–56`). |

> ⚠️ **FLAG, NOT FIXED — two sources of truth for insurance expiry.** `subcontractors.insurance_expiry`
> is written by the desktop form (`subcontractor-form.tsx:100`) and rendered as an *expired* badge on
> **mobile** (`app/m/subs/page.tsx:87`, `app/m/subs/[subId]/page.tsx:101`). The desktop list and detail
> sheet render it **nowhere**; desktop's sub profile shows the compliance-documents table instead
> (`subcontractors/[id]/page.tsx:97–110`). Two surfaces, two stores, one concept — the shape CLAUDE.md's
> S122 parity rule was written about. Logged only.

### C4 — Team (`14e`)

| Question | Answer |
| --- | --- |
| Burden/hr per member stored? | **Yes, but it is a MULTIPLIER, not a $/hr.** `member_burden_settings.burden_multiplier` `numeric(6,3)`, default `1.0`, `UNIQUE (member_id)` (`20260728010000_7a_expenses_job_cost.sql:313–333`; `database.ts:4919`). It is paired with **`burden_source`** ∈ `['member_multiplier','company_fixed']` (`:326`, `:331–332`). |
| Is there also a company-fixed rate? | **Yes — `companies.fixed_burden_per_hour`** (`database.ts:1193`). The two are alternatives selected by `burden_source`, not layers. The preview in the UI spells the arithmetic out: `pay-rate-section.tsx:104–106` renders `rate × multiplier / hr` **or** `rate + companyFixedBurden / hr`. So "is there also a per-member value?" — yes, and the per-member row also chooses **which** of the two applies to that member. Pay rate itself is effective-dated on `member_pay_rates` (`hourly_rate`, `effective_date` — `database.ts:4980–4981`), current row picked at `pay-rate-section.tsx:76`. |
| Hours this week + overtime per member without a per-row query? | **Yes — one query, already done this way.** `timesheets/page.tsx:70` calls `getSessionsForReview({from, to})` **once** for the whole week, groups by `member_id` in JS (`:81–85`), then calls the pure `weeklyHoursSummary(...)` per member (`:92`). No per-member round trip. (`getWeeklyHours(memberId, …)` at `time-tracking.ts:285` is the per-member variant — do not use it in a list.) |
| Pending invite representable as a row in the team list? | **Not today.** They are two tables and two tables on screen: `getTeamMembers()` reads `profiles` (`services/team.ts:167–169`) and `getPendingInvitations()` reads `invitations` (`:193–195`), rendered as **two separate `<table>`s** — members (`team-page-client.tsx:161–199`) and a `Pending Invitations` block (`:203–280`) that only renders when `canManageTeam && invitations.length > 0` (`:203`). The invite row carries `email`, `role`, `expires_at`, `token` and three actions (Copy link / Resend / Cancel). Merging them into one list is a presentation change with no schema work — `invitations.role` and `invitations.email` are the two columns a merged row needs. |

### C5 — Cost Catalog (`14f`)

| Question | Answer |
| --- | --- |
| Last priced / repricing date stored? | **Yes — `cost_catalog.last_verified_at`** (`database.ts:2036`). It is already editable (`catalog-form.tsx:245–247`) and already rendered in the list (`catalog-list.tsx:161–162`). |
| Usage count derivable, and how expensive? | **Derivable; would be new; moderately expensive.** The FK is `estimate_line_rows.catalog_item_id` → `cost_catalog` (`database.ts:2969–2973`). "Used on N **estimates**" needs `estimate_line_rows → estimate_line_items (line_item_id) → estimates` and a **distinct estimate count** — `estimate_line_rows` has no `estimate_id` of its own (`database.ts:2897–2920`), so it is a two-hop join per item. A second consumer exists: `selection_options.catalog_item_id` (`database.ts:7064–7068`), so "usage" needs a definition before it needs a query. Nothing in `lib/services/cost-catalog-client.ts` computes anything of the sort today. |

### C6 — Expenses

| Question | Answer |
| --- | --- |
| Duplicate detection today? | **None.** No detection code (grep over `apps/web/lib` + `apps/web/app` for "duplicate" returns only de-duplication of *notification recipients*, *export tables* and *offline queue upserts* — nothing about expenses). No DB constraint either: the only UNIQUE in the 7A migration is `expense_allocations_expense_line_key UNIQUE (expense_id, budget_item_id)` (`20260728010000_7a_expenses_job_cost.sql:141`). All four proposed keys exist as columns — `supplier` (`database.ts:3601`), `amount` (`:3569`), `expense_date` (`:3584`), `project_id` (`:3588`) — so it is buildable, but it is entirely new. |
| "Unbilled to client" derivable? | **Yes.** `invoice_cost_claims.expense_allocation_id` (`database.ts:4201`) is the billed marker; an `expense_allocations` row with no claim is unbilled. The DB already enforces the arithmetic — `invoice_cost_claims_within_allocation` prevents over-billing a cost (`invoices-client.ts:481`) — and the *remaining unbilled per allocation* is computed today at `invoice-derivation-server.ts:115` / `:176`. What does **not** exist is a company-wide or per-job "total unbilled" figure on the Expenses screen. |
| "Missing receipts" derivable? | **Yes** — `files.expense_id` (`database.ts:3820`) with `is_deleted = false`; an expense with no such row has no receipt. `getExpenseReceipts(expenseId)` (`expenses.ts:97–109`) does this **one expense at a time**, and the Expenses page calls it in an N+1 loop for pending rows (`expenses/page.tsx:79`). A list-wide flag wants one `.in('expense_id', ids)` read, not that loop. |

### C7 — Schedule

| Question | Answer |
| --- | --- |
| Does `public.phases` exist, and its columns? | **Yes.** `database.ts:5110–5123`. Columns: `id`, `company_id`, `project_id`, `name`, `sort_order`, `created_at`, `created_by`, `updated_at`, `updated_by`, `is_deleted`, `deleted_at`. That is the whole table — **no dates, no status, no percent-complete.** A phase's dates can only be a rollup of its tasks (`rollupPhases()`, `services/tasks.ts`, used at `projects/[id]/page.tsx:7`). |
| Crew assignment per task — could a double-booking be detected? | **Yes, for a single assignee.** `tasks.assignee_id` → `company_members.id` (`database.ts:8129–8133`), with `start_date` and `due_date` on the same row (`:8067`, `:8075`). Two tasks sharing an `assignee_id` with overlapping date ranges is a pure query. **⚠️ It is ONE assignee per task** — there is no task↔member junction table; `project_assignments` is project-level, and `daily_log_crew` is retrospective. So a task with a two-person crew is not representable, and any double-booking check inherits that limit. Separately, `time_segments.project_id` (`database.ts:8332`) records where a person **actually** was, which is a different question from where they were scheduled. |
| Is "on hold, resumes when permit clears" representable? | **Half of it.** The *state* is: `projects.status` CHECK includes `'on_hold'` (`20260704211000_module5_5a_projects.sql:120`), and the transition map allows `active ↔ on_hold` reversibly (`projects-client.ts:14–15`). The *reason* is **not stored** — there is no `hold_reason` column anywhere (grep across `apps/web`, `packages`, `supabase` returns zero hits), and `projects` has no field for it beyond free-text `internal_notes` (`database.ts:5608`), which is not hold-scoped and is not cleared on resume. A structured hold reason would be a new column. |

### C8 — Timeclock

| Question | Answer |
| --- | --- |
| Is overtime derived, not entered? | **CONFIRMED — derived, never stored.** `packages/shared/utils/time-tracking.ts:317` `overtimeHours(paid, settings)`; the file header states it outright at `:6` — *"paid / regular / overtime are DERIVED at read time (never stored on a row — §9)"*. Threshold is `companies.ot_threshold_hours` (`database.ts:1207`), read via `getCompanyTimeSettings()`. `weeklyHoursSummary` (`:548`) returns `{paidHours, regularHours, overtimeHours}` with `regular = paid − ot` (`:558–559`). There is no `overtime` column on any table. (Unrelated: `notify/crons/still-clocked-in.ts:47` has an `OVERTIME_HOUR = 17` constant — that is a **notification trigger hour**, not the pay rule.) |
| Hours-by-job for a week in one query? | **Yes.** `time_segments` carries `project_id`, `segment_start`, `segment_end`, `segment_type` (`database.ts:8322–8339`), and `workedHoursByProject(segments)` (`shared/utils/time-tracking.ts:279`) rolls an arbitrary segment array up **by project**. One range-filtered read of `time_segments` feeds it. ⚠️ Do **not** reach for `getProjectWorkedHours()` (`time-tracking.ts:257`) — it filters `.eq('project_id', …)` and then discards all but that project, so a per-job breakdown through it is N queries. |
| On-site / off-site GPS state stored per clock event? | **No — coordinates are stored; on-site is never computed.** `time_clock_sessions.gps_in` / `gps_out` are `jsonb` (`database.ts:8175–8176`), holding either a fix or a *failure reason* — the column is documented as three-state at `lib/gps.ts:17–25`: coordinates / `{reason, error_code}` / NULL = never attempted. `GpsRecord` is `GpsFix \| GpsFailure` (`time-tracking-client.ts:56`). **There is no geofence, radius, or distance calculation anywhere** (grep for `geofence`/`on_site`/`withinRadius`/`distance` over `lib/services` returns nothing), and no jobsite coordinates to compare against. Also note the granularity: GPS is **per session (clock in/out)**, not per `time_segments` row — a member who switches jobs mid-shift has one fix for the whole shift. `companies.gps_clock_mode` ∈ `off\|capture\|enforce` (`shared/utils/time-tracking.ts:117`) governs capture, not evaluation. |

### C9 — Field Ops: "2 of 4 jobs logged yesterday"

**Half-derivable today, and the existing derivation asks a different question.**

- What the Field Ops page has: `getProjectLogSummaries()` (`daily-logs.ts:152–177`) returns one Map of
  `{latest_log_date, log_count, hazard_flagged}` per project from **one** query — but only the
  *latest* date, so it cannot answer "was there a log on 2026-08-26".
- What already answers a date-specific version: **`runDailyLogMissing()`**
  (`lib/notify/crons/daily-log-missing.ts:59–150`). It reads `time_segments` for the company-local
  day (`:85–99`), builds the set of projects that had crew on them, then reads
  `daily_logs .in(project_id) .eq('log_date', logDate)` (`:126–131`) and treats the difference as
  missing (`:141`). Two queries, no N+1.

**Two caveats that change the wording of the KPI.** (1) That cron counts projects **with clocked
time that day**, not **active projects** — a job nobody clocked into is not "missing a log" by its
definition. (2) It runs on the service-role admin client inside a cron route, not through any
service a page can call. So the *shape* exists and is proven; a screen figure phrased as "N of M
active jobs" is a new derivation reusing it.

### C10 — Estimate detail

| Question | Answer |
| --- | --- |
| Does a scope-of-work section carry included/excluded state? | **No — Excluded would be new.** The stored shape is `estimates.scope_sections` `Json` (`database.ts:3195`), validated as `{ title: string, bullets: string[] }` — `packages/shared/validation/estimate.ts:35–38`, and the renderer's type agrees exactly (`ProposalScopeSection`, `lib/proposal/proposal-data.ts:41–44`). One level of nesting, no per-section or per-bullet flag. Adding Excluded means changing `scopeSectionSchema` and every reader of the JSON. |
| **Are payment terms structured fields or prose?** (the important one) | **PROSE, with four unrelated numbers stored separately.** `estimates.terms_sections` is `Json` (`database.ts:3209`) validated as **`{ name: string, content: string }`** — `packages/shared/validation/estimate.ts:52–55`. `content` is a free-text blob; nothing parses it. The structured numbers that *do* exist on `estimates` are: **`retainage_percent`** (`:3192`), `expiration_days` (`:3173`), `substantial_completion_days` (`:3203`), `tax_rate` (`:3207`), `discount_amount`/`discount_type`/`discount_total` (`:3169–3171`). **A deposit % is NOT stored anywhere on an estimate** — grep for `deposit` across `database.ts` returns only `invoice_lines.source_deposit_invoice_id` (`:4354`), i.e. a deposit is an *invoice* that later credits, not a term on the estimate. **Invoice due date is likewise not on the estimate** — `invoices.due_date` (`:4481`) is set per invoice. So: deposit % and invoice-due terms are **prose only today**; retainage % is the one payment term that is already a real column. |
| Saved scope library at company level? | **No.** `companies.default_terms_sections` `Json` (`database.ts:1189`) exists and is read into every new estimate (`estimates-client.ts:328`) — that is a **terms** library. There is **no `default_scope_sections`** and no scope library (grep for `default_scope`/`scope_library` across `apps/web`, `packages`, `supabase` returns zero hits). The nearest existing reuse path is cloning a whole estimate (`clone_estimate` RPC, `database.ts:8707`; `cloneEstimateSchema`, `validation/estimate.ts:103`). |
| Sub bids per line, with a winner? | **Yes — `estimate_sub_bids`** (`database.ts:2998–3015`). Per-line via `line_item_id`, per-sub via `subcontractor_id`, with `bid_amount`, `received_at`, `notes`, `bid_document_file_id`, and **`is_winner: boolean`** (`:3009`). There is a dedicated RPC `set_winning_bid` (`database.ts:8941`) and a whole UI tab (`estimates/[id]/bidding-tab.tsx`, 523 lines). |

### C11 — Dashboard: what is already computed vs. new

Everything the index page renders comes from **`getDashboardData()`** (`lib/services/dashboard.ts:42–133`),
which is reusable as-is (session client, so RLS scopes per role).

| Figure | Where computed | Reusable? |
| --- | --- | --- |
| Active project count | `dashboard.ts:91` from one `projects` read (`:49–53`) | ✅ existing |
| Past-target count | `dashboard.ts:92`, same fetch | ✅ existing |
| Contract value — **fixed** and **projected**, kept apart | `getPortfolioRevisedContract()` (`services/contract-value.ts`), consumed at `dashboard.ts:88, 94–97` | ✅ existing. ⚠️ `contractValue` (`:93`, the *sum* of the two) exists on the interface but is documented at `:17–20` as a figure **no surface should show** — P11 forbids mixing binding and non-binding |
| Awaiting-signature count + `$` sum | `dashboard.ts:98–99` from one `change_orders` read (`:71–75`) | ✅ existing; the sum is Owner/Admin display-only (`:26`) |
| Open punch count | `dashboard.ts:78–85`, a `head: true` exact count | ✅ existing |
| Needs-Attention feed (3 severities, capped at 6) | `dashboard.ts:105–132` | ✅ existing |
| Schedule card | `getCalendarEvents({ownMemberId})` (`services/schedule.ts`) — tasks + entries + inspections + compliance expiries | ✅ existing |
| **Anything money-side beyond contract value** — AR aging, cash position, unbilled, margin | Per-project only: `getProjectAging()` (`services/payments.ts`), `getProfitabilityReport()` (`services/profitability.ts`), `getPayablesSummary()` (`services/payables.ts`) | ❌ **new** — no portfolio-level rollup exists for any of these |
| **Compliance count** ("2 subs expired") | `getExpiringCompliance()` (`payables.ts:238`) returns the rows company-wide | ⚠️ **near-existing** — the rows exist, the count/tile does not; Owner/Admin only |
| **Missing-daily-log count** | `runDailyLogMissing()` (cron, admin client) | ❌ **new** as a page figure — see C9 |
| **Timeclock: who is on the clock now** | `time-tracking-client.ts:533` (the live board's read) | ⚠️ exists as a client read on `/dashboard/timeclock/timesheets`, not as a dashboard service |

⚠️ One correctness note for whoever respecs this: `getDashboardData()` computes `today` and
`sevenDaysAgo` from **UTC** (`dashboard.ts:44–45`), not the company timezone — the same class of
defect S140 fixed in `complianceToday()` (`payables.ts:192–202`) and S97 ruled on for 7D/7E.
Logged, not fixed.

### C12 — the dialog sweep (S175 item 9)

Counted over `apps/web/{app,components,lib}` (`--include=*.ts,*.tsx`). Every hit is a **bare global
or `window.`-prefixed** call — a check for any other receiver (`something.confirm(`) returns zero, so
these are all real browser dialogs.

| Dialog | Occurrences | of which `window.`-prefixed | Distinct files |
| --- | --- | --- | --- |
| `confirm(` | **58** | 30 | 38 |
| `alert(` | **20** | 8 | 16 |
| `prompt(` | **5** | 2 | 5 |
| **Total** | **83** | 40 | — |

Including `test/` and `e2e/` the `confirm` count is 59 (one extra in `test/s158-ui-fixes.test.tsx`);
`alert` and `prompt` are unchanged.

**Does a `useConfirm()` hook exist yet? — No.** Zero hits for `useConfirm`, `ConfirmDialog` or
`confirm-dialog` anywhere under `apps/web`.

Heaviest `confirm(` files: `changes/[coId]/co-builder.tsx` (5) · `estimates/[id]/estimate-builder.tsx` (5) ·
`projects/[id]/status-control.tsx` (4) · `estimates/[id]/items-tab.tsx` (4) ·
`projects/[id]/contracts/contracts-panel.tsx` (3).

All five `prompt(` sites, since each is a distinct UX decision:

| File:line | What it asks for |
| --- | --- |
| `app/dashboard/settings/contract-settings-form.tsx:307` | name a contract form |
| `app/dashboard/settings/lien-release-settings-form.tsx:104` | name a release form |
| `app/dashboard/estimates/[id]/items-tab.tsx:201` | (numeric entry — `window.prompt`) |
| `app/dashboard/projects/[id]/lien-releases/releases-panel.tsx:85` | a **void reason** |
| `app/dashboard/projects/[id]/files/[fileId]/markup/markup-editor.tsx:92` | markup text |

---

## PART D — flagged, not fixed

### D1 — `desktop-ffnav.spec.ts` testids

**The premise is wrong: they ARE rendered.** `app/dashboard/dashboard-shell.tsx:362` emits
``data-testid={`nav-section-${key}`}``, where `key` comes from `NAV_SECTIONS`
(`dashboard-shell.tsx:163–166`):

```ts
const NAV_SECTIONS: { key: Exclude<NavSection, null>; label: string }[] = [
  { key: 'reference', label: 'Reference' },
  { key: 'admin', label: 'Admin' },
];
```

So `nav-section-reference` and `nav-section-admin` are the only two testids that element can produce.
The header is inside `{ items.length === 0 ? null : … }` (`:356–357`), which is exactly what the
spec's A-N2 tests assert (`e2e/desktop-ffnav.spec.ts:138–139`: Admin `toHaveCount(0)`, Reference
`toHaveCount(1)` for crew/foreman/PM).

**Static check of the spec's expectations against the shipped nav — all consistent:**

| Spec claim | `NAV_ITEMS` (`dashboard-shell.tsx:80–161`) |
| --- | --- |
| Owner sees 14 items across 3 sections | 8 ungated top + 4 Reference + 2 Admin = **14** ✓ |
| Admin loses Billing only | Billing is `roles: ['owner']` (`:157`) ✓ |
| PM keeps Estimates + Cost Catalog, loses all of Admin | Estimates and Catalog are OAP (`:104`, `:145`); Settings is OA (`:151`), Billing owner ✓ |
| Foreman list === crew list | Neither role appears in any `roles` array, so both lose the same four items ✓ |
| Crew Reference is Contacts, Subs & Vendors, Team | Those three are ungated `section:'reference'` (`:123`, `:126`, `:138`); Catalog is gated ✓ |
| Role filtering never re-orders | `visible = NAV_ITEMS.filter(...)` (`:208`) — filter preserves order ✓ |

**Does the spec currently pass? — UNKNOWN.** It is a Playwright browser test requiring a dev server
on `http://localhost:3000` (`playwright.config.ts:57`) and sign-in as five seeded identities
(`desktop-ffnav.spec.ts:12–18`). Chromium binaries are present (`~/.cache/ms-playwright/chromium-1234`)
and `.env.local` exists, but **nothing is listening on :3000**. Running it would mean starting a
server and authenticating five real accounts against the shared rebuild-test database — outside a
read-only inventory. The static analysis above found no contradiction between spec and code.

### D2 — `lib/crew-manifest.ts` literal `description`

**CONFIRMED.** `apps/web/lib/crew-manifest.ts:66`:

```ts
description: 'The all-in-one platform for residential and commercial contractors.',
```

Every other brand-bearing field on the same object imports from `lib/brand.ts` — `name: brand.name`
(`:64`), `short_name: brand.shortName` (`:65`), `theme_color: brand.themeColor` (`:77`),
`background_color: brand.backgroundColor` (`:78`). The file's own banner at `:34` reads
**"EVERY BRAND VALUE IS IMPORTED. NONE IS A LITERAL. (§7.1)"**, and quotes the spec at `:38–39`:
*"a build that fills them from this spec has filled them wrong."*

`lib/brand.ts` has **no `description` field** (`brand.ts:49–` carries `name`, `shortName`,
`themeColor`, `backgroundColor` and their rationale) — so this is not a missed import but a value
with nowhere to import it from. Note the string still says *"platform"* while `brand.name` is
`'EZ Contractor Binder'` (`brand.ts:51`), i.e. the literal predates the rebrand. Logged only.

---

## UNKNOWNS

| # | Question | What was tried |
| --- | --- | --- |
| 1 | **Does `desktop-ffnav.spec.ts` currently pass?** (D1) | Read the spec and `dashboard-shell.tsx` and verified every assertion against `NAV_ITEMS`/`NAV_SECTIONS` statically — all consistent. Checked runtime preconditions: `.env.local` present ✓, `~/.cache/ms-playwright/chromium-1234` present ✓, `curl --max-time 3 http://localhost:3000/` → **no response**. Did not start a dev server or sign in as the five seeded identities — that is outside a read-only pass and touches the shared rebuild-test database. |

**Two near-misses worth recording as *not* unknown**, because a later reader might assume they were:

- **C7 hold reason** — reported as *not stored* rather than UNKNOWN. Grounds: `grep -rn "hold_reason\|holdReason"` over `apps/web`, `packages` and `supabase` returns **zero** hits, and the full `projects` Row in the generated types (`database.ts:5595–5627`) has no candidate column. Per CLAUDE.md's rule, this was checked against the generated types rather than inferred from a `CREATE TABLE`.
- **C6 duplicate detection** — reported as *absent* rather than UNKNOWN. Grounds: no detection code (grep for "duplicate" across `apps/web/lib` and `apps/web/app` returns only unrelated de-duplication), and the 7A migration's only UNIQUE constraints are `expense_allocations_expense_line_key` and `member_burden_settings_member_key` (`20260728010000_7a_expenses_job_cost.sql:141`, `:329`).
