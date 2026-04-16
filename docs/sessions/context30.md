# Session 30 — Module 3H: service layer, settings UI, OpenAI client, ai_tag_logs

**Date:** April 15, 2026
**Goal:** Continue Module 3H (AI photo auto-tagging via GPT-4o vision) — service layer + tag management UI, then as much of the API route foundation as time allowed.
**Outcome:** ✅ Service layer, settings UI, OpenAI client, and `ai_tag_logs` cost-tracking table all shipped. API route deferred to Session 31 — paused at session-end so it gets a fresh focused session rather than getting rushed.

---

## What shipped

### Service layer

- **Filename:** `apps/web/lib/services/tag-options.ts` (server, reads)
- **Filename:** `apps/web/lib/services/tag-options-client.ts` (client, writes)
- Mirrors the contacts.ts pattern exactly: server file does reads (no `companyId` param — RLS handles it), client file does mutations.
- **Server functions:** `getActiveTags()`, `getAllTags()`. Both order by `category` then `sort_order`.
- **Client functions:** `createTag()`, `updateTag()`, `deactivateTag()`, `reactivateTag()`. Deliberately NO `deleteTag()` — RLS allows owner-only hard delete, but per Session 29 design decision, deactivation is the normal flow. Hard delete risks orphaning historical references.
- Uses `Omit + intersection` to narrow the `category` CHECK column to a string-literal union.

### Settings UI for tag management

- **Route:** `/dashboard/settings/tags`
- **Filename:** `apps/web/app/dashboard/settings/tags/page.tsx` (server, role-gated)
- **Filename:** `apps/web/app/dashboard/settings/tags/tags-manager.tsx` (client, interactive)
- Owner/admin only — same redirect pattern as `/dashboard/settings`.
- Add tag form (name + category dropdown). Tags display grouped by category as colored pills. Each pill has a × (deactivate) or ↺ (reactivate) button. Deactivated tags render with strikethrough and gray styling but stay visible.
- Display-only capitalization: tags stored lowercase, first letter capitalized at render time. AI prompts and DB queries stay clean.
- Optimistic state updates after server-confirmed action.
- Uses inline styles (consistent with existing Module 3 pages — tracked under tech debt #49).

### OpenAI client

- **Filename:** `apps/web/lib/openai.ts`
- Lazy-initialized via `getOpenAI()` — mirrors the `getStripe()` pattern. Prevents Next.js build failures when `OPENAI_API_KEY` isn't present at build time.
- Server-side only. Comment header warns against importing from `'use client'` files.
- **Dependency:** added `openai` npm package to `apps/web/package.json`.
- This is the foundation for every future AI feature in FrameFocus (Module 4 estimating, Module 6 punch lists, Module 7 anomaly detection, Module 9 client summaries, Module 10 NL reports, Module 11 marketing).

### Migration 022 — column defaults for tag_options

- **Filename:** `supabase/migrations/20260415192808_add_tag_options_column_defaults.sql`
- Three `ALTER COLUMN ... SET DEFAULT` statements: `created_by = auth.uid()`, `updated_by = auth.uid()`, `company_id = get_my_company_id()`.
- **Why this was needed:** First attempt to create a tag from the settings UI returned 403. Root cause: the client `createTag()` insert didn't supply `company_id`, the table had no DEFAULT, so RLS compared `null = <user's company id>` and rejected the row.
- Fix mirrors Migration 018 (`files` column defaults) exactly. **This is now an established convention** — every per-tenant table needs `ALTER COLUMN company_id SET DEFAULT get_my_company_id()` from day one.

### Migration 023 — AI tagging add-on flag + cost log

- **Filename:** `supabase/migrations/20260415230317_add_ai_tagging_flag_and_logs.sql`
- **Two changes:**
  1. **`companies.ai_tagging_enabled`** — `BOOLEAN NOT NULL DEFAULT false`. Owner-toggleable add-on flag. UI lives on `/dashboard/billing` (owner-only — inherits the existing billing-page gate). Pricing/limits TBD.
  2. **`ai_tag_logs`** — append-only cost-tracking table. Columns: `id`, `company_id`, `file_id` (ON DELETE SET NULL — preserves cost data even after permanent file delete), `model`, `input_tokens`, `output_tokens`, `estimated_cost_usd` (NUMERIC(10,6) — sub-cent precision), `success`, `error_message`, `created_at`.
- **Deliberately NO standard audit columns** (`updated_at`, `created_by`, `updated_by`, `is_deleted`, `deleted_at`). Append-only audit logs follow this exception — same shape pattern as `trial_emails`. **MUST be documented in CLAUDE.md before next API route work — see tech debt #59.**
- **RLS:** owner/admin select per company; authenticated insert per company. No UPDATE/DELETE policies.
- **Indexes:** `idx_ai_tag_logs_company_id`, `idx_ai_tag_logs_created_at` (DESC).
- TODO comment in the migration flags `ai_tag_logs` as the data source for the future platform-admin per-company AI cost view.

---

## Decisions made

### 1. AI tagging is a paid add-on, not free with tier

- **Decision:** Will be sold as an add-on, not bundled into Starter / Professional / Business by default.
- **v1 implementation:** Boolean flag `companies.ai_tagging_enabled` (default false). Owner manually toggles it on. No Stripe wiring yet.
- **Rationale:** GPT-4o vision costs ~$0.005–0.01 per image. At scale, this is non-trivial. Need to charge for it to keep margins healthy.
- **Pricing model:** TBD. Options: flat monthly, per-image, per-MB. Decide before public launch.
- **Toggle UI location:** `/dashboard/billing` (owner-only, since it's billing-adjacent). NOT in tag settings.

### 2. Empty active tag list → skip AI call entirely

- **Decision:** If `getActiveTags()` returns 0 rows, the API route returns early without calling OpenAI. File uploads with no AI tags. No error shown to user.
- **Rationale:** Sending GPT an empty allowed-list returns garbage and wastes money. Easier to skip.

### 3. Server-side validation of GPT response

- **Decision:** GPT-4o output is validated server-side. Any tag returned that is NOT in the company's active tag list is **discarded**.
- **Why this is needed even with constrained prompting:** GPT-4o doesn't perfectly follow instructions. It may hallucinate tags. Trust the prompt, verify the output.
- **Future enhancement (tech debt #62, post-launch):** Capture discards instead of dropping them. They're signals that the company's tag list has gaps. Build aggregated review UI on the platform admin side.

### 4. Display-only capitalization for tags

- **Decision:** Tags stored lowercase. UI capitalizes first letter at render. AI prompts use the lowercase stored form.
- **Rationale:** Cheap, doesn't require migrating 66 seeded tags or handling case-insensitive uniqueness.

### 5. Cost logging built now (not deferred)

- **Decision:** `ai_tag_logs` table built in this session, before the first AI call ever fires.
- **Rationale:** Per context29 long-term notes, retroactively reconstructing per-company AI cost is painful. Building it now is cheap. The table is the data source for the future platform admin dashboard.

### 6. Platform admin dashboard deferred until 2nd paying customer

- **Decision:** Don't build the platform admin UI now. Foundation already exists (`platform_admins` table from Migration 001 + `is_platform_admin()` helper). When the 2nd paying customer signs up, build the minimum admin (companies list + AI cost summary) in one focused session.
- **Estimated effort when needed:** 2–3 sessions for a useful set of views.
- **Tracked as tech debt #61.**

### 7. Max 4 tags per image

- **Decision:** API route will cap GPT-4o output at 4 tags per image. Will be enforced via prompt instruction AND server-side truncation.
- **Rationale:** 4 tags is enough to capture multi-domain photos (e.g., `bathroom`, `plumbing`, `rough-in`, `damage` = 4 — covers area, trade, stage, condition). Lower than original 8 to keep file row UI uncluttered AND reduce output tokens (fewer output tokens = lower per-call cost). Output token savings are small per call (~$0.0003) but compound at scale.

### 8. Toggle on `/dashboard/billing`, column on `companies`

- **Decision (technical):** The `ai_tagging_enabled` column lives on the `companies` table (cleaner separation, simpler RLS). The toggle UI lives on the billing page (owner-only by inheritance).
- **Rationale:** Keeps the boolean out of the `subscriptions` table, which is written exclusively by the Stripe webhook. Adding a user-toggleable column there would muddy ownership.

### 9. Tags display alongside images, never burned into pixels

- **Clarification (mid-session product question):** AI tags and manual tags are stored as text in the `files.tags` and `files.ai_tags` columns. They are pure metadata — searchable, filterable, editable, removable — without ever modifying the image bytes in storage.
- **Display:** Tags render as small colored pill/chip labels next to or beneath the image (file row, fullscreen viewer, markup editor toolbar). Manual tags one color, AI tags another (or with an AI icon) so the source is visible.
- **Implication for the markup editor:** Markup is a separate JSONB overlay rendered as SVG over the image; tags are also separate metadata. Both stay structurally separated from the underlying image file. Burning either into the image is only relevant when exporting (see tech debt #53 — flattened markup export — and any future "share this photo with tags" export).

---

## Verifications run

- `npm run type-check` — clean (5/5 packages successful) after each new file.
- Tag settings page loaded in browser at `/dashboard/settings/tags` — all 66 seeded tags rendered, grouped correctly by category.
- Smoke test: deactivate tag → strikethrough + gray. Reactivate → blue + active. Add new tag → appears in correct category, count increments.
- 403 error on first create reproduced and fixed via Migration 022.
- TypeScript types regenerated after Migration 023 — `ai_tag_logs` and `ai_tagging_enabled` appear in `packages/shared/types/database.ts`.

---

## Gotchas caught

### 403 on first tag insert (root cause: missing column default)

- The client `createTag()` function only passed `name`, `category`, `sort_order`. Did not supply `company_id`.
- The original tag_options migration (020) did not set a DEFAULT on `company_id`. So insert sent `null`.
- RLS policy `WITH CHECK (company_id = get_my_company_id())` compared `null = <uuid>`, returned false, blocked the insert with 403.
- Fix: Migration 022 added `ALTER COLUMN company_id SET DEFAULT get_my_company_id()`. Same fix as Migration 018 for files.
- **Pattern lesson:** Every per-tenant table needs the column default from day one. The original `tag_options` migration should have included it. Going forward, this is a checklist item for any new table.

### Bash heredoc-style paste (false alarm)

Mid-session, Josh accidentally pasted the migration SQL into the terminal instead of saving it to the file. Bash spat out 30+ syntax errors. **Nothing was actually applied to the database** — bash just rejected each line as an invalid command. The file on disk was already saved correctly from the prior step. Verified with `cat` and re-pushed cleanly.

**Pattern lesson (already in CLAUDE.md):** Avoid heredocs for SQL. Use the editor. This was a paste mistake, not a heredoc, but the failure mode looked identical.

### `npm install openai` reported pre-existing audit warnings

`npm audit` showed 4 high-severity vulnerabilities. Initially looked like the `openai` package was the culprit. It wasn't — these are pre-existing in the dep tree. Logged as tech debt #58 to address pre-launch.

### `npm run dev` doesn't exist at repo root

Turborepo monorepo — root `package.json` doesn't have a `dev` script. Use `npm run dev --workspace=apps/web` instead. Worth remembering for fresh Codespaces sessions.

### `package-lock.json` lives at repo root, not per-workspace

First commit attempt failed with `pathspec 'apps/web/package-lock.json' did not match any files`. Turborepo keeps a single root lockfile. Adjusted the commit command and re-ran successfully.

### Codespace secrets supersede `.env.local`

The session-start snapshot warned `.env.local: MISSING — recreate from Vercel env vars before running the dev server`. Turned out to be unnecessary — Josh has env vars stored as **GitHub Codespace secrets**, which auto-inject into the shell environment. `printenv | grep -E "SUPABASE|STRIPE|OPENAI"` returned all values, and the dev server started cleanly without `.env.local` ever existing.

**Pattern lesson:** Don't recreate `.env.local` reflexively. Check `printenv` first. If Codespace secrets are populated, the dev server works without the file. Tech debt #35 (`.env.local` doesn't persist across Codespace rebuilds) is effectively resolved by this setup, though the underlying file behavior is unchanged.

### Migration 023 file is missing its top comment banner

Cosmetic only. The file on disk starts at `-- Two changes:` instead of the FrameFocus header banner (`-- =====...` and `-- FrameFocus — Migration 023:` lines were trimmed during paste). All SQL is intact and applied cleanly. A future audit reading just the file might think it's malformed — it isn't. Not worth re-editing.

---

## Tech debt summary

**Opened this session:** #58, #59, #60, #61, #62, #63 — see STATE.md for full details.
**Closed this session:** none. Module 3H still in progress.

---

## Module 3H — what's left for next session

**Foundation laid through Session 30 (8 of 10 work items done):**

- ✅ Schema (Session 29)
- ✅ Default tag list constant + seed function (Session 29)
- ✅ Service layer (Session 30)
- ✅ Settings UI for tag management (Session 30)
- ✅ OpenAI client (Session 30)
- ✅ Add-on flag column on companies (Session 30)
- ✅ Cost log table (Session 30)

**Remaining for Session 31+ (in recommended order):**

1. **CLAUDE.md update — append-only audit log convention** (tech debt #59). ~5 minutes. Do FIRST.
2. **API route `/api/files/auto-tag`** — the substantive work this session.
3. **Owner toggle UI on `/dashboard/billing`** for `ai_tagging_enabled`.
4. **Wire `/api/files/auto-tag` into upload flow** — fire-and-forget POST after `uploadFile()` succeeds. Image MIME types only.
5. **Display `ai_tags` on file row** — visually distinct from manual tags.
6. **Edit `ai_tags` on file row** — click to add, click X to remove. Per CLAUDE.md, any team member who can view the file can edit. No approval queue.

---

## API route prep — thorough notes for Session 31

> **Read this entire section before writing any code in Session 31.**

### Route shape

- **Path:** `apps/web/app/api/files/auto-tag/route.ts`
- **Method:** POST
- **Body:** `{ fileId: string }`
- **Response:** `{ success: boolean, tags?: string[], reason?: string }`
- **Auth:** Standard Next.js API route. Use `createClient()` from `lib/supabase-server` to get the user — RLS will scope DB queries.
- **Run on Vercel API route**, not Edge Function. Less infra to maintain.
- **Fire-and-forget from the upload form.** Caller doesn't wait for the response. Failures are non-blocking.

### Pre-flight checks (in order, bail early)

1. **Auth check.** If no user, return 401.
2. **Fetch file.** If file doesn't exist or user can't see it (RLS), return 404.
3. **MIME check.** If file MIME is not in image whitelist (`image/jpeg`, `image/png`, `image/heic`, `image/webp`), return 200 with `{ success: true, reason: 'not_image' }`. Not an error.
4. **Add-on flag check.** Fetch `companies.ai_tagging_enabled`. If false, return 200 with `{ success: true, reason: 'add_on_disabled' }`.
5. **Active tags check.** Call `getActiveTags()`. If empty, return 200 with `{ success: true, reason: 'no_tags_configured' }`. Don't waste an OpenAI call.

### OpenAI call

- **Model:** `gpt-4o` (vision-capable). Hard-code in the request; log the actual model returned in `ai_tag_logs.model` for future-proofing.
- **Image input:** Generate a signed URL for the file (mirrors the existing `/api/files/signed-url` route). Pass URL to GPT-4o vision.
- **Prompt structure (draft — refine in implementation):**

```
You are a construction-photo tagger for FrameFocus, a contractor management
platform. You analyze a single photo and select the most relevant tags from
a fixed allowed list.

Rules:
1. Pick AT MOST 4 tags.
2. ONLY pick tags from the allowed list below. Do not invent new tags. Do
   not modify the spelling or wording of any tag.
3. Pick a tag only if you are clearly confident it applies to the photo.
   Skip uncertain matches.
4. Return tags as a JSON array of strings, nothing else. No prose, no
   markdown, no commentary.

Allowed tags (grouped by category for context, but return only the tag
names, not the categories):

[INSERT GROUPED TAG LIST HERE — e.g.:
TRADE: framing, foundation, electrical, plumbing, ...
STAGE: pre-construction, rough-in, inspection, punch-list, ...
AREA: kitchen, bathroom, exterior, ...
CONDITION: damage, water-damage, completed-work, before, after, ...
DOCUMENTATION: receipt, delivery, change-order-evidence, ...]

Output format example:
["bathroom", "plumbing", "rough-in"]
```

- **Use OpenAI's structured output / JSON mode** if available for `gpt-4o-vision`. This forces JSON-shaped output and reduces parse failures. Worth checking the SDK docs at implementation time.
- **Temperature:** low (0.1–0.3). We want consistency, not creativity.
- **Max output tokens:** small (~50). 4 tags × ~15 chars = trivial output.

### Response handling

1. **Parse JSON.** If parse fails, log to `ai_tag_logs` with `success=false`, `error_message=<parse error>`. Don't write to `files.ai_tags`. Return 200 with `{ success: false, reason: 'parse_failed' }`.
2. **Validate against allowed list.** Build a Set of active tag names. Filter the GPT response: keep only tags that exist in the Set.
3. **Cap at 4.** Even though the prompt says max 4, double-check server-side. Slice to 4 if needed.
4. **Update `files.ai_tags`.** Write the validated array.
5. **Insert `ai_tag_logs` row.** Always insert, success or fail. Capture token counts and estimated cost.

### Cost calculation

- **OpenAI publishes prices** in dollars per million tokens. As of the knowledge cutoff, GPT-4o vision is roughly ~$2.50/M input, ~$10/M output, plus image-token cost based on resolution. **Verify current pricing at implementation time** — check `https://openai.com/api/pricing/` or the SDK docs.
- Pull `usage.prompt_tokens` and `usage.completion_tokens` from the OpenAI response.
- Calculate `estimated_cost_usd` = (input_tokens / 1_000_000) × input_price + (output_tokens / 1_000_000) × output_price.
- Store with 6 decimal precision (column is NUMERIC(10,6)).
- **Image tokens are bundled into prompt_tokens** in the OpenAI response — no separate calculation needed.

### Error handling

- **Network/timeout:** Catch, log to `ai_tag_logs` with `success=false`, return 200 with `{ success: false, reason: 'openai_error' }`. File still uploaded, just untagged. User can manually retag or click a future "Retag" button.
- **OpenAI rate limit:** Same as network error. Don't retry in v1. Manual retag if needed.
- **No retry logic in v1.** Adding retry adds complexity and can double-charge for partial failures. If it becomes a problem in production, add a "Retag" button or a background retry queue then.

### Confidence threshold — DECISION DEFERRED

GPT-4o vision does not return per-tag confidence scores natively. To get one, we'd need to ask in the prompt ("return [{"tag": "bathroom", "confidence": 0.95}, ...]"). This adds:

- More tokens (more cost)
- More parsing complexity
- A threshold value to tune (0.7? 0.8?)

**Session 30 decision: skip confidence scores in v1.** Rely on the prompt's "skip uncertain matches" instruction. Revisit if GPT is over-tagging in practice. This way we can always tighten the prompt later without changing the data shape.

### Security checks

- **Never log the OpenAI API key.** It comes from `process.env.OPENAI_API_KEY` via `getOpenAI()`.
- **Verify the user can see the file before signing the URL.** RLS will enforce this if we use the user's Supabase client (not the service role).
- **Don't return the full GPT response to the client.** Only return the validated tag list.

### Testing the route after build

1. With `ai_tagging_enabled = false`: upload an image → verify route returns `add_on_disabled`. No row in `ai_tag_logs`.
2. Set `ai_tagging_enabled = true` for Bishop Contracting. Re-upload → verify tags appear in `files.ai_tags` AND a row appears in `ai_tag_logs` with token counts and cost.
3. Upload a non-image file (PDF) → verify route returns `not_image`. No `ai_tag_logs` row.
4. Deactivate all tags in settings, re-upload → verify route returns `no_tags_configured`. No `ai_tag_logs` row.
5. Manually inspect cost. ~$0.005–0.01 per image expected.
6. **Discard logic test:** temporarily inject a fake "extra-tag" into the GPT response (or pick an unusual photo and pre-deactivate one of the tags GPT is likely to suggest). Verify the discarded tag does NOT appear in `files.ai_tags`. This confirms decision #3 (server-side validation) is wired correctly. Critical — failure here means GPT can pollute the tag space.

---

## Open questions remaining for Session 31

These are the items NOT decided this session and need decisions before code is written:

1. **Toggle UI exact placement on `/dashboard/billing`** — top of page? Below subscription summary? In a separate "Add-Ons" section? Probably its own clearly-labeled section.
2. **What does the toggle UI say to the user?** Need user-facing copy that explains "this is a paid add-on coming soon" without committing to pricing. Draft copy in Session 31 before building.
3. **Should the toggle be hidden if the company isn't on a Pro/Business tier?** Per the roadmap, AI features generally gate to higher tiers. Or is the add-on available to anyone who turns it on? Decide before building the UI.
4. **Display style for AI tags vs. manual tags** — different color? Small AI icon prefix? Both? Affects step 5 of the remaining work, not the API route.

---

## Commits this session

1. `ec23ca7` — `feat(tags): Module 3H — tag_options service layer (server + client)`
2. `0d13a1e` — `feat(tags): Module 3H — settings UI for tag management + column defaults (migration 022)`
3. `f73e332` — `feat(ai): Module 3H — OpenAI client + ai_tagging_enabled flag + ai_tag_logs table (migration 023)`
4. **Pending:** Session 30 closeout (STATE.md, CLAUDE.md, this file).

---

## Files touched this session

| File                                                                     | Change                                                                                               |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `apps/web/lib/services/tag-options.ts`                                   | Created — server reads                                                                               |
| `apps/web/lib/services/tag-options-client.ts`                            | Created — client writes                                                                              |
| `apps/web/app/dashboard/settings/tags/page.tsx`                          | Created — server, role-gated                                                                         |
| `apps/web/app/dashboard/settings/tags/tags-manager.tsx`                  | Created — interactive client component                                                               |
| `apps/web/lib/openai.ts`                                                 | Created — lazy `getOpenAI()` client                                                                  |
| `apps/web/package.json`                                                  | Added `openai` dependency                                                                            |
| `package-lock.json`                                                      | Updated to reflect new dep                                                                           |
| `supabase/migrations/20260415192808_add_tag_options_column_defaults.sql` | Created — Migration 022                                                                              |
| `supabase/migrations/20260415230317_add_ai_tagging_flag_and_logs.sql`    | Created — Migration 023                                                                              |
| `packages/shared/types/database.ts`                                      | Regenerated to include `ai_tagging_enabled` and `ai_tag_logs`                                        |
| `STATE.md`                                                               | Closeout updates (sub-status, tables, RLS, indexes, codebase tree, env var section, tech debt 58–63) |
| `CLAUDE.md`                                                              | Added AI Photo Auto-Tagging row to Subscription Tiers                                                |
| `docs/sessions/context30.md`                                             | This file                                                                                            |

---

## How to start Session 31

1. Open Codespace, `git pull`, run `bash scripts/session-start.sh`.
2. Open new Claude Chat with project knowledge loaded (CLAUDE.md, STATE.md, Quick Reference).
3. Paste session-start snapshot + this context file (context30.md).
4. **Goal: complete Module 3H** — API route, billing toggle, upload wiring, display, edit.
5. **First action of the session:** Address tech debt #59 — document the append-only audit log convention in CLAUDE.md `Database Conventions` section. Both `ai_tag_logs` and `trial_emails` use this pattern; CLAUDE.md must reflect it before the next per-tenant table gets built. ~5 min.
6. **Second action:** Decide the open questions in this file (toggle copy, tier-gating, display style).
7. **Third action onward:** Build the API route per the prep notes above. Reference: `apps/web/app/api/files/signed-url/route.ts` for route structure conventions.

---

## Long-term context

- **Module 3H establishes the AI integration pattern for the entire FrameFocus platform.** Every subsequent AI feature (Modules 4, 6, 7, 9, 10, 11) will reference this: the OpenAI client, the cost-logging pattern, the add-on flag pattern, the prompt design approach, the validation-after-response pattern. Build with that in mind. Shortcuts taken here become tech debt across half the platform.
- **Cost logging is now infrastructure.** Once the API route is built, every AI feature should log to `ai_tag_logs` (or a sibling table — possibly rename to `ai_call_logs` if it ends up serving multiple AI features. Decide in Session 31 once the route is functional.)
- **Add-on flag is the first one of many.** Module 11 (AI Marketing) will need a similar `ai_marketing_enabled` flag. The pattern established here (boolean on `companies`, owner-only toggle on `/dashboard/billing`) should be reused.
