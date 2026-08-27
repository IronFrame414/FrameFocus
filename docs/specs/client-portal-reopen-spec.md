# SPEC — reopening client portal access to a project

> Ruled by Josh at S175, after item 6 surfaced the gap. **Design spec for unbuilt work — NOT yet
> built.** File this and build it when the queue reaches it; it is not part of items 7, 8 or 9.
> Companion shape: `7C-retainage-accrual-spec.md` (a feature with a ruling attached, not a defect).
>
> **Verification note.** Every repo claim below was checked against the live migrations on branch
> `feature/s175-clients-off-team @ ba61257` (baseline `main @ a11ae8d`). Where the ruling as first
> captured no longer matches the shipped code, the correction is called out with ⚠️ — the window
> function is **already three-argument**, not two, and that changes how the reopen is built (§3).

---

## 1. WHY THIS EXISTS

Item 6 (`#1-s168` / `#2-s168`) found a third fault nobody had named:

**`get_invitation_status()` branches on role** (`20261018000000_m9_cancellation_window.sql:296-329`).
For `role = 'client'`, *"expired"* means **the project's window has closed** — it evaluates
`client_window_open(pr.status, pr.actual_end_date, pr.cancelled_at)` and **never reads
`expires_at`** (`:309-319`). But `/api/invites/[id]/resend` **resets `expires_at` and reuses the
token** (`apps/web/app/api/invites/[id]/resend/route.ts:73-77`, and its own header banner "THE TOKEN
IS REUSED AND THE EXPIRY IS RESET").

**So telling a client to ask for a resend prescribes an action that resets a clock their invitation
does not read.** The item-6 copy fix was correct and stands:

> *"This invitation has expired. Ask the company to send you a new one."*

**But it left a client whose project window closed with no recovery path at all.** Asking for a new
invitation does nothing, because the window is what refused her. Josh's ruling closes it: *"I'd like a
method to allow access."*

---

## 2. THE RULING

**An Owner or Admin can reopen client portal access to a project at any time.**

- **Owner/Admin only. Not PM.** Client-facing access control; sits beside R17's three termination
  states, which are already Owner/Admin.
- **A reopen on a COMPLETED project grants a FRESH 45-DAY WINDOW from the reopen date.** Not
  permanent, not an extension of the original. A completed project reopened indefinitely would mean
  client access never ends — the thing the window exists to prevent.
- **Both the company user and the client are notified**, **at reopen AND persistently in the portal**:
  - **At reopen** — the record exists and the client is told the clock is running. Certain to be sent.
  - **Persistently in the portal** — the expiry is shown whenever she arrives. Not really a
    notification; the page being honest about the clock. Josh: *"both."*

---

## 3. THE WINDOW FUNCTION — what it is TODAY, and how a reopen changes its shape

### 3.1 ⚠️ It is already three-argument. "Two scalars" is stale.

The ruling was captured saying `client_window_open(status, actual_end_date)` "takes two scalars
deliberately." **That two-argument version was dropped at `20261018000000_m9_cancellation_window.sql:337`.**
The live function is **three-argument** and was extended for exactly the reason a reopen extends it
again — a second closable state (cancellation) needed a third scalar:

```sql
-- 20261018000000_m9_cancellation_window.sql:118-137  (LANGUAGE sql, STABLE)
CREATE OR REPLACE FUNCTION public.client_window_open(
  p_status text, p_actual_end date, p_cancelled_at timestamptz
) RETURNS boolean LANGUAGE sql STABLE AS $fn$
  SELECT CASE
    WHEN p_status = 'complete'  THEN p_actual_end IS NULL OR p_actual_end + 45 >= current_date
    WHEN p_status = 'cancelled' THEN p_cancelled_at IS NULL OR p_cancelled_at + INTERVAL '30 days' >= now()
    ELSE true      -- active, on_hold, archived (archived deliberately open-ended)
  END;
$fn$;
```

**This is the precedent that answers the builder's first question before it is asked.** The
cancellation work added a third **scalar** input, kept the body a pure `CASE` over scalars with **no
table access**, and stayed `LANGUAGE sql STABLE` — the two properties that let Postgres inline it. A
reopen date is a **fourth scalar of the same kind**, passed from the caller's project row exactly as
`cancelled_at` is. **So it can stay inlined**, and this is not a hope — it is the same move already
made once and measured. The `~197 µs` nesting penalty is only incurred by a wrapper that *calls other
user functions*; a fourth scalar arg does not introduce one.

> ⚠️ **The one thing the builder must still confirm, not assume:** that the fourth argument is a bare
> column reference (`pr.reopened_at`), not a subquery or a function call embedded in the argument
> list. Inlining survives more scalar args; it does **not** survive an argument that is itself a
> user-function call. Keep the reopen date a plain column, and re-run the `EXPLAIN` that S175 ran —
> the expanded predicate must appear in the **Filter**, not as a `SubPlan`/function call. If it does
> not, measure the regression before building on it (the ruling's standing instruction).

### 3.2 The change: a fourth scalar and an additive OR term

Add **`projects.reopened_at timestamptz NULL`** (confirmed absent today — no `reopened_at` anywhere in
`supabase/migrations/`). Extend the function to four arguments and widen **only the closable
branch(es)**:

```sql
CREATE OR REPLACE FUNCTION public.client_window_open(
  p_status text, p_actual_end date, p_cancelled_at timestamptz, p_reopened_at timestamptz
) RETURNS boolean LANGUAGE sql STABLE AS $fn$
  SELECT CASE
    WHEN p_status = 'complete'  THEN p_actual_end IS NULL
                                     OR p_actual_end + 45 >= current_date
                                     OR (p_reopened_at IS NOT NULL AND p_reopened_at::date + 45 >= current_date)
    WHEN p_status = 'cancelled' THEN p_cancelled_at IS NULL
                                     OR p_cancelled_at + INTERVAL '30 days' >= now()
                                     -- reopen on cancelled: OPEN QUESTION §8, ruling covers 'complete' only
    ELSE true
  END;
$fn$;
```

**The term is purely additive.** A reopen can only *widen* a window, never narrow one, so it cannot
silently change any other window's behaviour (§6). `45` is still written **once**, now in two places
within the same function body — the builder should factor the completion window so `45` appears once
even across the original and reopen terms if that reads cleanly; **it must not appear in any other
function.**

### 3.3 The five callers move together — same choreography as the cancellation migration

`client_window_open` has exactly **five** callers, all passing the project row's scalars. Each gains
`pr.reopened_at` as the fourth argument. They must move in one migration (a caller left on the
three-argument version keeps a stale window):

| Caller | File:line | Role |
| --- | --- | --- |
| `my_client_access_level()` | `20261018000000:168` | access **tier** ('none' / 'signed_documents_only' / 'documents_for_signature' / 'full') |
| `is_client_of_project(uuid)` | `20261018000000:228` | per-project **access gate** for the read arms |
| `get_invitation_for_signup(uuid)` | `20261018000000:264` | invite clock (signup) |
| `get_invitation_by_token(uuid)` | `20261018000000:291` | invite clock (acceptance page) |
| `get_invitation_status(uuid)` | `20261018000000:315` | invite clock (status/copy) |

Follow the migration's own recipe (`:113-151`): **create the four-argument overload first**, move all
five callers, then **drop the three-argument version** — SQL bodies are parsed at creation, so the old
one cannot be dropped while a caller still names it. Do not leave the three-argument version as a
"convenience overload"; an overload that silently ignores the reopen date is the second copy the
ruling forbids.

---

## 4. WHAT ELSE THE WINDOW REFUSES — and why a reopen restores ALL of it coherently

The invitation is **one** caller. The other surfaces a closed window refuses are the M9 client read
arms, and **every one of them funnels through `is_client_of_project()` or `my_client_access_level()`**
— which is the entire coherence argument. There is a **single choke point**, so reopening the window
(via the shared function) restores every surface simultaneously. No per-surface reopen work exists,
and the failure mode the ruling warns about — *"a client who can sign in but still cannot read her
invoices"* — **cannot occur**, because sign-in access and invoice access read the same two functions.

Surfaces gated, from `20261019000000_m9_client_read_arms.sql` and `20261020000000_m9_client_financial_arms.sql`:

| Client SELECT policy | Gate | Migration:line |
| --- | --- | --- |
| `projects_select_client` | `is_client_of_project(id) AND my_client_access_level() <> 'none'` | `20261019000000:120-121` |
| `files_select_client`, `project_files_select_client` (storage) | `is_client_of_project(project_id)` + `client_visible` | `:131`, storage arm |
| `change_orders_select_client`, `change_order_line_items_select_client` | `is_client_of_project(co.project_id)` | `:167`, `:151` |
| `client_contracts_select_client`, `contract_documents_select_client` | `is_client_of_project(project_id)` | `:185`, `:257` |
| `instrument_rates_select_client` | via `is_client_of_project` chain | `20261019000000` |
| `invoices_select_client`, `invoice_lines_select_client`, `invoice_lines_client_presentation_gate` | `is_client_of_project(i.project_id)` | `20261020000000:155,276` |
| `invoice_cost_claims_client_closed`, `invoice_hour_claims_client_closed` | closed to client | `20261020000000` |
| expense arm | `is_client_of_project(e.project_id)` | `20261020000000:318` |
| selections denied / image read | `is_client_of_project(t.project_id)` | `20261028000000` |
| `client_has_full_access()` | `my_client_access_level() = 'full'` | `20261019000000:95` |

**Builder task (not assumption):** re-grep `is_client_of_project(` and `my_client_access_level(` at
build time and confirm the caller set has not grown since `20261028000000`. If a new client arm
appeared that reads the window some *other* way, that is a second copy and must be folded in — the
same discipline that folded `subcontractor_contracts` into the S133 floor.

---

## 5. THE TWO REOPENS ARE DIFFERENT — do not conflate portal-access reopen with project-status reopen

⚠️ **There is already an Owner/Admin "reopen" in the repo, and it is a different operation.**
`20261013000000_m5_02_project_status_scope.sql:19,90` enforces *"Only an Owner or Admin can reopen a
completed project"* — that is a **status transition `complete → active`**. Because
`client_window_open` returns `true` for `active` (the `ELSE` branch), a status-reopen *also* reopens
the client window, as a side effect.

| | Project-status reopen (exists) | Portal-access reopen (this spec) |
| --- | --- | --- |
| What changes | `projects.status` `complete → active` | `projects.reopened_at`; **status stays `complete`** |
| Window effect | open (status ≠ complete) | fresh 45-day window while still complete |
| Other effects | re-enters active lists, punch gates, dashboards, reporting | **none** — purely the client's viewing clock |
| When you want it | the job genuinely resumed work | the job is done; the client just needs to see it again |

The spec's reopen exists precisely so an Owner/Admin does **not** have to lie about a project's status
to give the client another look. The builder must not implement it by flipping status.

---

## 6. INTERACTION WITH THE OTHER WINDOWS — stated, per the ruling

| Window | Rule (unchanged) | Reopen interaction |
| --- | --- | --- |
| Completion | 45 days from `actual_end_date` | **Widened additively** by the reopen term. Never narrowed. |
| Cancellation | 30 days from `cancelled_at` | **Open question §8** — ruling covers `complete` only. As written above, the cancelled branch is untouched. |
| Archived | deliberately **fail-open** (`ELSE true`) | **Untouched.** Reopen adds nothing to the `ELSE` branch. |
| complete-without-a-date | stays open (`actual_end IS NULL → true`) | **Untouched** — already open; the reopen `OR` term cannot un-open it. |

Because the reopen term is a pure `OR`, the function is **monotonic in `reopened_at`**: setting or
advancing it can only turn a `false` into `true`. That property is the formal statement of *"a reopen
must not silently change any of them."*

---

## 7. UI SECTION (mandatory — CLAUDE.md spec-completeness rule)

### 7.1 Where the control lives

The **Portal panel on the project's Contacts tab** —
`apps/web/app/dashboard/projects/[id]/contacts/portal-panel.tsx`, driven by
`apps/web/app/api/portal/access-state/route.ts` and `lib/services/client-portal.ts`. This is already
the per-project, Owner/Admin surface where R17's termination states are set, and the window is
per-project, so the alignment is exact. **Do not** add a second surface.

### 7.2 Who sees it, and when it appears

- **Owner/Admin only.** Not PM, not the client. Mirror the resend route's own gate
  (`resend/route.ts:38-43`, 403 for non-owner/admin) and R17's control.
- **Shown only when the window is actually closed** for this client on this project — i.e. when
  `client_window_open(status, actual_end_date, cancelled_at, reopened_at)` is `false`. Offering
  "reopen" on an open window is noise. (A future affordance may show a countdown while open; out of
  scope here.)
- The control writes `projects.reopened_at = now()` via a new Owner/Admin-gated route
  (`POST /api/portal/reopen` or an extension of `access-state`), enforced in the DB by the same
  column-freeze pattern used for other Owner/Admin project columns — **not** in the route alone.

### 7.3 The two notifications

| # | Trigger | Audience | Channel | Says |
| --- | --- | --- | --- | --- |
| N1 | On reopen | **Company user + client** | Email, riding `sendEmail()` with a **new `email_types` row** (pattern: `20260915000000_invite_email_type.sql`) | "Portal access to *{project}* has been reopened. It will remain open until *{reopened_at + 45 days}*." |
| N2 | Persistent | Client, in the portal | Portal banner/field | "Your access to this project is open until *{window-end date}*." |

**N2 needs a window-end DATE, and today none exists** (grepped: no client-window-end helper). Add a
small read that returns the **effective end date** — for a reopened complete project
`reopened_at::date + 45`; for a normal complete `actual_end + 45`; for cancelled `cancelled_at + 30`;
open-ended (no date) for active/archived/no-date. ⚠️ **This date helper and the boolean
`client_window_open` must agree** — they are two views of one rule, and a divergence is the #129 trap
(two implementations that "do the same thing" until they don't). Derive the date in one place and let
the boolean be `end_date IS NULL OR end_date >= today` where practical, or unit-test the two against
each other exhaustively.

---

## 8. OPEN QUESTIONS — Josh at a keyboard (do not guess)

1. **Does reopen apply to CANCELLED projects too?** The ruling text is scoped to *"a COMPLETED
   project."* But a cancelled project's client hits the identical dead-end once the 30-day tail
   passes, and the mechanism is the same (`reopened_at` + a fresh window). **Recommendation:** allow
   it, granting a fresh 45-day window from the reopen date on cancelled as well — restricting to
   `complete` leaves the cancelled client with exactly the dead-end this feature exists to remove.
   **Cannot decide by ruling:** whether a cancelled job's client *should* regain access at all is a
   business call, not a mechanism one. Left unbuilt until answered; the migration above leaves the
   cancelled branch untouched pending it.
2. **Repeat reopen / expiry-while-open.** A second reopen just rewrites `reopened_at` to a later
   timestamp — intended ("at any time"). Confirm no audit trail of past reopens is required beyond
   the N1 email log; if it is, `reopened_at` becomes an append-only child table, not a column.
3. **Should N2 show a countdown while the window is still OPEN**, not only after a reopen? Out of
   scope here; noted because it is the natural next ask.

---

## 9. WHAT THIS UNBLOCKS / DOES NOT

- **Unblocks:** a client whose completion window closed can be given access again without a
  status-reopen and without the misleading resend dance item 6 found.
- **Does not touch:** R17 termination states (`client_access_state`), the resend route, the archived
  fail-open, or the project-status reopen. Those are adjacent and deliberately left alone.
- **Build order when the queue reaches it:** (1) column + 4-arg function + move 5 callers + drop
  3-arg, one migration, with the `EXPLAIN` inlining check; (2) reopen route + column freeze;
  (3) `portal-panel.tsx` control; (4) N1 email type + N2 portal date helper. Nothing in this spec is
  built now.

*Design spec only. Nothing built.*
