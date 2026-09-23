# S110 — report — site-visit access, desktop path, carried debt

Branch `feature/s110-site-visit-access`, cut from `main` @ `8bce4311` (tree clean; S109 merge
`d0e282e1` and photo fix `fd5a1a5a` both ancestors). CLI link: `nmyphyhmfttxkdoposvf`
(rebuild-test). **Nothing touches production.**

## Phase 1 — analyze (read-only)

### Step 1 — FILL-0 and Section A measured, written into the spec

- **`estimates.sent_at` cannot be the freeze cutoff.** It is never rewritten (the immutability
  trigger keeps it out of the allowlist), but a sent-or-later estimate can have none: on
  rebuild-test **14 of 21** estimates past review have `sent_at IS NULL`, because the trigger
  lets `draft → accepted` through and `signing-service.ts:258` writes it. Proposal:
  `site_visits.frozen_at`, stamped by a trigger on the estimates status transition.
- **Floor finding:** the estimate-files route's office arm lists every file on an estimate,
  PDFs included. Widening "photos" to foreman/crew through that arm would ship vendor quotes.
  Proposal: `files.site_visit_capture` marker and a staff arm scoped to it (Q-A.D).
- `s108-site-visit.live.ts`: 29 cases; 7 encode overturned behaviour. Four other test files do too.
- Rebuild-test holds **0** rows in every `site_visit_*` table.

### Step 2 — Sections B, F, G measured, written into the spec

- **F:** the estimate-files list has 6 consumer files (3 app), the per-file route 5 (2 app).
  ⚠️ A consumer-set allowlist alone would NOT have caught S109 — the consumer already existed and
  a FIELD was removed — so the proposed guard registers fields per consumer as well. Of 99 routes,
  19 have ≥2 consumers and a change since 2026-08-23; none but `estimates/[id]/files` removed a
  response field.
- **B:** the sidebar is flat with no children; every desktop road to a visit redirects foreman and
  crew away, which collides with Section A's widening → ASK-B.B added.
- **G:** queries and the one-line seed fix prepared; nothing executed.

### Step 3 — Sections C, D, E measured, written into the spec

- **C:** the S109 claim holds — the `/m/settings` → `/m/account` link exists on `main`. What fails
  is the road: Settings is the last ☰ tile, framed as read-only, and ☰ is absent on detail screens.
  No test ever clicked the link.
- **D2:** T2 ran only in Chromium, which focuses a button on click; Safari/Firefox on macOS do not,
  and the handle never calls `.focus()`. Failure class: "the thing inspected must be the thing
  judged" — the wrong-scope form.
- **D1:** a second RPC is owed; rows have a duplicate `sort_order` on rebuild-test. New: the
  `estimate_line_rows` UPDATE policy lacks the WITH CHECK that FILL-B5 gave lines.
- **E1:** `redirectType === 'PASSWORD_RECOVERY'` from the code exchange is a measured signal; `amr`
  after recovery is not measured. ⚠️ New, from code reading: the team-page admin reset likely
  produces a link that cannot work (PKCE verifier in the admin's cookies).
- **E3:** the portal can take the sheet with no new bytes if it reuses the already-signed URL;
  a re-sign route would be new client surface.
- **E4:** closable, provided the Stripe fidelity check is re-filed in the same commit.

### Step 4 — Section H and cross-cutting measured, written into the spec

- **No i18n exists** (0 hits for i18n / next-intl / react-intl / useTranslation) — new infrastructure.
- `/m` + mounted components: **767** user-facing strings (a floor; ~850–900 realistic); 15
  components are shared by both surfaces.
- ⚠️ Crew-typed text ALREADY reaches client-facing output: `site_visits.title` → `estimates.name`
  → proposal title and email subject; markup text → portal photos.
- `transcript_language` exists and nothing writes it.
- Pricing page read through WebFetch (summarised, not verbatim): gpt-4o-mini $0.15/$0.60 per 1M.
  Cost does not decide on-write vs on-read; correctness does.

**Production volume query for H (READ-ONLY, for Josh):**

```sql
select f, count(*) n, count(*) filter (where created_at > now()-interval '30 days') n30,
       round(avg(len),1) avg_len, sum(len) filter (where created_at > now()-interval '30 days') chars30
from (
  select 'site_visit_notes' f, created_at, length(body) len from site_visit_notes where not coalesce(is_deleted,false)
  union all select 'sv_measurements', created_at, length(area_name)+coalesce(length(notes),0) from site_visit_measurements
  union all select 'sv_voice_transcript', created_at, length(transcript) from site_visit_voice_notes where transcript is not null
  union all select 'site_visits.title', created_at, length(title) from site_visits
  union all select 'chat_messages', created_at, length(body) from chat_messages
  union all select 'punch_items', created_at, length(title)+coalesce(length(description),0) from punch_list_items
  union all select 'daily_logs', created_at, coalesce(length(notes),0)+coalesce(length(work_performed),0)+coalesce(length(hazard_notes),0)+coalesce(length(material_needed),0)+coalesce(length(material_used),0)+coalesce(length(tasks_tomorrow),0)+coalesce(length(equipment_used),0) from daily_logs
  union all select 'tasks', created_at, length(title)+coalesce(length(description),0) from tasks
  union all select 'time_segments.note', created_at, length(note) from time_segments where note is not null
  union all select 'safety_incidents', created_at, coalesce(length(description),0)+coalesce(length(outcome),0)+coalesce(length(prevention_notes),0) from safety_incidents
  union all select 'expenses.description', created_at, length(description) from expenses where description is not null
) x group by f order by f;
```

## Phase 1 — COMPLETE. Phase 2 questions sent to Josh; build stopped until ruled.

## Phase 2 — RULED. All 17 answered by Josh, written into the spec with what each beat.

Merge NOT authorized. One branch per section, order F, C, D, E, A, B, H; Josh applies A's, D's
and H's migrations to production before each deploying merge. Section A is blocked on Josh's
production counts. Q8: secure password change is NOT to be recommended until a real recovery
round-trip on rebuild-test proves it safe. Q16: the row-policy hole is fixed in D.

**Branch layout:** `feature/s110-site-visit-access` carries the spec and this report. Each section
is built on its own branch cut from it (`feature/s110-f-route-guard`, …). Report appends land here,
through a separate worktree, so the section branches never conflict over this file.

## Phase 3 — Section F — branch `feature/s110-f-route-guard` @ `b624f58b` — **built and proven**

- `lib/api-contracts/estimate-files.ts` — response types for the two estimate-files routes. Both
  routes now `satisfies` them over a TYPED admin client (it was untyped, so `satisfies` would
  have checked `any`). Consumers import them: `estimate-files-tab.tsx` and `media.ts` `ListedFile`
  (now a `Pick` of the contract, previously hand-written — the #161 mechanism).
- `lib/api-contracts/registry.ts` — three contract routes (list/upload, per-file `/url`,
  `files/signed-url`), each with every consumer file and the fields it reads.
- `test/s110-route-contracts.test.ts` (CI unit suite) — walks `app components lib e2e test`, no
  truncation, asserts it read >400 files; per contract: consumer set exact both ways (1), every
  registered field still produced (2a), every consumer field registered (2b). **10/10.**

| proof | printed line |
| --- | --- |
| sabotage 1 — a new unregistered consumer (`lib/s110-sabotage-consumer.ts`) | `SABOTAGE1_EXIT_LINE=1`, test 1: _"unregistered consumers … ['lib/s110-sabotage-consumer.ts']"_; file removed |
| sabotage 2 — the #161 shape: `created_at` dropped from the GET select | `SABOTAGE2_EXIT_LINE=1` (2a: _"no longer returns … ['created_at']"_) **and** `SABOTAGE2_TSC_EXIT_LINE=2` (route no longer satisfies the type); restored, `cmp` identical |
| sabotage 3 — the follow-through: field removed from the registry and the type | `SABOTAGE3_EXIT_LINE=1` (2b: 2 consumers depend on it) **and** `SABOTAGE3_TSC_EXIT_LINE=2` — **red in `site-visit-record.tsx`**, the file #161 broke; restored, `cmp` identical |
| unit suite | `UNIT_EXIT_LINE=0`, **105 files / 1404 tests** |
| lint (changed files) | `LINT_EXIT_LINE=0` |
| `next build` | `BUILD_EXIT_LINE=0`, 129/129, BUILD_ID `_V99NAVfSNR9hONdyXfpJ` |

Limits, stated in the registry: a path built by concatenation or from a variable last segment is
invisible to the walk, and is disallowed for contract routes. No migration. Merge: awaiting Josh.
