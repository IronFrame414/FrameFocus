# Session 48 — Module 4 estimating: 4B + 4C built, verified, pushed; MCP tooling installed

> Branch: `feature/estimating-4b-4c` — PUSHED to origin (backed up), NOT merged to main
> Model: Claude Code on Fable 5, bypass-permissions mode

---

## What happened

Resumed after a long gap. Ground-truthed via git: Session 47 was docs-only (Serena + Context7 added to the tooling list, never installed). HEAD was a kickoff.md typo fix.

**Environment brought back up:**

- Reinstalled Claude Code (lost on rebuild): `npm install -g @anthropic-ai/claude-code` (v2.1.172).
- Switched Claude Code to Fable 5 (`/model fable`; requires CC >= 2.1.170; burns limits ~2x Opus).
- Supabase project had been **paused** — un-paused. Re-linked the CLI (`login` + `link --project-ref jwkcknyuyvcwcdeskrmz`).
- Reinstalled `uv` (lost on rebuild) for Serena: `curl -LsSf https://astral.sh/uv/install.sh | sh`.

**Scope locked (minimum launch):**

- IN: 4B, 4C, 4D, 4E, 4F, 4J, 4K, 4M, and Module 5 (Projects — top priority).
- OUT (deferred): 4G versioning, 4H pipeline analytics, 4I AI assistant, 4L estimate-attachments UI.

**Specs written** and saved to `docs/specs/` as `4B-spec.md` / `4C-spec.md` (matching the `4A-spec.md` convention).

**Built via Claude Code on `feature/estimating-4b-4c`:**

- **4B — Cost Catalog:** `cost_catalog` migration (table, per-tenant defaults, triggers, RLS), regenerated types, `cost-catalog-client.ts`, Zod, catalog UI at `/dashboard/catalog`. Commits `0c2954b`, `a42f96b`, `4f3dd00`.
- **4C — Estimates:** `estimates` + 6 related tables, `companies` ALTER (markups, terms, prefix, tax), `next_estimate_number()` fn, `set_winning_bid()` RPC, full RLS, Zod (`estimate.ts` + `estimate-items.ts`), services (`estimates-client.ts` + `estimate-items-client.ts`). Commits `a821bc5`, `73bde4e`, `d34dd74`.

**Decisions locked:** B1 ILIKE; B2 catalog read-only by direct URL, hidden from nav; D1 `project_id` nullable UUID **no FK** (FK deferred to Module 5); D2 PM sees own only; D3 frozen-when-Sent in service + RLS; D4 child RLS = company scope + `EXISTS(parent visible)`; D5 row-locking numbering fn; D6 one atomic 4C migration; sub-bid FK `ON DELETE CASCADE` on `line_item_id`; `set_winning_bid` as RPC.

**Verification:** all acceptance checks passed (tsc clean; numbering EST-001/002 per company; Owner all / PM own / Crew none; sent estimates reject edits + child inserts; partial unique index blocks 2nd winner; cross-tenant isolation 0/0/0). Manual browser smoke test of the catalog UI (CRUD + search + filter) passed as Owner.

**Pushed:** branch backed up to `origin/feature/estimating-4b-4c` (8 commits). Not merged.

**MCP tooling installed this session** (completes the Session 47 plan), both project-scoped in `.mcp.json`, both approved and **connected**:

- **Context7** — remote HTTP (`https://mcp.context7.com/mcp`). Pure URL, survives rebuilds.
- **Serena** — local stdio via `uvx` (`oraios/serena`, `--context ide-assistant`). NOTE: depends on `uv`, which is wiped on every Codespace rebuild — Serena will show disconnected until `uv` is reinstalled.

**Incident (no damage):** a worthprop/SPEC-011 prompt meant for the website was mistakenly pasted into this FrameFocus CC session. CC correctly detected the repo mismatch and aborted — committed nothing. Verified clean via `git log` + `git status` (zero worthprop artifacts). Lesson: confirm the repo/Codespace before pasting a prompt.

**Tech debt:** `set_cost_catalog_updated_by()` omits `SECURITY DEFINER` from the CLAUDE.md template (harmless, pattern deviation). **VERIFY this got committed — it was not visible in the git log at close.**

---

## State at close

- `feature/estimating-4b-4c`: all 4B + 4C work committed, type-checked, acceptance-tested, **pushed to origin**. Not merged to main.
- Uncommitted in working tree: `.mcp.json` (now Supabase + Context7 + Serena), `docs/sessions/context48.md`. Commit + push these.
- `.serena/` folder created by Serena (project config + memories) — decide whether to gitignore it.
- Test data left in the Bishop catalog (`2x6 Joist`, `Romex 12/2`, `Drywall Sheet`; soft-deleted `2x4 Stud`) — intentionally kept.

## Carried forward

- Branch pushed but **not merged** — review the diff, then merge to main (auto-deploys to Vercel on push of main).
- Tech-debt commit — confirm it landed.
- Specs for 4D–4M — a parallel planning session was started to interview-and-spec them into 3 files; check whether they landed in `docs/specs/`.

---

## How to start Session 49

1. **Verify branch is sound:** `git checkout feature/estimating-4b-4c`, `git log --oneline`, `npx tsc --noEmit` from `apps/web/`.
2. **Push/merge decision:** review the branch diff, then merge `feature/estimating-4b-4c` -> `main` and push (pushing main auto-deploys to Vercel).
3. **Continue Module 4 -> build 4D (Estimate Builder UI):** depends on 4C (built); 4M (company settings) feeds it. Needs the 4D spec from the parallel planning session.
4. **Codespace environment checklist (every session):** reinstall Claude Code if missing; `/model fable`; re-link Supabase CLI if needed; confirm the project isn't paused; **reinstall `uv`** (or Serena won't connect); for unattended runs launch with `claude --dangerously-skip-permissions` from the start (setting it mid-session doesn't take).
5. MCPs are installed (Context7 + Serena, project-scoped in `.mcp.json`) — just confirm they're connected with `/mcp` (Serena needs `uv` present first).
