# Session 89 Context — Notifications Architecture (interview + doc)

## What happened

- Worktree created: `/workspaces/rafterworks-s89` on branch
  `feat/notifications-architecture` (off origin/main @ 8b6972a) — original
  tree untouched, S87 ran in parallel.
- `docs/specs/notifications-architecture.md` written, committed (c7069b2),
  pushed. VERIFY with git — do not trust this file.
- Original tree deliberately switched to `main` by Josh late in session.

## Decisions locked (S89, founder-approved)

- Notifications + project chat + PWA/mobile UI = ONE combined module.
  It is the NEXT build and GATES M8. Roadmap: this module → M8 → M9–M11.
- Native app REJECTED; PWA (add-to-home-screen, no app store, JobTread
  pattern). Push = Web Push/VAPID, no vendor.
- Chat: plain messages notify no one; @mention notifies that person only;
  notification shows actual message text. Chat log permanent; only
  notification rows expire (30 days unless starred).
- Notify-hours: company-set window, own setting (NOT business hours),
  company timezone. Outside window: tab-only, silent, nothing queued.
  Serious incidents override — push always.
- Incident recipients: everyone ranked above the filer (6C hierarchy).
- Low stock: fire on crossing, repeat WEEKLY while below (answers M8 OQ#3).
- Estimate reminders: notify only when exhausted + still unsigned.
- FINANCIAL_RLS_FLOOR applies to notification TEXT (pre-rendered per
  recipient at write time).
- 9 approved traces in doc §3 — verbatim acceptance examples for specs.

## Next session: spec files

Split approved: N1 PWA shell/push → N2 notifications core → N3 chat →
N4 mobile screen set. N1–N3 speccable now; **N4 requires its own interview
round first** (screen inventory per role). Start with N1 unless Josh says
otherwise. Doc §9 lists 7 spec-time open questions — resolve during specs.

## Flags / unfinished

- FFNav 13th sidebar item: owned by S87's reindex. Do not decide.
- M8 architecture doc exists UNCOMMITTED on a different branch (not main,
  not this branch) — Josh knows; needs committing eventually.
- `feat/notifications-architecture` not merged to main yet.
- No context87/context88 retrospectives seen in docs/sessions/ on the 6B
  branch; context88 commit exists on main (8b6972a). Reconcile if needed.
- Worktree `/workspaces/rafterworks-s89` still exists, parked on the
  notifications branch — reuse it for spec work or remove when done.
