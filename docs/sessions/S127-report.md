# S127 — report (unattended; research → plan → build)

> Lead sections (WHAT JOSH DOES, 1.4a, RULINGS NEEDED, PLAN) are written at the top once phase 2 lands.
> Until then this file grows from the bottom, one finding per commit.

---

# PHASE 1 — RESEARCH

## 1.0 — Peers

`ListAgents` at session start: *"No reachable agents — no other Claude session is running on this machine
right now."* This session is `framefocus-21`. **No peer, so no stop.**

## 1.1 — The ground (ref: `origin/main` after `git fetch --prune`, 2026-10-03)

- `origin/main` = **`fc220fd0`** *"docs: S127 prompt and open-work bundle [skip ci]"*. The prompt expected
  `71a039d5`; `fc220fd0` is its direct child and adds only the prompt and the bundle. The checkout was on `main`
  at session start; no edits were made there.
- `docs/specs/OPEN-WORK-BUNDLE.md` is on `main` (841 lines), read in full.
- The claimed SHAs, checked with `git merge-base --is-ancestor <sha> origin/main`:

| part | SHA | on `main`? |
| --- | --- | --- |
| S124 Part 0 (email pacing) | `5a78a648` | ✅ yes |
| S124 Part 2 (the switch) | `81fe1efc` | ✅ yes |
| S124 Parts 1 + 3 | `9e08c3dc` (`feature/s124-p1-push` head, confirmed) | ✅ **NOT** on main, as claimed |
| S125 audit report | `71a039d5` | ✅ yes |

## 1.2 — S124's report rescued

`git log --all --pretty=format: --name-only -- '*S124*report*' | sort -u` → exactly one path,
`docs/sessions/S124-report.md`, present only on `feature/s124-qb-timesheets` (`d49ed832`). Brought onto `main`
with its prompt and spec as **`c92900e2`** (docs only, `[skip ci]`, a fast-forward of `fc220fd0`). Read back:
`git ls-tree origin/main docs/sessions/` lists `S124-report.md` once. One report file, not two.
(`feature/s124-qb-timesheets` also carries `test/qb-sandbox-gate.ts` and its live test. Those belong to Part 1,
which is DO NOT TOUCH, and they also exist on `feature/s124-p1-push`. Not brought over.)

## 1.3 — Does `main` require a passing status check? **NO.**

- `gh api repos/IronFrame414/FrameFocus/branches/main` → `"protected": false`,
  `required_status_checks.enforcement_level: "off"`, `checks: []`, `contexts: []`.
- `gh api repos/IronFrame414/FrameFocus/rulesets` → `[]` (no rulesets).
- `…/branches/main/protection` → HTTP 403 *"Resource not accessible by integration"*. That is the token's scope, not
  an answer, so it is not counted.
- Corroboration by effect: `fc220fd0` and `c92900e2` were pushed straight to `main` with `[skip ci]` and accepted.

⇒ **§ 8 rule 1 applies:** a merge may carry `[skip ci]` when tree identity is proven and printed. No proof, no skip.

## 1.4b — The trash scope matrix (code: agent read of `origin/main` `c92900e2`; counts: production, read-only)

**Josh's "the trash isn't rendering anywhere" is mostly right.** Only **four** entities have a trash list a user can
reach from the UI, and every one of them is desktop-only. **`/m` has no trash screen at all.**

| entity | soft delete from | trash reader | reachable trash UI | restore wired |
| --- | --- | --- | --- | --- |
| files, documents | desktop Files tab row actions | `getFiles({only_deleted})` `files.ts:140` | ✅ `/dashboard/projects/[id]/files/trash` (Files tab "Trash" button, `files-list.tsx:68`) | ✅ `restoreFile` |
| **files, photos** | `/m` grid bulk delete (`photo-grid.tsx:446`), `/m` viewer (`viewer.tsx:366`), desktop markup page | the same reader; it has no category filter | ⚠️ **desktop only, indirectly:** a trashed photo shows in the *Files* tab's Trash. **The Photos tab has no Trash link, and `/m` has none** | desktop only |
| contacts | contacts list / sheet | `getDeletedContacts` | ✅ `/dashboard/contacts/trash` | ✅ |
| subcontractors | list / sheet | `getDeletedSubcontractors` | ✅ `/dashboard/subcontractors/trash` | ✅ |
| expenses | expenses page | `listDeletedExpenses` | ✅ `/dashboard/expenses/trash` (Owner/Admin) | ✅ |
| **projects** | "Move to Trash" (`status-control.tsx`) | `getProjectTrash` exists, **0 callers** | ❌ **no page** | `restoreProject` exists, **0 callers** |
| contact_addresses | none (reads filter `is_deleted=false` only) | — | — | — |
| tasks, phases, punch lists/items, daily logs, estimates, sub-bids, change orders, POs/deliveries, safety incidents, inspections, employee docs, team members, catalog/templates/categories/pay rates | each has a soft-delete path | none | ❌ | ❌ |
| invoices, selections | a service function, **no UI caller** | none | ❌ | ❌ |

- **Photos' storage objects are KEPT on soft delete** (`softDeleteFile` updates the row only). They are removed by
  permanent delete, Empty Trash, or the 6-month purge cron (`lib/files/trash-purge.ts`, `/api/cron/file-trash-purge`).
  ⚠️ **So a trashed photo is on a 6-month clock**, and today the only way back is the Files tab's Trash on desktop.
- Who may trash or restore a photo: `canDeletePhoto` / `canTrashFile` (`lib/photos/delete-permission.ts`) allow
  **Owner, Admin, PM, Project Executive**, and RLS enforces the same list (`20262030000000_s118_file_trash_floor.sql`).
  Permanent delete is Owner/Admin.

### Already soft-deleted on production (2026-10-03, `jwkcknyuyvcwcdeskrmz`, every `public` table with `is_deleted`, 90 tables)

| table | deleted / total | company | reachable today? |
| --- | --- | --- | --- |
| **files** | **7 / 390**, all **images**, all with a project, deleted 2026-09-23 → 2026-10-02 | Worth Properties | desktop Files → Trash only. **Not from Photos, not from `/m`** |
| estimates | 3 / 16 | Worth Properties | ❌ **no trash, no restore** |
| company_members / profiles | 3 / 13, 3 / 9 | — | removals; not a trash question |
| site_visits | 1 / 5 | Worth Properties | ❌ |
| subcontractors | 1 / 4 | Worth Properties | ✅ subcontractors trash |
| cost_catalog | 1 / 626 | H&H Signature Renovations | ❌ |
| project_assignments | 1 / 24 | — | an unlink |
| **every other table** (projects, contacts, tasks, daily logs, …) | 0 | — | — |

⇒ **4 rows in user-facing entities (3 estimates, 1 site visit) are soft-deleted with no way back except SQL. The 7
photos have a way back only from a screen nobody would look in.** Reported only; nothing changed.

## 1.4c — The segment-type defect: production count (paths: see 1.4c-paths below, once the read lands)

Production (`jwkcknyuyvcwcdeskrmz`), read-only:
- Triggers on `time_segments`: `time_segments_z_reopen_on_hours_change` → `reopen_session_on_segment_hours()`. That
  function **returns early when `segment_start`, `segment_end` and `is_deleted` are unchanged**. Its own comment calls
  that *"attribution only (job, task, note, completion): hours unchanged"*, but `segment_type` is **not** in that list
  and **not** in the check. **The defect is confirmed in the live definition.**
- `audit_time_segment_edit()` **does** record `segment_type` from→to in `time_edit_logs`, so history exists to count from.
- **Count:** `time_edit_logs` 16 rows total; **0 carry a `segment_type` change**, so **0 sessions** have had a type
  flipped, approved or not. Sessions by status: approved 9, pending 10, NULL 6.
- ⚠️ Residual: the audit skips a member's own edit made outside the sheet functions (`v_me = v_target`, no flag). An
  Owner/Admin flipping the type on **their own** segment through PostgREST would leave no log. The 6 NULL-status
  sessions are Owner sessions that are never approved, so on today's data this changes nothing.
⇒ **Ruling #9 has nothing to report: there are 0 affected approved days on production.**

## Item 8 — `feature/s114-c5-multi-upload`: ⛔ THE REVERT REASON STILL HOLDS → STOP. Not discarded.

- The branch is one commit, `6409738e` (2026-09-28), 17 files, +620/−127. Its own message: *"C-5 remains UNPROVEN per
  TECH_DEBT #2-s180u (one proof per surface owed); not for merge until those exist."*
- **The revert**, `39d4a493` on `main`: *"per-component verification = a test PER SURFACE ("8 components, 8 proofs …
  A single batch test is not acceptance."). C-5 as built has a helper test and a timing run, not eight surface proofs."*
- Since then, `main` met that ruling with a **different implementation** (S116, merge `5b5cc366`: `runUploadBatch`,
  `useUploadBatches`, `makeAttachWorker`, plus 8 per-surface specs `e2e/s116-c5-*.spec.ts`). S121 §1.6
  (`S121-report.md:327-337`) and `TECH_DEBT.md` `#181` both record that this branch is the version that was replaced,
  with a duplicate-on-retry defect, and that merging it would add a **second upload mechanism (PARITY)**.
- **Tested against today's `main` (`c92900e2`) myself:** `git merge-tree --write-tree --name-only origin/main
  origin/feature/s114-c5-multi-upload` → exit **1**, **10** `CONFLICT (content)`; `uploadRemaining` (the branch's
  mechanism) has **0** references on `main`.
- **Verdict: STOP (ruling #10).** The branch still has 0 per-surface proofs of its own, and `main` has replaced what it
  does. Merging it would overwrite or duplicate the proven S116 code in 10 files. **Branch left untouched.** Its useful
  remainder is the step-2 `multiple` attributes on 4 inputs, which is `#181` and should be built fresh from `main`.
  **Discarding it stays Josh's call.**
