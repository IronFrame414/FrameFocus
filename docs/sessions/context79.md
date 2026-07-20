# Context — FrameFocus Session 79 (July 19, 2026)

> **Format note:** Short, decisions-focused. Detailed work lives in git log. See STATE.md for live repo status.

---

## Session summary

Closed out `feat/signed-artifacts` and merged it to `main` (PR #4, merge commit
`22f139c` on the branch; `main` fast-forwarded to `709b558`). The session was
verification-heavy: most of the "open items" from the S79 handoff turned out
already done in prior sessions and were confirmed, not rebuilt.

Started at HEAD `a0269e1`. Of the five handoff open items: #1 (tech debt filing)
was already done S76 (#84/#85 present); #2 (cursive font) was already complete
(DancingScript `.ttf` + OFL license present, `Font.register` wired, renders
correctly); #4 (API error convention) was already in CLAUDE.md lines 353–355 from
a prior session. Only #3 (two-signature testing) and #5 (six test areas) were
genuinely open.

Added the project's first real automated tests beyond the seed `utils.test.ts`.
Split the six test areas by what automation judges well: 4 automated, PDF + Crew-RLS
manual. Hit and fixed a `server-only` vitest-load wall. Verified 6B day-bucketing
math and PM-role RLS. Filed tech debt #89/#90, closed #85. Refreshed STATE.md to
Session 79. Merge surfaced a real cross-branch type break in `main`'s 6A code
(`Result<T>`), fixed inline.

**Commits on `feat/signed-artifacts` this session:**

| Commit  | Description                                                              |
| ------- | ------------------------------------------------------------------------ |
| 1b80d11 | test(co): cover two-signature data flow in co-data                       |
| fab7ee6 | test(co): cover legacy-CO null created_at and empty items/project        |
| 46b5c26 | test(config): stub server-only so service tests load under vitest        |
| 74ebe73 | test(email): cover buildSenderAddress and replaceTemplateVariables       |
| 321036c | docs(tech-debt): close #85 — CO PDF bold row confirmed intentional       |
| 1940a43 | docs(tech-debt): add #89 — vendors mislabeled (Sub) in assignee dropdown |
| 71a4ee6 | docs(tech-debt): add #90 — Crew RLS gates unverified, blocked on #70     |
| 93d3d75 | docs(state): refresh to Session 79                                       |
| 22f139c | merge origin/main (STATE resolution + Result<T> fix)                     |

---

## Decisions made

### 1. Automate what automation judges well; manual for the rest

Six test areas split: two-signature data flow, legacy-CO NULL, notify-email
helpers, and 6B day-bucketing → automated. PDF correctness and Crew-role RLS →
manual UI (visual/auth-session judgment automation can't make). PDF confirmed via
UI walkthrough this session; Crew RLS deferred (see #90).

### 2. `Result<T>` fix: `{}` not `Record<string, never>`

`main`'s 6A `time-tracking-client.ts` defines `Result<T = undefined>` whose
`undefined` branch was `Record<string, never>`, which poisons the intersection
(`success` becomes `never`) → 20+ TS2322 errors. This never surfaced before because
PR checks ran each branch separately; the local merge was the first time the two
branches' code compiled together. Fixed the `undefined` branch to `{}` (verified by
actual compilation). Chose Option A (fix inline during merge) over B (abort + fix
6A separately) to keep merge momentum — no live users, low risk.

### 3. STATE.md conflict: keep ours, preserve main's prod-migration warning

The merge conflict on STATE.md was not pure take-ours. `main`'s Module 5 row
carried a still-true fact — the signed-artifacts migration is unapplied to any DB,
including prod. Kept this branch's current tables but folded that warning into the
Module 5 row so it isn't lost.

### 4. Merge with no live users, migrations deferred

No production users, so merged the code ahead of applying DB migrations (Option C).
Vercel `main` deploy = code only; migrations do NOT auto-apply.

---

## What was built

- `apps/web/lib/change-orders/co-data.test.ts` — 6 tests: two-signature v2 flow
  (null client / override mapping), contractor unsigned, contractor typed_name,
  legacy-CO null `created_at`, empty items/project. Uses a local `makeSupabase`
  fake client (no DB).
- `apps/web/lib/services/email-service.test.ts` — 4 tests: `buildSenderAddress`,
  `replaceTemplateVariables` (known/unknown/multi token).
- `apps/web/vitest.config.ts` — added `resolve.alias` + `server.deps.inline` for
  `server-only`; `apps/web/test/server-only-stub.ts` no-op stub. **Run vitest from
  `apps/web`, not repo root** — from root the config is ignored (silent default).
- One-line fix to `time-tracking-client.ts` `Result<T>` (see Decision 2).

---

## Verified (not built)

- 6B `get_project_day_segments` day-bucketing: timezone math confirmed —
  `2026-01-16 02:00 UTC` buckets to `2026-01-15` local (America/New_York). Full
  function end-to-end NOT tested through CC (auth helpers return NULL without a
  session — an env limit, not a code bug; covered by the PDF/UI path instead).
- `companies.timezone` is NOT NULL default `America/New_York` — the NULL-timezone
  bug I feared cannot occur.
- PM-role RLS gates (UI): team list visible, team-detail redirects (gated, silent),
  billing hidden, settings hidden, projects scoped to the 2 assigned. All correct.
- PDF output (UI): contractor DancingScript mark, client typed + drawn marks all
  render on their lines. Item 3 confirmed live.
- type-check 5/5 and lint 1/1 green on the merged tree.

---

## Tech debt

- **#85 closed** — CO PDF bold line-item row confirmed intentional (line item vs.
  its detail-row breakdown), UI verification, no code change.
- **#89 added** — vendors mislabeled "(Sub)" in the scheduling New Task assignee
  dropdown; display bug only, assignment works. Likely a hardcoded "(Sub)" suffix.
- **#90 added** — Crew-role RLS gates not verified end-to-end; no working Crew login
  (reset link broken #70 + email rate limit). Blocked on #70.

---

## Handed to parallel UX session

`docs/planning/ui-redesign-brief.md` (created separately) — Item 3 (unify Contacts
into one page with Clients/Subs/Vendors breakdown; subs should NOT appear in the
Contacts list — Subs & Vendors is their home; intended-behavior clarified) and
Item 4 (task creation as a modal/slide-in, not inline). Both are post-merge
redesign, NOT tech debt.

---

## Critical carry-forward — next session

**Production has SEVEN unapplied migrations.** The merge landed all of these on
`main`; prod code now expects schema that isn't there. No live users, so nothing is
breaking — but before ANY real use, apply in timestamp order:

1. `20260710120000_signed_artifacts.sql` (CHECK→FK swap on email_logs is the only
   destructive op)
2. `20260711130000_module6_6d_material_deliveries.sql`
3. `20260711140000_module6_6c_safety_incidents.sql`
4. `20260711150000_module6_6b_daily_logs.sql`
5. `20260714175906_project_files_storage_policies.sql`
6. `20260719000000_add_company_timezone.sql`
7. `20260720000000_email_types_lookup.sql`

STATE.md currently names only the signed-artifacts one — this list is the full set,
larger than that note reflects. Re-link Supabase CLI to prod (`jwkcknyuyvcwcdeskrmz`)
from repo root before pushing. **Do not test against prod** — verify against
rebuild-test parity first.

Also open: Crew-role RLS (#90, blocked on #70); CO create/send path still NOT RUN
(Module 5 #4 — only viewed existing sent COs this session, never created+sent a new
one, so Module 5 stays IN PROGRESS).
