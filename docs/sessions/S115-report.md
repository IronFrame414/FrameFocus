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

### Phase 1 — R11 (measured; Explore agent replayed all CREATE/DROP/ALTER POLICY across 257 migrations)
| what | number | command |
| --- | --- | --- |
| estimate tables | 11 `CREATE TABLE` (estimates, line_items, line_rows, categories, subcategories, files, sub_bids, sub_bid_requests, events, award_bases, proposal_views); 35 FK references to estimates | `grep -n -i -E "create table[^(]*estimate\|create table[^(]*proposal" supabase/migrations/*.sql` → 11; `grep -n -i -E "references (public\.)?estimate"` → 35 |
| final policies, 11 core tables | **34** (56 incl. cost_catalog, scope_library, instrument_rates, site_visit×4, signing_sessions, email_logs, contract_documents) | replay of every policy statement in migration order; 0 dynamic `EXECUTE`/`format()` policies; 2 `ALTER POLICY` (both `invoices`) |
| role-check forms in the 34 | `= ANY(ARRAY[…])` 22, `= 'literal'` 2, `pe_on_project()` 1, **no role check 11** (child SELECTs by containment), author floor 21, draft floor 19 | same replay |
| repo-wide forms | `get_my_role() = ANY` 451 lines/86 files; `= '` 77/27; `<> ALL` 22/10; `IN` 5/2; `pe_on_project` 113/8; `pe_on_estimate` 3/2; `can_view_project` 214/54; `is_assigned_to_project` 37/16; `is_owner_or_admin`/`has_role` 0 | `grep -c` per pattern |
| **"40 policies"** | **re-measured: it is not a count of estimate policies.** G3 = 40 of the **114 policies naming `project_manager`** (spec :175): directories 7, catalog/scope I/U 4, `projects_insert` 1, **estimate writes 21**, site-visit SELECTs 4, no-project safety 3. The replay reproduces the **21** estimate write policies exactly | replay + spec |
| **PE estimate READ today** | **already open in the DB** for converted estimates: `estimates_select_project_executive` (`20261830000000`): `project_id IS NOT NULL AND pe_on_project(project_id)`; every child table SELECT is containment, so line items/rows (with `markup_percent`, `unit_cost`), categories, files, events, proposal_views follow. Markup columns (`labor/material/subcontractor_markup_percent`, `pricing_mode`, row `markup_percent`) have no column-scope trigger. Margin is **computed** (`packages/shared/utils/estimate-totals.ts`, `lib/estimate-health.ts:104`), never stored | read |
| PE estimate WRITE today | none (21 write policies O/A/PM; all child writes need parent `status='draft'`) — a **converted** estimate is `status='converted'`, so it is unwritable by everyone | replay |
| what "its own projects" covers | only the converted estimate (`convert_estimate_to_project()` sets `estimates.project_id`, `20261770000000:332-335`). Earlier versions, voided/superseded versions, pre-conversion lead estimates and site visits have `project_id NULL` → **no project to scope by** | read |
| app gates blocking PE | 4 pages redirect (`estimates/page.tsx:66`, `new/page.tsx:20`, `[id]/page.tsx:27`, `[id]/proposal/page.tsx:32`: O/A/PM); `api/estimates/[id]/proposal-data` 403; nav entry O/A/PM (`dashboard-shell.tsx`); `BuilderRole` type `estimate-builder.tsx:42`; send/resend O/A only; `api/proposals/generate` has **no role check** (RLS only) | read |
| tests asserting the exclusion | 3 files: `test/s130-ffnav.test.ts:109-116` (nav = O/A/PM, "S111 Q7: no sales-stage access" — will invert), `test/s111-project-executive-floor.live.ts:109-129` (PE sees exactly owner's rows on assigned projects; never NULL-project), `test/s114-pe-financials-drop.live.ts:11` (comment) | `grep -rln "project_executive" test e2e \| xargs grep -l -i estimate` → 3 |

**Consequence for R11:** reading the estimate behind an assigned project's proposal — markup and margin included — needs **no migration**: the rows already reach the PE. What blocks it is 4 page redirects, 1 API 403 and 1 nav gate. ⚠️ But the use case in R11 ("builds the budget jointly and presents the proposal PDF") happens **before** conversion, when the estimate has no `project_id`. Scoping those to "its own projects" is impossible without a new per-estimate assignment → ASK. Writing (building) an estimate is the 21-policy widening with a migration.

### Phase 1 — H-1 (partial; timings)
| what | number | command |
| --- | --- | --- |
| file | `apps/web/middleware.ts` | — |
| matcher (verbatim) | `'/dashboard/:path*', '/m', '/m/:path*', '/portal', '/portal/:path*', '/onboarding', '/onboarding/:path*', '/sign-in', '/sign-up', '/locked', '/trial-limit', '/api/:path*'` | read |
| is it broad? | **No.** It is an explicit allow-list; static assets, `_next/*`, images, fonts, `/bid/*`, `/sign/*`, `/invite`, `/reset-password`, `/terms`, `/privacy` are already **excluded**. There is nothing to narrow without dropping a route that needs the session refresh (the comment block documents why each is there) | read |
| network calls, owner on `/dashboard/*` (non-billing) | **5 sequential**: `auth.getUser()` (Auth server) → `rpc is_my_company_locked` → `profiles` → `companies` (owner only, billing enforced) → `subscriptions` | read |
| other roles on `/dashboard/*` | 4 (no `companies`); on `/m`, `/portal`, `/api/*`: 2 (getUser + lock RPC); portal when locked: +1 | read |
| per-call latency, Codespace → rebuild-test, qa-b-owner, n=20 medians | getUser 53–74 ms; **getClaims 1 ms (local ES256 verify)**; lock RPC 49–81; profiles 43–82; companies 41–79; subscriptions 73 | `node scratchpad/h1-time.mjs josh+qa-b-owner@worthprop.com` (two runs; p90 spikes to 3 s on run 2 — rebuild-test is shared with main's running CI) |
| today's owner chain | 337 ms (sum of medians, run 2) → 204 ms parallelised → 152 ms with getClaims | same |
| JWT signing | both projects serve an **ES256** JWKS → `getClaims()` verifies locally; auth-js caches the JWKS in a module-level `GLOBAL_JWKS`, so a warm isolate makes no network call | `curl https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`; `grep -n GLOBAL_JWKS node_modules/@supabase/auth-js/dist/module/GoTrueClient.js` |
⚠️ Instrument caveat: these are Codespace→Supabase round trips, **not** Vercel→Supabase (same region per D-4, so each hop there is smaller). The **count** (5 sequential per request) is exact; the ms are relative. Production could not be timed server-side: I hold no production credentials, by design.

### Phase 1 — H-1 (continued): how many times middleware runs for ONE screen load
Instrument: local **production** build (`next build` → `BUILD_EXIT=0`; `next start -p 3000`) against rebuild-test, Playwright/CDP, signed in as `josh+qa-admin@worthprop.com`, project `4a4f8567…` ("QA A — isolation fixture", the company's heaviest: 85 live `files` rows, chosen by `scratchpad/pick-project.mjs` over 17 projects). Script: `scratchpad/nav-measure.mjs` (counts every request whose path the matcher catches). ⚠️ Local server + Codespace→Supabase, not Vercel; counts are exact, ms are relative.

| screen | middleware runs per cold load | of which |
| --- | --- | --- |
| project overview | **19** | 1 document + ~16 `<Link>` **prefetch** RSC requests (sidebar nav ×12, project tabs) + `/api/chat/threads` |
| project Photos | **32** | 1 document + prefetches incl. **one per photo tile** (`/files/<id>/markup`) and 5× the Photos tab itself + 4× `/api/chat/threads` |
| project Budget | **23** | same shape |
| `/m` (→ `/m/timeclock`) | **5** | |
| `/m/projects` | **11** | |
Each run costs 4 (5 for an owner) sequential Supabase round trips **before** the request is served, and each dashboard prefetch also renders the dashboard layout. With 0 `loading.tsx` files in the app (`find app -name loading.tsx` → 0), a dynamic-route prefetch carries no page data, so these prefetches buy little.

### Phase 1 — H-2 (measured; Explore agent + my baseline timings)
| what | number | command |
| --- | --- | --- |
| `loading.tsx` / `error.tsx` in `app/` | 0 / 0 | `find app -name loading.tsx` |
| `<Suspense>` on these routes | 0 (2 files app-wide: invite/accept, sign-in form) | `grep -rl Suspense app components` |
| React `cache()` | 2: `createClient` (one client per request) and `getMyLanguage`; **no cache for getUser / profile / getProject / company settings** | grep `cache` from 'react' |
| `auth.getUser()` call sites | 156 in `app/`, 35 in `lib/` | grep |
| `getUser()` per request | overview **6**, Photos **7**, Budget **6**, `/m/timeclock` 4 (+2 via the `/m` redirect), `/m/projects` 4 | traced |
| sequential page round trips (worst case, owner) | overview **13**, Budget **~36**, Photos 2 (+2 queued auth), `/m/projects` 5, `/m/timeclock` 4 | traced |
| duplicates per overview request | `profiles` ×5, `companies` ×5, `projects` ×3 | traced |
| auth-js lock | every PostgREST call awaits `auth.getSession()` through the same per-client queue that `getUser()` holds for its whole network call (`GoTrueClient.js:2229-2269,2444`) → repeated getUser calls serialize everything behind them (inferred from the library, not measured) | read |

**Baseline (before), same instrument as the after-measurement will use** — median of 3 cold loads, `RUNS=3 PID=4a4f8567… node scratchpad/nav-measure.mjs josh+qa-admin@worthprop.com`, exit 0:
| screen | server TTFB ms | load ms | JS KB (transferred) | total KB | requests | middleware runs |
| --- | --- | --- | --- | --- | --- | --- |
| overview | 1054 | 1268 | 266.5 | 411.6 | 54 | 19 |
| Photos | 675 | 828 | 253.9 | 405.8 | 72 | 32 |
| Budget | 1154 | 1317 | 258.4 | 408.5 | 57 | 23 |
| `/m` → `/m/timeclock` | 621 | 1077 | 229.8 | 360.5 | 39 | 5 |
| `/m/projects` | 430 | 561 | 223.5 | 354.7 | 38 | 11 |

### Phase 1 — H-4 (first pass)
| what | number | command |
| --- | --- | --- |
| First Load JS shared by all | 87.8 kB; middleware bundle 92.9 kB | `next build` output (`scratchpad/build-base.log`) |
| heaviest routes (First Load) | `/dashboard/estimates/[id]` 286 kB, `/dashboard/settings` 249, `/dashboard/expenses` 229, `…/deliveries/[poId]` 223, `…/safety/[incidentId]` 214 | same, 269 routes sorted |
| JS transferred on the H screens | 224–267 KB per cold load (table above) — no 45 MB-class outlier | CDP `encodedDataLength`, resourceType Script |

### Phase 1 — F-11 (measured)
| what | number | command |
| --- | --- | --- |
| E2E job, 3 recent green runs | 44.7 / 45.5 / 42.8 min wall; **"Run Playwright tests" step 41.2 / 42.1 / 40.3 min**; build 1.3–2.0; install+npm ci ~1 | `gh run view <id> --json jobs` for 36496252226, 36488865320, 36439127547 |
| tests | **612** (591 passed, 21 skipped), **1 worker** | run log: "Running 612 tests using 1 worker" / "591 passed (41.2m)" |
| per-spec breakdown | **not measurable from CI**: `reporter` in CI is `[['github'],['html']]` (`playwright.config.ts:94`); the html report uploads only on failure. The `github` reporter prints no per-test lines — which is also why a hung run and a slow run look identical | `grep -n reporter apps/web/playwright.config.ts` |

---

## Phase 2 — every question, in full (unattended: written, pushed, then Phase 3 proceeds under the narrower-default rule)

R9 verified built before asking: `lib/chat/photos.ts:85` `.eq('category', 'photos')`.

```
Q1. [ASK-19] R10 lets Owner/Admin/PM/PE add and edit a project's ORIGINAL budget lines "until the first invoice is
    issued". Measured: an invoice is issued when it leaves draft/pending_approval for 'sent' (sent_at set, number
    assigned). After that it can be 'paid' or 'voided'. Does a VOIDED invoice still count as "the first invoice was
    issued" (the window never reopens), or does voiding every issued invoice reopen budget editing?
    Options: A) any invoice with sent_at set, voided included — once issued, closed for good
             B) only a live sent/paid invoice — void-and-reissue reopens the window
    My recommendation: A — it is the narrower window, a void is an accounting event not an undo, and B lets a
    budget be rewritten after the client has seen a bill.
    TAKEN (unattended, narrower): A.

Q2. [ASK-R10-PM] R10 includes the Project Manager. But an original line's only money is
    project_budget_amounts.budgeted_amount, which the Financial Visibility Floor (RULED S150) withholds from a PM for
    read AND write — PMs see actual + committed cost only. How should the PM take part?
    Options: A) PM gets no budget-line editing (Owner/Admin/PE only) until you rule
             B) PM may add lines and edit their description/cost code, never the amount (it cannot see it)
             C) PM may type an amount it can never read back (write-only through a function)
             D) open budgeted_amount to the PM — this changes the Floor
    My recommendation: B — it gives the PM the structural half without touching the Floor; C is a trap (a figure
    you cannot see is a figure you cannot check); D is a Floor ruling, not an R10 detail.
    TAKEN (unattended): A — the narrowest; stop rule 4 forbids D, and B/C need your word. PM arm withheld.

Q3. [ASK-R10-SCOPE] R10 overturns the S97 immutability ruling (20260818000000: "the absence of UPDATE and DELETE
    policies on this table is deliberate… a new line via a change order") for ORIGINAL lines. Confirm the scope:
    edit = description, cost code and amount of original lines, plus ADD new original lines; NO delete of any line;
    change-order lines and ad-hoc/Miscellaneous lines stay immutable exactly as today.
    Options: A) as stated  B) also allow deleting an original line that has no actuals/commitments
    My recommendation: A — delete is not in R10's words, and a line with charges cannot be deleted anyway (FK).
    TAKEN (unattended, narrower): A.

Q4. [ASK-20] R11: which estimate surfaces does the Project Executive reach, and may it SEND an estimate to a client?
    Measured: the PE can ALREADY read, in the database, the converted estimate of each project it is assigned to —
    lines, markup % and cost basis included (estimates_select_project_executive, 20261830000000; child tables follow
    by containment). What blocks it is the app: 4 page redirects, the proposal-data API (403) and the nav entry.
    Options: A) read-only: estimate list (its projects only), builder in read-only mode, proposal preview, PDF
                download — no edit, no send
             B) A plus edit (needs the 21-policy write widening + a migration)
             C) B plus send to the client
    My recommendation: A now — it delivers "the estimate behind the PDF he hands over" with no migration; sending a
    proposal for signature is contract-adjacent (R1 carve-out 2), so C should be its own ruling.
    TAKEN (unattended, narrower): A.

Q5. [ASK-R11-PRECONVERSION] R11's use case — "builds the budget jointly and presents the proposal PDF" — happens
    BEFORE the estimate becomes a project. Before conversion an estimate has project_id NULL, so "scoped to its own
    projects" covers nothing at that stage. Which do you want?
    Options: A) PE sees an estimate only once it is converted onto an assigned project (what A in Q4 delivers)
             B) PE may create estimates and sees the ones it authored (the PM's author-floor model) — migration,
                21 write policies + 1 read policy
             C) a per-estimate assignment (new table: "this PE is on this estimate") — migration, new UI
             D) PE sees all company estimates (company-level — contradicts R1 "nothing at company level")
    My recommendation: B — it mirrors the PM exactly, is one arm per existing policy, and covers "builds jointly"
    without a new concept. The per-assignment flag noted in R11's caveat stays unbuilt.
    TAKEN (unattended): A only; B/C/D prepared as a write-up, not built (a migration widening 21 policies on an
    unruled question is the "irreversible/stop-list" class for this session).

Q6. [ASK-21] C-12: the scope Summary is a plain textarea with no hint; authors type markdown (## headings, * bullets)
    and every surface prints it raw — and the client signing page collapses it into one paragraph. Should the
    summary be markdown, or should authors get a formatting control?
    Options: A) render a small markdown subset (headings, bullets, numbered lists, bold, paragraphs) identically on
                every surface — PDF, signing page, builder preview, project overview desktop and /m — and label the
                textarea "Formatting: ## heading, - bullet, **bold**"
             B) a formatting toolbar (bold/heading/list buttons) that writes the same subset
             C) strip the markup and show plain text
    My recommendation: A — the text already in the database becomes readable on every surface at once; B can be
    layered on A later because it would write the same syntax.
    TAKEN (unattended): A.

Q7. [ASK-22] F-11: the E2E step takes 40–42 min of a 50-min job (612 tests, 1 worker). Raise, shard or split?
    Options: A) raise timeout-minutes 50 → 75 and add a per-test 'list' reporter (per-test progress + durations
                in the log, so a hang is distinguishable from slowness)
             B) shard across N jobs — but workers:1 exists because specs share rebuild-test state; concurrent suites
                have already produced two false reds
             C) split the slowest specs into a second job (needs the per-spec timings that A produces)
    My recommendation: A now, C next session from A's timings.
    TAKEN (unattended, narrower): A.

Q8. [ASK-H3-STALETIMES] H-3 says `feature/s112-staletimes-hold` "raises the router cache above its 30-second default,
    so returning to a page is instant". It does the opposite: it sets staleTimes.dynamic to 0, so every revisit
    refetches (measured S112: 52 → 369 ms unthrottled, 51 → 639 ms Fast 3G, 51 → 2,129 ms Slow 3G). It fixes a
    CORRECTNESS problem (a page you just changed showing stale) at a speed cost. The ruled condition for revisiting
    it — loading feedback on /m — is met once m-loading ships.
    Options: A) do not ship it; keep Next's 30 s default (revisits instant; mutating screens refresh themselves)
             B) ship dynamic: 0 as held (always fresh, every revisit slower)
             C) RAISE dynamic above 30 s (faster still) — contradicts the S112 ruling that the cache must never hand
                back a page the user just changed
    My recommendation: A — in a PART whose goal is speed, B is a measured regression; the markup-save reorder
    already fixed the case that prompted it.
    TAKEN (unattended): nothing shipped (A); stopped and reported per the spec's "a measurement contradicts a RULED
    line → STOP" rule.

Q9. [ASK-H1-CLAIMS] H-1: the matcher is NOT broad — it is an explicit allow-list that already excludes static
    assets, images, fonts and every public route, so there is nothing to narrow. The cost is inside: 4–5 sequential
    Supabase round trips per middleware run (getUser → lock RPC → profiles → companies → subscriptions), and one
    screen load runs middleware 19–32 times. Built and merged-eligible: run the independent queries together
    (5 sequential → 3; decisions and their order unchanged). Separately built, NOT merged: replace the Auth-server
    call getUser() with getClaims() (local ES256 signature check, ~1 ms vs ~50–70 ms) everywhere except
    /sign-in and /sign-up, where the authoritative call stays (a revoked session must not bounce between /sign-in
    and /dashboard). Every layout still calls getUser(), so who reaches a page is unchanged.
    Options: A) merge the getClaims branch  B) keep getUser in middleware
    My recommendation: A — Supabase's own guidance for middleware; the layouts remain the authoritative check.
    TAKEN (unattended): B for now (stop rule 6 — an auth-gate change beyond matcher narrowing waits for you).

Q10. [ASK-H5-PREFETCH] Every <Link> in the dashboard sidebar and project tabs, and every photo tile, prefetches its
    route on load; each prefetch runs middleware (4–5 round trips) and renders the dashboard layout. With no
    loading.tsx anywhere, a dynamic-route prefetch carries no page data, so it buys almost nothing. Turn it off?
    Options: A) prefetch={false} on sidebar/tab links and photo tiles
             B) keep prefetch, add loading.tsx boundaries — but S112 measured loading.tsx breaking 404 and
                redirect semantics under /m (CI 6 red) and the same applies under /dashboard
    My recommendation: A. See the H-5 ranked list for the measured effect.

Q11. [ASK-C11-ROLES] C-11: who may delete a project photo? CLAUDE.md's approvals table says "Delete files: Owner,
    Admin, PM ✓; Foreman —", and R1 gives the PE everything a PM has on its projects. /m today shows Delete to
    Owner/Admin only; desktop shows nothing. The database is wider still: RLS lets a PM, foreman and crew member
    soft-delete a photo on a project they can view.
    Options: A) Owner/Admin/PM/PE on both surfaces (the approvals table + R1), one shared rule
             B) Owner/Admin only on both surfaces (today's /m)
    My recommendation: A, and separately floor the foreman/crew soft-delete in RLS (filed as debt, needs your word).
    TAKEN: A — it is the written rule, not an unruled choice; the widening on /m for PM is the PARITY fix.

Q12. [ASK-F12-ORDER] F-12: `feature/s114-c5-multi-upload` touches 11 components, covers only 7 of #2-s180u's 8
    (the portal composer is missing), and does the ruled step 2 (adding `multiple` to new inputs) in the same
    commit as step 1 — the ruling says step 1 first, then step 2. Proofs present: 0 of 8. It also has a duplicate-
    on-retry risk (a photo that uploads but fails to link is uploaded again on retry, leaving an unlinked row).
    Options: A) split it: step 1 (the 8, incl. portal) with 8 per-surface proofs merges first; step 2 after
             B) keep the one commit and add proofs for all 11
    My recommendation: A — it is the ruled order.

Q13. [ASK-C12-SENT] C-12's renderer change will also change how ALREADY-SENT but unsigned proposals look on the
    signing page (it renders from live data), and a re-generated PDF of an existing estimate. Stored PDFs of signed
    contracts are files and are NOT re-rendered. Acceptable?
    Options: A) yes — they become readable  B) freeze old proposals' look
    My recommendation: A.
```

---

## Phase 3

### Part 1 — H-1 middleware — branch `feature/s115-h1-middleware` @ `341f6229`
- **Matcher: not narrowed** — measured not broad (explicit allow-list; see Phase 1). Narrowing further would drop a route that needs the session refresh.
- **Built:** the lock RPC and the profile read run in one `Promise.all`; the card-gate read and the subscription read run in one `Promise.all`. Every decision reads the same values in the same order (lock → role guard → card gate → subscription). Owner `/dashboard`: 5 sequential round trips → 3; other dashboard roles 4 → 3. `middleware.ts` is not Prettier-clean on main → hand-formatted, diff 49+/19−, only the touched blocks.
- **Measured the call, not the page** — temporary uncommitted wrapper stamping `x-mw-ms` on every middleware response; built once from `origin/main:apps/web/middleware.ts`, once from this branch; `next build` exit 0 both; 30 requests each as `josh+qa-admin` (`scratchpad/mw-compare.sh`, `mw-time.mjs`):

| request | before median (p10/p90) | after median (p10/p90) |
| --- | --- | --- |
| document `/dashboard/projects/:id` | 168 ms (152/304) | **120 ms** (111/148) |
| prefetch RSC `/dashboard/projects/:id/budget` | 159 ms (141/179) | **128 ms** (114/173) |
| `/api/chat/threads` (path unchanged: getUser + lock only) | 75 ms (67/94) | 80 ms (74/95) — control, no change expected |
  Wrapper removed; `cmp` against the saved after-file identical; `grep -c x-mw-ms middleware.ts` → 0. Codespace→rebuild-test hops; on Vercel the absolute numbers are smaller, the saving is one round trip per middleware run (×19–32 runs per screen).
- **Negative tests** `e2e/s115-middleware-gate.spec.ts`: signed-out `/dashboard`, `/dashboard/projects`, a project, `/dashboard/billing`, `/dashboard/team` → `/sign-in`; `/m` → `/sign-in?next=%2Fm`; `/api/chat/threads` → 401; `/sign-in` 200 with form; `/terms`, `/privacy` 200 not redirected; `/bid/<fake>`, `/sign/<fake>` not sent to `/sign-in`. **12 passed** (`E2E_EXIT=0`) on the production build.
- **Sabotage:** signed-out redirect target `'/sign-in'` → `'/terms'` (anchor matched exactly once) → rebuilt (exit 0) → **5 failed / 7 passed** (the 5 `/dashboard` cases), `E2E_EXIT=1`. Restored from the saved copy, `cmp` identical, `grep -c "appUrl('/terms'"` → 0; rebuilt (exit 0); **12 passed**.
- Signed-in halves ride existing specs unmodified: role guard `desktop-dashboard-guard.spec.ts`, trial lock `desktop-trial-screens.spec.ts` (run in CI).
- ⚠️ **Slip:** the H-1 commit was pushed without `[skip ci]` while main's CI (36500016295) was still in E2E. The run 36502727258 could not be cancelled (`gh run cancel` → HTTP 403, token lacks the permission). The two suites overlap for ~10 minutes. A red in either inside that window is treated as a suspected concurrency false red, re-run before any conclusion, and not counted toward stop rule 7.
- ⚠️ Instrument slip, no effect on results: two `pgrep -f` kill loops matched their own shell (exit 144) — the CLAUDE.md trap. The sabotage restore had already completed and read back identical. Replaced by `scratchpad/stop3000.sh` (kills the PID `ss` reports listening on :3000).
- **getClaims (Q9):** not built into this branch.

### Part 6 — F-11, built early (order deviation, recorded) — branch `feature/s115-f11-ci-timeout` @ `b6e58b0d`
- Built out of order because every later part's CI run sits 3–8 minutes under the 50-minute cap; a cancel would cost a full re-run each time. Two lines, reversible.
- `ci.yml` e2e `timeout-minutes: 50 → 75`, with a `50 -> 75 [S115, F-11]` line added to the existing 20→35→50 history block (the file already calls this a treadmill; recorded as the narrower default pending ASK-22). Sharding stays ruled out by that block (`workers: 1` is load-bearing).
- `playwright.config.ts`: CI reporter `[['github'], ['html']]` → `[['github'], ['list'], ['html']]` — one line per test with its duration, so the per-spec breakdown can be summed from the log and a hang shows its last line.
- Checks: `CI=1 npx playwright test --list` exit 0 (612 tests listed); YAML parsed with `js-yaml` → e2e timeout 75; `tsc --noEmit` exit 0; `playwright.config.ts` is Prettier-clean on main → the reporter line was re-formatted to Prettier's one-line form (second commit), verified with the repo's Prettier 3.8.1 via `--stdin-filepath`.
- ⚠️ Instrument slip caught: I first ran Prettier on a `/tmp` copy of main's files (the listed "wrong scope" trap — no repo config there, so it reported main as unformatted). Re-checked every file with `git show origin/main:<f> | npx prettier --check --stdin-filepath <f>`.

### Part 2 — H-2 waterfalls — branch `feature/s115-h2-waterfalls` @ `4527302a`
**Built:** `getRequestUser()` (per-request `cache`) replaces the getUser pattern in 8 files (dashboard + /m layouts, overview + budget pages, `getMyMember`, 5 functions in `company.ts`, `getMyProfile`, `getMyLanguage`); `getProject` memoized per request; project layout fetches project ∥ role; **overview**: 11 sequential awaits → 2 stages (guards, then everything in one `Promise.all`); **budget**: 1 + 6 sequential money reads → 1 `Promise.all` of 11, every gate condition unchanged; `/m` layout starts `getMembers`/`getUnreadCount` before the profile read (the dashboard layout's existing Option 2); `/m/projects` fetches translator ∥ projects ∥ tz ∥ mine ∥ session, only punch counts wait. Guards are judged in the original order and nothing money-bearing starts before they pass. Formatting: 8 of 12 files Prettier-clean on main stay clean; 4 that were not (budget page, overview page, company.ts, members.ts) hand-formatted, changed-line counts match the edits (+43/−19, +58/−45, +6/−16, +2/−4).

**Measured — deterministic, server side, same instrument both times** (`scratchpad/h2-compare.sh`): a `--require` preload logs every server-side fetch to `*.supabase.co` with start/end; one document request at a time per screen, 5 runs each, `josh+qa-admin`, project `4a4f8567…`. "Sequential depth" = the longest chain of Supabase calls where each starts after the previous ended (the waterfall). Built from `origin/main`'s versions of the 12 files (`git checkout origin/main -- <files>`, BUILD_EXIT=0) and from HEAD (BUILD_EXIT=0); restored with `git checkout HEAD -- <files>` → 0 lines differ from HEAD.

| screen | Supabase calls (before → after) | Auth-server calls | **sequential depth** | server wall, median of 5 |
| --- | --- | --- | --- | --- |
| project overview | 27 → 27 | 1 → 1 | **7 → 5** | 705 → **532 ms** |
| project Photos | 15 → 15 | 1 → 1 | 3 → 3 | 427 → 415 ms |
| project Budget | 39 → 39 | 1 → 1 | **16 → 8** | 1155 → **899 ms** |
| `/m/timeclock` | 13 → 13 | 1 → 1 | 5 → 4 | 389 → 346 ms |
| `/m/projects` | 12 → 12 | 1 → 1 | 5 → 4 | 612 → 520 ms |
(Middleware runs in the edge sandbox and is not in these counts; it is measured under H-1.)

⚠️ **Correction to Phase 1's H-2 row.** The agent-traced "getUser per request: 6–7" is **not** what reaches the network: the preload saw **one** Auth-server call per render **before** the change too, because Next 14's patched `fetch` memoizes identical GETs within one render (the same reason `profiles`×5 costs fewer calls than it reads). So `getRequestUser` saved **no** network call; it only removes queued duplicate awaits. The measured gain is the **depth** (the `Promise.all` restructuring), not the call count. Photos had no page-level waterfall to remove.
- Unit: `test/s115-request-user.test.ts` 3/3 (+ `supabase-server.identity.test.ts` 2/2), `VITEST_EXIT=0`. Sabotage: `getRequestUser` as a module-level memo (a cross-caller singleton) → **2 failed / 1 passed**, restored, `cmp` identical, 3/3.
- `tsc --noEmit` exit 0; `next build` BUILD_EXIT=0.
- **Remaining depth on Budget (8)** is inside services (`getBudgetRollup` 8 serial, `getJobCostRollup` 6 serial) → H-5 ranked list.

### Part 3 — H-3 — branch `feature/s115-h3-m-loading` @ `a129f39b` (m-loading only; staletimes STOPPED, Q8)
- Rebuilt `s112-m-loading` onto current main rather than rebasing it: `nav-pending.tsx` and the S112 R2 doc taken verbatim (`git show`), the shell mount (Suspense + `<NavPending />`) and the R2 punch-row e2e test re-applied by exact anchors. **Its 4 Prettier-reflow hunks of unchanged lines are NOT carried** — proof: the `+` lines of my `m-sections.spec.ts` diff equal the original branch's `+` lines minus exactly the 6 reflowed lines (`diff` of the two `+`-line lists). Diff: 2 files +34/−1, plus the 2 new files.
- `tsc` exit 0; `next build` BUILD_EXIT=0; R2 test **1 passed** (+ auth setup), `E2E_EXIT=0`.
- **Sabotage:** `<NavPending />` → `{null}` (anchor matched once) → rebuilt (exit 0) → R2 **1 failed** (`expect(locator).toBeVisible()`), `E2E_EXIT=1`. Restored from the saved copy, `cmp` identical, `grep -c "<NavPending />"` → 1. Rebuilt (exit 0): `m-sections.spec.ts` + `m-shell.spec.ts` in full → **114 passed, 4 skipped**, `E2E_EXIT=0`.
- PARITY: `/m` only by nature — desktop has its own sidebar and was not part of the S112 ruling; the ruling's condition ("/m has loading feedback on navigation") **is met once this merges**. The staletimes half is **stopped**: its premise in H-3 is contradicted by measurement (Q8).

### Part 4 — C-12 — branch `feature/s115-c12-scope-render` @ `7174215a`
- **One parse, two renderers** (PARITY: the meaning is decided once, below the UI): `packages/shared/utils/scope-text.ts` (`parseScopeText`: `#`–`######` headings capped at 3 levels, `- * + •` bullets, `1.`/`1)` numbered with the author's numbers, `**bold**`/`__bold__`, blank line = paragraph, single newline kept as a line break; no lookbehind in the regex — Safari < 16.4 cannot parse one and this runs on crew phones; text nodes only, no HTML built from author text). `lib/proposal/scope-text-html.tsx` (browser) and `lib/proposal/scope-text-pdf.tsx` (React-PDF, Helvetica-Bold for bold).
- **Every surface Phase 1 found:** PDF (`proposal-template.tsx` → generate/send/resend/signing-service + builder & review-send previews), **client signing page** (`proposal-html.tsx`), desktop project overview (`projects/[id]/page.tsx`), `/m` project overview (`m/p/[projectId]/overview/page.tsx`). Client portal and email bodies render no scope (measured) — nothing to change there.
- **Editor (ASK-21, taken A):** hint under the textarea ("Formatting: ## Heading · - bullet · 1. numbered · **bold** · a blank line starts a new paragraph") and a live "On the proposal:" preview using the same renderer.
- Tests `test/s115-scope-text.test.tsx` **9 passed** + `s112-client-proposal.test.tsx` 23 passed, `VITEST_EXIT=0`. Surface tests assert through what each surface calls: `ProposalHtml` over `trimProposalForClient(...)` (as `sign/[token]` serves it) → 3 headings, 2 `<ul>`, 1 `<ol>`, `<strong>`, a kept `<br/>`, no `##`/`* `/`**`; `ProposalDocument` → `renderToBuffer` → `pdfText` → words present, no `##`, no `**`, no line starting `* `.
- **Sabotage:** main's `proposal-html.tsx` + `proposal-template.tsx` checked out → **3 failed / 6 passed** (both signing-page tests and the PDF test), `VITEST_EXIT=1`. Restored from saved copies, `cmp` identical both, **9 passed**.
- `tsc` exit 0; `next build` BUILD_EXIT=0. Formatting: 2 renderer files Prettier-clean on main stay clean; 4 that were not are hand-formatted (+30/−1 text-tabs, +3/−3 overview, +6/−3 /m overview, +4/−3 template).
- Q13 (already-sent unsigned proposals change look on the signing page; stored signed PDFs do not) — taken A.
