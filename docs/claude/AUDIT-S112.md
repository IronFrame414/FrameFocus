# CLAUDE.md restructure: the audit (written BEFORE any edit)

**Source:** `CLAUDE.md` on main `80e15bad`, **936 lines**. The command that produced the table:

```bash
awk '/^#{1,3} /{if(t)printf "%4d  %4d  %s\n",s,NR-s,t; t=$0; s=NR} END{printf "%4d  %4d  %s\n",s,NR-s+1,t}' CLAUDE.md
```

**Target:** under 350 lines.

**Method: nothing is lost.** Every section's **full original text moves verbatim** into
`docs/claude/`. CLAUDE.md keeps each rule's operative statement and a link to its full text.
"No rule deleted" is then checkable mechanically: every non-blank line of the old file must appear,
verbatim, in `docs/claude/`. See the log for the check's result.

## The table

| Line | Lines | Section | Decision | Where the full text goes |
| --- | --- | --- | --- | --- |
| 1 | 8 | Title + "Last updated / Previously" banners | **COMPRESS** to the title and purpose. The update banners are history. | `docs/claude/history.md` |
| 9 | 11 | Project Overview | **COMPRESS** | `platform.md` |
| 20 | 7 | Claude Code MCP Servers | **KEEP** | — |
| 27 | 2 | Install commands pointer | **KEEP** | — |
| 29 | 21 | Technology Stack | **COMPRESS**: the table stays, the struck Expo row moves | `platform.md` |
| 50 | 26 | MOBILE IS A PWA (RULED S97) | **COMPRESS** to the ruling and its two reasons | `platform.md` |
| 76 | 31 | PARITY (RULED S122) | **COMPRESS** to the rule and its four practices | `rules.md` |
| 107 | 54 | Monorepo Structure (tree) | **MOVE**. A reference, partly stale (it lists only 5 dashboard dirs); a 2-line pointer stays | `platform.md` |
| 161 | 16 | Development Environment | **COMPRESS** | `platform.md` |
| 177 | 17 | Known Codespaces Gotchas | **COMPRESS** to one line each | `gotchas.md` |
| 194 | 13 | Database Patterns (SECURITY DEFINER SQL) | **COMPRESS**. It duplicates a gotcha, so they merge | `database.md` |
| 207 | 17 | Run protocol, Phases 0–3 | **KEEP** | — |
| 224 | 34 | Unattended runs commit per step (RULED S173) | **COMPRESS** to the rule, the table, and the push rule | `rules.md` |
| 258 | 48 | The thing inspected must be the thing judged (MANDATORY) | **COMPRESS** to the 7 instruments and 4 exit-status rules | `rules.md` |
| 306 | 40 | Sweep for EXISTING tests (MANDATORY S157) | **COMPRESS** to the rule and 4 practices | `rules.md` |
| 346 | 34 | `.limit(1)` ordered or scoped (MANDATORY S165) | **COMPRESS** to the 3 categories | `rules.md` |
| — | — | **NEW:** Never reformat a file the repo does not format (MANDATORY, S112 follow-up) | **ADD** | `rules.md` (full incident) |
| — | — | **NEW:** Role-permission tests are total maps (MANDATORY, S112 queue 3) | **ADD** | `rules.md` |
| 380 | 21 | Generated Types Workflow | **COMPRESS** | `database.md` |
| 401 | 10 | Platform Modules | **COMPRESS** | `platform.md` |
| 411 | 111 | Database Conventions | **COMPRESS** to the rules. The SQL templates move | `database.md` |
| 522 | 16 | Service Layer Pattern | **COMPRESS** | `database.md` |
| 538 | 18 | Code Conventions: TypeScript, React | **KEEP**, tightened | — |
| 556 | 14 | ~~React Native~~ (SUPERSEDED S97) | **MOVE**. It is already superseded and kept only as a record | `superseded.md` |
| 570 | 10 | API / Data Layer | **KEEP** | — |
| 580 | 9 | Git Workflow | **KEEP**, with one line flagged (see below) | — |
| 589 | 27 | User & Role Architecture, Layers 1–2 | **COMPRESS**. The role table stays; the long PM cell moves | `roles.md` |
| 616 | 40 | Roster Visibility Floor (RULED S131) | **COMPRESS** to the table and the two traps | `roles.md` |
| 656 | 111 | Financial Visibility Floor | **COMPRESS** to the ruled floor, the enforcement table, and the "do not floor change_orders" warning. The S140/S150 banner history moves | `roles.md` |
| 767 | 47 | The Floor governs staff; a client is a counterparty (RULED S164) | **COMPRESS** to the instrument table and the per-bill rule | `roles.md` |
| 814 | 15 | The Admin Role Principle | **KEEP** | — |
| 829 | 25 | Role Permissions Quick Reference | **KEEP**. The table's broken sixth column becomes a footnote | — |
| 854 | 6 | Workflow automations and "Admin in workflows" | **KEEP** | — |
| 860 | 25 | AI Integration Rules and the reference implementation | **COMPRESS** | `platform.md` |
| 885 | 23 | Tech-debt numbering (RULED S136) | **COMPRESS** to the rule | `rules.md` |
| 908 | 13 | Instruction Preferences | **KEEP** | — |
| 921 | 4 | Environment & Accounts (two headers, one pointer) | **COMPRESS** to one line. The duplicate header is merged | — |
| 925 | 12 | Reference Documents | **KEEP**, plus a pointer to `docs/claude/` | — |

## Proposed DELETIONS: listed for Josh, NOT deleted

Every one below is **still present**, verbatim, in `docs/claude/`. **None is removed from the
record.** The only question is whether each also stays in CLAUDE.md itself. Tonight they are left
out of the compressed file and marked as candidates:

1. **"Expo EAS: Cloud builds triggered from Codespaces terminal"** and **"Port forwarding … Expo
   (8081)"** in Development Environment. Mobile has been a PWA since S97, and nothing builds with
   EAS.
2. **Git Workflow: "`dev` branch for integration".** No `dev` branch exists on origin (checked:
   `git ls-remote --heads origin dev` returns nothing). Integration happens on per-wave branches.
   The rest of Git Workflow is **kept**.
3. **Project Overview: "Status: Modules 1, 2, and 3 complete."** Stale. STATE.md is the live status
   and is already linked from the same line.
4. **The "Last updated / Previously" banners** (Session 150 and Session 97). History, not
   instruction.

**Everything else is a rule and is KEPT** in CLAUDE.md, compressed, with its full text one link
away.
