# S115 — build every S114 addition (unattended) — REPORT

Running log. Appended, committed and pushed after every measurement, run, sabotage, decision and stop.
Branch for this log and the spec fold: `feature/s115-report` (docs-only).

## Ordering (from the S115 prompt)

- **Step 0** — fold `S114 spec additions` into `docs/specs/S114-SPEC-close-open-items.md` in place; delete the additions file. R9 recorded as a ruling, nothing built.
- **Phase 1 — measure, read-only:** H-1, H-2, H-3, H-4, C-12, C-11, R10, R11, F-11, F-12.
- **Phase 2 — every question in one plain-text message, appended here and pushed;** then proceed under the unattended rule (reversible+unruled → narrower option, recorded; irreversible/stop-list → prep, write-up, stop that part only).
- **Phase 3 — build, each part its own branch from main, in order:**
  1. H-1 middleware matcher (negative tests: protected route still redirects signed-out; public route loads)
  2. H-2 waterfalls (before/after ms, same method)
  3. H-3 ship `s112-m-loading`, then un-park `s112-staletimes-hold`
  4. C-12 scope renders as written on every surface
  5. C-11 project photo delete works
  6. F-11 CI timeout
  7. R10 original budget line items editable until first invoice
  8. R11 PE estimate access, project-scoped, incl. markup/margin (migration + runbook)
  9. F-12 C-5 eight per-surface proofs
  10. H-4 / H-5 bundle weight, then ranked list with a decision on each
- **Stop rules:** production writes; destroying/moving rows; constraints over existing prod rows; weakening the Financial Visibility Floor; refund/contract authority; route-reach changes beyond H-1; CI red twice on one cause.

## Log

### 2026-09-28 — session start
- `git fetch`; `origin/main` = `33be035c` (matches the prompt).
- `supabase/.temp/project-ref` = `nmyphyhmfttxkdoposvf` (rebuild-test). Read only; never written.
- Serena MCP failed to connect this session (`uvx` not found); symbol searches use grep with stated counts.
- ⚠️ The prompt names the additions file `docs/specs/S114-SPEC-additions-2026-09-28.md`; on disk it is the **untracked** `docs/specs/S114 spec additions.md` (184 lines). Same content per its heading (`# S114 spec additions — 2026-09-28 (evening)`). Used that file.
- Untracked `RUNBOOK.md` and `S114-C-questions.md` at repo root are not mine; left untouched.

### Step 0 — spec fold (done)
- Folded R9–R11 (new `# RULED [Josh, 2026-09-28]` block after R8), C-11/C-12 (end of PART C), F-11–F-13 (end of PART F), G-7/G-8 (end of PART G; the additions' G-6 restates the existing G-6 — noted, not duplicated), new PART H (after PART G), ASK-19–22 (appended to ASK list), and "Production state recorded 2026-09-28" (before Standing constraints). Each folded block is tagged `[Folded in S115 …]`.
- Spec 719 → 895 lines (`wc -l`). Additions file (untracked, never committed) deleted with `rm`.
- **R9 is recorded as already built; nothing built for it.**

### Phase 1 — H-3 (measured)
| what | number | command |
| --- | --- | --- |
| `s112-m-loading` commits not on main | 6 (c34133ef…72d603b3), tip 2026-09-27 00:59Z | `git log --oneline main..origin/feature/s112-m-loading` |
| `s112-m-loading` diff | 4 files, +213/−13: `app/m/nav-pending.tsx` (new, 92), `mobile-shell.tsx` (+mount), `e2e/m-sections.spec.ts` (+1 test), a doc | `git diff --stat main...origin/feature/s112-m-loading` |
| its CI | **green** — run 36284154586 on 72d603b3 (30m52s). The spec's "pushed without CI" (F-8 / H-3) is **stale**; the earlier red 36246627024 was the dropped `loading.tsx` | `gh run list -b feature/s112-m-loading` |
| reflow in it | 4 hunks are pure Prettier reflow of unchanged lines (2 in `mobile-shell.tsx`, 2 in `m-sections.spec.ts`); both files **fail** `prettier --check` on main → the reflow violates the formatting rule and will be dropped when rebuilt | `npx prettier --check apps/web/app/m/mobile-shell.tsx apps/web/e2e/m-sections.spec.ts` (2 warn) |
| `s112-staletimes-hold` diff | 1 file, +19: `experimental.staleTimes: { dynamic: 0 }` | `git diff main...origin/feature/s112-staletimes-hold` |
| both merge cleanly onto main | yes / yes | `git merge-tree --write-tree main origin/feature/<b>` |

⚠️ **CONTRADICTION — H-3's premise is false.** The spec says `s112-staletimes-hold` "raises Next's client router cache above its 30-second default, so returning to a page you just visited is instant." It does the **opposite**: it sets `staleTimes.dynamic` from 30 s to **0**, so every revisit refetches. Its own measurement (`docs/sessions/S112-router-staleness.md` §1): tab revisit 52 → 369 ms unthrottled, 51 → 639 ms Fast 3G, 51 → 2,129 ms Slow 3G. It is a **correctness** fix (stale page after a mutation), bought with speed. Shipping it inside "the app is slow, fix it" makes navigation slower. Per the spec's own rule ("if a measurement contradicts a RULED line, STOP and report"), the staletimes half of H-3 **stops** and goes to Josh as an ASK; the m-loading half proceeds.

### Phase 1 — C-12 (measured; code-read by a read-only Explore agent, key lines re-read by me)
| what | number / location | command |
| --- | --- | --- |
| where scope lives | `estimates.scope_summary` text (baseline `20260101000000:1353`) + `estimates.scope_sections` jsonb `[{title,bullets[]}]`; copied to `projects.scope_summary/scope_sections` on conversion | `grep -nE "scope_of_work\|scope_text\|scope_summary\|scope_sections" packages/shared/types/database.ts` → 18 |
| app refs | `scope_summary\|scopeSummary` 24; `scope_sections\|scopeSections` 16 | `grep -rnE "…" apps/web packages --include=*.ts --include=*.tsx` |
| editor | **plain `<textarea rows=3>`**, `app/dashboard/estimates/[id]/text-tabs.tsx:576-584`; label "Summary (shown at the top of the scope on the proposal)"; **no markdown hint anywhere**. Section titles/bullets are single-line inputs (can't hold markdown structure) | read |
| surface 1 — PDF + builder preview + review-send preview | `lib/proposal/proposal-template.tsx:203` `<Text>{scopeSummary}</Text>` — React-PDF keeps `\n`, prints `##`/`*` literally. Rendered by `proposal-service.ts:28` for generate/send/resend/signing-service | read |
| surface 2 — **client signing page (the "sent" version)** | `lib/proposal/proposal-html.tsx:146-148` plain `<p>` **with no `whiteSpace`** → every newline collapses to a space = "one paragraph". The intro (:136) and terms (:476) do have `pre-wrap`; scope was missed | read |
| surface 3 — desktop project overview | `app/dashboard/projects/[id]/page.tsx:686-691` pre-wrap, raw | read |
| surface 4 — `/m` project overview | `app/m/p/[projectId]/overview/page.tsx:164-167` `whitespace-pre-line`, raw | read |
| client portal / emails | **no** scope rendered (portal `financials/page.tsx:107` is a subtitle; `proposal-email.tsx` has none) | grep |
| markdown deps | `react-markdown ^10.1.0` + `remark-gfm ^4.0.1` direct in `apps/web/package.json`; used only by `components/public/markdown-doc.tsx` (terms/privacy) — cannot render into React-PDF | `grep -nE 'react-markdown\|…' package.json apps/*/package.json packages/*/package.json` → 2 |
| AI writing scope | **none** — only `text-tabs.tsx:485` writes `scope_summary` (plus SQL copy on conversion). Markdown is typed/pasted by authors (FILL-C-12.2: authors type markdown into a plain textarea because nothing told them otherwise) | grep of OpenAI callers |

### Phase 1 — C-11 (measured; Explore agent trace, key claims re-run by me)
| what | number / location | command |
| --- | --- | --- |
| delete controls on desktop Photos tab | **0** | `grep -rniE "delete\|trash\|remove" app/dashboard/projects/[id]/photos \| wc -l` → 0 (re-run by me) |
| the only "Delete" a desktop user reaches from a photo | markup editor "Delete selected" (`markup-editor.tsx:406-413`) → `handleDeleteSelected` removes a **drawn shape** from React state; `disabled={!selectedId}` but its style always shows `cursor: pointer`, no disabled look → **looks live, does nothing** | `grep -rn "Delete" …/markup/markup-editor.tsx` |
| how desktop lost photo delete | `831879b4` (2026-09-27, S112 2a) took photos off the Files tab (`getDocumentFiles()` = `exclude_category: 'photos'`), removing the only desktop path to `softDeleteFile`; nothing replaced it on Photos | `git log --oneline -5 -- <file>` |
| `/m` photo delete | wired: grid bulk delete (`photo-grid.tsx:442-455`) and viewer (`viewer.tsx:364-374`) → `softDeleteFile` (`lib/services/files-client.ts:396-412`), which does `.update().eq().select('id')` + `applied()` → a 0-row RLS-filtered write **is reported as failure**, not success (not the C-8 `saveMarkup` shape). Shown only to owner/admin (`photos/page.tsx:79`, `[fileId]/page.tsx:105`) | read |
| `softDeleteFile` call sites | 5 (photo-grid, viewer, file-row-actions, payables-client cleanup) | `grep -rn "softDeleteFile" app components lib` → 9 lines incl. 4 def/import |
| RLS | `files_update_non_client` (`20260822000000:98-100`): owner/admin any row; PM/foreman/crew/sub on viewable projects for non-contract categories; PE arm `20261940000000:66`. `files_z_site_visit_freeze` blocks `is_deleted` on frozen site-visit photos (42501) | read |

**Verdict (FILL-C-11.1): no handler on desktop.** Not an RLS 0-row success. The fix is a real desktop photo delete through the same `softDeleteFile`, plus the markup button's disabled look.
**FILL-C-11.2:** today "delete" = soft delete (`is_deleted=true`, `deleted_at`), row and storage object kept (restorable from Trash via `getTrash()`); thumbnails/derivatives are untouched because the row survives; any daily log / estimate / sent document referencing the row keeps its reference. A frozen site-visit photo refuses with an error.
**FILL-C-11.3 PARITY:** `/m` works for owner/admin; desktop has nothing. ⚠️ Role gap: CLAUDE.md "Delete files: Owner/Admin/PM ✓"; `/m` gates owner/admin only; RLS lets PM/foreman/crew soft-delete. → ASK.

### Phase 1 — R10 (measured; Explore agent, policy counts from its greps)
| what | number / location | command |
| --- | --- | --- |
| where original lines live | `project_budget_items` (line; no money column since `20260817000000` dropped `budgeted_amount`) + `project_budget_amounts.budgeted_amount` (one row per line, UNIQUE `budget_item_id`) | `database.ts:6125,6173` |
| "original" as data | no origin enum; derived: `source_change_order_id IS NULL AND (source_line_row_id IS NOT NULL OR source_line_item_id IS NOT NULL)` (created by `convert_estimate_to_project`, latest `20261770000000:260,286`) | read |
| writers of the two tables | 53 write statements across migrations, mapped to 6 writers (conversion, CO apply, capture RPC, misc line, 2 recompute triggers) + app `createAdHocBudgetLine` | `grep -nE "(INSERT INTO\|UPDATE\|DELETE FROM) (public\.)?project_budget_(items\|amounts)"` → 53 |
| policies | 10 CREATE/DROP/ALTER POLICY statements; cross-check grep 22 lines, no extra | `grep -nE "(CREATE\|DROP\|ALTER) POLICY[^;]*ON (public\.)?project_budget_(items\|amounts)"` → 10 |
| `project_budget_items` UPDATE/DELETE | **no policy — deliberate.** `20260818000000_budget_line_immutability.sql` table comment: "THE ABSENCE OF UPDATE AND DELETE POLICIES ON THIS TABLE IS DELIBERATE… the answer is a new line via a change order." Guarded by `test/s97ct-budget-immutability.live.ts` via `budget_line_policy_digest()` | read |
| `project_budget_amounts` writers | owner/admin INSERT/UPDATE (`20260816000000`), PE INSERT/UPDATE on own projects (`20261910000000:105,107`). **No PM arm, read or write** | read |
| lock triggers | none (only updated_at/updated_by) | read |
| edit UI today | **none** on desktop (`budget/page.tsx` read-only for lines) or `/m` (no budget route) | read |
| "first invoice issued" | `invoices.status IN ('sent','paid','voided')` ⇔ `sent_at IS NOT NULL` (draft/pending_approval are unissued; `issue_date` defaults on drafts so unusable). Must be evaluated SECURITY DEFINER: a PM sees only invoices it authored (`20261038000000:70`) | read |

⚠️ **R10 collides with the Financial Visibility Floor for the PM.** An original line's only money is `project_budget_amounts.budgeted_amount`, which the Floor withholds from a PM for **read and write** (budgeted/sell is Owner/Admin — and PE on own projects). "PM may edit original budget line items" therefore either (a) lets the PM write a figure it cannot see, or (b) opens the figure to the PM. (b) is stop rule 4. → ASK; the PM arm is withheld, the rest is built.
⚠️ R10 also overturns the S97 immutability ruling for original lines (R10 is Josh's newer ruling, so it governs); the S97 test is inverted in place, not deleted.

### Phase 1 — F-12 (measured; Explore agent)
| what | number | command |
| --- | --- | --- |
| `#2-s180u` | on main `TECH_DEBT.md:2310`; RULED order: **(1) FIRST** move the 8 existing-`multiple` inputs onto `runUploadBatch` + `upload-batch-list` UI; **(2) ONLY THEN** add `multiple` to new inputs; "8 components, 8 proofs, each stating what it uploaded and what landed" | `git grep -n "2-s180u" $(git for-each-ref --format='%(refname)' refs/heads refs/remotes)` |
| branch vs main | 1 commit (`6409738e`, revert-of-revert of `39d4a493`), 12 behind, merges clean | `git log --oneline main..feature/s114-c5-multi-upload`; `git merge-tree --write-tree --name-only …` exit 0 |
| diff | 17 files, +620/−127: **11 upload components** + helper `uploadRemaining` + i18n + tests | `git diff --stat main...feature/s114-c5-multi-upload` |
| of the ruled 8 | **7 touched; the portal composer (`portal-writes-ui.tsx`) is NOT** | diff |
| ruled order | **violated** — step 2 (`multiple` on 4 new inputs: estimate Files tab, /m log, /m check-in, /m incident) is in the same commit as step 1 | diff |
| `upload-batch-list` UI | used by 0 of the 11 (ruling step 1 requires it) | diff |
| per-surface proofs present | **0 of 8** (0 of 11). Existing: 3 unit tests on the helper, 2 live timing runs that bypass components, 1 attribute-only e2e | read |
| defect risk | `uploadDailyLogPhoto` / `uploadIncidentPhoto` / `uploadExpenseReceipt` return `{success:false,id}` when upload succeeds but linking fails; `uploadRemaining` records successes only → a retry uploads a duplicate and leaves an unlinked `files` row | read |
