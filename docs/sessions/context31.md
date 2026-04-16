# Session 31 — Module 3H: API route + ai-tagging service (the actual GPT-4o call)

**Date:** April 16, 2026
**Goal:** Tech debt #59 (CLAUDE.md append-only convention), then build and validate the `/api/files/auto-tag` route — the real GPT-4o vision integration.
**Outcome:** ✅ Convention documented. ✅ Service + route built, committed, all 6 validation tests passed. Module 3H's technical core is complete. Remaining work (billing toggle UI, upload wiring, display, edit UX) is all UI, deferred to Session 32.

---

## What shipped

### CLAUDE.md — append-only audit log convention (tech debt #59)

- **Location:** `CLAUDE.md` → Database Conventions section, inserted directly above the Trash-bin pattern block.
- **Content:** Documents that a narrow category of tables are pure append-only logs. These intentionally OMIT `updated_at`, `created_by`, `updated_by`, `is_deleted`, `deleted_at`. No UPDATE/DELETE RLS policies — SELECT (scoped appropriately) and INSERT only. Lists current examples: `ai_tag_logs` (Module 3H, Session 30), `trial_emails`.
- **Why this matters:** This pattern will recur. Any future event log or audit table should follow it. Having it in CLAUDE.md means the next AI feature build (Module 4, 6, 9, 10, 11) won't need to re-derive the convention from reading migrations.
- Commit: `a5a4...` (first commit of the session — see commits section below).

### AI-tagging service — `apps/web/lib/services/ai-tagging.ts`

The substantive logic file. Server-only. Reference implementation for all future AI features in FrameFocus.

**Exports:**

- `autoTagFile(fileId: string): Promise<AutoTagResult>` — runs the full pipeline for one file.
- `AutoTagResult` type — discriminated union: `{ success: true, tags: string[] } | { success: false, reason: string }`.

**Internal constants (documented at top of file):**

- `MAX_TAGS = 4` — server-enforced cap, also included in prompt (per Session 30 decision #7).
- `MODEL = 'gpt-4o'` — hardcoded in request; actual resolved model (`gpt-4o-2024-08-06`) logged from response for future-proofing.
- `IMAGE_MIME_TYPES` — whitelist: `image/jpeg`, `image/png`, `image/webp`, `image/heic`.
- `SIGNED_URL_TTL_SECONDS = 300` — 5 minutes, enough for GPT to fetch, short enough to limit exposure.
- `INPUT_COST_PER_M = 2.5`, `OUTPUT_COST_PER_M = 10.0` — OpenAI published GPT-4o prices (tracked as tech debt #64 for pre-launch re-verification).

**Pipeline (bails early to save cost):**

1. Auth check (reject if no user).
2. Fetch file row (RLS filters to user's company — also catches "file not found").
3. MIME check (bail with `not_image` if not in whitelist).
4. Add-on flag check (bail with `add_on_disabled` if `companies.ai_tagging_enabled = false`).
5. Active tags check (bail with `no_tags_configured` if `getActiveTags()` returns empty).
6. Sign short-lived URL for the image.
7. Build grouped tag list and prompt (per Session 30 prep notes — categories as context, allowed tag names only).
8. Call GPT-4o with `response_format: { type: 'json_object' }`, temperature 0.2, max_tokens 100.
9. Parse JSON response; if parse fails, log failure and return `parse_failed`.
10. Validate each returned tag against active tag set. Discard any not on list (this is the security property — proven by Test 5).
11. Cap at MAX_TAGS (redundant with prompt but belt-and-suspenders).
12. Always insert `ai_tag_logs` row (success or failure) with token counts and estimated cost.
13. On success with validated tags: update `files.ai_tags`.
14. Return structured result.

**Design choices worth calling out:**

- **RLS does the scoping.** We use the user's Supabase client (via `createClient()` from `@/lib/supabase-server`), not the service role. Fetching the file, reading `ai_tagging_enabled`, and inserting to `ai_tag_logs` all use the user's auth context. If RLS is wrong, this route won't work — forcing the security boundary to be correct in the DB, not in the app layer.
- **Always log, even on failure.** Cost tracking and debug trail are equally important. Failed calls still consume tokens.
- **Log `response.model`, not the hardcoded string.** OpenAI returns the specific model version (e.g., `gpt-4o-2024-08-06`). Logging the real version enables future cost analysis by model.
- **No retry logic.** Per Session 30 decision: v1 does not retry. If it becomes a problem, a "Retag" button or background queue gets added later. Retry on a failed call risks double-charge.

### API route — `apps/web/app/api/files/auto-tag/route.ts`

Thin. Parses `fileId` from POST body, calls `autoTagFile()`, returns result as JSON. Per the established convention (route = transport, service = logic).

Returns 400 for missing/invalid `fileId`. Everything else goes through the service's structured result — success or reason string. No 500s bubble up; failures are caught and logged in the service.

---

## Decisions made

### 1. Four open questions from context30 resolved

Locked at the start of the session before writing code:

1. **Who can toggle AI auto-tagging on?** Any tier — Starter, Pro, Business all see the toggle. Rationale: the add-on fee covers cost regardless of tier; gating it out of Starter pushes small contractors away from a feature that demos the platform well.
2. **How much copy on the toggle?** Short — one sentence + toggle. Minimal, fits in a row. Keeps the billing page uncluttered.
3. **Where on `/dashboard/billing`?** Its own "Add-Ons" section with a clear heading, exact placement decided at UI build time. Layout decisions are easier against a real page than in the abstract.
4. **How do we visually distinguish AI tags from manual tags?** Different colors AND an AI icon prefix — maximum visual distinction. Users need to know at a glance which tags were machine-generated so they trust the editing experience.

### 2. Log `response.model`, not the hardcoded constant

When the OpenAI SDK returns, the response includes the actual model version that ran (e.g., `gpt-4o-2024-08-06`). The service logs that, not the constant `'gpt-4o'`. Confirmed against the real log rows — all four test calls logged `gpt-4o-2024-08-06` even though we only sent `gpt-4o`.

**Why it matters:** When OpenAI rolls out a new version of `gpt-4o`, cost analysis needs to know which version actually served each call. Storing the resolved model enables that retrospectively.

### 3. Test 5 required temporary code injection to actually prove the filter

Initial Test 5 (deactivating `kitchen` and re-running the Kitchen.jpg call) returned 3 tags instead of 4. GPT respected the updated prompt and didn't suggest `kitchen`. That means the validation filter was never actually exercised — we couldn't distinguish "filter works" from "filter never had to work."

**Resolution:** Temporarily modified `ai-tagging.ts` to inject `'TEST_INJECTION_FAKE_TAG'` into GPT's parsed response before validation. Re-fired the call. Output was `["cabinets", "countertops", "completed-work"]` — the fake tag was discarded. Reverted immediately, verified with `git diff` (empty output).

**Why it was worth 3 minutes:** We're relying on this filter to prevent GPT from polluting the tag space. Proving it works once in a controlled scenario beats trusting the code was reviewable.

### 4. Leave `ai_tagging_enabled = true` on Bishop Contracting at session close

Normal practice would be to restore the DB to a neutral state. Kept it enabled because Session 32 will wire auto-tagging into the real upload flow — having the flag already on means the next session can immediately test end-to-end by uploading an image. Flagged in STATE.md Test Data section.

---

## Verifications run

- `npm run type-check` — clean after each new file (service, route).
- All 6 validation tests passed (see Test Results section below).
- `git diff apps/web/lib/services/ai-tagging.ts` — empty after Test 5 injection revert.
- `git --no-pager diff STATE.md` — inspected and corrected before commit.
- Manual cost inspection via SQL — avg $0.00382/call, well under estimated range.

---

## Test Results — all 6 passed

All tests run against Bishop Contracting, file `7d8f2531-252a-468a-ac7c-a30400f4f600` (Kitchen.jpg, image/jpeg) unless noted.

| #   | Test                                          | Expected                         | Actual                                                                       | Verification |
| --- | --------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------- | ------------ |
| 1   | `ai_tagging_enabled = false`                  | `add_on_disabled`, no log row    | `add_on_disabled`, 0 rows in `ai_tag_logs`                                   | ✅           |
| 2   | Real call after flipping flag on              | success + tags + log row         | 3 tags first call, 4 tags second call (both within MAX_TAGS cap), 2 log rows | ✅           |
| 3   | Non-image (new PDF upload, id `3855ced2-...`) | `not_image`, no log row          | `not_image`, still 2 log rows                                                | ✅           |
| 4   | All tags deactivated via SQL                  | `no_tags_configured`, no log row | `no_tags_configured`, still 2 log rows                                       | ✅           |
| 5a  | `kitchen` tag deactivated, re-run             | expected filter to fire          | returned 3 tags, GPT respected prompt, filter never exercised                | ⚠️ partial   |
| 5b  | Temporary injection of fake tag               | fake tag discarded               | returned `["cabinets", "countertops", "completed-work"]` — fake tag dropped  | ✅           |
| 6   | Cost inspection                               | ~$0.005–0.01 per call            | avg $0.00382 per call, $0.01528 total for 4 calls                            | ✅           |

**Final Test 2 output:** `["kitchen", "cabinets", "countertops", "completed-work"]` — genuinely useful tags on a construction photo (area + domain-specific + condition). Validates the prompt design.

**Token pattern:** input ~1,457 tokens per call (prompt + image), output 17–21 tokens (tiny JSON). 99% of cost is on input side — confirms Session 30 decision #7 (cap at 4, minimize output) was the right cost-vs-value call.

---

## Gotchas caught

### Commit from wrong directory fails

Running `git add apps/web/...` from inside the `apps/web/` directory produces `apps/web/apps/web/...` path errors. Needed to `cd /workspaces/FrameFocus` first. Easy to catch, but worth remembering.

### Terminal output truncation on long `git diff`

`git diff STATE.md` was truncated by the default pager (`less`). Had to use `git --no-pager diff STATE.md` to see the full output. Will affect any future large-file diff review.

### Wrong table inspection during testing

At one point I asked Josh to check `ai_tag_logs` and he checked the `ai_tags` column on the `files` table instead. Different things:

- `ai_tag_logs` — standalone table, per-call cost log.
- `files.ai_tags` — column on the files table where validated tags get written.

Worth being explicit about which one we're inspecting in future sessions.

### STATE.md tree drift — services files in two places

While updating STATE.md, discovered the codebase tree had `contacts.ts`, `subcontractors.ts`, `files.ts`, `tag-options.ts` listed BOTH under `dashboard/` (wrong — that's a page directory) AND under `lib/services/` (correct). The files only exist under `lib/services/`. Removed the duplicates from `dashboard/` and added the missing `subcontractors/` page directory entry. Unrelated to Session 31 work — pre-existing drift from earlier sessions. Tree now reflects reality.

### GPT-4o is non-deterministic even at temperature 0.2

Two back-to-back calls on the same photo returned different tag counts (3 vs. 4). Both correct and within cap. Means integration tests can't assert exact output — only that the response is well-formed and validated. Worth remembering when we build the next AI feature.

---

## Tech debt summary

**Opened this session:** #64 (GPT-4o pricing constants hard-coded — needs pre-launch review).
**Closed this session:** #59 (CLAUDE.md append-only convention — now documented).
**Still open from Session 30:** #58, #60, #61, #62, #63 — no change.

---

## Module 3H — what's left for Session 32+

**Foundation laid through Session 31 (9 of 10 work items done):**

- ✅ Schema (Session 29)
- ✅ Default tag list constant + seed function (Session 29)
- ✅ Service layer for tag management (Session 30)
- ✅ Settings UI for tag management (Session 30)
- ✅ OpenAI client (Session 30)
- ✅ Add-on flag column on companies (Session 30)
- ✅ Cost log table (Session 30)
- ✅ API route `/api/files/auto-tag` (Session 31)
- ✅ `ai-tagging.ts` service with all pipeline logic (Session 31)

**Remaining for Session 32+ (in recommended order):**

1. **Owner toggle UI on `/dashboard/billing`** for `ai_tagging_enabled`. Short copy, dedicated Add-Ons section, owner-only (inherits billing page gate). No tier gating.
2. **Wire `/api/files/auto-tag` into upload flow** — fire-and-forget POST after `uploadFile()` succeeds. Image MIME types only. Non-blocking.
3. **Display `ai_tags` on file row** — visually distinct from manual tags (different color + AI icon prefix).
4. **Edit `ai_tags` on file row** — click to add, click X to remove. Any team member who can view the file can edit. No approval queue.

The above 4 items are all UI. Estimated 1–2 sessions depending on pace.

---

## Commits this session

1. `bd6657a` — `docs(claude): document append-only audit log convention (tech debt #59)` (first commit, pre-route work)2. `c663424` — `feat(ai): Module 3H — /api/files/auto-tag route + ai-tagging service`
2. `c663424` — `feat(ai): Module 3H — /api/files/auto-tag route + ai-tagging service`
3. **Pending:** Session 31 closeout (STATE.md, this file).

---

## Files touched this session

| File                                       | Change                                                                                                                                                                                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CLAUDE.md`                                | Added append-only audit log convention block in Database Conventions section                                                                                                                                                                                                               |
| `apps/web/lib/services/ai-tagging.ts`      | Created — server-only, full autoTagFile() pipeline                                                                                                                                                                                                                                         |
| `apps/web/app/api/files/auto-tag/route.ts` | Created — thin POST route, delegates to service                                                                                                                                                                                                                                            |
| `STATE.md`                                 | Closeout updates: last-updated header, Module 3 row, 3H sub-status, codebase tree (api/files + lib/services), Test Data Bishop Contracting flag note, tech debt #64, corrected pre-existing tree drift (dashboard/ services-file duplicates removed, subcontractors/ page directory added) |
| `docs/sessions/context31.md`               | This file                                                                                                                                                                                                                                                                                  |

---

## How to start Session 32

1. Open Codespace, `git pull`, run `bash scripts/session-start.sh`.
2. Open new Claude Chat with project knowledge loaded (CLAUDE.md, STATE.md, Quick Reference).
3. Paste session-start snapshot + this context file (context31.md).
4. **Goal: complete Module 3H's UI work** — billing toggle, upload wiring, display, edit.
5. **Decision 1 (locked Session 31):** Billing toggle visible on ALL tiers (no tier gating). Dedicated Add-Ons section. Short copy.
6. **Decision 2 (locked Session 31):** AI tags get distinct color + icon prefix. Draft exact styling at UI build time.
7. **First task suggestion:** Build the billing toggle UI first — smallest and simplest remaining piece, unblocks real upload-flow testing. Bishop Contracting is already flipped on via SQL, so the toggle UI is immediately testable.
8. **Second task suggestion:** Wire upload → auto-tag (fire-and-forget POST). Verify end-to-end with a fresh upload.
9. **Third task suggestion:** Display ai_tags on file row with distinct styling.
10. **Fourth task suggestion:** Edit UX — add/remove individual AI tags inline.

---

## Long-term context

### Module 3H is the reference implementation for every future AI feature in FrameFocus

Every subsequent AI feature (Modules 4, 6, 7, 9, 10, 11) will reference this session's service layer:

- **Lazy OpenAI client** via `getOpenAI()` — reuse for every AI call.
- **Cost-logging pattern** — `ai_tag_logs` may be renamed `ai_call_logs` when the second AI feature ships (Module 4 estimating). Decide the naming at that time. Either way, every AI call gets logged with: model, input/output tokens, estimated cost, success/failure, error message.
- **Add-on flag pattern** — boolean on `companies`, owner-only toggle on `/dashboard/billing`. Module 11 AI Marketing will need an `ai_marketing_enabled` flag. Same shape.
- **Bail-early pre-flight checks** — ordered from cheapest to most expensive, bail on first failure. Saves money and surfaces problems fast.
- **Validation-after-response** — never trust LLM output. Validate against a known allowed set, discard anything not on it. This applies to any future AI feature that lets GPT pick from a constrained list (punch list items from Module 6, line-item suggestions from Module 4, etc.).
- **Log `response.model`, not the request constant** — OpenAI model versions drift, cost analysis needs the real version.

Shortcuts taken in Session 31 become tech debt across half the platform. None were taken. Good.

### The filter is the security property

Discarding unknown tags isn't a nice-to-have. It's what prevents a hallucinating GPT from gradually polluting every company's tag namespace with garbage. Every AI feature that accepts LLM output into persisted state needs the equivalent discard filter. Test 5's injection experiment proved the filter works for this feature — every future AI feature needs its own equivalent test.

### Cost posture so far

$0.00382 average per auto-tag call at current GPT-4o pricing. Rough arithmetic:

- 100 images/month per customer → $0.38/mo cost
- 1,000 images/month per customer → $3.82/mo cost
- 10,000 images/month per customer → $38.20/mo cost

That range tells us pricing — flat monthly for small customers, volume tiers or per-image pricing for heavy users. Decide when a second real customer signs up (linked to tech debt #61 — platform admin build).

### The UI work ahead is straightforward

All four remaining Module 3H items are well-scoped, no unknown integration risks, no new DB work, no new external APIs. The hard parts (prompt design, validation, cost logging, RLS posture) are done. Session 32 should feel like normal UI work.
