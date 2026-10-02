# S122 Part 8 — report entries (side file; folded into S122-report.md when this branch is rebased after Part 7 merges)

### R4.1 — Part 8 (templates), build log — branch `feature/s122-p8-templates` from `bacf1bb8`

- Migration `20262131000000_s122_schedule_templates.sql` (plan row 11 named `…29_s122_schedule_templates`; the timestamp moved because 29 and 30
  are taken). It creates the four tables plan row 11 names: `schedule_templates`, `schedule_template_phases`, `schedule_template_tasks`,
  `schedule_template_dependencies`, each with the CLAUDE.md standard columns, defaults and `updated_at`/`set_…_updated_by` triggers (the four
  `set_…_updated_by()` functions are the standard per-table trigger functions, not new behaviour).
  **No date, assignee or percent column exists**, so none can be copied.
  RLS: read = Owner/Admin/PM/PE of the company; insert/update = Owner/Admin; a child's template must be in the caller's company; no DELETE policy.

#### DECIDED UNATTENDED — Part 8

| # | decided | alternative rejected | why |
| --- | --- | --- | --- |
| D8-1 | Save and stamp are app code writing **as the caller** (RLS + the existing task/dependency guards decide), **no SQL function** | a SECURITY INVOKER/DEFINER plpgsql function doing it in one transaction | Josh's unattended rule: a function the spec does not name stops the item. Cost: no single-transaction atomicity; a failure mid-stamp is **compensated** (the rows it wrote are soft-deleted) and said so. |
| D8-2 | Stamping requires Critical Path to be **on** already (the stamp lives in the CP tab's empty network) | turning CP on as part of the stamp | Narrower: the stamp never flips a project-level switch (or its client-notification checkbox) as a side effect. |
| D8-3 | The refusal counts **live tasks** (Josh's ruling: "already has tasks", names how many). Existing phases with no tasks do not refuse | refusing on phases too | Follows the ruling's wording; phases alone carry no schedule. |
