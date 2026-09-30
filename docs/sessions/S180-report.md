# S180 unattended report

**No open cross-tenant or anonymous hole found.** The 39 signed-in SECURITY DEFINER write RPCs were
each read and all self-protect on tenant (item 2b: 0 cross-tenant writes); anon executability is still
3 (lockdown holds). The CDN post-revocation cache behaviour (item 3) is **RULED ACCEPTED RISK and
closed** [Josh, S180]. One cleanup filed (item 2b): a dead SECURITY DEFINER duplicate of the live
SECURITY INVOKER `create_safety_incident` — no security impact, proposed for removal. Nothing on
production was touched, queried or migrated, by rule. Every measurement below is on rebuild-test (`nmyphyhmfttxkdoposvf`, confirmed via
the MCP project URL before any query); rebuild-test is at migration `20261900000000`, **ahead of
production's `20261880000000`**, so its function counts include unmerged-branch functions — noted where
it matters.

> Resume: read `docs/sessions/S180-unattended-plan.md` first, then this file top to bottom. The
> "Log" at the bottom names the last step pushed.

---

## NEEDS A RULING

### Item 4 — N1–N4 stated in full (raised by the S112 overnight-2 run; Josh has seen only the labels)

Source: `docs/sessions/S112-overnight-2.md` on `feature/s112-overnight-2-report`. N1–N3 gate the
`s112-files-and-upload` branch; N4 gates `s112-claude-md-restructure`. None is built; each was raised,
not decided.

#### N1 — Daily-log and safety IMAGES: stay in Documents → Files, or leave too?

Queue 2a removes `category = 'photos'` rows from Projects → Documents → Files, **by category, never by
MIME** (as ruled). Daily-log and safety images keep their own categories (`daily_logs`, `safety`), so
they **stay in Files** — and since S111 Q18 they **also** show on the Photos page. So those images
appear in both places. **Measured on rebuild-test: 14 such images (12 daily-log, 2 safety) of the 134
rows left in Files.**

- **Option 1 — leave as built.** Filed with their log's documents in Files, also browsable in Photos.
- **Option 2 — exclude them from Files too**, by adding `daily_logs`/`safety` **image** rows to the
  exclusion. ⚠️ Needs a MIME test *inside* those categories — the ruling says "never by MIME" — and it
  would hide a photographed incident filed under `safety`.
- **Option 3 — exclude the whole `daily_logs`/`safety` categories from Files**, which also drops their
  13 non-image documents.

**Recommendation: Option 1** — the only choice that stays category-only, as ruled. The overlap is
harmless (one row, reachable twice); Option 2 reintroduces the exact MIME judgement the ruling forbids.

#### N2 — Should the Files upload still offer "Photos" as a category?

The desktop Files upload (`files/upload/upload-form.tsx`, `MANUAL_KEYS`) lets the uploader pick the
`photos` category. After 2a, a file uploaded there as "Photos" **does not appear in Files** — it lands
on the Photos page. Consistent, but could surprise someone uploading from Files who then can't see it.

- **Option 1 — keep "Photos" in the list.** Lands in Photos, correctly.
- **Option 2 — remove "Photos" from the Files upload.** Photos are added from the Photos page ("Add
  photos", S111 Q16).
- **Option 3 — keep it, and after upload show "Filed under Photos — view it there".**

**Recommendation: Option 3** (or Option 2 for a simpler screen). Not ruled; no change made.

#### N3 — Which of the 37 file inputs get `multiple`?

Inventory re-measured: **50 hits — 13 in tests, 37 source inputs; of those 13 already `multiple`, 24
single.** Built already (unambiguous): desktop Files upload and desktop Photos "Add photos", both moved
onto the shared upload queue.

- **Proposed to GET `multiple`** (via the shared queue): estimate Files tab; the sub's bid reply
  (**anon token route — do after bid-token-status lands**); `/m` daily-log & incident photo pickers
  (arrays — but **punch stays single**, it stores one completion photo); `/m` damage photos +
  delivery check-in (**PARITY fix** — desktop twin is already `multiple`).
- **Proposed to STAY single:** the 6 `capture="environment"` camera inputs (one shutter = one photo,
  D-8 ruled); punch library; logo/signature; lien-release & contract template PDFs; per-row bill
  attach; compliance certificate; per-request bid scope doc (until `#2-bidtok` decides line-attach);
  selection option image.
- **Already `multiple` → just move onto the shared queue** (they loop unbounded today): portal writes,
  desktop check-in, selection sheet, field-ops daily log, delivery edit, field incident, site-visit
  record, expense capture. (`/m` capture/offline pipeline is a separate question.)

Options: **(a)** apply the table as proposed; **(b)** only the PARITY fix + move existing `multiple`
onto the queue; **(c)** leave everything but the two built; **(d)** also add a per-file BYTE progress
bar (needs a second XHR transport beside supabase-js — the PARITY rule warns against two upload paths).

**Recommendation: (a) without (d)** — moving the existing `multiple` inputs onto the queue first, since
that is where unbounded parallelism already lives.

#### N4 — Four CLAUDE.md deletion candidates (from the restructure)

The restructure removed nothing from the record — every line is verbatim in `docs/claude/`. Four items
were **left out of the compressed CLAUDE.md** as deletion candidates. Stay out, or come back?

1. **"Expo EAS: cloud builds…" / "port forwarding … Expo (8081)".** Mobile has been a PWA since S97;
   nothing builds with EAS.
2. **Git Workflow: "`dev` branch for integration".** No `dev` branch exists on origin (checked).
3. **"Status: Modules 1, 2, and 3 complete".** Stale; STATE.md is the live status.
4. **The "Last updated / Previously" banners.** Now in `docs/claude/history.md`.

**Recommendation: keep all four out** (they remain in `docs/claude/`). If a `dev` branch is meant to
exist, that is a separate decision.

### New blockers found this run

_(none beyond N1–N4 — updated if the CI wave surfaces one.)_

---

## DONE AND PROVEN

### Item 2 — `authenticated` SECURITY DEFINER enumeration (read-only, rebuild-test)

**The question:** the S112 lockdown closed the *logged-out* (`anon`) door. What can an ordinary
signed-in user of ANY company EXECUTE, how many SECURITY DEFINER functions are reachable that way,
and which of them write?

**The command** (run via MCP `execute_sql` against rebuild-test; `has_function_privilege` is the same
instrument the lockdown used for `anon`):

```sql
SELECT
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND has_function_privilege('authenticated', p.oid,'EXECUTE'))                 AS auth_executable_total,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND has_function_privilege('authenticated', p.oid,'EXECUTE') AND p.prosecdef) AS auth_secdef_total,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND has_function_privilege('authenticated', p.oid,'EXECUTE') AND p.prosecdef
      AND pg_get_functiondef(p.oid) ~* '\m(insert|update|delete|truncate)\M')                             AS auth_secdef_writers;
```
The writer split by return type used `p.prorettype = 'pg_catalog.trigger'::regtype`.

**The counts (rebuild-test, `20261900000000`):**

| Measure | Count |
| --- | --- |
| Functions `authenticated` may EXECUTE (`public`) | **283** |
| — of which SECURITY DEFINER | **254** |
| — of which contain a write keyword (INSERT/UPDATE/DELETE/TRUNCATE) | **78** |
| `anon` executable total (lockdown control, still holding) | **3** |

**The 78 writers split cleanly in two — and only half are a real surface:**

- **39 are TRIGGER functions** (`RETURNS trigger`): `enforce_*` (16), `sync_*` (3), `audit_*` (2),
  `create_member_for_*`, `qb_enqueue_*`/`qb_wake_parked_queue`, `*_recompute`, `capture_project_cancelled_at`,
  `client_payments_retire_applications`, `retire_applications_on_invoice_void`, `handle_new_user`,
  `autoconfirm_invited_signup`, `assign_sub_on_contract_award`, `log_purchase_order_header_edit`,
  `snapshot_session_rate`, `stamp_selection_markup_snapshot`, `subscriptions_unlock_on_active`,
  `seed_lien_release_templates`, `sync_subcontractor_insurance_expiry`. **The EXECUTE grant on these
  is inert** — a trigger function can only be invoked by the event it is attached to; a direct
  PostgREST/RPC call cannot supply a valid trigger context, so it is not a usable write path.

- **39 are directly-invokable RPCs** — the actual signed-in write surface. Full list:

  ```
  abandon_site_visit               apply_change_order_budget        apply_client_credit
  clone_estimate                   convert_estimate_to_project      create_budget_line_at_capture
  create_safety_incident           create_site_visit                delete_site_visit_measurement
  delete_site_visit_note           edit_purchase_order_line         finish_site_visit
  flag_po_item_missing             get_or_create_misc_budget_item   get_sub_bid_request
  issue_po_lines                   mark_estimate_lost               mark_po_lines_purchased
  next_co_number                   next_estimate_number             next_po_number
  next_project_internal_seq        next_project_number              promote_site_visit
  record_client_payment            save_site_visit_measurement      save_site_visit_note
  selection_client_pick            set_line_override_cost           set_winning_bid
  submit_delivery_check_in         submit_sub_bid_reply             supersede_instrument_rate
  switch_pricing_mode              transfer_ownership               update_site_visit
  update_voice_note_transcript     void_estimate                   void_purchase_order
  ```

**VERDICT: verified — see item 2b. All 39 self-protect on tenant; no cross-tenant write.**

### Item 2b — caller-check verification of all 39 callable SECURITY DEFINER writers

All 39 function bodies were read in full (via `pg_get_functiondef`). The question for each: **before it
writes, does it confirm the target belongs to the CALLER's company** — or does it trust a passed id?
A SECURITY DEFINER function bypasses RLS, so a passed id written without a tenant re-check would be a
cross-tenant write (the anon-hole shape).

**Result: 0 cross-tenant writes. All 39 are self-protecting.** Grouped as you asked:

- **Group A — unprotected (cross-tenant write possible): NONE.** (This is the group that, if non-empty,
  would be the first line of this report.)
- **Group B — "protected only because the caller passes their own ids" (trusts a passed id without a
  tenant re-check): NONE.** Every function that takes an entity/project id re-fetches that row with a
  `company_id = get_my_company_id()` predicate (or `<> get_my_company_id() → RAISE`) and derives the
  write's `company_id` from the *fetched* row, never from a caller parameter.
- **Group C — self-protecting: all 39.** By mechanism:

  | Mechanism (checked before the write) | Functions |
  | --- | --- |
  | Fetch target `WHERE company_id = get_my_company_id()` (or `<> … RAISE`), + role check | `apply_change_order_budget`, `apply_client_credit`, `edit_purchase_order_line`, `issue_po_lines`, `mark_po_lines_purchased`, `record_client_payment`, `set_line_override_cost`, `set_winning_bid`, `supersede_instrument_rate`, `clone_estimate`, `convert_estimate_to_project`, `mark_estimate_lost`, `void_estimate`, `void_purchase_order`, `switch_pricing_mode`, `promote_site_visit`, `flag_po_item_missing`, `submit_delivery_check_in` |
  | Derive company from `get_my_company_id()` + `can_view_project()` gate + role | `create_budget_line_at_capture`, `create_safety_incident` (the 6-arg SECURITY DEFINER overload), `get_or_create_misc_budget_item`, `create_site_visit` |
  | Own-company sequence bump `WHERE id = get_my_company_id()` / project `… AND company_id = get_my_company_id()` | `next_estimate_number`, `next_project_internal_seq`, `next_project_number`, `next_co_number(p_project_id)`, `next_po_number(p_project_id)` |
  | `site_visit_access()` — itself gated on `e.company_id = get_my_company_id()` — then owner-of-visit | `abandon_site_visit`, `finish_site_visit`, `update_site_visit`, `delete_site_visit_measurement`, `delete_site_visit_note`, `update_voice_note_transcript` |
  | `my_company_id_flat()` + `is_client_of_project()` + `client_has_full_access()` + option-containment | `selection_client_pick` |
  | Owner-only + `target.company_id = caller.company_id` re-check | `transfer_ownership` |
  | Secret **capability token** (row found only by `token = p_token`); writes land in the token's own company | `get_sub_bid_request`, `submit_sub_bid_reply` |

**Notes for the record:**
- The two **token routes** are not company-scoped by design — the unguessable token *is* the
  authorization (the sub-bid model), the same shape as `get_invitation_by_token`. A signed-in user of
  another company cannot reach another company's request without its token.
- **`transfer_ownership`** and **`supersede_instrument_rate`** are the tightest — owner-only — and both
  re-check same-company on the target.
- **Incidental find — and it is exactly the trap you flagged this week [corrected after reading callers].**
  `create_safety_incident` has TWO overloads: a **6-arg SECURITY DEFINER** version (the one that landed
  in the 39-writer list, verified self-protecting) and a **7-arg SECURITY INVOKER** version (`…,
  p_prevention_notes, …`). **The LIVE production path is the 7-arg INVOKER** — the only caller,
  `app/api/safety-incidents/route.ts`, passes `p_prevention_notes`, which resolves to it. **The 6-arg
  DEFINER version has NO caller.** So my secdef-only enumeration pointed the audit at the *dead*
  overload and would have missed the live one entirely — the precise failure mode of a stale duplicate.
  - **The live 7-arg invoker path is verified safe:** `safety_incidents` has RLS enabled, INSERT policy
    `company_id = get_my_company_id() AND (project_id IS NULL OR can_view_project(project_id))`, and
    NOT-NULL defaults `company_id = get_my_company_id()` / `reported_by_member_id = get_my_member_id()`.
    SECURITY INVOKER + RLS is the correct pattern; no tenancy gap.
  - **Cleanup filed as `#1-s180u`** (TECH_DEBT): the 6-arg SECURITY DEFINER overload is dead — propose
    `DROP FUNCTION public.create_safety_incident(uuid,date,text,text,jsonb,jsonb)`. Migration + prod
    apply are Josh's action; not applied this session.

**So the first line "No production issue found" is now SUPPORTED by the check, not asserted ahead of
it.** The follow-up value that remains is authority correctness (e.g. is every money writer's role set
right), not tenant isolation — tenant isolation holds across all 39.

### ⚠️ Stated residual — what this audit did NOT cover

**This audit covered functions that BYPASS RLS** (`prosecdef = true`, executable by `authenticated`).
That is the dangerous class, because a SECURITY DEFINER write is only as safe as its own internal
checks. It is not the whole write surface.

**SECURITY INVOKER functions that write were never enumerated.** They ran outside the `prosecdef`
filter — the `create_safety_incident` 7-arg overload is a member of this uncovered set and, by luck,
turned out safe. Such functions are **bounded by RLS**: they run with the caller's privileges, so a
table's row-security decides what they can write. **That bound is real — all public tables have RLS
enabled** (measured on rebuild-test: **131 / 131 tables, 0 disabled**; production is ~128, the delta
being unmerged-branch tables).

**But "RLS is on" is not "the `authenticated` policies were reviewed."** Nobody has read the
per-table `authenticated` INSERT/UPDATE/DELETE policies the way the S112 lockdown reviewed the `anon`
grants. The bound exists; its *contents* — whether each table's write policy actually scopes to
`get_my_company_id()` and the right role — are unaudited this session. That is the natural next pass:
enumerate write policies per table (not functions), and cross-check each against its callers, per the
new CLAUDE.md rule "audit by what is called, not by what matches a catalog filter."

**⚠️ Production caveat:** production is at `20261880000000`, so its numbers are **lower** — it lacks
the rebuild-test-only functions from the unmerged `s111-project-role` (820/830), `bid-token-status`
(850/860/890) and `default-acl-guard` (900) branches (e.g. `pe_*` role functions, `anon_execute_exposure`).
The shape of the finding (39 trigger / 39 callable writers, anon=3) is a property of the code and
holds on both; the exact totals are rebuild-test's.

### Item 3 — CDN revocation: ACCEPTED RISK, CLOSED [Josh, S180]

**Mechanism (the answer):** revoked/expired access outlives the token because the **CDN edge cache**
serves previously-fetched bytes without re-authenticating. Evidence (prior 90-min run in
`s112-cdn-revocation-long.live.ts`): two primed files stayed `cf-cache-status: HIT` to t+5390 s —
1,792 s past the token's 3,600 s expiry (`cache-control: max-age=3600`). A response served with an
expired bearer token is the cache answering, not the origin.

**RULED ACCEPTED RISK [Josh, S180]. Reasoning:** the exposure covers only files the user had **already
opened while authorised**, and anyone who could open a file could equally have **saved a copy at the
time**. Revocation being eventually-consistent at the edge adds roughly 90 minutes to an exposure the
person **already had permanently**. **Content changed after revocation is not visible to them** — the
cache serves the old bytes. Engineering against it is poor value.

**Revisit condition (the only one):** if Supabase exposes **cache invalidation on object update or on a
permission change**, reconsider. Until then, closed.

**The exact upper bound is no longer worth the harness** — deliberately not pursued. (Supersedes the
earlier "needs the harness" framing.)

---

## BUILT BUT UNTESTED

_(none yet this run)_

## BLOCKED

_(only the exact upper bound of the item-3 finding is unmeasured this session — see item 3 under
DONE AND PROVEN; the mechanism and the consequence are established.)_

## OWED TO PRODUCTION

- The item-2 enumeration was measured on rebuild-test. To get production's exact numbers, run the
  same command against production (read-only) — Josh's action; not run this session by rule.

## WHAT JOSH MUST CLICK

1. **Rule N1–N4** (above) so `s112-files-and-upload` and `s112-claude-md-restructure` can finish. My
   recommendations: N1 = leave as built; N2 = option 3 (or 2); N3 = (a) without (d); N4 = keep all four out.
2. **The docs branches cannot auto-merge under S180** (no CI run → condition 1 unsatisfiable), so they
   remain your call: `s112-claude-md-restructure` (also needs your read + N4), `s112-followup-docs`,
   `s112-overnight-2-report`, and this run's `s180-merge-ruling` / `s180-branch-archive` / `s180-unattended`.
3. **Item 3 (CDN)**: if you want the definitive number, provide rebuild-test `.env.local` (incl. service
   key) and an attended ~100-min window — recipe under BLOCKED.

## BRANCHES

Current main is `08db226d` (wave 2). CI is one-at-a-time (E2E shares rebuild-test).

**CI wave — code branches, no migration (condition 3 vacuous); mergeable when their CI is green on main:**

| Branch | Rebased onto main? | Local check | CI | State |
| --- | --- | --- | --- | --- |
| `s112-heic-conversion` | clean | — | run 36315127852 cancelled by docs-push contention; **re-run 36325402567 GREEN** (E2E ✅ + Lint&Type ✅) on `3bde33d0` | **✅ MERGED to main `32570857`** [skip ci]. Condition 1 met by proof: main moved only by docs-only commits, and the rebased code tree is byte-identical to the green-tested tree (`git diff 3bde33d0 <rebased>` is docs-only), so the green result transfers; no migration. Conversion RUN stays Josh's prod action. |
| `s112-proposal-payload` | clean | — | **GREEN** 36328505557 (E2E ✅ + Lint&Type ✅) on cbb054fd | **✅ MERGED to main `74a640b7`** [skip ci]. Tree-identity exemption: main's delta since the tested base was docs-only (proof in merge msg); no migration. |
| `s112-files-and-upload` | clean (2a+2b+**N2**) | type-check 5/5; N2 test 6/6 | **GREEN** 36330511093 (E2E ✅ + Lint&Type ✅) | **✅ MERGED to main `e6612d38`** [skip ci]. Condition 1 met directly (tested tip rebased onto current main). N3 deferred (#2-s180u). |
| `s112-role-permission-maps` | clean | — | **GREEN** 36332408721 (E2E ✅ + Lint&Type ✅) | **✅ MERGED to main `de793c25`** [skip ci], tree-identity exemption (main moved only by A-1 docs since the tested base). |

**Blocked on a migration not yet on production (condition 3 fails — cannot merge):**

| Branch | Migrations (not on prod) | Note |
| --- | --- | --- |
| `s111-project-role` | 20261820000000, 20261830000000 (+ drafted 910) | Also unfinished; open ruling to Josh (lien-release authority, followup §8). |
| `s112-bid-token-status` | 20261850000000, 20261860000000, 20261890000000 | Never CI'd. |
| `s112-default-acl-guard` | 20261900000000 | Never CI'd. Anon-execute guard (relates to item 2). |

**Docs branches — NOT auto-mergeable under S180** (no CI ⇒ condition 1 unsatisfiable): `s112-claude-md-restructure`
(blocked on N4 + Josh's read; its reconciliation with `s180-merge-ruling` is **blocked on N4** — the restructure
cannot finalize until the four deletion candidates are ruled, so I did not force it), `s112-followup-docs`,
`s112-overnight-2-report`, `s180-merge-ruling`, `s180-branch-archive`, `s180-unattended`.

**Protected / preserved (from the S180 cleanup):** `s112-staletimes-hold`, `s112-cdn-investigation`,
`s112-catalog-importer`, `s110-a-site-visit-access`, plus `s110-site-visit-access` (not-contained docs).

**Not-mergeable, later wave:** `s112-m-loading` (= wave2 + R2; R2 not in the authorized set).

---

## ⚠️ Process error this run: docs commits without `[skip ci]` collided with the CI wave

CI triggers on **every** branch push (`on: push: '**'`) and E2E is **serial on one shared
rebuild-test DB** (`workers: 1`). My report/plan/archive commits were pushed **without `[skip ci]`**,
so each spawned a full CI run. The concurrency group is per-branch, so those runs did **not** cancel
heic by group — but they ran E2E against the same rebuild-test DB concurrently, and **heic's E2E was
cancelled in the contention** (its Lint&Type had already passed). The overnight/followup reports avoid
this by carrying `[skip ci]` on every docs commit; I failed to, and it cost the heic slot.

**Correction, applied from here:** every docs commit (this report, the plan, the archive) carries
`[skip ci]`. The token cannot cancel or re-run runs (`403 Resource not accessible by integration`), so
I let the two already-triggered docs runs drain, then push ONE fresh heic commit for a clean run, and
push no non-`[skip ci]` commit while a code-branch CI is live.

## CLAUDE.md reconcile — DONE AND PROVEN [Josh-directed]

Order as directed: **merged `s112-claude-md-restructure` into main FIRST** (`796a12e7`), then rebased
`s180-merge-ruling` onto it and reconciled. Both are now on main (`ab1af199`).

**Method — reconcile, not conflict-resolution (no side taken):** CLAUDE.md is the restructured
349-line file. **FOUR pieces of main-only content were carried into it**, because the restructure
predated all four:

1. **The wave2 R5b CO-summary note** (b7816868, added to main after the restructure's base) — re-added
   **verbatim** to `docs/claude/roles.md`'s change-order enforcement row, and compressed in the
   CLAUDE.md Financial Floor table. This was the merge's one conflict; had I taken the restructure side
   blindly it would have silently dropped R5b.
2. **S180 merge-conditions rule** — re-expressed compressed in CLAUDE.md (run-protocol family), full in
   `rules.md`.
3. **"Audit by what is called, not a catalog filter"** — placed next to "the thing inspected must be
   the thing being judged", as directed; compressed in CLAUDE.md, full in `rules.md`.
4. **"Questions in plain text, never the picker"** — compressed in CLAUDE.md (session-conduct family),
   full in `rules.md`.

**Proofs, on `origin/main` (`ab1af199`) — both numbers stated:**

- **(a)** `wc -l CLAUDE.md` = **382** (restructure baseline **349** + the 3 new S180 rules, ~11 lines
  each). Nowhere near 900 — no side was restored.
- **(b)** all three rules present by name in the merged CLAUDE.md (grep = 1 each); R5b present in both
  `roles.md` and the CLAUDE.md table.
- **(c)** restructure's contract holds: `docs/claude/rules.md` diff is **+73 / −0** (only appends, no
  original line removed); 9 docs/claude files intact; the 3 rules' full text present in `rules.md`.

**N4 (the four CLAUDE.md deletion candidates):** stay out, as recommended — merging the restructure
enacted that. `s112-claude-md-restructure` and `s180-merge-ruling` are now contained in main and
deletable in the next branch-cleanup pass (not in the protected set).

## Condition-1 tree-identity exemption — codified [Josh, S180], with heic evidence

The heic merge used a tree-identity argument (byte-identical code tree > a re-run). Josh accepted it
and directed it be **written into the S180 rule**, defined by **path exclusion, not intuition**, with
the proof stated. Codified on main (`ae2fb375`): compressed in CLAUDE.md (389 lines) and full in
`docs/claude/rules.md`.

**The standard:** condition 1 is satisfied by a green run **either** on the branch rebased onto current
main, **or** plus a proof the rebased tree is byte-identical to the tested tree **outside a delta that
build, tests and runtime never read**. The delta may touch **ONLY `docs/` and root-level `*.md`**; any
path under `apps/`, `packages/`, `scripts/`, `supabase/` or `.github/` disqualifies it (`.github/`
especially — a workflow change is a change to what CI does). **The merge message and report must state
the full changed-path list and the command.**

**heic, to that standard (the evidence, not the claim):**

- **Command:** `git diff --name-only 3bde33d0 32570857^2` (tested green SHA → merged rebased tip `ad739e2c`).
- **Delta, full path list:** `CLAUDE.md`, `docs/claude/AUDIT-S112.md`, `docs/claude/conventions.md`,
  `docs/claude/database.md`, `docs/claude/gotchas.md`, `docs/claude/history.md`, `docs/claude/platform.md`,
  `docs/claude/roles.md`, `docs/claude/rules.md`, `docs/claude/superseded.md`, `docs/specs/S113-SPEC-open-items.md`.
- **Disqualifier check:** `git diff --name-only 3bde33d0 32570857^2 | grep -vE '^docs/|^[^/]+\.md$'` →
  empty. Nothing under `apps/`, `packages/`, `scripts/`, `supabase/`, `.github/`. **Exemption valid.**

## Docs branches merged under the exemption [Josh follow-up]

- **`s112-overnight-2-report`** → ✅ **merged** (`8b22e2d5`). Delta = 3 files, all `docs/sessions/`
  (runbook + overnight-2 report/plan); command `git diff --name-only $(git merge-base main <b>) <b>`;
  no path under `apps/`/`packages/`/`scripts/`/`supabase/`/`.github/`; clean (0 conflicts). Pure
  exemption merge.
- **`s112-followup-docs`** → ✅ **merged as a RECONCILE** (`f6302420`), not a clean exemption merge: its
  root-`*.md` delta had diverged from main. Resolution: **kept main's restructured CLAUDE.md** (its
  "Never reformat" rule is already in main via the restructure — the old-format change was discarded,
  restructure intact at 389 lines), **union-merged TECH_DEBT.md** (main's `#1-cosum` + followup's
  `#1-s112f`, `#1-msweep` preserved). Clean new content brought in: `docs/incidents/rebuild-test-out-of-band-sql.md`
  (**its only copy**), `docs/sessions/S112-followup-report.md`, `docs/specs/perf-trace-harness.md`.

## files-and-upload build [Josh follow-up: N1-N3 ruled]

Branch `feature/s112-files-and-upload` rebased clean onto main; already carries 2a (Documents excludes
photos) + 2b (shared upload queue `lib/uploads/upload-batch.ts` + the 2 unambiguous inputs on it).

- **N2 — DONE and pushed** (`15d7b45a`, `[skip ci]`). Removed `'photos'` from `MANUAL_KEYS` in the
  Files upload form so it no longer offers the Photos category (after 2a a "Photos" upload there would
  not appear in Files). Guard test added with a control (contracts/other still present → not vacuous):
  `s112-document-files.test.ts`, 6/6 local.
- **N3 sequencing — DEFERRED to a focused build. RULED Option A [Josh, S180].** "Move existing
  `multiple` inputs onto the shared queue" is **not a mechanical swap** — 8 disparate components
  (`portal-writes-ui`, desktop `deliveries/check-in`, `selection-sheet`, field-ops `daily-logs/log-form`,
  `delivery-edit-form`, `components/field/incident-form`, `site-visit-record`, `expense-capture-form`),
  each threading `fileId` into its own state shape. Eight bespoke paths = eight chances for a silent
  break; the shared queue is already shipped, so deferring costs nothing.

  **⚠️ Deferring N3 does NOT breach the N3 sequencing condition [confirmed, Josh, S180].** That
  condition is "do not add `multiple` to any NEW input before the existing unbounded ones are on the
  shared queue." **2a, 2b and N2 add no new parallelism** — 2a excludes a category, 2b put the 2
  unambiguous inputs on the *bounded* queue, and **N2 removes an option.** So this increment
  (2a+2b+N2) is clean and merging it is not the sequencing being dropped.

  **The N3 build, when it happens — the order stands [Josh, S180]:** the 8 existing-`multiple`
  components move onto the shared queue **FIRST**; only then do the NEW `multiple` additions land
  (estimate Files tab, `/m` daily-log & incident pickers, damage photos, delivery check-in, and the
  sub's bid reply **after `bid-token-status`**). **Per-component verification = a test PER SURFACE**,
  not one test covering the batch: **8 components, 8 proofs, each stating what it uploaded and what
  landed.** Filed as `#2-s180u`.

## Branch cleanup (CI-wave pass) — DONE

Archived first (`docs/branch-archive-2026-09-27.md`, pass-3 section), then **9 branches deleted** whose
work landed on main this session: 6 true ancestors (`claude-md-restructure`, `files-and-upload`,
`followup-docs`, `overnight-2-report`, `wave2-integration`, `s180-merge-ruling`) + 3 whose contribution
was verified byte-identical in main though their origin tips were rebased-copy SHAs (`heic-conversion`,
`proposal-payload`, `role-permission-maps`). The `s180-c1-exemption`/`n3-debt`/`a1-record` branches were
local-only (merged via `--ff`, never pushed), so nothing to delete there.

**Remaining remote branches (all kept for a reason):** the 4 protected (`s112-staletimes-hold`,
`s112-cdn-investigation`, `s112-catalog-importer`, `s110-a-site-visit-access`); 3 blocked-on-migration
(`s111-project-role`, `s112-bid-token-status`, `s112-default-acl-guard`); `s112-m-loading` (= wave2+R2,
a later wave); `s110-site-visit-access` (not-contained docs, left per the `--is-ancestor` rule); and
this session's working branches `s180-unattended` (this report) + `s180-branch-archive` (the record).

## QUEUE COMPLETE — S180 unattended

1. **CI wave** ✅ — heic, proposal-payload, files-and-upload (2a+2b+N2; N3 deferred `#2-s180u`),
   role-permission-maps all merged. CLAUDE.md restructure + S180 rules + condition-1 exemption
   reconciled onto main; docs branches merged; branch cleanup done.
2. **`authenticated` SECURITY DEFINER enumeration** ✅ — 283/254/78; 39 callable writers all verified
   self-protecting, 0 cross-tenant writes (item 2b); residual stated (INVOKER writers + per-table
   `authenticated` policies unaudited).
3. **CDN revocation** ✅ — ruled ACCEPTED RISK/closed with the mechanism and one revisit condition.
4. **N1–N4** ✅ — stated in full and ruled (N1 leave; N2 built; N3 deferred order-preserved; N4 out).

Standing rulings recorded this session: S180 merge-conditions, condition-1 tree-identity exemption,
"audit by what is called", "questions in plain text". Tech debt filed: `#1-s180u`, `#2-s180u`. A-1
(Resend rotation) recorded done with the key-name finding. **Nothing touched production.** Stopping.

## Deploy confirmation — 2a (Files excludes photos) IS live

**The `[skip ci]` merges did NOT stop Vercel** — Vercel deploys every push regardless of the GitHub
Actions `[skip ci]` marker (verified via commit statuses, not assumed): both `e6612d38` (the
`files-and-upload`/2a merge) and current main `de793c25` show **`Vercel: success — Deployment has
completed`**, and production `/` answers **200**. So **2a is live in production.**

⚠️ **For Josh:** you observed photos **still listed in Files BEFORE this merge** — that was the
**expected pre-merge state** (2a had not shipped). Now that `e6612d38` is deployed, **if you still see
photos in Documents → Files, that is a REAL defect**, not the pre-merge state — report it and it
becomes a new PART B item.

## Photo-viewer UI (S113 PART B) [branch `feature/s113-photo-viewer-ui`] — RULED, B-10 built

All three ruled by Josh; recorded in `docs/specs/S113-SPEC-open-items.md` PART B.

- **B-8 (comments, his #3):** ✅ RULED **B** — the dead tile is **removed** (as part of B-10); comments
  become their own scoped item (design the permission model first: who comments, who sees, portal?,
  notify?, ⚠️ does the Floor apply — free text, someone types a price). This does not deliver comments;
  it stops pretending to.
- **B-9 (site-visit markup, his #2):** ✅ RULED **A** (unsent-only; sent shows a WHY notice; sent-case
  filed to be allowed eventually via a non-contaminating derivative). **⚠️ But a measurement re-targets
  it and I did NOT build it — see the question below.** The `/m` project viewer **cannot show a frozen
  site-visit photo** (gallery is `project_id`-filtered; conversion nulls `estimate_id`, which
  un-freezes). So unsent-markup + frozen-notice belong to the **site-visit record view**
  (`/m/site-visits/[id]` + desktop `site-visit-record.tsx`), where photos are seen before conversion —
  and that surface has **no markup entry today**. Building B-9 in the photo viewer would be a no-op.
- **B-10 (move markup to bottom bar, his #1):** ✅ RULED **A** and **BUILT** — markup is now a bottom-bar
  tile (`m-viewer-markup`, `onClick`→`/markup`), replacing the dead Comments tile; removed from the ⋮
  menu; gated by `canMarkup` (receipt → `m-action-markup-absent`). 4 e2e specs updated in place; tsc 0.
  **CI run 36338280615 in progress**; merge when green (branch is on current main de793c25).

## Log

- Start — plan persisted to `S180-unattended-plan.md` and pushed. Report initialised.
- Item 2 DONE — `authenticated` enumeration measured on rebuild-test: 283 executable / 254 secdef /
  78 writers (39 triggers inert, 39 callable RPCs listed). anon still 3. No production issue. Pushed.
- Item 1 — heic-conversion CI (run 36315127852) in progress: Lint&Type ✅, E2E running.
- Item 4 DONE — N1–N4 stated in full with options + recommendations under NEEDS A RULING. Pushed.
- Item 3 — CDN revocation reframed from "dropped" to a FINDING [Josh correction 1]: mechanism is the
  CDN edge cache (reads HIT to t+5390, 1,792 s past token expiry); consequence stated (removed sub
  keeps reading already-viewed files ≥90 min); exact upper bound still needs the harness. Pushed.
- Item 2 — verdict corrected [Josh correction 2] from "no issue" to verified: all 39 callable
  SECURITY DEFINER writers read in full, all self-protect on tenant, 0 cross-tenant writes (item 2b).
  First line updated to the supported claim. Pushed.
- CLAUDE.md reconcile [Josh-directed] — restructure merged to main first (`796a12e7`), then
  s180-merge-ruling reconciled onto it (`ab1af199`). 4 main-only pieces carried (R5b + 3 S180 rules);
  proofs: CLAUDE.md 349→382, all 3 rules present, rules.md +73/-0. Pushed to main [skip ci].
- CDN → ACCEPTED RISK/closed [Josh ruling]; `#1-s180u` filed for the dead 6-arg DEFINER overload;
  MANDATORY CLAUDE.md rule "audit by what is called, not by what matches a catalog filter" added on
  `feature/s180-merge-ruling`; stated residual added (SECURITY INVOKER writers + per-table
  `authenticated` policies unaudited; RLS on 131/131 tables is the bound but its contents unreviewed).
  Pushed.
