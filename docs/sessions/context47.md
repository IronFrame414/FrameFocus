# Session 48— Plan

**Goal:** Install Serena + Context7 MCP servers, then resume the next planned development target.

## Pre-step — Install MCP servers (~10 minutes)

Per STATE.md → "Claude Code MCP setup." First three steps:

1. `curl -LsSf https://astral.sh/uv/install.sh | sh` (install `uv` in Codespace).
2. Run both `claude mcp add --scope project ...` commands from STATE.md (Serena, Context7).
3. `claude mcp list` to confirm both connected; commit `.mcp.json` to `main`; flip Infrastructure row in STATE.md to `✅ Installed YYYY-MM-DD`.

After install, CLAUDE.md triggers govern when each server is used.

## Main work

[Fill in at session start.]

## How to start Session 47

1. Open Codespace, `git pull`, `bash scripts/session-start.sh`.
2. New Claude Chat with project knowledge.
3. Paste session-start snapshot + `context46.md`.
4. **First action — install MCP servers (~10 min).** Per STATE.md → "Claude Code MCP setup": install `uv`, run both `claude mcp add --scope project ...` commands, confirm with `claude mcp list`, commit `.mcp.json` to `main`, flip Infrastructure row in STATE.md to `✅ Installed YYYY-MM-DD`.
5. **Then: pick the next Module 4 sub-module** per `docs/module4-architecture.md` §4.16 build order. 4A is fully complete; nothing pending on it.
6. SPEC-driven Claude Code flow: chat drafts SPEC.md → Claude Code plan mode → review → execute → review.
