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

## Phase 2 — decisions, each answered with the reversible default (no stops)

**No hard stop needed.** Every decision below has a reversible/additive default that fulfils the
prompt's clear intent; I took it and proceed. One premise-correction flagged (burst clock-routing).

**Item 1 — split:**
- D1 (naming): OPEN keeps the name **`TECH_DEBT.md`** (so all ~70 path refs resolve unbroken) + new
  **`TECH_DEBT_CLOSED.md`** + **`TECH_DEBT_IDEAS.md`**. Exactly three files. Reversible.
- D2 (what→IDEAS): ONLY #155, #156 (deferred *decisions*), per the prompt. Everything else open → OPEN
  (incl. the branch-scoped pointer sections, which are already register-pointers). Reversible.
- D3 (authority): stated at top of OPEN — TECH_DEBT.md (=OPEN) is the assignment authority; next-free =
  max number across all THREE files + 1 (currently #156 → **#157 next**); branch provisional ids convert
  here at merge. Matches CLAUDE.md's "main's file is the authority".
- D4 (refs): nothing breaks (TECH_DEBT.md still resolves). Update CLAUDE.md's active pointer prose to
  name the three files; leave historical context/spec files unrewritten (rewriting history is wrong).

**Item 2.1 (#89):** widen `getMembers()` to embed `subcontractors(sub_type)` via the member_id FK;
label by resolved sub_type (vendor→"(Vendor)", sub→"(Sub)", crew→none, NULL→"(Sub)" fallback = today's
behaviour). Also correct the same shared mislabel at `team-panel.tsx:112,189` in the same pass (the
type-widening makes it free). Desktop-only; no /m twin. Reversible.

**Item 2.2 (#13):** no build — mark CLOSED with S140/S158/S159 refs; note #108(a)(b) stay open.

**Item 2.3 (#100):** build the derivative swap on the 3 genuinely-broken surfaces via a shared resolver
(`hasMarkup(markup_data) ? derivativePathFor(path) : path`): desktop file grid, 3 photo PDF services,
general download. DEFAULT for downloads: serve the marked-up derivative when the photo is annotated
(matches the entry's intent that markup is visible "everywhere", and the portal/gallery precedent);
flagged as a minor UX call. No schema.

**Item 2.4 (#101):** (b) BUILD the desktop-mode toggle — a `ff_surface` cookie the middleware reads at
`:92-95`, Owner/Admin/PM only, a "Desktop site" button on /m and a "Mobile site" button on desktop,
persisted across sessions. This is the high-leverage piece: it gives power roles access to EVERY
desktop screen from a phone, largely subsuming (a). (a) /m screen ports: REPORT the gap (timesheet
approval, costs, contracts/schedule read) with reasons; DO NOT port individual screens this pass —
each needs its own Floor review and the toggle already unblocks power roles. Judgment within the
prompt's "do not port everything" latitude.

**Item 2.5 (burst):** (1) ⚠️ PREMISE CORRECTION — the clock→job routing does NOT feed capture today;
I WIRE the open-segment `project_id` as an additive fallback in the capture project resolution
(fulfils Josh's "save to the job I'm clocked into"). (2) burst = accumulate shots in a list (no
save-and-return between), one job-picker ONCE at batch end if not clocked in. (3) batch failure:
per-photo status, keep failed shots, offer retry via the existing `offline-sync` idempotent queue —
never silently drop, never abort the rest. Logic in `lib/`, mobile-only presentation (parity).

**Migrations:** NONE of the five fixes needs a schema change (FK for #89 exists; #100 derivative is a
storage object; toggle is a cookie; burst is client). So the rebuild-test migration path is not
exercised this run — confirmed during build.

## Phase 3 — build. Order: Item 1 split → #13 close → #89 → #100 → #101 toggle → burst.

## Phase 3 — Item 1 DONE (commit: split)
- 3 files: `TECH_DEBT.md` (OPEN, 2800 ln, authority), `TECH_DEBT_CLOSED.md` (89 ln), `TECH_DEBT_IDEAS.md` (85 ln).
- Content conserved: 2800+85+89=2974 = original 2915 + ~59 ln new cross-link/authority headers. No entry lost.
- #155/#156 → IDEAS only (verified grep). #13 → CLOSED with S140/S158/S159 refs. #81 stays OPEN. #136 in CLOSED.
- NO number renumbered (a move). Authority stated at top of OPEN: next free = max across all 3 + 1 = #157.
- Every file points at the other two. `TECH_DEBT.md` path still resolves (=OPEN) → no broken refs.
- Active pointers updated: CLAUDE.md Reference Documents, STATE.md Open-Tech-Debt note. Historical
  context/spec refs left unrewritten (resolve via OPEN + cross-links; rewriting history is wrong).
- NOTE: did NOT hunt for additional IDEAS candidates beyond the two named — reclassifying other open
  items would be a deferred-decision judgment not in the prompt (a stop). Only #155/#156 moved.

## Phase 3 — Item 2.1 (#89) DONE (commit: Schedule label)
- `members.ts`: CompanyMember gains optional `sub_type`; getMembers() embeds
  `subcontractors!subcontractors_member_id_fkey(sub_type)`, flattens reverse-embed array → sub_type.
- `schedule/page.tsx`: threads sub_type into the TaskForm members prop.
- `task-form.tsx`: label by resolved sub_type (vendor→"(Vendor)", sub→"(Sub)", crew/null→fallback).
- type-check PASS. Runtime VERIFIED on rebuild-test: FK `subcontractors_member_id_fkey` exists; join
  returns sub_type; 1 vendor (member-linked) → now "(Vendor)"; 3 subs → "(Sub)"; crew → none.
- Guarded the silent-empty risk (getMembers `if(error) return []`): embed confirmed non-erroring.
- Desktop-only (no /m twin). Shared getMembers change is additive (optional field) — other callers unaffected.

## Phase 3 — Item 2.3 (#100) photo markup display — IN PROGRESS

> ⚠️ **This whole section was reconstructed after a restart lost the session mid-#100.** The (a)+(c)
> code below was found UNCOMMITTED at tip `fc1f9bb`, audited read-only, judged a complete unit by
> Josh, and only then committed. The log had been silent on all of #100.

### Phase 1 supersession finding (was lost from the log; restated here)
The #100 TECH_DEBT entry ("markup invisible everywhere but the editor") is **STALE**. Established in
Phase 1: mobile gallery (M-8), mobile viewer (M-9), the editor save, and the client portal ALREADY
render the flattened `.markup.jpg` derivative via the shared `saveMarkup()`/`drawShapes()` path.
**#129 and #139 are genuinely closed** — desktop and mobile share one derivative path and cannot
silently diverge. Only THREE surface-groups were still serving the raw original:
- (a) desktop file grid — `file-row.tsx`
- (b) the 3 photo PDF services — `delivery-pdf-service.ts:86,108`, `daily-log-pdf-service.ts:74`, `incident-pdf-service.ts:51`
- (c) general file download — `file-row-actions.tsx`

### (a)+(c) DONE (commit: `[Files] #100: desktop files page shows photo markup`)
- `route.ts`: on `markup=1`, sign the `.markup.jpg` derivative; **degrade to the original** if absent
  (save's derivative step can fail independently of `markup_data` — A-23t).
- `file-row.tsx` (a): `annotated = hasMarkup(file.markup_data)`; append `&markup=1` on row-click open; pass `annotated` down.
- `file-row-actions.tsx` (c): append `&markup=1` on download.
- Reuses shared `hasMarkup`/`derivativePathFor` (no re-implemented format, per PARITY).
- **#142 error contract PRESERVED**: `markup=1` returns only on success; any failure falls through to
  the original-path fetch, which still runs the full 403/500 + real-cause-log logic. Access decision
  is always made on the ORIGINAL path.
- VERIFIED: type-check PASS (exit 0); `next build` PASS (exit 0, 121/121 pages, both `/…/files` and
  `/api/files/signed-url` routes compiled). The client-imports-server build defect did NOT ship —
  `@framefocus/shared/utils/markup` is a pure util (type-only import), already used by client components.

### (b) the 3 PDF services DONE (commit: `[PDF] #100: photo PDFs embed the flattened markup derivative`)
⚠️ Different mechanism from (a)/(c), as predicted — the `markup=1` protocol did NOT transfer. These
download BYTES server-side, not sign a URL.
- New shared helper `downloadPhotoBase64(rls, bucket, photo)` in `co-data.ts` (next to
  `downloadImageBase64`, which all 3 services already import): `hasMarkup(markup_data)` → download
  `derivativePathFor(path)` and declare `image/jpeg` (the flatten is always JPEG); **degrade to the
  original bytes** if the derivative download returns null. ONE helper — no re-implementation across
  the 3 services (PARITY).
- Widened `DeliveryPhoto` (interface) / `LogPhoto` / `IncidentPhoto` (Pick) + their queries to carry
  `markup_data`. Additive — `markup_data` is a real column in database.ts (no regen needed).
- 4 embed call sites swapped: delivery ×2 (line + general), daily-log ×1, incident ×1. Each now sets
  the dataUri mime from the helper's returned `mimeType` (JPEG for derivative, original otherwise).
- VERIFIED: type-check PASS (exit 0); `next build` PASS (exit 0, ✓ Compiled successfully). Mandatory
  test sweep: grep of `test/` + `e2e/` for the changed symbols found NOTHING — no existing test
  encoded the old raw-original behaviour, so nothing to invert.

### #100 COMPLETE — all three remaining surfaces (a)(b)(c) done. Bookkeeping note:
The TECH_DEBT #100 entry's blanket "markup invisible everywhere but the editor" was already STALE
(mobile/portal closed via #129/#139). With a/b/c now done, #100 is fully addressed and can be moved
to CLOSED at branch reconciliation with refs to these three commits. (Not moving it now — one item
at a time; the debt-file move is its own bookkeeping step.)
