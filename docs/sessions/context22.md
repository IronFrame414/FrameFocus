# Context — FrameFocus Session 22 (April 13, 2026)

> **Format note:** Short, decisions-focused. Detailed work lives in git log. See STATE.md for live repo status.

---

## Session summary

Closed two of the three high-priority tech debt items queued from Session 21. Tech debt #42 (empty Platform Roadmap docx) regenerated from current source-of-truth files and committed. Tech debt #11 (constants/index.ts latent admin-missing bug) refactored to a pure barrel; surfaced and fixed two cascading type errors. Tech debt #44 (password reset flow) deferred to Session 23 — session length called.

**Commits pushed to `main` this session:**

| Commit  | Description                                                        |
| ------- | ------------------------------------------------------------------ |
| 6005264 | docs(roadmap): Tech debt #42 — regenerate Platform Roadmap         |
| 1b17ec6 | refactor(shared): Tech debt #11 — fix latent admin role bug        |
| (next)  | docs(state,sessions): Close #42 and #11 in STATE; add context22.md |

---

## Decisions made

### 1. Regenerate, don't restore (#42)

The Platform Roadmap docx Josh had locally turned out to also be empty. Regenerated from CLAUDE.md, STATE.md, CLAUDE_MODULES.md, and the Quick Reference. Used the original Development Roadmap (10-module version, March 2026) for structural template and voice but rewrote content to reflect: 11 modules, current build status (M1/M2 complete, M3 in progress), six roles with the Owner-vs-Admin split, 12 workflows (up from six), QuickBooks integration as a dedicated section, and the deferred-to-post-launch list. Final file is 34 pages / 38,435 bytes. Audited via grep against source files before release — module renumbering, pricing, storage tiers, workflow names, status flags all check out.

### 2. Option B for SubscriptionTier ambiguity

The #11 cleanup surfaced a `SubscriptionTier` duplicate export — defined as a string union in `types/index.ts` AND as a derived `keyof typeof SUBSCRIPTION_TIERS` in `constants/subscriptions.ts`. Picked the derived version (Option B) as single source of truth. Type can never go out of sync with the constant. Same philosophy as the generated `database.ts` types.

### 3. Held the line on scope (didn't bleed into #12 or #43)

While auditing for #11, found that `packages/shared/types/index.ts` has the same anti-pattern: inline `CompanyUserRole` string union missing `admin`, plus inline `Profile`/`Company` interfaces that should be split out. That's tech debt #12 — logged, not touched. Also #43 stayed deferred until #14 (team member edit UI) ships. Mid-session pull to "while we're in there..." resisted successfully.

### 4. The string→CompanyRole tightening was real, not scope creep

When `ROLE_LABELS` got its correct strict type (`Record<CompanyRole, string>`) via the barrel cleanup, `dashboard-shell.tsx`'s `userRole: string` failed to compile. The fix (tighten to `CompanyRole`) is a direct, necessary consequence of #11, not extra work. Worth noting because it validates STATE.md's call that #11 was hiding latent bugs — it was.

---

## What was built

- **docs/roadmap/FrameFocus_Platform_Roadmap.docx** — regenerated, 34 pages, current state across all 15 sections.
- **packages/shared/constants/index.ts** — rewritten as 8-line pure barrel.
- **packages/shared/constants/subscriptions.ts** — renamed from `subscpritions.ts` (typo fix preserved via `git mv`).
- **packages/shared/types/index.ts** — dropped duplicate `SubscriptionTier`; added explicit `import type` from constants.
- **apps/web/app/dashboard/dashboard-shell.tsx** — `userRole: string` → `userRole: CompanyRole`; import updated to bring in `CompanyRole`.

No DB changes. No migrations. Type-check clean across all 5 packages (full turbo cache hit on final run).

---

## Lessons learned

1. **Long bash command pastes lose newlines in the terminal pane.** The `git mv` and final commit both came back garbled. Confirming with `git status` after every multi-line paste is cheap insurance.

2. **Field name swaps are a real failure mode in copy-paste edits.** Step 16 said "change line 9" without enough specificity. Josh changed `userName` instead of `userRole`. The error message immediately surfaced it, but next time: always specify the field name being changed and what it should look like after, not just the line number.

3. **Barrel-cleanup ripple is predictable.** Strict types replacing loose types ALWAYS surface latent `: string` bugs at the consumer. Budget for one or two cascading fixes whenever cleaning up a barrel that exports widely-used types.

4. **Audit-before-commit catches the right things.** Grepping the regenerated docx against source files for module numbers, pricing, workflow names, and status flags caught zero issues — but it also gave honest confidence the file was right. The ten minutes spent auditing was worth it for a 34-page document.

---

## Carry-forward to Session 23

1. **Tech debt #44 — password reset flow.** First task of Session 23. STATE.md spec: build a `/reset-password` page that handles the recovery token from URL hash and updates the user's password. Estimate 1–2 hours per context21. Required before Module 1 can truly be marked complete and before any future Admin test account work.

2. **STATE.md update is uncommitted.** Carries #42 and #11 closures. Will be committed alongside context22.md at session end (this commit).

3. **Project knowledge refresh pending post-session.** STATE.md and `docs/roadmap/FrameFocus_Platform_Roadmap.docx` both changed. Refresh project knowledge copies from `main` before Session 23 starts.

4. **Module 3 build target — pick one when #44 closes.** Same options as Session 22 carry-forward: 3F (file list UI), 3G (photo markup component), 3H (AI auto-tagging), 3I (file_favorites table).

5. **High-priority tech debt remaining:**
   - **#44** — password reset flow (Session 23 first task)
   - Nothing else marked High in the current STATE.md

6. **Adjacent items surfaced but NOT acted on this session:**
   - **#12** — `types/index.ts` has same anti-pattern as the cleaned-up `constants/index.ts` (inline `CompanyUserRole` missing admin, inline `Company`/`Profile` interfaces). Worth a similar barrel cleanup pass when #14 (team edit UI) is in flight or as standalone tech debt work.

7. **Still blocked:** Pre-Module 9 Decision Gate (unchanged from Session 15). Does not block Module 3 work or #44.

---

## How to start Session 23

1. Open the Codespace at `github.com/IronFrame414/FrameFocus`.
2. Run:

```bash
git checkout main
git pull
bash scripts/session-start.sh
```

3. Paste snapshot output + `STATE.md` + `docs/sessions/context22.md` into a new Claude Chat session.
4. Say: **"Starting Session 23. Session 22 closed tech debt #42 and #11. First task: tech debt #44 — build /reset-password page that consumes Supabase recovery token. Estimated 1–2 hours."**
5. Switch to Claude Code once the build plan is agreed.
6. End the session in Chat with a STATE.md update and context23.md.

---

**End of context22.md.**
