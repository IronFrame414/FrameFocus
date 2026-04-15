# Session 29 — Module 3H foundation: tag_options schema + seeding

**Date:** April 15, 2026
**Goal:** Start Module 3H (AI photo auto-tagging via GPT-4o vision).
**Outcome:** ✅ Foundation complete — schema, seed function, default tag list. AI integration deferred to next session.

---

## What shipped

### Schema (Migration 020)

- **Filename:** `supabase/migrations/20260415182405_add_tag_options_table.sql`
- **Table:** `tag_options` — per-company tag catalog. Columns: `id`, `company_id`, `name`, `category` (CHECK: trade/stage/area/condition/documentation), `is_active`, `sort_order`, standard timestamps + audit columns. UNIQUE (company_id, name).
- **Indexes:** `idx_tag_options_company_id`, partial `idx_tag_options_company_active` WHERE `is_active = true`.
- **Triggers:** `tag_options_updated_at` (timestamp), `tag_options_set_updated_by` (mirrors files/contacts/subcontractors pattern).
- **RLS (4 policies):**
  - SELECT — anyone in company (active + inactive readable; needed for filter UI to show historical tags on existing files)
  - INSERT — owner/admin
  - UPDATE — owner/admin
  - DELETE — owner only (rare; deactivation is the normal flow)

### Default tag list (TypeScript constant)

- **Filename:** `packages/shared/constants/default-tags.ts`
- **Content:** 66 tags total across 5 categories:
  - **trade** (22): framing, foundation, concrete, masonry, roofing, siding, windows, doors, insulation, drywall, painting, flooring, tile, cabinets, countertops, trim-and-millwork, electrical, plumbing, hvac, landscaping, demolition, excavation
  - **stage** (7): pre-construction, site-prep, rough-in, inspection, punch-list, final-walkthrough, post-completion
  - **area** (17): kitchen, bathroom, bedroom, living-room, dining-room, basement, attic, garage, exterior, yard, driveway, deck-or-patio, stairs, hallway, laundry-room, office, mechanical-room
  - **condition** (12): damage, water-damage, mold, pest-damage, code-violation, safety-hazard, defect, existing-condition, progress, completed-work, before, after
  - **documentation** (8): receipt, delivery, material-sample, selection, change-order-evidence, warranty-claim, daily-log, client-requested
- **Exports:** `TagCategory` type, `DefaultTag` interface, `DEFAULT_TAGS` array.
- **Sort order:** Each category uses a 100-block (trade=100s, stage=400s, area=500s, condition=700s, documentation=900s) with 10-step intervals between items. Leaves room for inserts.

### Seed function + trigger patch (Migration 021)

- **Filename:** `supabase/migrations/20260415183855_seed_default_tags_on_company_create.sql`
- **`seed_default_tags(p_company_id UUID)`** — SECURITY DEFINER plpgsql function. Inserts all 66 tags via single `INSERT ... VALUES (...), (...), ...` with `ON CONFLICT (company_id, name) DO NOTHING`. Idempotent — safe to re-run.
- **`handle_new_user()` patch** — full function redefined (preserving invite path, owner path, trial logic) with one new line at the end of the OWNER PATH: `PERFORM public.seed_default_tags(v_company_id);`. Only fires on owner signup; invited users join an already-seeded company.
- **Drift warning:** Header comment in both the SQL migration AND the .ts file flags that they MUST be kept in sync. See "Open tech debt" below.

### Other commits this session

- **`style(markup): tweak color palette and stroke widths`** — leftover uncommitted change from a previous session in `markup-editor.tsx` (added cyan + reorganized COLORS array, expanded STROKE_WIDTHS). Cleared before starting 3H.

---

## Decisions made

### 1. Architecture: per-company editable tag list

- **Decision:** Each company gets the default 66-tag list seeded on signup. Owner/Admin can add, rename, deactivate.
- **AI constraint:** GPT-4o will be passed the company's currently-active tags and instructed to choose only from that list.
- **Rationale:** Stable, low-maintenance for Josh; flexible per-company; AI behavior is deterministic relative to a known list.

### 2. Multi-tag, not single-tag

- **Decision:** AI returns multiple tags per image. A bathroom rough-in photo with damage gets `bathroom`, `plumbing`, `rough-in`, `damage` (4 tags).
- **No max enforced in schema** — AI prompt will cap at a reasonable number (TBD next session, likely 5–8).

### 3. Deactivated tags stay on existing files

- **Decision:** Deactivating a tag in settings stops it from being applied to NEW uploads. It does NOT strip it from files already tagged with it.
- **Rationale:** Preserves history; supports legitimate reasons to retire a tag without rewriting old data.
- **UI implication:** Filter UI must read both active + inactive tags (RLS SELECT policy reflects this).

### 4. Boolean column on `files` for favorites — already shipped Session 28, mentioned here only because we contrasted it: tag_options needed a separate table because it's many-tags-per-company; favorites was correctly a boolean.

### 5. Where the seed list lives: SQL trigger + .ts constant (parallel)

- **First instinct:** TypeScript constant as single source of truth, app code calls a seed function on signup.
- **Reality:** New companies are created entirely by the `handle_new_user()` Postgres trigger. There's NO app-side post-signup hook to attach to.
- **Decision:** SQL trigger seeds (hardcoded list inside `seed_default_tags()`). The .ts constant is kept as a readable source for future use (e.g., "reset to defaults" button, or admin-side reference).
- **Tradeoff accepted:** Drift risk between SQL and .ts. Mitigation: comment headers in both files; tech debt item to add automated sync check pre-launch.

### 6. AI call will run from a Next.js API route (not Edge Function)

- **Decision (planning, not yet implemented):** `/api/files/auto-tag` route on Vercel. Fire-and-forget POST after upload completes.
- **Why not Edge Functions:** more infrastructure to maintain, more places to check logs, more deploy pipelines. Vercel API route uses existing infra.
- **Why not from the browser:** would expose `OPENAI_API_KEY`. Off the table.
- **Failure mode:** if the API call fails, the file is still uploaded and usable, just untagged. Easy manual retry.

### 7. Upload UX

- **Decision:** Upload completes immediately. Tags appear a few seconds later when GPT-4o responds.
- **Implication:** Need a way to show "tagging in progress" state on the file row. UI pattern TBD next session.

### 8. Image files only — PDFs not auto-tagged

- **Decision:** Only image MIME types (jpg, png, heic, webp) get sent to GPT-4o. PDFs and other files skip auto-tagging entirely.

---

## Verifications run

- `tag_options` table created in remote Supabase — confirmed via `information_schema.columns` query (10 columns present).
- `seed_default_tags()` callable — manually invoked for Bishop Contracting, inserted 66 rows.
- Counts per category verified: area=17, condition=12, documentation=8, stage=7, trade=22 → total 66. Matches the .ts constant exactly.
- TypeScript types regenerated — `tag_options` appears in `packages/shared/types/database.ts`.
- Other test companies ("test const", "test construction") have 0 tags — Josh confirmed not worth backfilling (forgotten test accounts).

---

## Gotchas caught

### Empty migration file from accidental double-run

When running `npx supabase migration new add_tag_options_table` early in the session, the command appears to have fired twice (or the chat cut off output and we re-ran), creating two files:

- `20260415182317_add_tag_options_table.sql` — empty
- `20260415182405_add_tag_options_table.sql` — the real one

Both got applied to the remote DB on `npx supabase db push`. The empty one is now permanently in `supabase_migrations.schema_migrations` on remote.

**Resolution:** Left the empty file in the repo with a one-line comment explaining it's intentional. Trying to "fix" the remote migration history is exactly the kind of patching to avoid. Future `db push` and `migration list` commands won't drift.

### Chat paste truncation on long terminal output

Multiple times this session, `cat` and `tail` commands had their last 1–3 lines cut off in the chat (not in the terminal). Once it caused us to think a SQL file was missing its closing `);` when it wasn't — Josh used a screenshot to verify. **Pattern to remember:** if a file looks truncated but the editor shows it complete, trust the editor. Use `wc -l` for length checks rather than visual inspection of `cat` output.

### Supabase CLI update prompt is noise

CLI nags about updating to v2.90.0 (currently v2.88.1) on every `db push`. Skipped this session — wrong time to update tooling mid-build. Worth doing at the start of a fresh session.

---

## Tech debt opened

| #   | Item                                                                                                                                                                                                                                                                     | Priority   | Notes                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | --------------------------------------------------- |
| 56  | **SQL/TS tag list drift risk.** `seed_default_tags()` SQL function and `DEFAULT_TAGS` in `packages/shared/constants/default-tags.ts` must stay in sync manually. Add automated check before public launch — likely a script that diffs the two and fails CI on mismatch. | Pre-launch | Both files have header comments warning about this. |
| 57  | **Empty migration file `20260415182317_add_tag_options_table.sql`** — kept in repo intentionally because it's been applied to remote. Cosmetic noise in the migrations folder. No action needed; documenting for future-Josh.                                            | Won't fix  |                                                     |
| 58  | **Backfill seed for existing test companies** — "test const" and "test construction" have 0 tags. Skipped because Josh doesn't use them. If they ever get cleaned up via test data wipe, this self-resolves.                                                             | Won't fix  |                                                     |

---

## Tech debt closed

None this session. (Module 3H is in progress; nothing closes until 3H is complete.)

---

## Module 3H — what's left for next session

**6 remaining steps** (rough order):

1. **Service layer for `tag_options`** — `apps/web/lib/services/tag-options.ts` (server) + `tag-options-client.ts` (client). Functions: `getActiveTags(companyId)`, `getAllTags(companyId)` (incl. inactive for filter UI), `createTag()`, `updateTag()`, `deactivateTag()`, `reactivateTag()`. Follow existing pattern (Pick<> or Omit+intersection from generated types).
2. **Settings UI for tag management** — new page (likely `/dashboard/settings/tags` or section within existing settings page). List by category, add new tag (name + category dropdown), toggle active/inactive, rename. Owner/admin only.
3. **API route `/api/files/auto-tag`** — POST endpoint, accepts `{ fileId }`. Fetches file metadata → fetches signed URL → calls GPT-4o vision with constrained tag list → writes to `files.ai_tags`. Server-side OpenAI key.
   - **Open: cap on tags per image** — likely 5–8.
   - **Open: prompt design** — pass active tag list, ask GPT-4o to pick the most relevant ones, return JSON.
   - **Open: confidence threshold?** GPT-4o vision doesn't return confidence scores natively; if we want one we'd need to ask in the prompt.
4. **Wire into upload flow** — modify `upload-form.tsx` to fire `/api/files/auto-tag` after `uploadFile()` succeeds. Fire-and-forget (don't block redirect). Only for image MIME types.
5. **Display `ai_tags` on file row** — visually distinct from manual `tags`. Possibly a different color/icon to make AI-vs-human clear.
6. **Allow editing `ai_tags` on file row** — click to add, click X to remove. Per CLAUDE.md, any team member who can view the file can edit. No approval queue.

### Open product questions to decide before/during step 3

- **Max tags per image?** Probably 5–8.
- **What if GPT-4o returns a tag NOT in the company's active list?** Validate server-side and discard. Don't trust GPT to follow instructions perfectly.
- **What if the active tag list is empty?** (Owner deactivated all tags.) Skip the AI call — no point.
- **Retry on failure?** First version: no retry. If a call fails, file is just untagged. Manual re-trigger via "Retag" button later if needed.
- **Cost monitoring?** Each GPT-4o vision call costs money. Should we log calls per company for future billing/abuse prevention? Probably yes — a `ai_tag_logs` table tracking timestamp, file_id, company_id, tokens used, cost. Defer to step 3 implementation.

---

## Commits this session

1. `1146925` — `style(markup): tweak color palette and stroke widths` (housekeeping)
2. `a263567` — `feat(tags): Module 3H — tag_options table + RLS (migration 020)`
3. `62bfb1f` — `feat(tags): Module 3H — seed_default_tags() function + handle_new_user() patch (migration 021)`

(STATE.md update commit pending after this file is finalized.)

---

## Files touched this session

| File                                                                           | Change                                          |
| ------------------------------------------------------------------------------ | ----------------------------------------------- |
| `apps/web/app/dashboard/projects/[id]/files/[fileId]/markup/markup-editor.tsx` | Committed pending color/stroke palette changes  |
| `supabase/migrations/20260415182317_add_tag_options_table.sql`                 | Created (empty, with explanatory comment)       |
| `supabase/migrations/20260415182405_add_tag_options_table.sql`                 | Created — tag_options table + RLS               |
| `supabase/migrations/20260415183855_seed_default_tags_on_company_create.sql`   | Created — seed function + handle_new_user patch |
| `packages/shared/constants/default-tags.ts`                                    | Created — 66-tag default list                   |
| `packages/shared/types/database.ts`                                            | Regenerated to include tag_options              |

---

## How to start the next session

1. Open Codespace, `git pull`, run `bash scripts/session-start.sh`.
2. Open new Claude Chat with project knowledge loaded.
3. Paste session-start snapshot + this context file (context29.md).
4. State goal: **"Continue Module 3H — service layer + tag management UI."** Or if appetite/time is short, do just the service layer.
5. **Before writing any code**, decide the open product questions in step 3 above (max tags per image, behavior on empty active list, cost logging).
6. The first build step is the service layer (`tag-options.ts` + `tag-options-client.ts`) following the pattern from `files.ts`/`contacts.ts`.

---

## Long-term context for the next session

- Module 3H is the **first AI feature in the entire FrameFocus platform.** Patterns set here (API route structure, error handling, prompt design, cost logging) will be referenced by every subsequent AI feature: Module 4 estimating suggestions, Module 6 punch-list-from-media (post-launch), Module 7 budget anomaly detection, Module 9 client summaries, Module 10 NL reports, Module 11 marketing content. Build with that in mind. A throwaway approach here will create technical debt downstream.
- Consider extracting `apps/web/lib/openai.ts` (lazy `getOpenAI()` client, mirroring the `getStripe()` pattern) when building step 3, even though only one feature uses it now. Future AI features will all need it.
- The `ai_tag_logs` table idea (cost tracking) is worth building NOW, not later. Once usage scales, retroactively reconstructing AI cost-per-company is painful.
