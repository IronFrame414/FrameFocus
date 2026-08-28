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
