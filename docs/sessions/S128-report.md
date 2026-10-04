# S128 — Estimates & change orders: report

**Governing prompt:** `docs/prompts/S128-prompt.md` (on `main` at `d2c052a0`). **Spec:**
`docs/specs/estimates-and-change-orders-spec.md` (837 lines, read in full) and
`docs/specs/cost-codes-masterformat-1995.md` (§ 1 read before anything touches a code).

> ⚠️ The lead sections below (`WHAT JOSH DOES WHEN HE'S BACK`, `What Josh must RULE`, the plan) are filled in as the
> session reaches them. Until then this file is appended in session order.

## WHAT JOSH DOES WHEN HE'S BACK

1. **Part H walkthrough on the dev server** — the command, address, sign-in and click list are in Part H's entry
   (filled when Part H reaches rebuild-test).
2. Answer the rulings below (ASK-0 … ASK-UV), or let the recommendations stand.
3. Merge `feature/devcontainer-uv` (`94a08353`) — one `.devcontainer` commit, `[skip ci]`.
4. Reconnect the QuickBooks sandbox (carried from S127; S124 Parts 1 and 3 wait on it).
5. (Carried from S127, 5b) On a real iPhone at 402 px: on `/m`, open a daily log's close-out, tap a date field, pick a
   date, dismiss the picker, and say whether a white band appears under the tab bar.
6. (Carried from S127, B-2) On the same iPhone: Settings → Apps → Safari → Location → Allow, and Privacy & Security →
   Location Services → Safari Websites → While Using the App; clock in twice from the home-screen app and say whether
   it still asks.

## What Josh must RULE

Each is built on the **recommendation** unless it says STOPPED. Every one is reversible before its merge.

- **ASK-0 — production migration authority.** S127's prompt granted it in words ("MERGE AND PRODUCTION AUTHORITY IS
  GRANTED"). S128's says A/B/C/D/E-1/F/G "ship the normal way: … merged, migrations to production", against `CLAUDE.md`
  (S180: "applying a migration to production is still Josh's action"). **My reading: granted for those parts, as in S127,
  and never for Part H.** If wrong: I stop before each production push and the merges wait on you.
- **ASK-A1 — where a LINE description prints on formats that print no lines.** Summary-with-descriptions, Itemized-with-
  descriptions and Cost Plus print sections only (phase 1, A-2). Options: **A) under its section, a short list of the
  described lines only, "Line name — description"; lines without one print nothing (recommended)**; B) only T&M (the one
  format that prints lines) — contradicts your list of four. Breaks under A: nothing existing; the section description
  stays exactly where it is.
- **ASK-A2 — change-order line descriptions and the client.** A CO has no proposal format. **A) staff-only until COs get a
  format: stored, editable, never in the client payload (recommended — the safe side of stop rule 4)**; B) always shown
  to the client on the CO; C) follow the project's source estimate's format. Breaks under A: a description written on a
  CO does not reach the client yet; the field says so.
- **ASK-B1 — clearing the red manual total.** **Recommended: three paths, all existing words —** retype the total (takes
  the new cost, red clears); type a markup (releases the line, as today); and an explicit **"↺"** control titled
  *"Set by hand — click to revert to the computed total"* (the section override's own wording). Red always carries a
  title, never colour alone. **Existing hand-set totals have no recorded cost basis, so they are never red until
  retyped** — a stated gap, not a guess.
- **ASK-E1 — how far E-1 goes.** Bids, requests and the winner are keyed per SECTION in the schema, and award refuses a
  section with 2+ sub lines. **A) display fix (recommended): one card per SUB line, titled by the line, its section as
  context, its own amount; a single-sub-line section behaves exactly as today; on a section with 2+ sub lines the
  per-line award stays refused (as the database already does) with that said on the card.** B) re-key bids per line
  now — a schema redesign of the bid tables and the public `/bid` page, which is the separate build's interview subject.
- **ASK-F1 — where the cover lives.** **A) a staff-only `project_covers` table (recommended)**: a client has SELECT on
  `projects`, so a `projects.cover_file_id` column is readable through the REST API whatever the pages select, and
  `projects_column_scope` would meet a crew member's upload. B) the spec's `projects.cover_file_id` column.
- **ASK-F2 — which photos can become the default cover.** **A) images in category `photos` — what the Photos tab shows
  and what the picker offers (recommended)**; B) any image on the project (receipts, invoice scans, daily-log photos).
- **ASK-F3 — who SEES covers.** **Recommended: the staff roles including crew, on projects they can view; never client,
  never subcontractor** (a sub reaches `/m/projects`; the ruling names only the client).
- **ASK-A4 — catalog prefill and a length cap.** **Recommended: no prefill** — `cost_catalog` has only INTERNAL `notes`;
  prefilling from them would put internal text on a proposal. **Cap: 2,000 characters**, enforced in the database and the
  form; the PDF wraps it.
- **ASK-D1 — how Terms are edited.** **A) reuse Scope of Work's proven markdown subset (extended: italic, underline,
  indent, nested lists; no headings), with a toolbar for the six formats, and stored text marked per section so every
  existing plain section renders byte-identically (recommended)**; B) a WYSIWYG HTML editor with a server-side
  sanitizer — new mechanism, the PDF is the hard half.
- **ASK-UV — merge `feature/devcontainer-uv` (`94a08353`).** One commit; outside the S180 exemption, so it is yours.

## The phase 2 plan, and deviations

**Build order (the prompt's), with what changes, migrations, proof, and risk.** Every migration number is above
rebuild-test's `20262135000000`. CI runs against rebuild-test, so live harnesses and CI never overlap.

| # | item | branch | migrations | what it proves | what could break |
| --- | --- | --- | --- | --- | --- |
| 1a | **Part B** + the two B-0 defects | `feature/s128-b-manual-total` | **1**: `estimate_line_rows.total_override_basis numeric` (NULL on every existing row) + `clone_estimate_line` copies `total_override` and the basis (original captured + RESTORE committed first) | $600 / $722.98 holds through display (20.50%) and a no-change blur; cost change → total holds, red, titled; ↺ releases; clone keeps a typed total (live); Cost Plus prints the effective markup at 2 dp; sabotage: recompute-from-rounded goes red | a blur committing the rounded draft (tested) |
| 1b | **E-1** | `feature/s128-e1-sub-lines` | 0 | SUB lines counted = cards counted, one section holding two sub lines; sabotage: `.find` restored → red | the award/request controls on multi-line sections (ASK-E1) |
| 1c | **G** | `feature/s128-g-menu` | 0 | e2e: menu's LAST item inside the viewport, above the bar, `elementFromPoint` = the item, a REAL click opens the confirm; the old `dispatchEvent` test made honest; sabotage: old positioning → red | other menus: none on a page with a bottom bar (phase 1) |
| 2+3 | **Part A + Part C** — one branch, as the spec says ("A, B and C ship together"); A's editing surface IS C's sheet | `feature/s128-ac-line-sheet` | **1**: `description text` (≤ 2,000) on `estimate_line_rows` and `change_order_line_rows` | payload: cookie-less fetch of `/sign/[token]` on all 8 formats, sentinel present on exactly 4; the PDF's text likewise; sabotage: narrowing removed → red; section description untouched (byte test); the sheet opens from any line, Add Line lists existing lines, live | the CO surfaces (desktop + `/m`, PARITY) |
| 4 | ⚠️ **Part H** — rebuild-test ONLY, no merge, no CI | `feature/s128-h-divisions` (from `main` after 2+3) | one per section: cost codes + division template; estimate divisions/sections/lines + bottom block | normalizer (`1000`→`01000`, 5-char kept, else refused); solver (gross-up solved, 100% refused, mode-1-on-mode-2 refused, round up, total = sum of rounded, both-ways figure); snapshot; role map on bytes | its size |
| 5 | **Part F** | `feature/s128-f-covers` | **1**: `project_covers` + `files` trigger + RPC + backfill (count stated first) | 2nd photo does not move it; hand-set survives a 3rd; role map; `client_visible` untouched both ways; client payload on every portal surface; proxy only | the trigger on every photo insert |
| 6 | **Part D** | `feature/s128-d-terms` | 0 | PDF generated and read for all six incl. indent + nested lists; script tag neutralised in bytes; existing terms byte-identical | PDF parity |

**C before H; A before C** — H-5's `+ Line` opens the sheet C builds; the sheet shows A's description.

**Part H, how much I expect to reach:** H-1 (structure), H-2 (codes, seeded), H-3, H-4 (line fields incl. out-to-bid
and alternate as columns), H-5 (the shared sheet; hover + double-click), H-7/H-8/H-8a (the block, both modes, the
gross-up, basis in words on every row, drag with the consequence shown before the drop), H-9 (round up, sum of rounded),
H-11 (% of job), H-12 (snapshot), H-14 (RLS + payload). ⚠️ **NOT expected: H-10 (the client/PDF rendering of a division
estimate), H-13 (Excel import/export), and H-15's reissue copy of division data** (lock-on-send comes free from the
estimate's status). H-6's flag is a column only; H-16 is not in this session at all.

⚠️ **Items I expect NOT to reach: Part D likely; Part F possibly.** They come after Part H in the prompt's order. If
they are not reached they are written up as not started, not half-built.

**Deviations so far:** 2 and 3 are one branch (the spec's own instruction); 1a carries the two B-0 defects (a typed
total moved by clone; a wrong markup on a client document) because they are Part B's rule failing elsewhere.

---

# PHASE 0 — before phase 1 (Josh's config fix)

## `uv` in the devcontainer — `feature/devcontainer-uv` `94a08353`, pushed, NOT merged

**What the devcontainer is (verified by reading it, `.devcontainer/devcontainer.json`, the only file there):** an
image-based container (`mcr.microsoft.com/devcontainers/typescript-node:20`), ONE feature
(`ghcr.io/devcontainers/features/github-cli:1`), and a `postCreateCommand` of
`npm install && npm install -g @anthropic-ai/claude-code`. No Dockerfile, no `uv` anywhere. `.mcp.json` launches serena
with `uvx`. **Correction to the prompt's claim:** context7 is an `http` server, not `npx`; supabase is `npx`. Same
conclusion — neither needs `uv`.

**Change (one line + a comment):** `postCreateCommand` gains
`&& curl -LsSf https://astral.sh/uv/install.sh -o /tmp/uv-install.sh && sh /tmp/uv-install.sh`. Astral's own installer,
not a third-party devcontainer feature. **Downloaded then run, not piped** — `curl … | sh` exits 0 when the download
fails, because `sh` reads empty input. Installs to `~/.local/bin`, which this image's `~/.profile` (lines 25–26) puts on
PATH when the directory exists — the same place Josh's hand install landed (`which uv` → `/home/node/.local/bin/uv`).

**Proof:** the JSONC parses and `postCreateCommand` reads back as written; the installer, downloaded fresh and run into a
scratch directory (`UV_UNMANAGED_INSTALL`), exited 0 and produced `uv 0.12.23` / `uvx 0.12.23`. **Not proven:** an actual
rebuild (it applies on the next create/rebuild only).

**Why it is not merged:** the S180 merge rule needs CI green or the tree-identity exemption, and the exemption is defined
by exclusion — it may touch only `docs/` and root `*.md`. `.devcontainer/` is neither, and the commit is `[skip ci]` as
asked, so no CI ran. **Josh merges it** (it is in his list below).

---

# PHASE 1 — RESEARCH

## 1.0 — ListAgents

First action of the session. Result: *"No reachable agents — no other Claude session is running on this machine."*
No peer. Proceeded.

## 1.1 — The ground

- `git fetch --prune`. **`origin/main` = `d2c052a0`** "docs: S128 prompt, estimates spec with division budgeting, MF95
  cost codes [skip ci]". Measurements in phase 1 are on that ref unless stated.
- **The spec is on `main`**: `docs/specs/estimates-and-change-orders-spec.md`, 837 lines. Read in full.
- **What S127 left, verified by log and by database:**
  - Merges on `main` (by `git log --merges`): items 1 + 7 `5f05476a`, P-1/P-6/P-4 `574d9aef`, 5a + 6 `965b3f21`,
    4a + 4b `7f6627fe`, 5a fix + 4c `879e869f`, 4e `aff79789`, P-5 + P-2 `78eeeb30`, 4d `c1bfd059`, P-3 `182b069c`,
    R-2 `1904258e`, R-9 `a0793dcf`, item 2 `2e54b21d`.
  - ⚠️ **Correction to the prompt: EIGHT S127 migrations are on production, not seven.** Production
    `supabase_migrations.schema_migrations` (scratch workdir linked to `jwkcknyuyvcwcdeskrmz`, `db query --linked`),
    read: `20262134100000` qb_time_export_auto_off · `…134200000` segment_type_reopen · `…134300000`
    daily_log_client_photo · `…134400000` holiday_rules · `…134500000` photo_share_links · `…134600000`
    photo_share_perms · `…134700000` share_path_check · `…134800000` money_recat_lock. S127's close-out said "seven"
    (`…1341`–`…1347`) **before** R-9 added the eighth. Latest on production: `20262134800000`.
  - **rebuild-test** additionally carries `20262135000000` s124_qb_time_activity_push (S124 Part 1, unmerged, on
    `feature/s124-p1-push`) — **so every new S128 migration must be numbered above `20262135000000`**, and rebuild-test
    dry runs need that file in the workdir (S127's method).
  - The checkout is linked to rebuild-test `nmyphyhmfttxkdoposvf` (`supabase/.temp/project-ref`, read back).

## 1.2 — The verifications (on `origin/main` `d2c052a0`; code read, plus rebuild-test catalog where stated)

### ⚠️ Vocabulary first — it changes how every part reads

**Josh's "line" is the database's `estimate_line_rows` row. Josh's "section" is the database's `estimate_line_items`.**
The editor labels an `estimate_line_items` row "section" ("Delete section", `items-tab.tsx:1199`) and its children
(Type / Name / Cost / Qty / Markup % / Tax / Total, `items-tab.tsx:1230-1240`) are `estimate_line_rows`. Confirmed by
E-1's own table: "Electric – Rough in" (a row) under "Rough Phase" (a line item). Change orders:
`change_order_line_items` (section) → `change_order_line_rows` (line). **The proposal code uses the opposite
vocabulary**: its `ProposalLine` is an `estimate_line_items` row, and "line description" in `client-proposal.ts` means
the SECTION description. This report uses Josh's words: **line = row, section = line item.**

### A-0 — no per-line description exists anywhere

| table | text fields |
| --- | --- |
| `estimate_line_items` (section) | `description` (the "Description (shown on proposal)"), `notes` ("Internal notes — never on the proposal") |
| `estimate_line_rows` (**line**) | **none** — only `name` |
| `change_order_line_items` (CO section) | `description` — rendered on the CO PDF and signing page, but **no UI ever writes it** (desktop sends name only, `co-builder.tsx:1414-1441`; mobile hard-codes `null`, `co-editor.tsx:308-312`). Always null in practice. |
| `change_order_line_rows` (CO line) | **none** |
| `cost_catalog` | `notes` (internal; never copied into an estimate) — **no `description`** |

No later migration adds a description to either line table (every `ALTER TABLE` on them read). **Part A is a new column
on two tables, not a rendering gap.** ⚠️ The near-miss to record: the CO SECTION `description` IS rendered to the
client and nothing writes it — the A-0 shape inverted (a renderer with no writer). Not touched (A-3 / stop rule 12).

### A-2 — the four formats are `estimates.proposal_pricing_level` values, NOT contract types

| Josh's words | stored value (`proposal_pricing_level`) |
| --- | --- |
| summary with description | `summary_with_descriptions` |
| itemized with description | `itemized_with_descriptions` |
| cost plus | `cost_plus_itemized` |
| time and material | `time_and_materials_itemized` |

The other four: `total_only`, `summary`, `itemized`, `itemized_no_unit_pricing` (+ five legacy values, still allowed,
mapped in `proposal-format.ts:59-65`). **`projects.project_type`, `estimates.contract_type` and `change_orders.co_type`
are `fixed_price | time_and_materials | cost_plus`** — a different axis; the condition is written against
`proposal_pricing_level` only.

⚠️ **Finding that changes Part A's shape:** on every format except T&M, **the client payload carries NO lines at all**
— `shapeFor` returns `rows: 'none'` for summary, itemized and cost-plus (`client-proposal.ts:79-241`), and the PDF
(`RENDER_PLAN`, `proposal-format.ts:120-129`) prints sections, not lines. So on three of Josh's four formats there is no
place a line description currently prints. **A line description needs a new printed element under its section** (see
plan, ASK-A1).

⚠️ **Change orders have no proposal format.** The CO signing page and PDF send every section and every line name with no
format narrowing (`sign-co/[token]/page.tsx:58-117`, service role; `co-data.ts:140-160`). Josh's rule names proposal
formats; a CO has none. (ASK-A2.)

### B-0 — the raw markup is DISPLAY ONLY. The typed total IS stored. Two downstream defects found.

- Typing a total saves `{ total_override: v, markup_percent: null }` (`items-tab.tsx:939-948`); typing a markup saves
  `{ markup_percent: v, total_override: null }` (`:906-911`); CHECK `estimate_line_rows_one_override_check` allows only
  one. `total_override` is plain `numeric` (`20261570000000…:21-22`). **The back-solved `20.4966…%` is never stored**:
  `derivedMarkup` → `backsolveMarkupPercent` (`estimate-totals.ts:82-94`) → `fmtPercent` prints it raw
  (`labels.ts:61-64`). Clicking the cell also seeds the edit draft with the raw string (`inline-edit.tsx:156,162`).
- **`total_override` IS the existing manual-total marker.** `computeRowPricing` returns it untouched
  (`estimate-totals.ts:387-394`), and recalculation, award projection, section/grand totals, conversion and the S122
  invoice ceiling all respect it.
- ⚠️ **Defect 1 — the Cost Plus proposal prints the WRONG markup on a hand-set line.** `getProposalData` does not select
  `total_override` (`proposal-data.ts:224-226`); with `markup_percent` null, `resolveRowMarkupPercent` falls back to the
  estimate default (`:311-318`). Open-book client document, markup disagreeing with the price. Also printed raw
  (`proposal-template.tsx:422`, `proposal-html.tsx:389`).
- ⚠️ **Defect 2 — cloning an estimate DROPS hand-set totals.** `clone_estimate_line` (latest
  `20260730010000_money_representation.sql:86-100`) does not copy `total_override` (nor `vendor_id`). The clone keeps
  the stored `total` until the next recalculation, which reverts it to default markup × cost — **a typed number moved
  by the system** (stop rule 6's class).
- Nothing records the cost a total was typed against, so B-2's red state needs one new column (plan 1a).
- **S122 precedent:** pins are browser state only (`invoice-builder.tsx:941`); language: an uppercase **"pinned"** badge
  and a **"Release to the percentage"** link. The estimate SECTION override already uses **"override ↺"** with title
  *"Override active — click to revert to the computed total"* (`items-tab.tsx:1178-1193`) — the same surface's own
  words, which 1a reuses.
- **`money-representation.md`:** money rounds to 2 dp at every stored boundary (`roundMoney`, `estimate-totals.ts:15,
  44-46`); it says nothing about a derived markup — the 2-dp display lands inside it with no new rule.
- **Change orders have no `total_override`**: CO lines are always cost × markup (`change-order-totals-server.ts:192,231`).
  "The typed number wins" holds trivially there (only the markup can be typed).

### C-3 — estimates and change orders have THREE separate line editors

`app/dashboard/estimates/[id]/items-tab.tsx` (1,879 lines) · desktop `changes/[coId]/co-builder.tsx` (1,465) · mobile
`m/p/[projectId]/changes/new/co-editor.tsx` (807). Shared: only the math (`packages/shared/utils/estimate-totals.ts`).

### D-0 — Scope of Work was PARTLY fixed: a markdown subset in a plain textarea, summary box only

- **No rich-text editor in the repo** (no tiptap/lexical/quill/slate/contenteditable editor), **no HTML sanitizer**, no
  `dangerouslySetInnerHTML` in app code. PDF is `@react-pdf/renderer` (`proposal-service.ts`), no puppeteer.
- `estimates.scope_summary` is a textarea with a hint ("`## Heading` · `- bullet` · `1. numbered` · `**bold**`",
  `text-tabs.tsx:592-598`), parsed by `packages/shared/utils/scope-text.ts` (a deliberately small subset; *"No HTML is
  ever produced from the text, so there is nothing to sanitize"*) into BOTH renderers: `lib/proposal/scope-text-html.tsx`
  and `lib/proposal/scope-text-pdf.tsx`. Tested by `test/s115-scope-text.test.tsx`. **Scope sections' bullets are plain
  strings.** So pasting formatted text into Scope of Work still strips it — what was fixed is *typing* markdown.
- **Terms:** `estimates.terms_sections jsonb` `{name, content}` (+ `companies.default_terms_sections`); textarea
  placeholder "Section content (plain text)" (`text-tabs.tsx:365`, `estimating-settings-form.tsx:546`); rendered raw
  with `pre-wrap` on the signing page (`proposal-html.tsx:482-483`) and as one `<Text>` in the PDF
  (`proposal-template.tsx:505`).
- **Conclusion: Part D is REUSE of the proven parser + two renderers, extended** (italic, underline, indent, nested
  lists; headings excluded for Terms), not a new mechanism. Its open question is the editing experience (ASK-D1).

### E-0 — the real cause: `rows.find` takes the FIRST sub line of a section; the schema is per section too

- `bidding-tab.tsx:92-96`: `subRowFor = (lineItemId) => rows.find(r => r.line_item_id === lineItemId && r.row_type ===
  'subcontractor')`. Cards are one per **section** (`estimate_line_items`), titled `{line.name}` — the section name —
  and "Current sub bid" is `subRow.amount` of the first sub row by `sort_order` (`:283-285, :332`). Electric ($7,000)
  sorts first; Plumbing ($850) is never rendered. **The hypothesis was right in effect; the mechanism is a `.find`, not
  a group-by.**
- ⚠️ **The schema has the same one-per-section shape:** `estimate_sub_bids` and `estimate_sub_bid_requests` key only on
  `line_item_id`; one winner per section (`idx_estimate_sub_bids_one_winner`); and `set_winning_bid` **refuses** a
  section with 2+ sub rows (`20262100000000…:531-532`, *"winning-bid auto-management requires 0 or 1"*), mirrored
  client-side (`estimate-items-client.ts:710-715`). **So per-line bidding is a schema redesign — the separate build's
  subject.** (ASK-E1.)
- No test covers a section with two sub lines.

### F-2 — every client surface that names a project, and the shape of the default-cover write

- **Portal pages** all read `getPortalProjects` (`lib/services/portal.ts:233-290`), an explicit select (`id, name,
  status, start_date, target_end_date, actual_end_date, contact_address_id` + address). Pages: `portal/page.tsx`,
  `portal/[projectId]/layout.tsx`, `[projectId]/page.tsx`, `files`, `financials`, `selections`. Portal photos:
  `getPortalPhotos` (`:469-532`).
- **Public token pages:** `sign-co/[token]` (selects `name, project_number`); `share/p/[token]` (no project name, by
  design); `sign/[token]` (no project fields).
- **Client emails naming a project:** invoice send, invoice reminders (cron), selection released, selection
  specifications, schedule finish moved (`lib/critical-path/notify.ts`). None carries an image today.
- ⚠️ **A client has SELECT on `projects` rows**, so a `projects.cover_file_id` column would be readable by a client
  through the REST API even if no page selected it. And **`projects` has a BEFORE UPDATE `projects_column_scope`
  trigger** (`enforce_projects_column_scope`) — a cover written onto `projects` from a crew member's photo upload would
  run into it. Both point to a separate staff-only table (ASK-F1).
- **Upload paths (F-6):** no INSERT trigger on `files`; no RPC inserts files; **~20 insert sites** — `uploadFile()`
  (`files-client.ts:128-303`, used by capture, offline replay, punch, deliveries, daily logs, incidents, desktop Photos,
  desktop Files, selections, the retry queue), plus server inserts: estimate/site-visit files (`api/estimates/[id]/files`,
  `project_id` null until conversion), **portal client photos** (`portal-photo-upload.ts`, client session), selection
  link previews; and **`convert_estimate_to_project` moves estimate photos onto a project by UPDATE**. ⚠️ **Enumerating
  20 call sites is exactly the "path that forgets" trap; a database trigger on `files` (AFTER INSERT, and AFTER UPDATE
  OF `project_id`) is the single choke point.**
- The Photos tab shows `category = 'photos'` (`lib/services/photos.ts:214`).
- Thumbnail proxy: `lib/photos/thumb-proxy.ts` (`private, max-age=604800, immutable`; 404s `private, no-store`), route
  reads with the caller's RLS, URL `/api/photos/{id}/thumb?v=…`. Tests `s127-thumb-proxy.test.ts`, e2e
  `desktop-photos-thumbnails-s111.spec.ts`.
- Lists: both read `getProjects()` (`select('*, contact:…')`) — one query; a cover join adds no per-row read.

### G — ONE screen. No shared menu component exists.

- "More actions" is hand-rolled (`details-tab.tsx:617-697`): `position:absolute; top:100%; zIndex:10`, no portal, never
  flips. The totals bar is `position: fixed; bottom: 0; zIndex: 40` (`estimate-builder.tsx:732-747`) — it paints over
  the menu. **The estimate builder's bar is the only fixed/sticky bottom bar on desktop**; the only other dropdown on
  that page (`contact-address-picker`) sits near the top. Hand-rolled menus elsewhere (`/m` photo viewer, photo grid,
  ai-tag-editor) have no bottom bar on their page. **No `components/ui/`, no dropdown/popover primitive, nothing that
  flips upward.** The only portal is `components/sheet/modal-sheet.tsx`.
- The existing e2e (`desktop-confirms.spec.ts:495-524`) clicks "Delete estimate" with `dispatchEvent('click')` — **it
  never proves the item is visible or clickable**, which is why it stayed green. (Its comment claims an outside-click
  closer that the code does not have.)

### H-2 — nothing stores a cost code as a number; nothing is CSI-coded yet

- Existing `cost_code` columns are all `text` and free-form: `project_budget_items.cost_code` (filled at conversion with
  the **category name**, e.g. "Framing"), `cost_catalog.cost_code`, and `p_cost_code text` parameters. No `division`,
  `csi` or code table exists.
- **Seed source:** `docs/specs/cost-codes-masterformat-1995.md` § 4 — 16 `## Division NN — Title` headings, each a
  `| code | title | source |` table; **88 codes (34 `[IN USE]`, 54 `[COMMON]`)**, every row matching
  ``^\| `(\d{5})` \| (.+?) \| (\*\*\[IN USE\]\*\*|\[COMMON\]) \|$``. Machine-readable; titles contain `/` and `&`.
- **Project Executive access** is `estimate_assignments` (one live PE per estimate), helper `pe_assigned_estimate(id)`;
  H-14 reuses it.
- `project_executive` is a real role (`profiles_role_check`).
