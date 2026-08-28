# Desktop redesign — build log

> Incremental recovery log (precedent: `S166-battery-log.md`). Append-only.
> Each entry: step · what was done · files · commit hash · what was verified · decisions/contradictions.
> The Codespace can restart and take uncommitted work with it — this log is the recovery point.

**Working tree at start:** `main @ 6ab116e` ("docs: the desktop redesign spec and its six source
inventories"). Spec: `docs/specs/desktop-redesign-spec.md` (1358 lines). CLI linked to rebuild-test
(`nmyphyhmfttxkdoposvf`) for read-only verification.

**Phase order (hard stop after each):** A audit → B tokens → C sidebar → D six sections. Build step 4
(the six list screens) is NOT in scope.

---

## Log

### Entry 0 — build log created
- **Step:** pre-Phase-A setup.
- **Did:** created this log as the first action.
- **Files:** `docs/specs/desktop-redesign-build-log.md` (new).
- **Commit:** (this entry's commit).
- **Verified:** spec present at `6ab116e` (1358 lines); on `main`; CLI on rebuild-test.

### Entry 1 — Phase A: citation audit (new session, resumed after Entry 0's session ended)
- **Step:** Phase A, complete.
- **Did:** audited every file path, `file:line`, schema claim, line count and cross-reference in
  the spec against `main @ ee2feaa`. Six parallel read-only audit passes; every ❌/⚠️ independently
  re-measured before it entered the audit file (one agent's wrong-methodology grep counts and a
  policy-superseded-by-later-migration near-miss were both caught this way).
- **Branch note:** this session works on `feature/desktop-redesign` (cut from `origin/main @
  ee2feaa`), per the run protocol's no-edits-on-main rule — Entry 0's session sat on `main`
  directly. `main` is checked out in a second worktree (`/workspaces/FrameFocus`), so the branch
  was reset to `origin/main` rather than branched from a local `main` checkout.
- **Files:** `docs/specs/desktop-redesign-spec-citation-audit.md` (new).
- **Commit:** (this entry's commit).
- **Verified:** `npx turbo run type-check` → exit 0, 5/5 (read from redirected log per the
  exit-status protocol).
- **Headline results:** 0 wrong paths, 0 citations pointing at wrong code, ~23/25 line cites exact,
  2 hard ❌s — the header's "invoice floor outstanding" (it shipped at `2ff9966` +
  `20261038000000_invoice_payment_floor.sql`, keyed on **`author_member_id`, not `created_by`**),
  and §3 R8's "lib/notify verified empty" (`push.ts:29` still has `support@frameFocus.app`).
- **Found, not ruled anywhere:** `money-representation.md` / `7d1-spec.md` §12a still state the
  overturned S97 carve-out — the fix commit did not amend them; the five deliberate `prompt()`
  leftovers (`#1-dialogsweep`) sit on screens later build steps restyle.

### Entry 1b — the VAPID-subject fix (ruled by Josh after reading Phase A)
- **Step:** standalone fix, ordered separately from the tokens.
- **Did:** `push.ts:29` fallback `mailto:support@frameFocus.app` → `mailto:framefocus2026@gmail.com`.
- **Files:** `apps/web/lib/notify/push.ts`.
- **Commit:** `f64c622`.
- **Ruled alongside [Josh]:** `money-representation.md` / `7d1-spec.md` §12a are LEFT ALONE — that
  amendment belongs with the invoice-floor work, not the redesign.

### Entry 2 — Phase B: design tokens
- **Step:** build step 1, complete.
- **Did:** README palette adopted per §2. `theme.ts`: navy `#0f1729`, primary `#3b4ae0`, cardBorder
  `#e4e8ef`, pageBg `#f4f6fa`, blueTint/blueTintAlt `#f2f4ff`/`#e8ecfb`; four additions (`purple`/
  `purpleBg`, `rowTintAttention`, `rowTintProblem`, `attentionCardStyle` as a composable style
  fragment, R7 marked permanent). `tailwind.config.ts`: brand 50/100/500/900 moved; **200/300 left**
  — the design files still use `#cdd6e8`/`#8fa0c4` verbatim and §4 lists no nav-text delta;
  400/600/700/800/950 left (no README counterpart; re-deriving is invention). `accent`: **zero
  changes** — its README-named values (warning family) already match, and 500 is ruled to stay.
  `m6m` repainted per R6 (navy/blue/surface/border), **canvas and danger held**. `brand.ts`
  themeColor + backgroundColor → `#0f1729`, still two separate literals (§S2).
- **Decisions a ruling did not cover, recorded:**
  1. `theme.ts` `blueTint`/`blueTintAlt` moved with brand.50/100 — R5's sentence names only four
     theme.ts values, but the tailwind bullet moves 50/100, and splitting one token's value across
     two files is the divergence class (#129) the repo rules against. Both pairs move together.
  2. The **text ramp, hover, and semantic colours did NOT move** — the design uses a different text
     ramp (`#1a2437`, `#3f4a60`, success `#1f8f4e`…), but R5 deliberately scopes to navy/primary +
     near-identical shades; re-ramping is a ruling nobody made.
  3. Two live shell hexes in `dashboard-shell.tsx` (top-bar border, main bg) and four live `/m`
     stragglers (photo placeholder ×2, timeline-dot halo, switch-screen bar blue) moved with the
     tokens — they are the same tokens hand-pasted, and leaving them splits the palette on the
     surfaces this phase repaints. `/m` now has **zero** live old-palette hexes.
  4. **Left behind on purpose: ~200 inline old-palette hexes** in desktop screen bodies
     (field-ops/safety/deliveries/daily-logs families, gantt, dashboard page) and the email/PDF
     templates (`auth-email`, `incident/spec-sheet/delivery/daily-log` templates). Screen bodies are
     owned by build steps 4–10, which restyle each screen against its mockup; the old and new
     navies are near-identical in the interim. **Templates need their own ruling** — emails/PDFs
     are documents, not UI, and nothing rules whether they follow the repaint.
- **Tests swept per the S157 rule (existing tests encoding the old palette):**
  `m6m-pwa.test.ts` A-26b4 inverted to `#0f1729` (run: **7/7**); `e2e/m-hubs.spec.ts` on-site
  border expectation → `rgb(59, 74, 224)` (needs the next Playwright battery to prove live —
  e2e, not runnable in this step). `brand-email-footer.test.tsx`'s `#2f49d1` is a tenant-fixture
  prop, not a palette assertion — untouched. Also caught: A-26b4 asserts `theme.ts` does not
  contain the substring `brand` (independence guard) — the new comments were worded around it.
- **Files:** `theme.ts` · `tailwind.config.ts` · `brand.ts` · `dashboard-shell.tsx` ·
  `m/timeclock/switch/switch-screen.tsx` · `m/p/[projectId]/photos/photo-grid.tsx` ·
  `m/p/[projectId]/page.tsx` · `test/m6m-pwa.test.ts` · `e2e/m-hubs.spec.ts`.
- **Commit:** (this entry's commit).
- **Verified:** guarded values confirmed in place post-edit (`m6m.canvas #0d1220`, `m6m.danger
  #c0362c`, `accent.500 #f59e0b`, `logoAmber #EDA122`); `/m` grep for live old hexes → 0;
  `npx turbo run type-check --force` → exit 0, **5/5 uncached**; `vitest run test/m6m-pwa.test.ts`
  → exit 0, 7/7. §5b's on-phone splash check (§S2's flagged assumption) still needs a real
  handset — unchanged, as the spec says.

### Entry 3 — the audit's correction sheet applied to the spec [ordered by Josh, before Phase D]
- **Step:** docs-only, its own commit; required before Phase D because the six-section build copies
  §1 R2's role table, and the stale table would have silently undone the invoice floor.
- **Did:** amended the header status line, §1 R2 (the live role table, now marked as the one the
  build copies), §7.1 (shipped, with the `author_member_id`-not-`created_by` deviation recorded),
  §8.8.3 and §8.8.4 (post-floor banners), and §9.2's amendment pointer. Superseded text quoted, not
  deleted, throughout. Also recorded in §7.1 and §9.2: Josh ruled the `money-representation.md` /
  `7d1-spec.md` §12a amendment travels with the invoice-floor work — the redesign leaves both alone.
- **Files:** `docs/specs/desktop-redesign-spec.md`.
- **Commit:** (this entry's commit).
- **Verified:** every correction traces to a line in `desktop-redesign-spec-citation-audit.md` §2;
  no ruling was altered — only the record of what has shipped.

### Entry 4 — RULED [Josh]: R5 amended, the text ramp and semantic colours move
- **Step:** ruling 1 of two issued after the Phase B report; applied immediately.
- **Did:** `theme.ts` ramp → README values: body/bodyAlt `#3f4a60`/`#4b5670`, muted/mutedAlt
  `#7b8699`/`#8792a8` (neutralBadgeText follows muted), faint/faintAlt `#9aa4b8`/`#c3cad8`,
  success/successBg `#1f8f4e`/`#e6f0e9`, warning `#b45309`, danger `#c0362c`, tableHeadBg
  `#fbfcfe`, rowDivider `#f4f6fa`, inputBorder `#d5dae4`. `warning`==`warningDeep` and
  `danger`==`dangerAlt` now collapse to one value each — deliberate, the design carries one of
  each; name consolidation deferred. No counterpart, unmoved: `successOnBg`, `primaryHover`,
  `neutralBadgeBg` (already the README progress-track value), navText/navySecondary (design
  retains those hexes — Phase B evidence). `m6m` followed per R6: `muted` `#8792a8`, and the
  judgment call recorded for revisit — `strip-bg`/`strip-border` → the README page-level warning
  (`#fff5e6`/`#f5cf8f`) and `danger-border` → `#efd3d0`, on the reading that those tokens carry
  exactly the README's page-level-warning and danger-border roles on mobile. Live `/m` copies
  moved: switch-screen break grey, schedule fallback dot, check-in usable-count green.
- **Tests swept:** `e2e/m-hubs.spec.ts:442` photo-badge mono colour → `rgb(135, 146, 168)`
  (e2e — proves out at the next Playwright battery). No unit test asserts ramp hexes (grepped).
- **Files:** `theme.ts` · `tailwind.config.ts` · `m/timeclock/switch/switch-screen.tsx` ·
  `m/schedule/page.tsx` · `m/p/[projectId]/deliveries/check-in/check-in-form.tsx` ·
  `e2e/m-hubs.spec.ts` · spec §2 R5 (amendment recorded, superseded reading quoted).
- **Commit:** (this entry's commit).
- **Verified:** type-check run before commit (see commit message); grep confirms no live old-ramp
  hexes remain under `app/m`; desktop screen-body inline ramp hexes remain owned by steps 4–10,
  same policy as Entry 2.

### Entry 5 — RULED [Josh]: emails follow the repaint, PDFs do not
- **Step:** ruling 2 of two; applied immediately after ruling 1.
- **Did:** all nine `lib/email/templates/*.tsx` repainted hex-for-hex (`#374151`→`#3f4a60`,
  `#6b7280`→`#7b8699`, and auth-email's `#14213d`/`#2f49d1`/`#eef1fb`/`#e6e9ef`/`#9aa1ac` →
  new values). Tenant identity untouched: `brandColor` props and per-company logos are data, not
  palette. **Interpretation recorded:** Josh named "auth email and other platform-sent mail"; the
  client-facing templates (proposal, invoice, CO, reminder, selections ×2) were included because
  their grey chrome is platform typography, not contractor identity — the headline of the ruling
  is "emails follow the repaint". **PDF templates left alone by ruling** (incident, spec sheet,
  delivery, daily log): a client sees their contractor's identity, never the platform's;
  `invoice-data.ts` already pulls `companies.brand_color` per tenant. Reason recorded in spec §2
  so it is not re-litigated.
- **Files:** the nine templates + spec §2 (ruling recorded above the Blast radius section).
- **Commit:** (this entry's commit).
- **Verified:** residual grep over `lib/email/templates` → clean (exit 1); no test asserts email
  hexes (`brand-email-footer.test.tsx` uses `brandColor` fixtures only); type-check before commit.
- **CONFIRMED [Josh, after the Phase C report]:** both judgment calls upheld — the five
  client-facing templates were correctly included (contractor identity = `brandColor` + logo,
  which are data; grey chrome = platform typography), and the `m6m` strip tokens moving to the
  README page-level warning is right. Recorded in spec §2 so the email/PDF boundary is written
  down as ruled rather than inferred.

### Entry 6 — Phase C: sidebar
- **Step:** build step 2, complete.
- **Did:** the three ruled deltas in `dashboard-shell.tsx`, nothing else: width `w-[236px]` →
  `w-[228px]` (line 277 — the `w-[236px]` at line 248 is a historical comment and stays); active
  item + `shadow-[inset_0_0_0_1.5px_#7d8bf5]`; item padding `px-3 py-[10px]` → `px-[11px] py-[9px]`
  on both branches. **No `NAV_ITEMS` entry, order or gate touched.**
- **Files:** `apps/web/app/dashboard/dashboard-shell.tsx`.
- **Commit:** (this entry's commit).
- **Verified:** `e2e/desktop-ffnav.spec.ts` run LIVE against a fresh dev server, anonymous
  chromium project, real five-role sign-ins: **10/10 passed** (exit 0 read from the redirected
  log, corroborated by the pass tally) — Owner 14/3, Admin −Billing only, PM keeps Estimates +
  Cost Catalog and loses Admin, foreman == crew, empty sections render no header.
  `npx turbo run type-check` → 5/5.

### Entry 7 — Phase D: the six sections
- **Step:** build step 3, complete.
- **Did:** `project-header.tsx` — 17 tabs → 6 sections with a sub-tab row. **`TABS` itself is
  untouched** (its role lists are the live gates verified against the file — Payments is
  `owner·admin` per the invoice floor — and its comments carry rulings that `s126-chat-ui`
  asserts on). A `SECTIONS` layer maps slugs to sections in §1's order; the role filter runs per
  sub-tab against the untouched lists (R2). R1: a section links to the caller's first VISIBLE
  sub-tab; a section filtering to zero sub-tabs is dropped. R3: People = Contacts · Team, two
  sub-tabs. R4: Overview and Chat render no sub-row. Chat still carries no `roles` entry (A-C27).
  Styling per the README tab hierarchy: raised segments (`9px 9px 0 0`, active = primary fill,
  white text), white sub-strip with the `inset 0 -2.5px 0` underline.
- **Decisions a ruling did not cover, recorded:**
  1. **A structurally-multi section role-filtered to ONE sub-tab still renders the row** (crew in
     Money sees a lone "Change Orders" sub-tab). R4's "sections of one" is read structurally —
     a reflow, not a disappearance, matching §5b.5. Trivial to flip if Josh prefers.
  2. The zero-visible-section branch is unreachable with the live gates (every section keeps an
     ungated sub-tab); noted in the test file so nobody hunts for the missing assertion.
  3. `data-testid="project-section-*"` / `project-subtab-*` added — constructed identifiers, per
     the nav's existing pattern.
- **Couplings verified:** `payments-view.tsx:142` (invoice-detail links) and
  `invoice-delivery-panel.tsx:177` (lien-releases link) — slugs unchanged, nothing moves.
- **Tests:** NEW `test/redesign-sections.test.tsx` — 15 cases over owner/admin/PM/foreman/crew:
  R1 resolution per role (foreman → budget, crew → changes), gated sub-tabs absent (PM keeps
  Invoices, loses Payments/Profitability — the live floor), §1 sub-tab order, R3, R4 with a
  counter-vacuity case. **Swept per S157 and caught one:** `s97ct-roles.live.ts` 6a rendered the
  header at the project BASE and asserted tab labels in the flat bar — under sections the owner
  arm fails and the foreman/crew arms go vacuous. Adapted to render each role inside Money at a
  page that role can reach, with a 'Change Orders' counter-vacuity guard.
- **Files:** `project-header.tsx` · `test/redesign-sections.test.tsx` (new) ·
  `test/s97ct-roles.live.ts` (6a adapted).
- **Commit:** (this entry's commit).
- **Verified:** new suite 15/15; `s126-chat-ui` 24/24 (TABS-source assertions survive);
  **`s97ct-roles.live.ts` 36/36 LIVE against rebuild-test**; full unit suite **947/947 (62
  files)**; `npx turbo run type-check` → 5/5. Foreman acceptance proven in both the new suite
  and the adapted live 6a: Money lands on Budget & Cost, Profitability absent from the markup.

---

## Build step 4 — the six list screens

### Entry 8 — the shared anatomy + `14a` Projects
- **Step:** the pattern (once) and the first, most-specced screen.
- **Did:**
  - NEW `components/list-screen/list-screen.tsx` — ListPageHeader · ListSearchInput ·
    MetricStrip · AlertStrip (wears `attentionCardStyle`) · FilterChips. **The table is
    deliberately NOT shared** — six different column sets/reflows; a generic table would be a
    framework, not a pattern. Tables stay per-screen on the theme tokens.
  - NEW `lib/project-list-derive.ts` — the two ruled derivations as pure functions:
    `progressFor`/`progressLabel` (percent + days left, nothing else; null → "no dates set";
    past-target renders "Nd over" — a micro-decision, the ruling didn't name the overdue case)
    and `attentionFor` (four conditions, closed set, ruled order).
  - `projects/page.tsx` — three grouped attention queries (draft COs · open+in_progress punch,
    the checkPunchGate statuses matching dashboard.ts · accepted-unconverted estimates, keyed on
    status='accepted' since conversion flips to 'converted'); `projectHasUnsignedContract()` per
    project for the Awaiting-signature metric (the one legal mechanism — SECURITY DEFINER,
    role-safe; N calls on a single-digit list is the same accepted shape as the margin loop);
    the §6 margin loop — per-project `getProfitabilityReport` behind `canSeeFinancials`, zero
    calls for gated roles. Billed = headline.billed; margin% = profit over the headline's own
    basis (profitBasisFor); Unbilled = Σ positive `backlog` (already earned−billed−discounts).
  - `projects-list.tsx` — number folded under name; Type column dropped (`project_type` kept for
    the projected qualifier); Progress + Billed + Margin + Needs-attention columns; metric strip
    Contract value active · Unbilled work · Awaiting signature · Need attention (money cards
    Owner/Admin only — the strip itself reflows); grid reflow now **8 → 5** on
    `canSeeFinancials`, same mechanism as the shipped 6 → 5. **[S97] Contract/projected header
    and per-row qualifier kept — the design's bare CONTRACT header is amended, as ruled.**
- **Decisions a ruling did not cover, recorded:** overdue renders "Nd over"; multiple attention
  conditions join with " · "; row tints NOT applied (§8.1 does not order them — the tint tokens
  exist for screens whose specs do); attention counts are caller-RLS-scoped, so a foreman/crew
  row never shows draft-CO or accepted-convert conditions (the S121/estimates floors, working);
  Unbilled sums only positive backlog (an overbilled job is not negative unbilled work).
- **Files:** the four above + `test/redesign-projects-list.test.ts` (new, 8 cases, non-vacuous).
- **Commit:** (this entry's commit).
- **Verified:** derivation tests 8/8; type-check 5/5. The §5b live render check (Owner + a gated
  role, real Bishop data) runs ONCE for all six screens at the end of the step, as a Playwright
  pass — logged when it runs.
- **⚠️ INCIDENT, and the step-commit rule earned its keep again:** between committing 14a and
  pushing it, this worktree was found on a **detached HEAD** and the local
  `feature/desktop-redesign` branch was **gone** — the other worktree (`/workspaces/FrameFocus`)
  now has `main` fast-forwarded to `17cdf77`, i.e. the redesign work was merged into local main
  externally mid-session and the local feature branch deleted under us. The 14a commit
  (`54eaa94`) was safe in the reflog, parented on the pushed `17cdf77`; the branch was recreated
  at it and pushed. Remote `feature/desktop-redesign` continues unbroken.

### Entry 9 — `14f` Cost Catalog
- **Step:** the second screen — nearly pure restyle, proving the pattern travels.
- **Did:** `catalog/page.tsx` gains the ONE new data piece: the usage map as **two grouped
  queries** (`estimate_line_rows.catalog_item_id` → distinct estimates via the two-hop
  `estimate_line_items!inner(estimate_id)` join; `selection_options.catalog_item_id` filtered on
  its `is_deleted` — `estimate_line_rows` has none, its rows live and die with the estimate's
  recalc). `catalog-list.tsx` restyled onto the shared anatomy: header + search, **AlertStrip**
  ("N prices not verified … Review stale prices", the mockup's caption), category chips + a
  **Stale N** chip, grouped tables on the theme tokens. Browser-fetch shape kept.
- **Ruled wording applied:** the Used column reads **"used N times" — no noun**; the mockup's
  "used on 14 estimates" would be false over a combined count.
- **Decisions a ruling did not cover, recorded:** **stale = never verified OR >90 days old**
  (the mockup names no threshold; `STALE_AFTER_DAYS = 90`, one constant, re-rulable without a
  hunt); null `last_verified_at` renders "never" and counts as stale; usage counts do not chase
  deleted estimates through the two-hop join (noted in code).
- **Files:** `catalog/page.tsx` · `catalog/catalog-list.tsx`.
- **Commit:** (this entry's commit).
- **Verified:** type-check 5/5 (exit 0 read from log).

### Entry 10 — `14c` Contacts
- **Step:** third screen.
- **Did:** `contacts/page.tsx` gains the two new server-grouped reads: **Jobs** — distinct
  projects per contact over BOTH arms (`projects.contact_id` + the `project_contacts` junction;
  one arm alone undercounts, per `is_client_of_project()`); **Client portal** — the company-wide
  derivation (the shipped one is project-scoped): `profiles.client_access_state` by
  `contact_id`, `invitations.contact_id` marking invited-not-accepted, profile wins over
  invitation, absence = the derived "Not invited". `contacts-list.tsx` restyled onto the
  anatomy: header + search + Trash + Add, type chips, the status dropdown kept with its S158
  Finding-2 comment, themed table, two appended columns. **The S158 contract survives intact**:
  row-as-button semantics (role/tabindex/aria/testid), no row actions, sheet unchanged.
- **Decisions a ruling did not cover, recorded:** leads render the em-dash in the portal column
  (a lead has no portal to be invited to); the portal read is caller-RLS-scoped (a role that
  cannot read `invitations` simply sees "Not invited" less accurately — same posture as 14a's
  attention counts); no invitation-status filtering (any invitation row = "Invited"; an accepted
  one has a profile, which wins).
- **Tests adapted, not left red (S157):** `s158-ui-fixes.test.tsx` — the four render calls gain
  the new required props, and the six-column guard **grows to eight** (Jobs · Client portal), so
  it keeps guarding "removed only one column" against the new table. 11/11.
- **Files:** `contacts/page.tsx` · `contacts-list.tsx` · `test/s158-ui-fixes.test.tsx`.
- **Commit:** (this entry's commit).
- **Verified:** type-check 5/5; s158 suite 11/11.

### Entry 11 — `14e` Team
- **Step:** fourth screen.
- **Did:** the browser-fetch inversion is **kept, not "fixed"** — members and invitations still
  load client-side. The server page adds only the NEW columns' data, because their mechanisms
  are server-side and already correct elsewhere: **Hours this week + OT** via ONE
  `getSessionsForReview({from,to})` + `weekWindowForYmd` + pure `weeklyHoursSummary()` per
  member (the timeclock/timesheets pattern verbatim — not `getWeeklyHours(memberId)` in a
  loop); **Burden/hr** derived per the pay-rate-section arithmetic — in-force effective-dated
  rate, then `rate × multiplier` or `rate + companies.fixed_burden_per_hour` by
  `burden_source`. Sessions/rates key on `company_members.id`; rows are profiles — mapped via
  `company_members.profile_id`. **Pending invites became rows of the one table** (presentation
  only — email/role were always there), keeping all three D4 controls and the resend note.
  Client restyled onto the anatomy.
- **Reflow:** pay rates are Owner/Admin by RLS, so a gated role's burden map arrives empty and
  the column renders em-dashes; hours likewise follow session RLS. Less, not nothing.
- **Decision recorded:** the new columns' data rides SERVER props while the old data stays
  browser-fetched — additive, not an inversion; writing a duplicate client-side sessions query
  would have been the #129 divergence shape.
- **Files:** `team/page.tsx` · `team-page-client.tsx`.
- **Commit:** (this entry's commit).
- **Verified:** type-check 5/5; no test renders TeamPageClient (swept).

### Entry 12 — `14d` Subs & Vendors
- **Step:** fifth screen. §8.4 read in full first; the dual insurance-expiry stores are RULED
  LEAVE AS IS and this build does not pick a side — what renders is the compliance-documents
  side; `subcontractors.insurance_expiry` stays desktop-invisible as it is today.
- **Did:** server page — compliance alert + W-9 map **Owner/Admin only with the read SKIPPED
  for other roles** (the sub-profile posture: an empty list reads as "no problems", a false
  statement; gated roles get `null` and em-dashes that mean "not yours to know", never
  "missing"). `getExpiringCompliance()` reused type-blind, counts split expired/expiring-soon
  per SUB (distinct member_id). **Committed open + 12-mo spend, SUBS ONLY**: one company-wide
  `getBillsAndCommitments()` (its projectId is optional), rows → subs via
  `subcontractor_contracts.subcontractor_id`, maths from `payables-shared`
  (`countsTowardCommitted`/`committedRemaining` — THE definitions, not restated); spend = Σ
  `expense_payments` in the trailing 12 calendar months. **Vendors get the em-dash by ruling**
  — `vendor_name`/`supplier` are free text with no FK; no join is invented. List restyled onto
  the anatomy (type badge now wears §2's purple token); Trash/+Add moved into the client
  header; S159 row-as-button contract intact.
- **Live-state note (built against reality):** the compliance table holds zero rows, so the
  alert is silent and W-9 reads "Missing" for every sub until documents are uploaded.
- **Tests adapted, not left red (S157):** `s159-subs-sheet.test.tsx` — three render calls gain
  the new props; the column guard grows 6 → 9; and the "no `<a>` anywhere" assertion was
  narrowed to **no `<a>` inside the table** — its meaning (the row is the only way in), not its
  letter, since the header now legitimately carries the Trash/+Add links. 12/12.
- **Files:** `subcontractors/page.tsx` · `subcontractors-list.tsx` · `test/s159-subs-sheet.test.tsx`.
- **Commit:** (this entry's commit).
- **Verified:** type-check 5/5; s159 12/12 (exit 0 + tally).

### Entry 13 — `14b` Estimates, and the step's live acceptance pass
- **Step:** sixth screen, last on purpose — its Client Activity column depends on view tracking
  that IS NOT BUILT (P3) **and is not built here**: the write path is the whole security
  question (public, logged-out proposal link), so it stays its own item. The column renders
  from what exists — "sent <date>" / "not sent" — and upgrades without a layout change;
  `estimates.viewed_at` + status `'viewed'` keep waiting for their writer.
- **Did:** server page computes the two metrics over one grouped read (caller-RLS-scoped):
  **Win rate — the RULED 12-month window, not the mockup's 90 days** — cohort = sent-in-window,
  won = `accepted` **or `converted`** (conversion flips accepted → converted, so counting
  accepted alone would drop the rate every time a job converts); **Expiring soon** = sent
  estimates whose stored `expires_at` falls in the next 7 days. Client restyled onto the
  anatomy: metric strip (win-rate card renders an em-dash on an empty cohort, not a fake 0%),
  expiring AlertStrip with a review shortcut, status select → chips, number folded under name,
  Client activity column, Clone kept.
- **Decisions recorded:** the 7-day expiring window (mockup names none — one constant);
  win-rate numerator includes `converted`.
- **Files:** `estimates/page.tsx` · `estimates-list.tsx`.
- **Commit:** (this entry's commit).
- **Verified:** type-check 5/5; no test renders EstimatesList (swept).

### Entry 14 — §5b live acceptance, the whole step
- **Did:** NEW `e2e/desktop-lists.spec.ts` (anonymous chromium project, per-role sign-ins, the
  ffnav precedent) — every screen renders for **Owner with real Bishop data** (empty states
  asserted ABSENT — no zero-row passes) with its new columns/metrics visible, including the
  ruled details (the [S97] "Contract / projected" header; no "used on N estimates" wording
  anywhere on the catalog). The gated pass runs as **PM**, the one gated role that reaches all
  six: 14a loses Contract/Billed/Margin and the money cards while Progress/attention/counts
  stay alive; 14d shows no compliance alert and **no false "Missing"** — the em-dash posture,
  live.
- **Run:** **8/8 passed** against a fresh dev server (exit 0 + tally). Full unit suite after
  all six screens: **955/955 (63 files)**. Type-check 5/5 at every commit.
- **Files:** `e2e/desktop-lists.spec.ts` (new).
- **Commit:** (this entry's commit, with 14b).

### Entry 15 — the step-4 constants RULED [Josh, after the step report]
- **Catalog stale = ONE YEAR, not 90 days.** Never-verified still counts. The mockup's own copy
  says "haven't been repriced in over a year"; 90 days would badge a June-2026 item and put the
  flag on too much of a 148-item list to mean anything. `STALE_AFTER_DAYS` 90 → 365, alert copy
  now says "in over a year".
- **Estimates expiring soon = 7 days — CONFIRMED as built.** No change.
- **Row tints STAY UNAPPLIED, ruled open.** §2's tokens are permanent, but where they belong is
  not yet ruled — the mockups use them for ROW STATE (a lapsed-insurance sub, an over-budget
  line), which is not the same question as category nesting. They wait for that ruling; no
  screen applies them until it lands.
- **Files:** `catalog/catalog-list.tsx`.
- **Commit:** (this entry's commit).
- **Verified:** type-check 5/5 before commit.

---

## Build steps 5–7 — Money · Documents · Notifications & Expenses

### Entry 16 — 5.1 `13a` Budget & Cost
- **Did:** the mockup's **"Cost to complete" card** — `budget − actual − committed` (budget
  REMAINING), computed as `budgetRemaining`, **NOT named `costToDate`** (the shipped field is
  cost INCURRED, the opposite quantity, and keeps its name). Renders only when `totalBudgeted`
  is non-null — Owner/Admin; a PM/foreman gets their existing card rows, never an empty extra
  card. The **Watch list panel** lands (Owner/Admin, in-memory over the rollup, no new query):
  line ≥50% committed with no signed subcontract (`committed_awaiting_signature`), unspent
  allowances, labour budget with no labour logged. **The mockup's allowance copy is
  REWRITTEN as ruled (§9.1):** "an approved selection binds by its signature — no change order
  is generated" — the "turns into a change order" sentence does not ship.
- **Decisions recorded:** the unsigned-sub flag fires at ≥50% spend fraction
  (`WATCH_BUDGET_PCT = 0.5`, one constant — the mockup says "N%" and names no N); spend for
  that heuristic is actual + gross committed.
- **Files:** `projects/[id]/budget/page.tsx`.
- **Verified:** type-check 5/5. No old-palette hexes were present in this file (grepped).

### Entry 17 — 5.2 `16a` Change Orders
- **Did:** **the redaction behaviours are preserved untouched** — a redacted amount is an empty
  grid slot by construction (the span only renders when `net_delta !== null`), and the summary
  caption still flips "$X pending" → "sent to clients" on `canSeeSums`. NEW: the **Impact
  column** — `schedule_impact_days` NULL renders "not entered", never a fake `+0`; a
  tinted strip counts non-draft COs with no impact entered (the mockup's "1 CO has no impact
  entered", all roles — non-dollar); **draft age** under the status badge ("in draft Nd",
  from `created_at`). One old-palette badge hex moved (`#6b7280` → `#7b8699`).
- **DEFERRED, per the prompt's ask-first list:** "Bill on next invoice vs Bill now" (not
  stored; needs Josh's choice between a new column and an invoice-action shortcut) and
  "from a photo or punch item" (no FK either direction; pairs with 17b). Neither is built.
- **Files:** `projects/[id]/changes/changes-panel.tsx`.
- **Verified:** type-check 5/5.

### Entry 18 — 5.3 `13c` Invoices
- **Did:** built on the LIVE floor (a PM sees authored invoices only; the aggregate card is
  already `canSeeContractValue`-gated with the [Fix 4] comment — untouched). NEW:
  **`getFrontedCostTotal(projectId)`** in `invoices.ts` — the project-level aggregate that did
  not exist, over `expenses ⋈ expense_allocations ⋈ invoice_cost_claims` with the SAME
  semantics as the per-instrument picker beside it (approved only; remaining = allocation −
  live claims; claims cascade on void), documented to be kept in step. Rendered as a
  "Cost you've fronted" figure in the Owner/Admin position card; a gated role triggers zero
  calls; zero renders nothing rather than a $0 husk.
- **Verified, not assumed:** both hardcoded sibling URLs re-checked live —
  `payments-view.tsx:142` (invoices base ×4 uses) and `invoice-delivery-panel.tsx:177`
  (lien-releases); slugs unchanged.
- **Files:** `lib/services/invoices.ts` · `projects/[id]/invoices/page.tsx`.
- **Verified:** type-check 5/5.

### Entry 19 — 5.4 `13d` Payments · 5.5 `13e` Profitability
- **5.4:** the reminders control relabelled as RULED — "Payment reminders — chasing rules for
  this client · applies to all of this client's projects", never "for this job"
  (`client_reminder_settings` spans the client). Four aging buckets stay as coded; "Expected in
  30 days" stays deferred (P-1 — nothing writes `due_date`). Two grey hexes → tokens.
- **5.5:** the **no-cost-landed banner** — `actualCost === 0` gets the attention treatment and
  says the figures are billing/budget only (deliberately NOT one of the six report caveats:
  those describe derivation assumptions, this describes an absence). **"Projected at
  completion"** lands page-level, **fixed-price + Owner/Admin only** (the page is already o/a):
  `revised − max(budget, committed + actual + unattributed)` — the budget as cost forecast,
  FLOORED by money already incurred, so an over-budget job projects at its overrun and never
  back down to plan; em-dash when budget or revised is missing. **Formula is a recorded
  decision** — no ruling named one; it is page-level (not added to the 7H service) precisely so
  re-ruling it touches one file. The by-category em-dashes stay em-dashes; the mockup's
  "unlock when the budget carries a sell figure" caption is NOT shipped (it points at deferred
  §6b.3 work).
- **Files:** `payments/reminder-settings.tsx` · `profitability/page.tsx`.
- **Verified:** type-check 5/5 each.

### Entry 20 — 6.1 Files: the schema change (custom categories) + revisions UI
- **The crux, and the shape chosen for it:** `files.category` **KEEPS its role as the stable
  key** app writers target. `20261039000000_file_categories.sql` adds a per-company
  `file_categories` table (renameable `label`, immutable `key`, `sort_order`, `is_system`,
  nullable `project_id` for per-job custom rows), seeds the historical 14 per company
  (backfill + AFTER INSERT trigger on companies, the lien-template precedent), **replaces the
  14-value CHECK with a composite FK** `files(company_id, category) →
  file_categories(company_id, key)`, and enforces the contract with a trigger: **key and
  is_system immutable; a system row refuses even soft-delete.** A rename can never orphan a
  writer — that is the trigger's job, not a convention's. RLS: SELECT company-wide,
  INSERT/UPDATE Owner/Admin, no DELETE policy. Standard per-tenant defaults + update triggers
  per the checklist.
- **Applied live** (`npm run db:push`, exit 0, types regenerated): probe on rebuild-test —
  4 companies × 14 = 56 rows seeded, **0 orphan files**, FK present.
- **UI/service:** `getFileCategories` (server) + `file-categories-client.ts` (list/create;
  create slugs the key ONCE from the label); the upload picker reads the table — `MANUAL_KEYS`
  still excludes the app-written five (a manual 'selections' upload would be hard-removed by
  the next spec-sheet generation, per the migration header) — with an inline
  "+ New category for this job" (Owner/Admin by RLS); the files page passes renameable labels
  down; `file-row` renders **revisions** (v-chip + supersedes note — RULED IN, columns were
  stored and never rendered) and the **per-FILE "Shared with client" chip** (the design's
  category badge amended: the column is per-file, the badge follows the column).
  `FileCategory` stays the system-key union; `AnyFileCategory` is the honest open column type.
- **Deferred to step 8 (recorded):** the rename/reorder management UI — its natural home is
  the Settings Documents tab, which is step 8's screen.
- **Files:** the migration · `database.ts` (regen) · `files.ts` · `files-client.ts` ·
  `file-categories-client.ts` (new) · `files/page.tsx` · `file-row.tsx` ·
  `upload/upload-form.tsx`.
- **Verified:** type-check 5/5; live probe above; no test renders FileRow (swept).
