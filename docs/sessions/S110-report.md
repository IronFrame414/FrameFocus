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

## Phase 3 — Section C — branch `feature/s110-c-account-link` @ `cbd4c085` — **built; e2e NOT YET RUN**

- `app/m/mobile-shell.tsx` `NavSheet`: a full-width **"Your account"** row (`m-sheet-account`,
  `href="/m/account"`, `aria-current` on the page) directly above Sign out, every role (Q7). The
  Settings card link stays.
- `e2e/m-shell.spec.ts` A-3b: describe title superseded and quoted in place; the seven tiles are
  still asserted exactly; a new case measures the row (58 px, full width, directly above Sign
  out, not in the grid).
- New `e2e/m-account-link-s110.spec.ts`: **clicks** ☰ → Your account → the password form, as crew
  and as a subcontractor (the S109 link had never been clicked by any test).
- `tsc` 0, lint 0. ⚠️ **e2e held:** the Actions API shows 4–6 concurrent CI runs on rebuild-test
  (every pushed S110 branch, plus `main` and `feature/s110-docs`, which are not this session's).
  Stop rule: no second heavy consumer. To be run when the queue drains.

## Phase 3 — Section D — branch `feature/s110-d-line-rows` @ `075139c4` — **DB half proven; UI e2e NOT YET RUN**

- `20261720000000_line_row_reorder_and_containment.sql` → rebuild-test: dry run listed exactly this
  file; `DBPUSH_EXIT_LINE=0`; objects verified (`reorder_estimate_line_rows` INVOKER, anon ✗ /
  authenticated ✓; `enforce_line_row_containment` no grants; trigger `estimate_line_rows_containment`
  present); `db:types` +4 lines; `db:fingerprint` exit 0; `db:verify` exit 0, **LEDGER CLEAN**.
- **`#1-s110` filed and fixed** (Q16): `line_item_id` immutable on UPDATE, service role included.
- `test/s110-line-rows.live.ts` — **`LIVE_D_EXIT_LINE=0`, 11/11**, 0 fixtures left. Renumber incl.
  the duplicate-`sort_order` case; stale/partial list 22023 with order unchanged; PM own draft
  CONTROL passes beside PM-on-owner refused and owner-on-SENT 42501; rename CONTROL passes beside
  three re-parent refusals (23514), row stays put. ⚠️ First run red at 3b: the PM got **22023, not
  42501**. The PM cannot even SELECT the owner's rows, so the list check refuses before any
  UPDATE. That is the stronger refusal; the test now asserts it, with the reason in the file.
  42501 is covered by 3c.
- UI: one `ReorderGrip` for lines and rows (`items-tab.tsx`), row grip in the Type cell, native
  DnD within the line (upper half = before, lower half = after) plus ↑/↓. **D2: the grip focuses
  itself on mousedown.**
- **The D2 failure class, named:** _the thing inspected must be the thing being judged_ — the
  **wrong-scope** form. S109 T2 ran in Chromium only, which focuses a button on click by itself;
  it measured Chromium's default, not the handle. The new e2e dispatches a **synthetic**
  mousedown, which no browser focuses by default. `desktop-row-activation-s109.spec.ts` gains a
  header note (T2's focus claim is Chromium evidence only); nothing deleted.
- `test/s110-line-rows.test.ts` 10/10 (plan helpers + a pin on the grip's focus and on there
  being ONE draggable button). `tsc` 0, lint 0.
- ⚠️ **Production count owed (governs no existing row, cannot abort):**
  `select count(*) from estimate_line_rows;` — Josh applies `20261720000000` before D merges.
- **e2e `desktop-line-rows-s110.spec.ts` (R1 row, R2 line) and its sabotage (remove the
  `onMouseDown`) held** for the same CI-queue reason.

## Phase 3 — Section E1 — branch `feature/s110-e-carried-debt` @ `12feaa6c` — **built and proven (live + sabotage)**

### ⚠️ Q8's measurement — Supabase's password-change safeguards vs the emailed recovery link

Done on **rebuild-test only** with a throwaway user (`scratchpad/recovery-probe.mjs`, `PROBE_EXIT_LINE=0`).
Both settings were read first (`false`/`false`), toggled via the Management API, and **restored and
re-read equal to the original**. The throwaway tenant the signup trigger created was removed (0
users, 0 companies left). The round-trip used the **literal emailed link**
(`GET /auth/v1/verify?token=<token_hash>&type=recovery`, 303 with a session) and the server-side
`verifyOtp` path.

| setting ON | recovery-link session sets a password | a FRESH password session, no current password / nonce |
| --- | --- | --- |
| neither (today) | OK | OK |
| `security_update_password_require_reauthentication` (**"secure password change"**) | **OK — does not break recovery** | ⚠️ **OK — NOT stopped** (GoTrue exempts recent sessions) |
| `security_update_password_require_current_password` | **OK — does not break recovery** | **REFUSED** `400 current_password_required`; with `current_password` → OK |

**Report for Josh:** "secure password change" is **proven safe** for the recovery link, but it
**does not close the unlocked-device case** for a session signed in recently. The setting that does
is **"require current password"**. It is also proven safe for the recovery link, and it is the
real floor under a direct API call. It would have broken the Account page's password change,
which called `updateUser` without `current_password`. **That is fixed on this branch**:
`changeMyPassword` and `/reset-password` pass it. So **after E merges**, switching on "require
current password" in the production dashboard is safe by measurement. Switching it on **before**
E merges would break the Account page. **Recommendation, not action:** enable it after the E
merge. "Secure password change" adds little on top.

**Also measured:** a recovery session's `amr` is `[{method:"otp"}]`, **not `recovery`**. Option B
(`amr`) could not have told recovery from any other OTP sign-in. The ruled option A was the right
one.

### Built

- **Admin reset fixed first** (`lib/services/team.ts`, `team/[id]/actions.ts`): `generateLink`
  (no email, no PKCE verifier) → the SAME `handleAuthEmail` the hook uses (template, sender, rate
  cap, `email_logs`), link → new **`/auth/confirm`**, which runs `verifyOtp` server-side on any
  device. Recovery type only. _Old call quoted in place._ Outside production the send is
  gated, and the action now **throws with the gate's reason** instead of silently "succeeding".
- **`/auth/callback`** reads `redirectType === 'PASSWORD_RECOVERY'` (runtime field missing from the
  public type — read via a commented cast) and sets the marker.
- **`lib/auth/recovery-marker.ts`**: `ff_recovery`, httpOnly, HMAC (key HKDF-derived from the
  service-role key — nothing new to provision), bound to user + session id, 15 min, spent on use.
- **`/reset-password`**: a server page decides whether to show "Current password"; the change runs
  in the server action `resetPasswordFromPage` — marker OR current password. The browser no longer
  calls `updateUser`.

### Proof

| check | printed line |
| --- | --- |
| `s110-recovery-marker.test.ts` | `UNIT_E1_EXIT_LINE=0`, 7/7 (other session, other user, expired, edited body, bad/absent sig) |
| `s110-reset-password.live.ts` — real `/auth/confirm` GET + real server action | `LIVE_E1_EXIT_LINE=0`, **8/8**: A confirm → 307 `/reset-password`, session, httpOnly marker; A2 non-recovery/missing token refused; **N** no marker → refused, unchanged; **X** the real marker copied onto a password session → refused; **F** forged sig → refused; **R** recovery + marker → set without current; **S** marker spent; **C** wrong current refused, right current changes |
| sabotage 1 — `recovery = true \|\| …` | `SABOTAGE_E1_TRUST_EXIT_LINE=1`, 6 red (N, X, F first); restored `cmp` identical |
| sabotage 2 — marker ignores the session id | `SABOTAGE_E1_BINDING_EXIT_LINE=1` (X red) and `SABOTAGE_E1_BINDING_UNIT_EXIT_LINE=1`; restored `cmp` identical |
| clean re-run | `LIVE_E1_CLEAN_EXIT_LINE=0`, 8/8; fixtures 0 users / 0 companies |
| `s109-change-password.live.ts` (now passes `current_password`) | `LIVE_S109_PW_EXIT_LINE=0`, 6/6 |
| S157 sweep | `s109-password-wiring` asserted the redirect in `page.tsx` — **inverted in place**, old regex quoted; now also asserts the browser does not call `updateUser`. `s175` B6 unaffected. |

⚠️ Not built, stated: a SELF-SERVICE reset link opened on a different device from the one that
requested it still fails (PKCE verifier). This is the pre-existing limit named in S110 Phase 1, and
not in Q8's scope.

## Phase 3 — Sections E2–E4, and E's final gate — branch `feature/s110-e-carried-debt`

- **E2 (Q9 → A)** `catalog-list.tsx`: the name is plain text; a separate labelled **"Vendor ↗"**
  link. `s110-catalog-vendor.test.ts` 3/3; sabotage (name re-wrapped in the link) →
  `SABOTAGE_E2_EXIT_LINE=1`; restored `cmp` identical.
- **E3 (Q10 → A)** — new `components/files/sheet-link.tsx` (real `href`, so a modified click still
  opens a tab; a plain click opens the sheet; `fileId` re-signs on the staff session, and with no
  `fileId` it reuses `href`). Eight staff sites migrated (project file **View**, lien releases,
  both "View form"s, delivery photos, receipts, **View Signed Proposal** — no longer navigates
  away — and PO **View PDF**, with `/api/pos/[id]/pdf` inline only for `?view=1`).
  **Portal:** `FileSheetProvider` in `app/portal/layout.tsx`; Shared documents open the sheet with
  **only the already-signed URL**; photos untouched and view-only.
  `s110-file-sheet-sites.test.ts` 14/14 (+ `s109-file-sheet` 21/21 unchanged); sabotage (a
  `fileId` on the portal link) → `SABOTAGE_E3_PORTAL_EXIT_LINE=1`; restored `cmp` identical.
  ⚠️ **Proven by source assertion, not in a browser.** No e2e drives these nine sites yet.
- **E4 (Q11)** `#1-deliv` → `TECH_DEBT_CLOSED.md` (summary + "full text in git history"); the
  Stripe event-shape check **re-filed as `#2-s110` in the same commit**; `#161` status line
  records the S110 migration and that the inline-only surfaces remain.

### ⚠️ Two defects that the final gate caught, both mine, both fixed

1. **`next build` failed: `BUILD_EXIT_LINE=1`** — `lib/services/team.ts` is imported by a CLIENT
   component (`team-page-client.tsx`), and the E1 change pulled the server-only `handleAuthEmail`
   into it. **`tsc` and the full unit suite were both green over it.** Fixed by moving
   `resetTeamMemberPassword` to server-only `lib/services/team-reset.ts`. CI saw the same thing: runs
   `35932967573` and `35933424621` failed at "Build (production)".
2. **`tsc` failed on the E1 live test** (`data!.properties` possibly null). vitest does not
   type-check, so the live run was green. CI run `35932967573` failed "Type check" on it. Fixed and
   committed separately.

### E final gate

| check | printed line |
| --- | --- |
| unit (whole suite) | `UNIT_EXIT_LINE=0`, **107 files / 1418 tests** |
| `tsc` | `TSC_EXIT_LINE=0` |
| `next build` (after fix 1) | `BUILD_EXIT_LINE=0`, **130/130** (`/auth/confirm` is the new page), BUILD_ID `Jwtgu_rawAF1IvHEQL4Lf` |
| lint (changed files) | `LINT_EXIT_LINE=0` |

### C and D — `next build` now run (it had not been)

| branch | printed line |
| --- | --- |
| `feature/s110-c-account-link` | `BUILD_EXIT_LINE=0`, 129/129, `6XzTzwtT6cHfUyyNqTuON` |
| `feature/s110-d-line-rows` | `BUILD_EXIT_LINE=0`, 129/129, `4HL7mKLSMN6f59IcnmKGk` |

### CI queue (Actions API), and why no local e2e

F, C and D CI runs have been `in_progress` for 30+ minutes. That is four concurrent e2e suites on
rebuild-test, one per pushed S110 branch, which is the "push after every commit" cost the S108
report predicted. **Each runs the whole e2e suite, so the new C and D specs get a CI result
there.** A local run on top would be the second heavy consumer the prompt forbids. D's UI sabotage
(remove `onMouseDown`) still needs one local run once the queue is idle.

## Section A — ⚠️ BLOCKED on Josh's production counts (FILLED-A.8 queries 1–3). B depends on A.
Per Josh: not idling. Moving to Section H's parts that do not touch `SiteVisitRecord`.

## Phase 3 — Section H (started early, A being blocked) — branch `feature/s110-h-language`

Cut from the docs branch, then **C merged in** (`3c9988d1`) so H stacks on C's `mobile-shell.tsx`
change instead of conflicting with it. Merge order F, C, D, E, A, B, H is unchanged.

### Database — `20261750000000_language_and_translations.sql` → rebuild-test

`profiles.language` (`'en'|'es'`, NOT NULL DEFAULT `'en'`, CHECK) and the self-edit guard admitting
it; `text_translations` (the Q12 cache — RLS on, **no policies**, service role only);
`ai_translation_logs` (3H cost log, owner/admin SELECT). Dry run listed exactly this file;
`DBPUSH_EXIT_LINE=0`; column and RLS verified; all 10 rebuild-test profiles read `en`;
`db:fingerprint` 0; `db:verify` 0 **LEDGER CLEAN**. The tenant-deletion walk gained
`text_translations` (deleted with the tenant), and `ai_translation_logs` survives detached (S137 Q1).
Census tests 46/46.
⚠️ **Rebuild-test is shared by every section branch.** The push needed D's `20261720000000` present
locally, so it was copied in **untracked** (never committed on H). **H's generated
`database.ts` and fingerprints therefore include D's RPC.** Regenerate them (`npm run db:types`,
`db:fingerprint`) when the branches land.
**Production count owed:** `select count(*) from profiles;` — the CHECK governs every row, but every
row takes the default `'en'`, which satisfies it.

### Built, with proof

| piece | proof |
| --- | --- |
| `LanguageForm`, ONE form on `/dashboard/account` and `/m/account` (ruling 1) | tsc/lint; drives `updateMyLanguage` (RLS + the column guard) |
| `LanguageProvider` — `uiLang` (/m = user's, /dashboard pinned `en`, ruling 2) and `readerLang` (both surfaces, ruling 3) | layouts wired; shared components never inspect their route |
| **anti-rot guard** `s110-m-i18n-guard.test.ts` (TS-AST scan of all 131 files /m can render; PENDING ratchet) | **`SABOTAGE_GUARD_EXIT_LINE=1`** — a hard-coded `<p>` on `/m/notifications` is named with its line |
| **/m migrated**: 1011 strings / 80 files → `t()` in five area tables (5 parallel agents on disjoint files, then chips, gender agreement and 4 unowned labels by me) | guard 134/134; ratchet now holds **only** `site-visit-record.tsx` (60) and `voice-notes.tsx` (20), deferred until A |
| `/api/translate` + `lib/translation/translate.ts` (Q12: on read, cached by company + sha256 + target + model; the original is never written; gpt-4o-mini; output validated; cost row on success and failure) | unit 5/5; **live 5/5 against the real model**: Spanish → English with a cost row, cache hit spends nothing, English → null, **a client refused 403 before any spend** |
| `UserText` (Q13: translation + "Translated from Spanish · show original"; original while pending/failed) | built; wired into screens next |
| **ruling 5** `s110-client-facing-english.test.ts` — from 19 roots + 14 root dirs, no import closure reaches translation, and nothing mounts a provider | 7/7; **two sabotages red** (UserText imported into the portal; a provider mounted in the portal layout) |
| gate | unit **1540/1540**, `tsc` 0, lint 0, `next build` **130/130** `OY6oG28vQ1-syf43GX0Po` |

### ⚠️ Twice this section, a sabotage that DID NOT APPLY read as a pass — caught, then redone

1. **Translate route, client refusal.** `sed` matched nothing (Prettier had reflowed the `Set`), and
   the run printed `SABOTAGE_TRANSLATE_CLIENT_EXIT_LINE=0`, a pass. The replacement count (`0`)
   gave it away. Redone with a checked replacement → **`=1`**, X red.
2. **Portal provider.** The anchor targeted E's portal layout, which is not on this branch.
   `grep -c` printed `0` and the run passed. Redone against this branch's layout → **`=1`**.
Both are the named class ("a probe that cannot fail"). **Every sabotage now prints its replacement
count before its exit line.**

Also measured and recorded in the test: under vitest 4, a `beforeEach` that resets or clears a
mock makes a later throwing implementation fail the test **even though the code caught the
error**. Reproduced with and without the hook; the test asserts call-count deltas instead.
