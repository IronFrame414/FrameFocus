# context58 — Session Close

**Date:** 2026-07-05
**Session type:** Parallel spec-finalization (5F + 5G). Specs only — no code, no migrations, no builds, no commits.
**Decoupled from:** the overnight autonomous M5 launch build (feat/module-5, company_members + 5A–5E).

---

## 1. What this session did

Finalized the two Module 5 post-launch specs from the exact on-disk versions pasted in:

- **5F — Project Import** (was "Project Cloning") — all four Q-5F questions resolved.
- **5G — Closeout & Warranty** — all five Q-5G questions + the settings-fold decision resolved.

Both produced as downloadable files. **Neither is in the repo yet** (see §3).

---

## 2. What this session did NOT do (by design)

- Did **not** write to `docs/specs/`.
- Did **not** run git or commit anything.
- Did **not** spin up a second Claude Code build against the repo while the overnight build runs.
- Did **not** touch the working tree — no risk of working-tree contention or the doubled-path bug.

The finalized specs live only in downloads until filed.

---

## 3. Deliverables — where they are, how to file them

Two files in downloads:

- `5F-spec.md` → goes to `docs/specs/5F-spec.md`
- `5G-spec.md` → goes to `docs/specs/5G-spec.md`

**File them only AFTER the M5 launch build is merged.** Both are **full-file overwrites** (plain markdown — no heredoc/angle-bracket issue; drop the file in, or open and paste over).

Commit **path-scoped**, never `-A`:

```
git add docs/specs/5F-spec.md docs/specs/5G-spec.md
```

---

## 4. First actions next session (verify before anything)

1. **Verify the overnight M5 build status** — this is a _claim to verify, not a fact_. Check `git log`/`git status`/branch state on feat/module-5. The build was initiated Phase 0–3 (structure); CC had surfaced Phase 2 questions. Confirm where it actually landed before doing anything else.
2. Once M5 is merged, **file + commit the two specs** per §3.
3. Also outstanding from prior memory (unrelated to this session): capture the CO amendment commit hashes via `git log --all --grep="AMENDMENT" --oneline`.

---

## 5. Resolved decisions (full detail is in memory)

**5F — Project Import**

- Renamed clone → import throughout; RPC `import_project(source_project_id, contact_id, new_name, new_number?, start_date)`.
- Entry is **contact-first**: select/create contact → Import existing OR Start blank. The chosen contact becomes the new project's client.
- Q-5F-1 address blank (contact supplies; source address never carried).
- Q-5F-2 any readable source project, regardless of status.
- Q-5F-3 start date defaults to **today**, editable.
- Re-dating = **rigid-shift**: translate source's real start/due dates by one constant delta (delta = chosen_start − MIN(start_date), fallback MIN(due_date)); preserves spans and real gaps. **Not** a graph-walk/recompute — 5B stores literal dates, no duration/offset column. Backlog tasks (both dates NULL) import as backlog.
- Q-5F-4 milestones/zero-duration need no special case (shift like any row).
- Inspections **reset** (not imported), alongside files, change orders, punch lists, contracts, assignees, and the source's client.
- Dependency edges copied but **remapped to new task ids** (silent-failure trap).

**5G — Closeout & Warranty** (internal-only; payment/lien-releases/waivers stay Module 7)

- Q-5G-1 the proposed **8-item** default closeout checklist stands, editable per company.
- Q-5G-2 per-project warranty override at completion, **inheriting from Company Settings** (pre-fill, editable before stamp, untouched = company default) — built to consume settings, not hardcode.
- Q-5G-3 checklist item shape **simple**: label + optional notes + checked-by/when. Richer fields (assignee/attachment/photos/typed sub-questions) reserved as an additive block — not a form engine.
- Q-5G-4 on revert of a completed project the stamped warranty **persists, editable, flagged** (not cleared).
- Q-5G-5 warranty length default **12 months**, number configurable, **unit fixed to months** (no picker); end = start + N months.
- Both guessed values (8-item list, 12-month default) accepted as-is.
- Completion gate = **warn-but-allow** (lists unchecked items, user can proceed).
- **Settings decision:** warranty include/length/terms + company-standard checklist **fold into the batched Company Settings pass**. 5G builds only the stamp logic + per-project override + checklist instance + completion gate, and consumes those settings. A future Company Settings spec owns the defaults.

---

## 6. Build order & dependencies (unchanged)

- **5G before 5F.** Both only **after** company_members + 5A–5E are live.
- 5F and 5G bring their own migrations/schema at build — they cannot destabilize the launch build.

---

## 7. Flags carried into the eventual build (not open design questions)

- Verify checklist/warranty and phases/tasks/dependencies **table + column names against the live schema** at build (both specs carry the note).
- Confirm the **completion-authorized role set** against 5A's completion rules (5G §6).
- Both acceptance examples are **PROPOSED** — verify against a real Bishop closeout/job before they harden.
