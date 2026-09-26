# S112 — rulings R1–R7, attended session (2026-09-26)

**Nothing touched production.** No migration, backfill or write to production; nothing merged. All
database work was on rebuild-test, with CI idle.

## Summary

| Ruling | Branch (stacked on) | State |
| --- | --- | --- |
| **R1** display-size + full-res export | `feature/s112-display-size` (on `markup-local-display`) | Built, measured, fallback proven. CI not yet run. |
| **R2** loading feedback | `feature/s112-m-loading` (on `audit-rulings`) | `loading.tsx` **plus a pending bar**, because taps were still dead. 20/20. CI not yet run. |
| **R3** 16px fields | `feature/s112-audit-rulings` (on `audit-fixes`) | 36 fields → 0 below 16px; static guard. No `maximum-scale`. |
| **R4** muted grey `#687081` | same | Token + 7 hard-coded sites. 4.97 / 4.60. |
| **R5a** CO notice + stale comments | same | Built; for foreman/crew it is superseded by R5b on the next branch. |
| **R5b** approved COs for all staff, no money | `feature/s112-co-summary` (on `audit-rulings`) | DB function applied to **rebuild-test**; proof 14/14 with row counts; sabotage went red. **CI running.** |
| **R6** punch badge, F11, F22, F23 | `feature/s112-audit-rulings` | Badge wraps; `#9d6506` amber text 4.89 / 4.52. F23 identified (below). |
| **R7** HEIC conversion | `feature/s112-heic-conversion` (on `main`) | Script + proof on rebuild-test, 17/17, control went red. **Not run on production.** |

## R1 — see `docs/sessions/S112-R1-display-size.md` (on its branch)

Same photo and three conditions as the 3d table:

| Condition | Save, 3d → R1 | Stored derivative | Export (Save to device) | Exported |
| --- | --- | --- | --- | --- |
| Local | 2,593 → **2,536 ms** | 559,442 B, 1536×2048 | **1,826 ms** | 2,090,890 B, **3024×4032** (full) |
| 1 Mbps uplink, CPU 4× | 20,994 → **8,236 ms** | same | **7,954 ms** | same |
| Fast 3G, CPU 4× | 29,871 → **11,209 ms** | same | **14,827 ms** | same |

- **(a) Fallback, tested both ways.**
  - Regeneration forced to fail → the stored 1536×2048 derivative, with the display-size note.
  - `markup_data` removed → the stored derivative.
- ⚠️ **The second case was broken until this session.** The /m viewer and grid exported the
  **unmarked original, silently**. I found this while measuring and fixed it: a derivative is now
  looked up at export time.
- **Chat still has this gap** (question 4).
- **(b) Mixed content.** Exports are identical, because both old and new derivatives rebuild from
  the original. Old photos keep a full-res stored derivative and new ones are 2,048 px. So:
  - A new marked photo zoomed past about 1.2× in the viewer looks softer.
  - The client portal and PDFs now show 2,048 px for newly marked photos.
  - A fallback export of an old photo is full-res; of a new one, 2,048 px.
- **Before R1, "Save" in the viewer didn't save.** It was an anchor to a cross-origin URL, and
  browsers ignore `download` on those.

## R2 — `loading.tsx` alone was not enough; the pending state was added (as ruled)

Held-tap re-run, method as the audit. Production builds, crew, the RSC payload held 3 s, 20 taps.

| Build | Changed by 800 ms | Punch row |
| --- | --- | --- |
| no `loading.tsx` (control) | **0 / 20** (3.4–3.7 s) | dead |
| `loading.tsx` | **16 / 20** (~30 ms, skeleton) | **still dead, 3.4 s** |
| + pending bar | **20 / 20** (13–17 ms) | bar |

- **Why the punch row stayed dead:** Next 14 remounts the `/m` boundary only when the first segment
  under `/m` changes. A tap that stays inside a project doesn't change it.
- **The bar** is one shell component: a capture-phase listener on same-origin `/m` links. The first
  build listened in the bubble phase, where next/link's `preventDefault` hid every navigation, and it
  raised the bar 0 of 4 times.
- **e2e guard added.** This does **not** unblock `staletimes-hold`.

## R5b — the database does the work

- **The function:** `get_approved_change_order_summaries(project)` (`20261840000000`). It is
  SECURITY DEFINER with `search_path = public`, and returns only six columns, none of them money:
  - id, project_id, co_number, title, description, signed_at
- **It checks, itself:** company, role (the five staff roles, as a positive list), `can_view_project`,
  `status = 'signed'` and `is_deleted`. `anon` has no execute grant.
- **Proof** (`s112-co-summaries.live.ts`, negative first), counted against the database:
  - **Not on the project → 0 rows** for PM, foreman and crew. The fixture holds a signed CO that the
    Owner reads.
  - **Subcontractor → 0** even on their own 2 projects, which hold 3 signed COs.
  - **Positive:** PM 11 = database 11, foreman 3 = 3, crew 9 = 9. Every row has exactly the six keys
    and no money key.
  - **Direct table read after the function exists:** foreman, crew and subcontractor read **0**
    change orders; the PM reads only their own.
  - **Sabotage:** with the role and project checks removed, 4 tests went red (1, 1, 1 and 3 leaked
    rows). Restored and green again.
- **UI, /m and desktop, one shared service:**
  - Foreman and crew get "Approved changes": number, title, description, approval date and a "Scope
    only" pill, with a note saying amounts stay with the office.
  - A PM sees their own COs in full, then other authors' approved COs as scope only, under a note
    explaining why there's no amount.
  - **Desktop was showing foreman and crew three 0-count cards and "No change orders yet."** Now
    fixed.
- **Applied to rebuild-test by hand.** The CLI push refuses because rebuild-test also holds the
  unmerged S111 Project Executive versions. I ran the SQL and inserted the history row.
  `database.ts` carries only this function's hunk.

## R6 — F23, identified before anything is proposed

**The "—" on a `/m/projects` card means `projects.target_end_date` is NULL**, i.e. the project has
no target end date. Code path:
- `projects/page.tsx:65-66`: `n === null ? '—'`
- `daysLeft()` returns null when `!targetEndDate`
- rendered in `projects-list.tsx:133-135`

A-10e specifies that em-dash, and `m-hubs.spec.ts:229` asserts `'—'`. **A second "—" sits
bottom-right, meaning 0 open punch items.** Nothing is built for F23.

## R7 — the thumbnail trap, handled and proven

**Approach.** The script repoints the row, then **copies** every side object to the new path's name
in the same pass: the plain thumbnail, the marked thumbnail and the `.markup.jpg` derivative. Old
objects are never modified or deleted, so undo is lossless. The thumbnail fingerprint depends only
on `markup_data`, so suffixes carry over.

**Proof**, run as an assigned subcontractor, whose only way to read a thumbnail is
`20261810000000`'s `regexp_replace` lookup:

| Check | Result |
| --- | --- |
| Row after apply | repointed to a real JPEG served as `image/jpeg`, 3000×4000 |
| Thumbnail at the NEW name | **1** (readable) |
| Thumbnail at the OLD name | **orphaned**: sign 0, download 0 |
| `--verify` | 0 |
| Undo | exact |

- **Control:** with the copy step removed, 4 red, including the script's own `--verify`.
- **Measurement trap, recorded in the PREPARED doc:** a `download()` probe first read the orphaned
  thumbnail as readable. It was a cached GET, not a policy decision.

Josh runs the production count, then dry run, one-row canary (`--only-ids`), apply and verify:
`docs/sessions/S112-heic-conversion-PREPARED.md` on its branch.

## Incidents (mine)

1. **A CI run started early.** I pushed the R5b branch without `[skip ci]` (run 36233826714). The
   cancel API returned 403, so it ran to the end, green. Nothing else was running.
2. **A scripted edit broke two spec files.** It used `String.replace` with a `'$'` in the
   replacement, which JS reads as `` $' `` (insert the rest of the file), mangling `m-writes.spec.ts`
   and `m-details.spec.ts` in `fe1ae1e1`. The type-check caught it before any CI run. It is repaired
   from the pre-edit files in `60639902`.
3. **Two measurement-premise errors, both corrected before they were reported:**
   - A "project-folder policy" I assumed and that does not exist.
   - A dimension caption.

## Branches and merge order

| Branch | CI | Migration |
| --- | --- | --- |
| `feature/s112-audit-rulings` | via `co-summary` (contains it) | none |
| `feature/s112-co-summary` | **running** | `20261840000000` — new function only |
| `feature/s112-m-loading` | queued | none |
| `feature/s112-display-size` | queued | none |
| `feature/s112-heic-conversion` | queued | none (script + doc) |

- **Order:** the overnight three, then `audit-rulings`, then `co-summary` and `m-loading` in either
  order, then `display-size`. `heic-conversion` is independent.
- ⚠️ **Migration order on production:** whichever of `20261840000000` (R5b) and S111's
  `20261820/30` lands second needs `supabase db push --include-all`.

## Owed to production (read-only first)

1. **R5b:** `20261840000000` adds one function and governs no row. Before it, measure how often money
   has been typed into descriptions:
   ```sql
   SELECT count(*) FILTER (WHERE status = 'signed') AS signed,
          count(*) FILTER (WHERE status = 'signed' AND
            (coalesce(description,'') ~ '\$\s?\d' OR coalesce(description,'') ~ '\d{1,3}(,\d{3})+(\.\d\d)?'
             OR title ~ '\$\s?\d')) AS money_like
   FROM change_orders WHERE NOT is_deleted;
   ```
2. **R7:** the HEIC count (unchanged from the overnight report), then the PREPARED runbook.
