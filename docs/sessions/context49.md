# Session 49 — Module 4: 4B + 4C built, verified, merged to main; MCP tooling live; 4D spec'd

> Branch: `feature/estimating-4b-4c` — merged into `main` (fast-forward).
> Model: Claude Code on Fable 5, bypass-permissions mode.

---

## What happened

Resumed after a long gap. Ground-truthed via git: Session 47 was docs-only (Serena + Context7 added to the tooling list, never installed).

**Environment rebuilt (all wiped by Codespace rebuild / overnight restart):**

- Reinstalled Claude Code (`npm i -g @anthropic-ai/claude-code`, v2.1.172); set model to **Fable 5** (`/model fable`, needs CC >= 2.1.170, ~2x usage vs Opus).
- Supabase project had been **paused** — un-paused; re-linked CLI (`login` + `link --project-ref jwkcknyuyvcwcdeskrmz`).
- Reinstalled `uv` (for Serena): `curl -LsSf https://astral.sh/uv/install.sh | sh`.

**Scope locked (minimum launch):** IN — 4B, 4C, 4D, 4E, 4F, 4J, 4K, 4M, Module 5 (Projects, top priority). OUT — 4G, 4H, 4I, 4L.

**Built (Claude Code) on `feature/estimating-4b-4c`, then merged to main:**

- **4B — Cost Catalog:** migration (table, defaults, triggers, RLS), types, `cost-catalog-client.ts`, Zod, UI at `/dashboard/catalog`.
- **4C — Estimates:** `estimates` + 6 related tables, `companies` ALTER, `next_estimate_number()` fn, `set_winning_bid()` RPC, RLS, Zod (`estimate.ts` + `estimate-items.ts`), services (`estimates-client.ts` + `estimate-items-client.ts`).
- Decisions: B1 ILIKE; B2 catalog read-only by direct URL, hidden from nav; D1 `project_id` nullable UUID **no FK** (FK in Module 5); D2 PM sees own; D3 frozen-when-Sent (service+RLS); D4 child RLS = company + `EXISTS(parent visible)`; D5 row-lock numbering fn; D6 one atomic 4C migration; sub-bid FK `ON DELETE CASCADE` on `line_item_id`; `set_winning_bid` as RPC.

**Verification:** all acceptance checks passed (tsc clean; EST-001/002 per company; Owner all / PM own / Crew none; sent estimates reject edits + child inserts; partial unique index blocks 2nd winner; cross-tenant 0/0/0). Catalog UI smoke-tested by hand as Owner (CRUD + search + filter). Branch pushed to origin, then **merged into main (fast-forward).**

> **CONFIRM deploy status:** if main was pushed, Vercel deployed — verify the build went green. If the main push was held, **pushing main is Session 49 step 1** (deploys + required before the 4D additive migration).

**MCP tooling installed (completes the Session 47 plan):**

- **Context7** — remote HTTP (`https://mcp.context7.com/mcp`), 2 tools, connected. Pure URL, survives rebuilds.
- **Serena** — local stdio via `uvx` (oraios/serena, `--context ide-assistant`), 20 tools, connected. **Depends on `uv`, which is wiped on every Codespace rebuild — Serena shows disconnected until `uv` is reinstalled.**
- Both project-scoped in `.mcp.json`. (Gotcha hit this session: the first Serena add was run from `apps/web`, landing in a stray `apps/web/.mcp.json` — deleted. Always add MCPs from the repo root.)
- Supabase MCP present but "needs auth" — left unauthenticated; unused (CLI handles the DB).

**4D spec landed:** `docs/specs/4D-spec.md` (covers **4M + 4D + 4K** + an additive 4C-schema migration), from a parallel planning session; recovered from a typo'd `.d` extension. **Not built** — queued for Session 49. NOTE: the other two planned specs (4E+4F, and 4J) are NOT in the repo — confirm whether that session produced them.

**Incident (no damage):** a worthprop/SPEC-011 prompt meant for the website was pasted into this FrameFocus CC session by mistake. CC detected the repo mismatch, aborted, committed nothing. Verified clean via git. Lesson: confirm the repo/Codespace before pasting a prompt.

**Tech debt:** `set_cost_catalog_updated_by()` missing `SECURITY DEFINER` (harmless, pattern deviation) — logged in TECH_DEBT.md.

---

## State at close

- `main`: 4B + 4C merged in. Deploy = see CONFIRM note above.
- Both Context7 + Serena connected; project-scoped in `.mcp.json`.
- `docs/specs/4D-spec.md` ready (not built).
- Test data left in Bishop catalog (`2x6 Joist`, `Romex 12/2`, `Drywall Sheet`; soft-deleted `2x4 Stud`) — intentional.

---

## How to start Session 49

1. **Codespace env (all wiped on rebuild):** reinstall Claude Code; `/model fable`; re-link Supabase CLI if needed; confirm the Supabase project isn't paused; **reinstall `uv`** (or Serena won't connect). Launch CC with `claude --dangerously-skip-permissions` for an uninterrupted run.
2. **Verify MCPs:** `/mcp` — Context7 and Serena both connected (Serena needs `uv` first). Approve project servers if they show pending.
3. **Push main if the deploy was held** — required before the 4D build (its additive migration needs 4C on main). Confirm Vercel green.
4. **Build 4D** from `docs/specs/4D-spec.md` on a fresh branch (the spec suggests `feature/module-4-spec-1`). Covers 4M settings + 4D builder + 4K clone + an additive 4C migration. Answer the spec's reserved build-time questions first.
5. After 4D: 4E+4F and 4J still need specs (parallel session may or may not have produced them — check `docs/specs/`).
