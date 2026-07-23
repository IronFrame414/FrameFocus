# Context 87 — Module 6 UI Specs + Build (6B/6C/6D)

**Branch:** `feat/module-6b-ui` (off main `c2475c3`). NOT merged. Nine migrations on rebuild-test ONLY — prod batch owed.

## Delivered
- **UI specs written** for 6B/6C/6D per the S86 CLAUDE.md UI-section rule; committed on `feat/module-6bcd-ui-specs` (85a4646, 949a6dc, 1be4d37). 6E renamed post-launch (7d871ca).
- **M6 desktop UI built end-to-end:** 6B daily logs, 6C safety incidents, 6D deliveries. 6A already live from prior sessions. 6E deferred post-launch.
- **12-item FFNav reindex** landed (Field Ops after Schedule, ungated); Field Ops hub; project-detail entry points.
- **6D expansion (late S87):** per-line + whole-delivery photos, damage-photo REQUIRED when qty_damaged>0 (form+zod+route enforcement, extended to edit via new PUT route), delivery PDF on every check-in, Deliveries promoted to first-class project tab, open/closed PO sections.

## Key decisions
- Edit RLS: creator OR Owner/Admin (accepted live, spec amended) — 6B Q1.
- `get_project_day_presence()` SECURITY DEFINER unblocks crew auto-fill without exposing payroll — 6B Q2.
- Photos are LOG-BOUND (daily_log_id), not day-pooled. Incident + delivery photos project-pooled but `client_visible=false` (portal-hidden until starred).
- 6C schema pre-existed (S78); only additive columns + atomic `create_safety_incident()` RPC (deferred-trigger vs PostgREST autocommit).
- Incident notification: hierarchy (everyone above submitter) + Owner→Admin floor.

## Owed / next session
- **Prod migration batch (9, in order):** 20260721060000 → 070000 → 080000 → 20260722000000 → 010000 → 020000 → 20260723000000 → 010000 → 020000, then `db push` + regen types + swap cast escape-hatches. Then MERGE.
- **Full walkthrough** was done piecemeal across an interrupted session (rebuilds, env fights, missed CC prompts); Josh confident. One clean pass advisable pre-merge.
- **Files-manager redesign** (NEW, next session — needs interview + spec): categorized sub-tabs (daily reports/incidents/deliveries), user-created named folders, photo thumbnails, searchable tags, auto-tagging by source.
- **M7 build** gated on M6 merge; M7 prereqs still unread against its architecture doc.
- **TECH_DEBT:** #93 (PM-reopen PO), #94 (HEIC conversion at upload — iPhone photos count-not-embedded until built).

## Notes / slips
- **Commit-tag slip:** 739bc53 and 5435d65 tagged [S89] in error — this is Session 87. Already pushed, immutable; left as-is.
- **Codespace secret gotcha recurred:** personal `RESEND_API_KEY` Codespaces secret overrides `.env.local` at shell level, returns each rebuild. `unset` per-session; delete the personal secret to fix permanently (repo secret already deleted).
- **Parallel S88 session** ran on `feat/module-8-architecture` — caused a working-tree branch mixup mid-session (recovered, zero loss). M8 architecture committed there.
