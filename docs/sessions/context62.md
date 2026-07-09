# Session 62 — M5 functional testing on the throwaway

**Branch:** `feat/module-5` (still local, no upstream — nothing pushed)
**HEAD at close:** `6e21b56`
**Target DB:** throwaway `framefocus-rebuild-test` (`nmyphyhmfttxkdoposvf`, us-east-2). Prod untouched.

---

## What this session was for

Run the four deferred functional tests from Session 61 against the throwaway:
conversion trace, RLS by role, punch-complete gate, CO create/send gates.

Three ran. One is still owed.

---

## Test results

| #   | Test                                 | Result                                                          |
| --- | ------------------------------------ | --------------------------------------------------------------- |
| 1   | Conversion trace (EST-100 → PRJ-100) | **PASS** — with a schema-vs-intent gap found                    |
| 2   | RLS by role                          | **PASS** — both directions                                      |
| 3   | Punch-complete gate                  | **PASS** — with a latent fail-open defect found by code reading |
| 4   | CO create/send gates                 | **NOT RUN** — blocked, deferred to main                         |

### Test 1 — conversion trace (PASS)

Built EST-100 through the UI: one line, four rows (labor / material / sub / other),
all at 20% markup.

- Cost basis: 3,000 + 50 + 2,500 + 1,000 = **6,550**
- Marked-up (sell): **7,860**
- Profit: **1,310**

`convert_estimate_to_project(p_estimate_id uuid)` (the real RPC name — _not_
`import_project`, which is 5F project cloning) produced:

- `project_number` = PRJ-100, mirroring EST-100 ✓
- `contract_value` = 7,860 (the sell total) ✓
- `source_estimate_id` → EST-100; `estimates.project_id` → PRJ-100 (round-trip intact) ✓
- 4 `project_budget_items` rows, correct `row_type`, distinct `source_line_row_id` (per-row provenance) ✓
- `committed_amount` / `actual_amount` = 0, awaiting M7 ✓
- Σ `budgeted_amount` = 6,550 < `contract_value` 7,860 — invariant holds ✓

**Gap found:** `project_budget_items` stores only `budgeted_amount`, and it holds
**cost**. Josh's intent is that the project budget track **three** values — cost,
marked-up/sell, and profit. As built, sell lives only on the estimate line and
`projects.contract_value`; profit exists nowhere (derivable only as
`contract_value − Σ budgeted`). This is a schema-vs-intent gap, not a conversion bug.

**Also noted:** `projects.tax_rate` is NULL, and the material row's tax checkbox
produced no visible tax anywhere in the 7,860. Where/whether tax computes is an
open question. **Batch the tax question with the budget-columns fix** — both are
about how money is represented on the project.

### Test 2 — RLS by role (PASS)

Read the real policy off the DB rather than trusting the spec:

```
projects_select_visible:
  company_id = get_my_company_id()
  AND (get_my_role() IN ('owner','admin') OR is_assigned_to_project(id))

projects_update_authorized:
  company_id = get_my_company_id()
  AND (get_my_role() IN ('owner','admin')
       OR (get_my_role() = 'project_manager' AND is_assigned_to_project(id)))
```

Visibility is **assignment-based**, as 5A specced. Verified through the app:

- PM (unassigned) → PRJ-100 **not visible** ✓
- Crew (unassigned) → PRJ-100 **not visible** ✓
- Added a `project_assignments` row for the PM → PRJ-100 **appears** ✓
- Assigned PM → **can** change project status ✓

That flip (invisible → visible on assignment) is the real proof: `is_assigned_to_project()`
and `get_my_member_id()` work against a live authenticated session.

**Not covered:** whether a PM can update an _unassigned_ project, or crew an assigned
one. Both rows are invisible, so the UI offers no path to try — the select policy
guards update before it's reached. Testing the update policy in isolation needs
SQL-layer JWT impersonation, not the app.

### Test 3 — punch-complete gate (PASS)

The gate blocked `active → complete` while a punch item was open, and permitted the
transition once the item was closed. Correct behavior, observed both ways.

**A false alarm, recorded so it isn't rediscovered:** a DB query mid-session showed
`projects.status = 'complete'` alongside `punch_list_items.status = 'in_progress'`,
which looked like a bypass. It wasn't — Josh created a _new_ punch list _after_
completing the project. Timeline artifact. **No bypass was ever observed.**

**But a real latent defect was found by reading the code** (Claude Code diagnostic,
read-only):

`checkPunchGate` (`lib/services/projects-client.ts`, ~141–167) runs two `count` queries
against `punch_list_items` and destructures only `{ count }` — **discarding `error`**.
On any query failure PostgREST returns `count: null`, which `?? 0` coalesces to `0`.
So `blocking = 0`, the gate returns `ok: true`, and the transition proceeds.

**A failed read is indistinguishable from "zero open items." The gate fails open.**

Most likely trigger: a transient auth-token refresh race (401 → null count → permit).
CC ruled out the stale-props and cached-data theories — the gate does a _live_ read at
submit time.

**Second latent gap:** `updateProject(id, updates)` (`projects-client.ts`, ~89–101)
writes an arbitrary `updates` object straight to `projects.update` with **no gate**.
No callers today (grep-confirmed), but it's an ungated status-write path waiting for one.

No DB constraint or trigger backstops the invariant. The service layer is the only
line of defense, and it fails open.

### Test 4 — CO create/send gates (NOT RUN)

Clicking **Confirm Send** on a change order returns **HTTP 500** from our own route:

```
POST /api/change-orders/{id}/send   → 500
  change-orders-client.ts:198 → co-builder.tsx:171
```

UI surfaces "Invalid API key." This is a **server-side** failure — the browser's anon
key is fine. `apps/web/.env.local` holds only `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY`; the route plausibly needs `SUPABASE_SERVICE_ROLE_KEY`
(to mint a `co_signing_sessions` row bypassing RLS) and/or `RESEND_API_KEY`.

**Probably a throwaway env gap, not a code bug — hence deferred.** The dev-server
terminal output was never read, so this is a hypothesis, not a finding.

**To resolve:** retest on merge to main, against an env with the full key set. If it
still 500s, read the dev-server terminal for the actual failing key name before assuming.

---

## Commits landed (both local, unpushed)

Two instances of the **same bug class**: a client component pulling a runtime value
through a module that imports `supabase-server.ts`, dragging `next/headers` into the
client bundle and breaking the build.

- **`4b079ed`** — `fix(projects): move presentation label maps to client-safe module`
  `PROJECT_STATUS_LABELS` / `PROJECT_TYPE_LABELS` moved into `projects-client.ts`;
  `projects.ts` re-exports for server consumers. Fixed three client offenders at once
  (`status-control.tsx`, `project-header.tsx`, `projects-list.tsx`).

- **`6e21b56`** — `fix(change-orders): move CO_STATUS_LABELS to client-safe module`
  Same shape, one level deeper: `change-orders-client.ts` — the supposedly client-safe
  sibling — was itself importing the server module. Constant now defined there;
  `change-orders.ts` re-exports.

**CC swept the repo for further instances of this pattern and found none.** Every other
cross-module re-export is type-only (erased at build). The class is closed.

---

## The big environment fix

Most of this session was lost to a landmine, now permanently defused.

**Two GitHub Codespaces secrets — `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` — were injecting at the shell level on every container
start.** Next.js reads shell env _before_ `.env.local`, so the file was silently
overridden. The URL pointed at **prod**; the key was an `sb_publishable_…` value
belonging to **neither** project.

Symptoms this produced, each of which we chased separately: the app hitting prod while
`.env.local` said throwaway; "Invalid API key" on signup; a test account created on prod;
`unset` fixes that evaporated on every restart.

**Both secrets are now deleted at the GitHub user level, and the fix survived a full
container restart (verified: `printenv` returns blank for both).** `apps/web/.env.local`
now governs, as it always should have.

Worth noting: the throwaway didn't cause this cost — it _exposed_ it. Testing on prod
would have looked like everything "just working."

---

## Fixture built on the throwaway (still live)

The throwaway had schema but zero data. Signup on it does **not** seed a company/profile
(no `on_auth_user_created` trigger exists there), so the dashboard redirect-loops on a
missing `company_members` row. Hand-seeded instead:

- Company: **Bishop Contracting** (`03bb903f-1084-4ab4-afb8-03192cb58d30`)
- Owner: `josh+test50@worthprop.com` — profile `role='owner'`
- PM: `josh+pm@worthprop.com` — `role='project_manager'`, assigned to PRJ-100
- Crew: `josh+crew@worthprop.com` — `role='crew_member'`, unassigned
- PM + crew passwords set to `TestPass123!` directly in SQL

Insert only `companies` + `profiles` — a `create_member_for_new_profile()` trigger
auto-creates the `company_members` row. Inserting it yourself collides on
`idx_company_members_profile_id`.

`project_assignments` needs `company_id` passed **explicitly**; its `get_my_company_id()`
default returns NULL in the SQL Editor (no JWT, no authenticated user).

---

## Open work, in rough priority order

1. **Punch gate robustness — Josh chose Option 3 (full).** Not implemented.
   1. Make `checkPunchGate` **fail closed** — capture `error`; treat `error || count === null` as blocking.
   2. Neutralize `updateProject` — reject `status` in its `updates` so all status changes route through `transitionProjectStatus`.
   3. **Enforce the invariant with a DB trigger on `projects`** so it cannot fail open regardless of client state.
      > (3) **reverses the documented CLAUDE.md decision** that this gate is "service-layer only by design."
      > That's a spec-level change and needs a migration. Worth a clean session.

2. **Budget money model** — add sell/profit representation to `project_budget_items` (or a
   defensible derivation), update `convert_estimate_to_project()`. **Batch with the tax
   question** (where does tax compute? `projects.tax_rate` is NULL).

3. **Test #4 (CO gates)** — retest on main with a full key set.

4. **Reversing `complete`** — there is no way to move a project out of `complete`
   (5A allows `complete → archived` only). Josh has flagged this twice. **Design question,
   not a bug** — needs a decision.

5. Smaller items, all unverified:
   - Punch item saved with `description = NULL` despite text being typed. Re-verify —
     the timeline confusion above may have muddied this observation.
   - No edit affordance on punch items. **Design intent: whoever _created_ an item should
     be able to edit it.** Never checked whether Owner sees an affordance.
   - `/billing` redirects to the dashboard; the Billing button does nothing.
   - The dashboard renders the schedule. Intent: dashboard = summary landing, with
     Schedule as its own left-panel tab. Product change, not a bug.
   - `apps/web/.claude/` is untracked and should probably be gitignored.

---

## Uncommitted at close (deliberate)

```
 M TECH_DEBT.md          # inherited edit — left untouched, per standing instruction
?? apps/web/.claude/     # Claude Code local config
```

---

## How to start Session 63

1. **Verify first.** `git log --oneline -5` and `git status -sb` from repo root.
   Expect HEAD `6e21b56` on `feat/module-5`, no upstream, the two files above dirty.
2. `printenv NEXT_PUBLIC_SUPABASE_URL` should be **blank**. If it isn't, a secret came
   back and nothing else matters until it's gone.
3. `npx supabase projects list` — confirm the ● is on `nmyphyhmfttxkdoposvf`, not prod,
   before any `db push`.
4. Then pick from Open Work. **Option 3's DB trigger is the highest-value item and the
   one that most deserves a fresh session** — it's a migration and it reverses a
   documented architecture decision.

**Standing reminders that earned their keep this session:**

- Git is ground truth. Context files are claims.
- The dev server must be started from a shell whose env you've verified.
- `tsc --noEmit` passing ≠ the bundler compiling. Both gates, every time.
- Read the failing request / the server terminal before theorizing about the cause.
