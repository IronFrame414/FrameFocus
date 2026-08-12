# S136 — progress log

**Branch:** `feature/s136-email-and-debt`, cut off `origin/main` = `9a2d9f5`.
**Target DB:** rebuild-test (`nmyphyhmfttxkdoposvf`). Production is Josh's to push, attended.
**Phase 3 is unattended.** Josh answered all seven Phase 2 questions; his rulings are recorded
against each part below.

Append after every completed step: what was attempted, what happened, **the real exit code**, and
the next action. `## RESUME HERE` stays at the bottom, naming ONE next action.

---

## Rulings carried into Phase 3

| Q | Ruling |
| --- | --- |
| 1 | Fix `ai-tagging.ts:105` **in its own commit** so it can be reverted alone. Re-run the tagging test. |
| 2 | New **repo-wide** brand assertion over `apps/web` + `packages`; leave A-26b3 as written; convert `brand-email-footer.test.tsx` to a **directory walk**; **cover the subject-line gap** — the hole that actually fired. |
| 3 | Extract **`generate_company_slug(text)`**, not an inline loop. |
| 4 | Empty base slug → `company`, then `company-2`. Base truncated at **48 chars**. |
| 5 | Backfill **only companies with zero `email_logs` rows**. |
| 6 | Renumber at **merge time**. Land the mapping in main's `TECH_DEBT.md` header. **Do not commit to `feat/notifications` or `feature/m6m-mobile`.** |
| 7 | **Provisional branch-scoped ids** (`#N-notif`) until merge. Rule goes in **CLAUDE.md**. |

---

## Step 0 — environment confirmed

- `pwd` `/workspaces/FrameFocus-work`; tree clean.
- Branch `feature/s136-email-and-debt` cut off `9a2d9f5`.
- Supabase CLI linked to `nmyphyhmfttxkdoposvf` (rebuild-test) — **not** production.
- `uv` present at `/home/node/.local/bin/uv`; root and `apps/web` `node_modules` both present.

Exit code: n/a (read-only checks).

---

## Step 1 — Part 1, the six literals (DONE)

Five user-facing ones fixed and committed as `4e456b8`; the GPT-4o prompt separately as
`d3c93e2` per Q1.

- `tsc --noEmit` → **exit 0**. `vitest run` → **exit 0**, 46 files / 665 tests passed.
- `brand.shortName` used for exactly one string — "Open EZ Binder from the new icon" — because
  that sentence names the label under the home-screen icon, which IS the manifest `short_name`.
  Everything else reads `brand.name`.

⚠️ **TRAP HIT AND RECOVERED.** The first run of step 1's verification was executed from the REPO
ROOT, which reported `TSC_EXIT_CODE: 1` and `Test Files 67 failed | 8 passed`. That is the
documented trap — the root ignores `apps/web/vitest.config.ts`. Re-run from `apps/web`: exit 0
both. **Nothing was broken; the cwd was.** Recorded because the false failure is indistinguishable
from a real one in the log.

⚠️ **COULD NOT DO AS ASKED:** Q1 said "re-run the tagging test". **There is no tagging test.**
`ai-tagging.ts` has one consumer (`app/api/files/auto-tag/route.ts`) and zero tests reference it,
`ai_tag_logs`, or `autoTagFile`. Full unit suite + typecheck are green but neither exercises the
prompt. Not treated as blocking — the change is a string in a model input and is revertible alone.

---

## Step 2 — Part 1, the three assertions (DONE) — `a7ba55a`

- `test/brand-literals.test.ts`: repo-wide sweep of `app/`, `lib/`, `components/`, `packages/` for
  the stale name AND the current name hard-coded outside `lib/brand.ts`. Anti-vacuity guard
  included (a broken walk would otherwise pass).
- **VERIFIED LOAD-BEARING:** appended `// FrameFocus` to `lib/services/files.ts` → **exit 1**,
  naming that file; reverted → **exit 0**. File confirmed clean via `git status --porcelain`.
- `brand-email-footer.test.tsx`: now WALKS `lib/email/templates` and asserts covered-set ==
  on-disk in both directions; `InviteEmail` rendered and asserted.
- Subject gap closed by extracting `buildInviteSubject()` so it is assertable without a DB.
- A-26b3 left exactly as written, per Q2.

`tsc` → **exit 0**. `vitest run` (from `apps/web`) → **exit 0**, 47 files / 673 tests.

---

## Step 3 — Part 2, the slug (DONE) — `1560789`, `6b515c7`

`20260917000000_company_slug_no_hex.sql` on rebuild-test. Push **exit 0**. Live probe
`s136-company-slug.live.ts` **9/9, exit 0**. Full live suite **52 files / 577 tests, exit 0**.
`tsc` **exit 0**.

**Two defects found by reading data, not exit codes — every push reported 0:**

1. **Missing `p_exclude_company_id`** made the backfill non-idempotent: after one run each slug
   equals its own normalised name, so a replay matches the company's OWN row and bumps
   `worth-properties` → `-2` → `-3`. Applied 5× total; slugs verified unchanged across the last 3.
2. **`REVOKE … FROM PUBLIC` did not close the function** — Supabase grants EXECUTE to `anon` and
   `authenticated` explicitly, and an explicit grant survives a PUBLIC revoke. The probe failed on
   that assertion; both roles now named.

**One wrong inference of mine, corrected in the migration text:** I first read
`ridgeline-builders-test-co-2` as a self-collision. It is not — the `-2` is the company's own NAME
(`Ridgeline Builders (TEST CO 2)`) normalising. Recorded in the migration so the next reader does
not chase a bug that is not there.

**Two harnesses repaired** (`6b515c7`): `s97ct-isolation` and `s97ct-reply-to` pinned a company by
`slug`. The tests were wrong, not the backfill — both already resolved their other company by
`name`. Also note `s97ct-isolation`'s failure message said "run seed-test-identities.mjs", which
was untrue and pointed at the wrong fix.

⚠️ **CWD TRAPS HIT TWICE, BOTH RECOVERED.** `vitest`/`tsc` must run from `apps/web`; the
**Supabase CLI must run from the repo root** or it reports `LegacyProjectNotLinkedError` and looks
like a lost link. Neither was a real failure.

---

## Step 4 — Part 3, the debt reconciliation (DONE) — `75fb5c5`

**The collision is wider than filed: it starts at `#147`, not `#148`,** and the two branches
collide with each other as well as with main. `feature/m6m-mobile` owes **three** renumbers, not
one. Verified genuinely different items (main has no "actionable residue" entry; m6m has no "ONE
address" entry).

Reassignment table landed in `TECH_DEBT.md`'s header, to be applied **at merge time** per Q6.
**Neither branch was touched.** CLAUDE.md gained the provisional-id rule per Q7.

## Step 5 — Part 4, the interview material (DONE) — `c544ee1`

`docs/specs/trial-lifecycle-interview.md` — 35 questions, 24-row open-decisions register, banner-
marked as **not a spec**. No schema, no acceptance criteria, no build order, no code.
TL-23/TL-24 routed to legal review with **no draft wording**, per the Module 7 posture.

## Step 6 — final gates (DONE)

Run from `apps/web`, real exit codes printed and read:

| gate | exit | signal |
| --- | --- | --- |
| `tsc --noEmit` | **0** | — |
| `npm run lint` | **0** | pre-existing warnings only |
| `vitest run` (unit) | **0** | 47 files / **673 tests** passed |
| `npm run build` | **0** | `✓ Compiled successfully` |
| `vitest --config test/live.vitest.config.ts` | **0** | 52 files / **577 tests** passed |

Playwright was **not** run — no route, component or page behaviour changed that an e2e chunk
covers; the changes are strings read from `brand`, a SQL function, docs and tests. Recorded as a
deliberate omission, not an oversight.

---

## RESUME HERE

**Next action:** none — S136 Parts 1–4 are complete, committed and pushed. Josh merges.
**Owed to production (Josh, attended):** `20260917000000_company_slug_no_hex.sql` is on
rebuild-test only; production is current through `20260916000000`.

