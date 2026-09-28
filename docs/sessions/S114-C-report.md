# S114 PARTS C and B — session report

Running log. Appended, committed and pushed after every measurement, test run, sabotage, build exit
line, unattended decision and stop. Newest entries at the bottom.

**Branch at start:** `feature/s114-c-no-migration`, cut from `main` = `2269a9a9` (verified:
`git rev-parse origin/main` → `2269a9a94877ae29074c5495ac019894ad48bad3`, 2026-09-28).
**CLI link:** `supabase/.temp/project-ref` reads `nmyphyhmfttxkdoposvf` (rebuild-test). Read only.

## Rulings carried in by the prompt (build to these, do not re-ask)

- **Order:** PART C first, then PART B. C is split: **C-branch 1 = no migration** (merges on CI under
  R8), **C-branch 2 = needs a migration** (waits on Josh's runbook). PART B is its own branch after C.
- **No production override.** Applying a migration to production is Josh's action. Never
  `supabase link`; never `migration repair --status reverted`. Four versions owed from unmerged branches
  (`20261850000000`, `20261860000000`, `20261890000000`, `20261900000000`) are PART E, expected absent.
- **R4** — photo upload with no project selected: **refuse**. Existing orphans untouched; count them and
  hand Josh the query (FILL-C-4.3).
- **R7** — Files filters by **CATEGORY, never MIME type**.
- **C-6** — "Summary with Descriptions" SHOWS line descriptions. Fix the page first; trim the payload to
  the corrected page.
- **C-8** — site-visit markup on `/m/site-visits/[id]` and desktop `site-visit-record.tsx`; unsent visits
  only; frozen visit shows a notice saying why ("part of a sent estimate, can't be annotated"). PARITY.
- **R3 (PART B)** — QuickBooks exclusion: per project, **Owner only** (DB policy, not a hidden button),
  changeable any time, stops **future** sync only, nothing unlinked/deleted. Control in the project
  overview STATUS section. **The Project Executive must not see it.**
- **New items to add to the spec in place:** C-9 (contact name-or-company), C-10 (subcontractor detail
  redirects a PE), F-10 (debt numbering now `#166`+), G-6 (PART A click-test owed, not passed).
- **Gates:** C-2 — no fix before FILL-C-2.1. C-1 — proof walks the real email link on a second device.
  B — FILL-B-1 (what the QB integration does today, from code) before any design.
- **Stop rules:** production writes; unsettled decisions; destroying/moving rows; constraints over
  existing production rows (count first); anything weakening the Financial Visibility Floor; refund or
  contract authority.

## Log
