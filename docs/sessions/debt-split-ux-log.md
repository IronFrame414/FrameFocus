# debt-split-and-ux — work log

> ⚠️ **TEMPORARY.** This log is Josh's review artifact for the `fix/debt-split-and-ux` branch and is
> **DELETED after he reads it.** Do NOT treat it as a permanent record. Anything that must outlive
> this run belongs in the TECH_DEBT files or a spec — never here.

Branch cut from `main` @ `b10f67d` (production push complete; origin/main no longer 38b9c5a).

Phases: (1) READ-ONLY analysis of ALL SIX items, change nothing. (2) questions all at once, answer
each with the reversible default. (3) build. Item 1 (TECH_DEBT split) is done FIRST.

Stops: production (never), a decision not in this prompt, altering/destroying existing rows.
Migrations: rebuild-test only; check it's idle first; MCP apply_migration writes no ledger row — repair.

---

## §0 — status: Phase 1 (read-only analysis) starting

## Phase 1 findings (read-only) — batch A (3 of 5 investigations done)

### 2.1 — #89 vendors mislabelled "(Sub)" — CONFIRMED, fix known
- Root cause: `apps/web/app/dashboard/projects/[id]/schedule/task-form.tsx:184-186` hardcodes
  `' (Sub)'` whenever `member_type === 'subcontractor'`. `member_type` is 2-value (`crew|subcontractor`);
  vendors have no distinct value, so every non-crew member reads as "(Sub)".
- Real distinguisher: `subcontractors.sub_type` (`subcontractor|vendor`), NOT carried by `getMembers()`
  (`members.ts:14-32` reads `company_members`, which has no sub_type). Link is `subcontractors.member_id
  → company_members.id`.
- Desktop-ONLY: mobile schedule is read-only (`m/p/[projectId]/schedule/page.tsx:21`). No `/m` twin.
- Fix: widen `getMembers()` to embed `subcontractors!subcontractors_member_id_fkey(sub_type)`, label by
  resolved sub_type, NULL→fallback "(Sub)". Same latent mislabel exists at `team-panel.tsx:112,189`
  (out of #89 scope; fixable in same pass if we widen the type).

### 2.2 — #13 read-only detail view — ⚠️ ALREADY DONE. STALE ENTRY. (job shrinks)
- Read-only row-click profile shipped: subs S140, contacts S158, unified S159. Both list files carry
  "THE ROW IS THE WAY IN" headers naming #13/#108(c) fixed.
- Contacts: `contacts-list.tsx:186` row onClick → `ContactDetailSheet` (read-only sheet, no route).
- Subs: `subcontractors-list.tsx:232` row onClick → `SubcontractorDetailSheet`; plus existing
  `subcontractors/[id]/page.tsx` read-only page hosting Owner/Admin ComplianceSection.
- Mobile parity already present: `m/contacts/[contactId]/page.tsx` (M-36), `m/subs/[subId]/page.tsx` (M-27).
- Financial Floor SAFE BY SCHEMA: sub money moved to `subcontractor_financials` (Owner/Admin RLS, S122
  migration 20260903000000); `getSubcontractor()` select('*') no longer carries rates/EIN. Not render-hidden.
- #108(c) done; #108(a)/(b) (did_not_finish read, closeout reason, rating history) remain open, natural
  home = sub profile.
- **ACTION: bookkeeping only — mark #13 CLOSED (→ CLOSED file) with S140/S158/S159 refs. No build.**

### 2.3 — #100 photo markup display — ⚠️ PARTLY STALE. Scope shrinks to 3 surface-groups.
- FIXED (entry's blanket "invisible everywhere but editor" is now FALSE): mobile photo gallery (M-8),
  mobile viewer (M-9), the editor save, and the client portal all show the flattened derivative.
  Shared `saveMarkup()` (`photos-client.ts:80-143`) writes BOTH `markup_data` AND a `.markup.jpg`
  derivative (`derivativePathFor()`, `packages/shared/utils/markup.ts:64-68`); desktop + mobile call
  the SAME fn + SAME `drawShapes()` (`lib/markup/flatten-shapes.ts:38`). #129 & #139 genuinely CLOSED —
  desktop/mobile cannot silently diverge (identical derivative path).
- GENUINELY STILL RAW ORIGINAL (the real remaining gap):
  (a) desktop file grid — `file-row.tsx:30` opens `file.file_path`, no derivative check.
  (b) all 3 photo PDF services — delivery-pdf-service.ts:86,108; daily-log-pdf-service.ts:74;
      incident-pdf-service.ts:51 — each embeds `photo.file_path`.
  (c) general file download — `files-client.ts:311` signs `file_path`; `file-row-actions.tsx:44` ?download.
- There is NO derivative DB column; "has markup" = non-empty `markup_data` (`hasMarkup()`), derivative is
  the storage object `{path}.markup.jpg`. Any fix reuses `derivativePathFor()`/`hasMarkup()` — no schema.
- **ACTION: rewrite #100 to the 3 surfaces above; build the derivative swap on each (shared helper).**

## Phase 1 findings — batch B (last 2 investigations)

### 2.4 — #101 /m expansion + desktop toggle — premise CONFIRMED moved; specifics established
- Device decision is USER-AGENT ONLY (`lib/device.ts:59-70`), consulted at ONE place —
  `middleware.ts:92-95` as the sign-in *landing default*. Routing is NOT device-gated: every route is
  reachable by URL on any device; a desktop opening `/m` gets the mobile shell by design. So the 79px
  desktop-shell problem is indeed moot (phones already land on /m).
- (b) DESKTOP TOGGLE: nothing exists today. A persistent "view desktop" needs a NET-NEW cookie the
  middleware reads at `:92-95` (e.g. `ff_surface=desktop`); middleware already has `cookies.getAll()`
  (`:24-25`) and already fetches `role` (`:176-180`). Owner/Admin/PM = `MONEY_ROLES`. A client-only
  toggle would NOT survive nav — must be a cookie. → this is the reversible mechanism to build.
- (a) /m GAP (field-relevant, no /m equiv): **timesheet approval**, **costs (actual — visible to all
  roles)**, read-access to **contracts/schedule detail**. Office/money screens (estimating, billing,
  invoices, payments, profitability) are correctly desktop-only & Floor-gated.
- Floor: `budgetColumnsFor()` NOT imported anywhere under /m — any money screen ported must ADOPT it
  (share mechanism, per PARITY), not re-derive. A-5: `/m` uses `min-h-[44px]` inline, no auto-enforce.

### 2.5 — Burst capture — constraint located; TWO assumptions corrected
- Constraint is NOT the input nor the service — it's the SINGLE-SLOT store + confirm-and-return nav.
  `capture-store.tsx:57-59` holds ONE `PendingShot` (each `hold()` overwrites); `onShot`
  (`mobile-shell.tsx:328`) navigates to `/m/capture`; `capture-screen.tsx:135-176` is a terminal
  "saved / take another" card. Burst = replace the single slot with a LIST, accumulate without
  navigating. `uploadFile()` (`files-client.ts:69`) is single-file, no loop — caller loops N times;
  its `id?` option gives idempotent UPSERT replay (per-photo retry).
- ⚠️ CORRECTION to the prompt's premise: the clock→job routing DOES NOT feed capture today.
  `projectInContext` (`capture-store.tsx:73-86`) reads ONLY the URL path `/m/p/{id}` or `?project=`.
  The clocked-in project IS knowable — `getOpenSession()` (`time-tracking.ts:53`) →
  `openSegment.project_id` (`timeclock-screen.tsx:423-426`) — but capture never reads it. "Auto-save to
  the job I'm clocked into" only happens incidentally (if standing on that project's screen).
  → Wiring the open segment's project_id as a fallback is the missing (additive, reversible) work.
- ⚠️ CORRECTION: `capture="environment"` is ALREADY SET (`mobile-shell.tsx:546`, log-form.tsx:359,
  incident-form.tsx:328, check-in-form.tsx:336, punch-actions.tsx:170; e2e asserts it). #101's "no
  input sets capture" is STALE. No one-line fix needed.
- #118 batch failure: online path has NO retry queue; offline branch uses `offline-sync.tsx` (idempotent
  auto-retry). For a batch, photo 4/7 failing must be handled EXPLICITLY: per-photo status, keep failed
  shots held, offer retry — route burst shots through the existing `offline-sync` queue (idempotent via
  `uploadFile` `id`), NOT bare `uploadFile`. Do NOT silently drop, do NOT abort the rest.
- Parity: capture is mobile-only presentation over shared `uploadFile` — keep batch/retry logic in
  `lib/`, not owned by `app/m/`.

## TECH_DEBT.md structure (for Item 1 split)
2915 lines. `## Open Tech Debt` (L56) → `### Ruled genuine debt — the only two [S179]` = #155,#156
(L58-124, the IDEAS), then many `### Branch-scoped, awaiting real numbers` pointer sections
(L125-1945, superseded-in-place per S179), then `### Pre-Beta`(1946) `### Code Quality`(2138)
`### UX Polish`(2209) `### Track for Module 4`(2249) `### Track for Module 5/6`(2434) `### Module 3
Follow-Ups`(2463) `### Lower Priority / Existing`(2470) `#### #81`(2557). `## Closed Tech Debt`(L2836).
`## Process notes`(L2903). ~70 files cite the literal path `TECH_DEBT.md` (mostly historical).
