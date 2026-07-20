# Module 6B — Daily Logs (Desktop UI) — Spec

> **Derives from** `docs/specs/6B-spec.md` (the data/behavior spec — its trace is VERIFIED against
> a real Bishop day) and the live 6B data layer (migration `20260711150000_module6_6b_daily_logs`,
> on prod as of S83). When this spec and shipped code conflict, **git is ground truth** — amend
> the spec.
>
> **Status:** SCOPED Session 84. Decisions below were taken with Josh this session and are tagged
> **[S84]**. **Schema/route/service names are NOT asserted as fact** — CC reads the live
> `daily_logs` / `daily_log_crew` / `daily_log_sub_entries` schema, RLS, and any existing 6B
> service files before building; §S lists what must be confirmed live.
>
> **Design authority (read view):** M6 UI handoff screen **4c** (`docs/design/module-6/`), 1a
> "Refined Navy" tokens. **The create/edit form has NO handoff design** — the handoff defers
> entry forms to mobile; **path A (S84): build create/edit on desktop now** anyway, styled from
> ui-01 tokens and this spec. Mobile, when built, supersedes as the primary capture surface.
>
> **Depends on:** 6A data layer (live), shared hours helper (6B build adds it — Build Note 1 of
> `6B-spec.md` §13), M3 files/photos, M5 projects, 6D deliveries tables (live; read-only render).
>
> **Conventions:** `CLAUDE.md` throughout — server/client service split, RLS already governs
> visibility (`can_view_project()`, creator-only edit via `author_member_id`).

---

## §1 — Scope

Two surfaces:

1. **Read/detail view** — handoff 4c: the office reads the day's field record.
2. **Create/edit form** — desktop entry (path A [S84]); creator-only edit per `6B-spec.md` §8.

**Out of scope for this build:** voice-to-text (**dropped from desktop v1 [S84]** — open item #3
stays open for the mobile build; the desktop answer is: type); offline sync; any 6C/6D/6E UI
(their data renders read-only where 4c shows it); PDF versioning (see §4).

---

## §2 — Locked decisions [S84]

1. **Photos: display + upload.** The photo grid auto-pulls the day's project photos (M3) AND
   offers a file-upload attach on desktop (photo capture is a phone act; upload replaces it).
2. **Voice-to-text: dropped from desktop v1.** No vendor, no UI affordance. Mobile decision later.
3. **PDF: regenerate-on-edit.** One current PDF per log; an edit regenerates and replaces it in
   the project's Daily Logs folder (M3). This closes `6B-spec.md` open item #2 for v1 —
   versioning is a deliberate later enhancement if edit history is ever required. Filename still
   disambiguates by author for same-project same-date logs (build detail, per `6B-spec.md` §9).
4. **Hazard escalation button: build now.** The 4c hazard callout's red **"File an incident
   report"** button is built in this slice, routing to the 6C incident-create route pre-filled
   with `project_id` + date. **Known consequence, accepted [S84]: it 404s until the 6C UI
   ships.** Do not hide it behind a flag; 6C follows in the build order.

---

## §3 — Read/detail view (handoff 4c — authoritative layout)

- Breadcrumb (project-nested); title + author + date; **Field sub-tab bar** (Daily Logs active ·
  Crew Briefings · Deliveries · Safety — tabs for unbuilt modules render but route to their
  future routes, same accepted-404 posture as §2.4, or render disabled if CC finds routing to
  nothing worse than hiding; surface the choice); **Download PDF** action.
- Body `1fr / 320px`:
  - **Left:** Work performed paragraph; **2×2 free-text cards** (Material used / Material needed /
    Equipment used / Tasks for tomorrow); **Notes** (the §6.7a field — present in the data spec
    though absent from the 4c mock; render it, e.g. full-width under the 2×2); **Photos** grid
    (auto-pulled + uploaded, "+N more" tile).
  - **Right rail:** **Hazard flagged** amber callout (only when `hazards_present`) with hazard
    notes + the red escalation button (§2.4); **Crew present** (auto-filled members, each with
    **read-only employee hours** from the shared 6A derivation, "read-only, from time tracking
    (6A)" caption; warranty-only visitors labeled per Q4); **Subs on site** (manual hours +
    notes); **Weather / Deliveries** card (weather manual text; deliveries **read-only from the
    live 6D tables** for this project + date — renders whatever exists, empty state otherwise).
- Read-only markers (`#9aa1ac` captions) on every derived field, per the handoff token rules.

## §3a — List view (minimal, not in the handoff)

The detail view needs an entry point: a per-project list of logs (date, author, hazard badge if
flagged), newest first, within the Field sub-tab structure. Keep it minimal — no KPIs, no
filters beyond the project scope, v1. Multiple logs per project-day are legal; the list shows all.

---

## §4 — Create/edit form (path A — no handoff design)

- **Create:** any member, on any project they can see (no rank gate). Fields per `daily_logs`:
  date (defaults today), weather, work performed, the four free-text cards, notes, hazard
  checkbox + required hazard notes (CHECK-enforced), sub entries (repeating rows: sub member +
  hours + note), photo upload.
- **Auto-fill at creation:** crew present snapshot via the shared per-member-per-day hours
  helper (Build Note 1 — this build ADDS that helper to `packages/shared/utils/time-tracking.ts`,
  touching 6A additively; call it out in the commit). Crew list editable after; hours never
  editable here.
- **Edit:** creator only (`author_member_id = get_my_member_id()`), never locks. Saving an edit
  regenerates the PDF (§2.3).
- **PDF generation:** React-PDF per repo tooling, filed to the project's Daily Logs folder (M3),
  regenerate-on-edit.

---

## §S — Confirm live before building (CC — no names asserted)

- **§S-1 — Routes + nav.** The 4c screen lives under the **Field Ops** nav item, which does not
  exist yet (the FFNav shell change is a separate task). Decide the interim route (likely
  project-nested, e.g. under the existing project detail) and surface it; do not build the full
  nav change inside this slice unless Josh says so.
- **§S-2 — 6B service layer.** Inventory what exists (S83 verified the 6A services; 6B services
  are UNVERIFIED — there may be none). Build server/client per convention if absent.
- **§S-3 — Company timezone.** `6B-spec.md` §13.2 requires it for the day-boundary predicate.
  A `company_timezone` migration (`20260719000000`) was applied/verified on prod in S83 — confirm
  the column live and use it; if somehow absent, STOP and flag.
- **§S-4 — Shared hours helper.** Confirm `packages/shared/utils/time-tracking.ts` current
  exports; add the per-member-per-project-per-day derivation there (single source of truth —
  legal-record number), imported by this UI.
- **§S-5 — Photo pull + upload.** Confirm the M3 files schema/service for (a) the auto-pull
  predicate (project + date — open item #8; propose and surface) and (b) desktop upload wiring.
- **§S-6 — Deliveries read.** Confirm the live 6D table names/columns for the read-only
  project+date delivery render.
- **§S-7 — PDF builder.** Follow the repo's React-PDF patterns (CO PDF is the reference);
  regenerate-on-edit replaces the `pdf_file_id` target — confirm the M3 replace-vs-new-file
  convention and surface the choice.

---

## §5 — Acceptance criteria

- [ ] Detail view renders the 4c layout in 1a tokens: sub-tab bar, left column (work performed,
      2×2 cards, notes, photos), right rail (hazard callout, crew + read-only hours, subs,
      weather/deliveries) — all bound to real data.
- [ ] Hazard callout appears only when flagged; escalation button routes to the 6C create route
      with project + date pre-filled (404 until 6C ships — accepted).
- [ ] Create form: any member on a visible project; hazard notes required when flagged;
      "no subs, no delivery" day saves clean (the verified Bishop trace shape).
- [ ] Crew present auto-fills from the shared helper at creation and is editable after; employee
      hours render read-only and recompute on read; warranty-only visitors labeled.
- [ ] Sub hours are manual rows; they never enter 6A.
- [ ] Photos: day's project photos auto-pull; desktop upload attaches; grid shows "+N" overflow.
- [ ] Edit is creator-only (direct client call as a non-creator is rejected); saving regenerates
      the PDF; two same-day logs produce two PDFs with disambiguated filenames.
- [ ] No voice-to-text affordance anywhere.
- [ ] `tsc` passes, builds clean, no new console errors.
