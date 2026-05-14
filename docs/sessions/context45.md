# Session 45 Recap — Workflow Tooling Setup

No FrameFocus code. Installed the Chat-Code workflow from the strategy article: new slash commands, MCP, skills, allowlist, type-regen automation.

## What shipped

- Slash commands adopt new convention: `kickoff.md` reads `session-NN-plan.md`, `wrap.md` writes `session-NN-recap.md`.
- `.claude/settings.json` — bash allowlist (npm, git, supabase, cat, ls, grep, rg, turbo, Read) + MCP read-tool allowlist (`mcp__supabase__list_*`, `get_*`, `search_*`, `generate_typescript_types`).
- `db:push` npm script chaining `supabase db push && npm run db:types && npm run type-check`. CLAUDE.md Generated Types Workflow points at it.
- Supabase MCP in `.mcp.json`, project-scoped to `jwkcknyuyvcwcdeskrmz`. Connected via Claude Code's manual URL-paste OAuth fallback (browser callback doesn't work in Codespaces).
- Four skills in `.claude/skills/`: `supabase-rls`, `framefocus-admin-roles`, `framefocus-contacts-subs-split`, `framefocus-ai-approvals`.

## Gotchas

- **MCP OAuth in Codespaces:** browser callback to `localhost` fails (localhost = your laptop, not the Codespace). Claude Code 2.1.126+ accepts the callback URL pasted back into the terminal — that's the working path.
- **Conflicting auth signals:** adding `Authorization` header to `.mcp.json` while OAuth is active makes Supabase reject the new credentials on reconnect. Pick one.
- **VS Code "new file" saves to the displayed parent**, not the highlighted folder. Workaround: `touch <full path>` before opening in editor.
- **MCP allowlist syntax:** `mcp__<server>__<tool>` with prefix wildcards (`mcp__supabase__list_*`). Server-wide wildcard also works (`mcp__supabase__*`).

## Next session

Tech debt #66 (ownership transfer UI). Still gates Module 4B. Unchanged from Session 44.
