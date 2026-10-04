# S128 — Estimates & change orders: report

**Governing prompt:** `docs/prompts/S128-prompt.md` (on `main` at `d2c052a0`). **Spec:**
`docs/specs/estimates-and-change-orders-spec.md` (837 lines, read in full) and
`docs/specs/cost-codes-masterformat-1995.md` (§ 1 read before anything touches a code).

> ⚠️ The lead sections below (`WHAT JOSH DOES WHEN HE'S BACK`, `What Josh must RULE`, the plan) are filled in as the
> session reaches them. Until then this file is appended in session order.

## WHAT JOSH DOES WHEN HE'S BACK

_(filled at phase 2 and kept current)_

## What Josh must RULE

_(filled at phase 2)_

## The phase 2 plan, and deviations

_(filled at phase 2)_

---

# PHASE 0 — before phase 1 (Josh's config fix)

## `uv` in the devcontainer — `feature/devcontainer-uv` `94a08353`, pushed, NOT merged

**What the devcontainer is (verified by reading it, `.devcontainer/devcontainer.json`, the only file there):** an
image-based container (`mcr.microsoft.com/devcontainers/typescript-node:20`), ONE feature
(`ghcr.io/devcontainers/features/github-cli:1`), and a `postCreateCommand` of
`npm install && npm install -g @anthropic-ai/claude-code`. No Dockerfile, no `uv` anywhere. `.mcp.json` launches serena
with `uvx`. **Correction to the prompt's claim:** context7 is an `http` server, not `npx`; supabase is `npx`. Same
conclusion — neither needs `uv`.

**Change (one line + a comment):** `postCreateCommand` gains
`&& curl -LsSf https://astral.sh/uv/install.sh -o /tmp/uv-install.sh && sh /tmp/uv-install.sh`. Astral's own installer,
not a third-party devcontainer feature. **Downloaded then run, not piped** — `curl … | sh` exits 0 when the download
fails, because `sh` reads empty input. Installs to `~/.local/bin`, which this image's `~/.profile` (lines 25–26) puts on
PATH when the directory exists — the same place Josh's hand install landed (`which uv` → `/home/node/.local/bin/uv`).

**Proof:** the JSONC parses and `postCreateCommand` reads back as written; the installer, downloaded fresh and run into a
scratch directory (`UV_UNMANAGED_INSTALL`), exited 0 and produced `uv 0.12.23` / `uvx 0.12.23`. **Not proven:** an actual
rebuild (it applies on the next create/rebuild only).

**Why it is not merged:** the S180 merge rule needs CI green or the tree-identity exemption, and the exemption is defined
by exclusion — it may touch only `docs/` and root `*.md`. `.devcontainer/` is neither, and the commit is `[skip ci]` as
asked, so no CI ran. **Josh merges it** (it is in his list below).

---

# PHASE 1 — RESEARCH

## 1.0 — ListAgents

First action of the session. Result: *"No reachable agents — no other Claude session is running on this machine."*
No peer. Proceeded.

## 1.1 — The ground

- `git fetch --prune`. **`origin/main` = `d2c052a0`** "docs: S128 prompt, estimates spec with division budgeting, MF95
  cost codes [skip ci]". Measurements in phase 1 are on that ref unless stated.
- **The spec is on `main`**: `docs/specs/estimates-and-change-orders-spec.md`, 837 lines. Read in full.
- **What S127 left, verified by log and by database:**
  - Merges on `main` (by `git log --merges`): items 1 + 7 `5f05476a`, P-1/P-6/P-4 `574d9aef`, 5a + 6 `965b3f21`,
    4a + 4b `7f6627fe`, 5a fix + 4c `879e869f`, 4e `aff79789`, P-5 + P-2 `78eeeb30`, 4d `c1bfd059`, P-3 `182b069c`,
    R-2 `1904258e`, R-9 `a0793dcf`, item 2 `2e54b21d`.
  - ⚠️ **Correction to the prompt: EIGHT S127 migrations are on production, not seven.** Production
    `supabase_migrations.schema_migrations` (scratch workdir linked to `jwkcknyuyvcwcdeskrmz`, `db query --linked`),
    read: `20262134100000` qb_time_export_auto_off · `…134200000` segment_type_reopen · `…134300000`
    daily_log_client_photo · `…134400000` holiday_rules · `…134500000` photo_share_links · `…134600000`
    photo_share_perms · `…134700000` share_path_check · `…134800000` money_recat_lock. S127's close-out said "seven"
    (`…1341`–`…1347`) **before** R-9 added the eighth. Latest on production: `20262134800000`.
  - **rebuild-test** additionally carries `20262135000000` s124_qb_time_activity_push (S124 Part 1, unmerged, on
    `feature/s124-p1-push`) — **so every new S128 migration must be numbered above `20262135000000`**, and rebuild-test
    dry runs need that file in the workdir (S127's method).
  - The checkout is linked to rebuild-test `nmyphyhmfttxkdoposvf` (`supabase/.temp/project-ref`, read back).
