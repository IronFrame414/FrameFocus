# Session 88 — M6 prod batch + merge

**Branch:** main (merged from `feat/module-6b-ui`) · **Tip:** `305ffe4`

> Naming note: `context88.md` is taken by the parallel M8-architecture session (commit `2cc49af`, branch `feat/module-8-architecture`). Two S88s ran concurrently. This file is the M6 merge thread.

## Done

- Prod (`jwkcknyuyvcwcdeskrmz`) migration batch: nine migrations `20260721060000`→`20260723020000`, applied in order, verified present in Remote via `supabase migration list`.
- Types regenerated against prod → `packages/shared/types/database.ts` (4786 lines, `project_day_presence` present). Committed `305ffe4`.
- `npx turbo run type-check` green (5/5). `npx vitest run` from `apps/web/` green (11/11).
- Fast-forward merge `feat/module-6b-ui` → main, 83 files. Pushed. Vercel deploy green.
- Prod smoke test: Field Ops → Safety → New Incident creates successfully (exercises new `create_incident_fn` RPC).

## Decisions

- **Cast escape-hatch swap SKIPPED.** ~60 `as unknown as` casts in `apps/web`; type-check green, no spec naming which are redundant, most are structural join-shape casts. Filed as TECH_DEBT #95 rather than removed by guesswork on deploy day.
- **RLS behavioral probes SKIPPED** on founder's call. Overrides the standing mandatory-probe rule. Owed on M6B tables (presence, incidents, deliveries, file links).

## M7 prereq read (architecture doc read, no repo assertions made)

Unblocked by this merge: §7.12 #5 (M6 schema) and #4 (CO/signed-artifact schema) are now readable on main.

Still blocking 7A–7C:

1. Reopen path (§7.7 #2) — hard dependency of 7A and 7C, UNVERIFIED
2. Budget sell/profit gap (debt #7, `project_budget_items` cost-only)
3. M4 allowance model (#3) — gates §7.8.6
4. Grep pass reconciling §7.1 debts vs live TECH_DEBT.md; numbering unresolved (#7)
5. T&M settings confirm (#8) — cheap read

Conflict flagged: 7D–7H specs (984 lines) were written before 7A–7C existed (0 bytes). Adding hooks is a reconciliation pass, not fill-in-the-blanks — D–H may assert a ledger shape the spine hasn't decided.

## Next session

Start with reopen-path verification. Then build 7A/7B/7C to completion before touching D–H. **UI incorporated from the start** (CLAUDE.md standing rule).

## Owed

- #94 HEIC import — confirmed still failing in prod smoke test
- #95 cast cleanup (filed this session)
- RLS behavioral probes on M6B
- Delete personal `RESEND_API_KEY` Codespaces secret
- Un-pause M8 branch
- `context85.md` unaccounted for — not in `feat/module-8-architecture`; may never have been committed
- Files-manager redesign (needs interview + spec)
