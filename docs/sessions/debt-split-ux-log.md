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
