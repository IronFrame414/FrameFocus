# S162 — Module 6 (Team & Field Operations). Whole-system audit, pass 6 of 11.

> **Findings and proposals only.** No application code, service or schema changed. Evidence is
> `apps/web/test/s162-m6-audit.live.ts` (20/20) plus live reads of `pg_policies`, `pg_proc`,
> `pg_constraint`, `pg_indexes` and `information_schema`.
>
> **M6 owns:** `company_members`, time tracking (`time_clock_sessions`, `time_segments`,
> `time_edit_logs`, `time_session_rate_snapshots`, `member_pay_rates`), `daily_logs` + 2 children,
> `safety_incidents` + 2 children, `deliveries`/`delivery_items`/`purchase_orders`/
> `purchase_order_items`, chat (5 tables), `notifications`, `push_subscriptions`,
> `sync_conflicts`, and the `/m` PWA surfaces — **24 tables**, the largest built module.

---

## §0 — The one-paragraph version

**M6's RLS is the most carefully written in the platform** — time tracking uses a tiered rank model,
safety handles project-less incidents explicitly, chat separates crew from sub threads correctly,
and the notify layer models three reachability states honestly instead of pretending everyone has an
inbox. **What is wrong is at the edges of that care.** Three append-only logs — including the one
that answers *"who changed these hours"* and the one that carries the frozen pay rate — accept
forged rows from any authenticated user. An assigned subcontractor reads injured names and treatment
notes that the mobile UI deliberately hides. Notification delivery leaves no record, push has never
been enrolled anywhere, and 95% of the roster has no notification path at all. And the repo's most
emphatic security comment — *"THIS GUARD IS THE ENTIRE ENFORCEMENT"* — has become false for three of
the four surfaces it names.

---

## §1 — Findings, most severe first

---

### M6-01 · REACHABLE · The mobile guard's stated justification is stale for three of its four surfaces

**What it is.** `app/m/detail-access.ts` carries the strongest warning in the repository:

> *"⚠️ THIS GUARD IS THE ENTIRE ENFORCEMENT. RLS WILL NOT CATCH A BYPASS."*

and backs it with four policy citations and one measurement. **Three of the four citations are now
wrong, and the measurement no longer reproduces** (A2–A5):

| the file's citation | live policy | as the QA subcontractor |
| --- | --- | --- |
| `change_orders_select_visible` — *"company_id + can_view_project(). No role floor, no author scoping."* | **has both** — owner/admin OR PM-author, added by `20260830000000` (S121) | **reads 0** |
| `contacts_select_authenticated` — *"company + is_deleted = false, no role arm"* | `role <> ALL (subcontractor, client)` — the S131 roster floor | **reads 0** |
| `company_members_select_authenticated` — *"company_id and NOTHING else"* | **policy replaced** by `company_members_select_visible`, with an explicit subcontractor arm | **reads fewer than an owner** |
| `files_select_non_client` — *"a SUBCONTRACTOR PASSES IT"* | **still accurate** | reads files |

The header also records: *"MEASURED, NOT INFERRED [S115]: signed in as the QA subcontractor, the
database returned both change orders on a project they are assigned to, at full value — net_delta
1410 and 21385.91."* **That measurement returns 0 rows today.**

**Why this is a finding and not pedantry.** The comment's purpose is to stop a future reader
deleting the guard on the assumption RLS is behind it. It now also tells that reader the data layer
is wide open when it is not — and someone acting on that belief could relax a policy, skip a floor,
or spend a session re-hardening what S121 and S131 already closed. **A security comment that is
wrong in the reassuring direction is a bug; one that is wrong in the alarming direction is a tax.**
This is the second kind, and it is still worth fixing while the history is legible.

**Proposed fix.** Rewrite the header against the live policies, keeping the superseded text quoted
per repo convention, and narrow the claim to `files` — the one surface where it still holds.
**⚠️ Do not delete the guard:** `files` genuinely does admit a subcontractor, so `co`, `member` and
`contact` are now belt-and-braces while `file` is load-bearing. **Ruling needed** only on whether the
three now-redundant guards stay (they cost nothing and D-54 asks for hide *and* route-guard).

---

### M6-02 · REACHABLE · All three append-only logs accept forged rows — including the payroll audit trail and the frozen pay rate

**What it is.** A census of every write-side policy in the database [LIVE]: **3 of 82 are gated by
company scoping alone**, and they are exactly the three append-only logs.

| table | write check, in full | what it records |
| --- | --- | --- |
| `time_edit_logs` | `company_id = get_my_company_id()` | **who changed whose hours** — the record that answers a wage dispute |
| `time_session_rate_snapshots` | `company_id = get_my_company_id()` | `hourly_rate`, `burden_multiplier`, `fixed_burden_per_hour` — the frozen figures job costing reads |
| `ai_tag_logs` | `company_id = get_my_company_id()` | per-call AI cost |

No role test. No test that the caller is the actor named in the row. No test that the referenced
session or segment is one the caller may touch.

**Proven (B1, B2).** A crew member inserted a `time_edit_logs` row **naming a different member as
the editor**, and an `ai_tag_logs` cost row. Both landed. The crew member cannot read either back —
`*_select_admin`/`_select_owner_admin` are owner/admin — so **the forgery is invisible to its author
and shown to the owner as fact.**

**⚠️ The counterfactual failed, and that makes it bigger.** This started as *"surely the platform's
other append-only log is not this open"*. It is. **This is not an M6 slip; it is how the
append-only-log convention was written** — CLAUDE.md's own description of the pattern specifies
which columns to omit and says nothing about constraining the INSERT.

**`time_session_rate_snapshots` is the money one.** `expenses.ts:315` reads
`hourly_rate, burden_multiplier, fixed_burden_per_hour` straight from it to compute a project's
labour cost. A forged snapshot changes reported labour cost. **`UNIQUE (session_id)` is what limits
it** — a snapshot can only be forged for a session that has none yet, so this is a race with a
window rather than an overwrite. Correctness resting on a uniqueness constraint added for a
different reason.

**Proposed fix.** Add an authorship predicate to all three:
`time_edit_logs` → `editor_member_id = get_my_member_id()`;
`time_session_rate_snapshots` → owner/admin, or write it only through the approval RPC (which runs
`SECURITY DEFINER` and is unaffected by the policy);
`ai_tag_logs` → `created_by = auth.uid()` if a column is added, else owner/admin.
**Touches:** three policies, one migration. **Ruling needed:** whether the convention itself should
carry an authorship rule, since it will be copied again.

---

### M6-03 · REACHABLE · An assigned subcontractor reads injured names and treatment notes that the UI deliberately hides

**What it is.** `safety_incidents_select_visible`'s project arm is

```sql
(project_id IS NOT NULL AND can_view_project(project_id))
```

with **no subcontractor exclusion** — unlike its two M6 siblings, `daily_logs` (excludes
`subcontractor`) and `deliveries` (excludes `subcontractor` and `client`). `is_assigned_to_project()`
is role-blind, so an assigned sub passes, reads the incident, and with it the child rows carrying
`injured_name`, `treatment_sought` and `treatment_notes`.

**And the mobile UI cuts exactly that.** `e2e/m-sections.spec.ts` A-39: *"lists type, date, reporter
and status — **and no injured-person name**"*. **The screen is narrower than the database.**

**Proven (G1).** With the subcontractor temporarily assigned to the incidents' project, they read
2 incidents, 2 injury rows and both injured names. Reverted in G3.

**⚠️ The first version of this probe was vacuous** and would have reported the opposite: every
scoped role read 0, not because a policy refused them but because **nobody is assigned to the
incident project**. The temporary assignment is what makes the answer mean anything.

**Proposed fix.** Add the sub (and client) exclusion to `safety_incidents_select_visible`'s project
arm, matching `daily_logs`/`deliveries`. **Ruling needed:** a subcontractor arguably *should* see
that an incident occurred on their site — the OSHA-adjacent argument — in which case the fix belongs
on the children (`injured_name`, `treatment_notes`) rather than the parent. **That is a real product
question and this document does not answer it.**

---

### M6-04 · LATENT · FRAGILE · The safety child tables are contained only by an implicit mechanism — and S161's proposed performance fix would break it

**What it is.** `safety_incident_injuries_select_visible`, in full:

```sql
company_id = get_my_company_id()
AND EXISTS (SELECT 1 FROM safety_incidents si WHERE si.id = safety_incident_injuries.incident_id)
```

That is a **foreign-key existence check**, not an authorization check. Read on its face it opens
every injury record in the company. `safety_incident_witnesses` is identical.

**It is nonetheless sound today** (G2, proven: zero injury rows came back for an incident the caller
could not read) **because PostgreSQL applies `safety_incidents`' own RLS to that nested reference.**
The child inherits the parent's scope implicitly.

**⚠️ Why this is filed rather than waved through.** Compare
`change_order_line_items_select_visible`, whose EXISTS **re-states** `can_view_project(co.project_id)`
and the role floor inside itself. Same repo, same shape, two conventions — one explicit, one relying
on a mechanism nothing names. And the implicit one has a specific way to fail:

> **`SECURITY DEFINER` functions bypass the caller's RLS. That is the entire point of
> `can_view_project()`. If anyone wraps this parent lookup in such a helper — which is exactly what
> S161's M5-07 proposes doing for performance elsewhere — the implicit filter disappears and these
> two tables open, silently, with no policy edit anywhere near them.**

An efficiency change in M5 becoming a data leak in M6 is the coupling worth naming before either is
touched.

**Proposed fix.** Make the containment explicit: restate the parent's visibility inside the child
EXISTS, as `change_order_line_items` does. **No behaviour change today.** **No ruling needed.**

---

### M6-05 · REACHABLE · An in-app notification that fails to deliver leaves no record anywhere

**What it is.** `notify()` inserts one row per recipient and, on failure, does this:

```ts
console.error('[notify] row insert failed', { type, companyId, recipientProfileId, error });
continue;
```

That is the entire record. There is no `notifications`-side equivalent of `email_logs`, which
carries `status: sent|failed` for every email — and which S160 has just extended to cover Supabase
Auth's own mail. **Notifications are now the only delivery channel in the platform with no log**
(C2).

**And almost nobody reads the return value.** `notify()` returns
`{ written, pushed, pruned, unreachable }`. **Six of the call sites do not assign it at all** (C3);
only `delivery-notify.ts` and the chat mention route use `outcome.written`. A fan-out that reached
nobody is indistinguishable from one that reached everybody, at every other call site.

**Proposed fix.** Either a `notification_deliveries` log mirroring `email_logs`, or — cheaper — have
every caller compare `written` against `recipients.length` and log the shortfall with the type and
the company. **Ruling needed:** whether in-app notifications warrant an audit table at all, or
whether the console is the right place given they are not contractual documents.

---

### M6-06 · REACHABLE · Push has never been enrolled anywhere, and every push path fails silently

**Measured (C1):** `push_subscriptions` holds **0 rows** platform-wide.

`sendPushToProfile()` returns early and silently in **two** cases: when VAPID is unconfigured
(`if (!vapidConfigured()) return result;`) and when the recipient has no subscriptions. Both produce
`{ sent: 0 }`, which — per M6-05 — nobody reads.

**This is the known risk the brief named, now with a number.** Recording it rather than re-deriving
it: chat's delivery guarantee, the still-clocked-in nudge, the incident escalation and the
assignment ping all assume a push channel that has never once been exercised. The in-app row is
written either way, so nothing is *lost* — but the "immediacy" half of every notification decision
is unverified.

**Proposed action:** none in code. **Enrol one handset and re-run C1 inverted.** Until then, treat
every push-dependent guarantee in `notifications-architecture.md` as unproven.

---

### M6-07 · REACHABLE · `company_members` carries no email, and 95% of the roster has no notification path

**What it is.** `company_members` columns [LIVE]: `id, company_id, profile_id, member_type,
display_name, schedule_color` + the standard eight. **No email**, and no FK to `subcontractors` —
the link is on the subcontractors side (`subcontractors.member_id`, `20260731000000`).

So a member is reachable only via a `profiles` row (a login) or via that reverse lookup.
`resolveMemberReachability()` implements exactly that, in three honest states.

**Measured (D1), rebuild-test:**

| | count | share |
| --- | --- | --- |
| members total (not deleted) | 172 | |
| **with a profile** (in-app + email) | 7 | 4% |
| **email-only** (via `subcontractors.member_id`) | 2 | 1% |
| **unreachable** | **163** | **95%** |

165 of the 172 are `member_type = 'subcontractor'` with no profile.

**⚠️ The ratio is seed data; the shape is not.** rebuild-test's 165 profile-less subcontractor
members look like an import fixture and production may differ. What does not differ is the
mechanism: **reach depends entirely on a login or a linked `subcontractors` row with an email**, and
`company_members` itself can answer neither.

**This is the honest half, and it is genuinely good:** `notify()` counts the unreachable rather than
dropping them, and `POST /api/project-assignments` returns `unreachableName` so the screen can say
so, non-blocking (F3). **The product does not pretend.** What is missing is any aggregate view — an
owner cannot ask *"how many of my roster can I actually reach?"*

**Proposed fix (needs a ruling).** Josh's standing ruling is that subs, vendors and clients all
carry an email on the profile. M6 cannot satisfy that today for a member with no login. The options
are (a) an `email` column on `company_members`, (b) requiring a `subcontractors` row for every
subcontractor member, or (c) accepting that a roster-only member is unreachable by design and
surfacing the count. **(c) is closest to what is built.**

---

### M6-08 · REACHABLE · The offline conflict backlog has a resolution workflow and no surface

**Measured (E1, E2):** `sync_conflicts` holds **92 rows, every one `status = 'pending'` with
`resolved_at IS NULL`**, spanning 2026-08-06 to 2026-08-19, **all with
`target_table = 'time_clock_sessions'`**.

The table is built for a workflow — `status`, `resolved_at`, `resolved_by`, `resolution_note`,
`rejected_body` — and `sync_conflicts_select_owner_admin` lets an owner read it. **Nothing renders
it.** The only consumers in the repo are `lib/offline/{queue,sync,executors}.ts` (the writer) and
`lib/trial/deletion.ts` (the purger).

**And the person whose write lost the conflict cannot see it** (E2): the policy is owner/admin, so
the field user whose `rejected_body` is sitting in the row has no way to learn that what they
entered was discarded. For `time_clock_sessions` that is somebody's hours.

**⚠️ Caveat, stated rather than glossed:** 92 conflicts in 13 days against 16 sessions strongly
suggests harness traffic rather than human use, and `m6m-queue`/`m-chat-offline` exercise this path.
**The count may be synthetic. The absence of a surface is not.**

**Proposed fix.** A conflicts view for owner/admin, and — the part that matters — a signal back to
the author. **Ruling needed** on the second: telling a crew member *"your clock-out was rejected"*
is a notification design, not a screen.

---

### M6-09 · REACHABLE · 29 of 32 UPDATE-shaped writers report success over discarded writes

| service | writers | guarded | via `applied()` |
| --- | --- | --- | --- |
| `time-tracking-client.ts` | 9 | 1 | 0 |
| `daily-logs-client.ts` | 5 | 0 | 0 |
| `safety-client.ts` | 6 | 0 | 0 |
| `deliveries-client.ts` | 5 | 0 | 0 |
| `members-client.ts` | 2 | **2** | 0 |
| `notifications-client.ts` | 3 | 0 | 0 |
| `pay-rates-client.ts` | 1 | 0 | 0 |
| **total** | **32** | **3** | **0** |

**With M5's 4 of 24, the two modules audited this session are 7 of 56.** The unguarded set includes
`approveSession()`, `clockOut()`, `setIncidentResolution()`, `closePurchaseOrder()` and
`softDeleteIncident()` — every one of which reports a state change to the user.

`mutation-result.ts` says *"No exceptions"*. **No M6 service imports it.** **No ruling needed.**

---

### M6-10 · EFFICIENCY · `notify()` inserts one row per recipient, sequentially

The fan-out loop awaits one `INSERT … RETURNING id` per recipient before starting the next. A
company-wide safety escalation to every owner, admin and PM is N round trips where a single
`.insert([...])` would be one. Round-trip latency dominates at this data size, so the cost is
`N × RTT`. The per-recipient render (`render(recipient)`) is why the loop exists, but the *inserts*
can still be batched. **No ruling needed.**

---

### M6-11 · EFFICIENCY · `chat_message_photos.company_id` is the one M5/M6 column missing an index

Of 97 tables, 7 carry a `company_id` with no leading index; **only one is M5 or M6**. Every RLS
policy on the table filters `company_id`, so every scan is sequential. It is empty today and grows
by one row per photo attached to a chat message, forever. The other six are M1/M7 config tables and
are outside this pass. **No ruling needed.**

---

### M6-12 · DRIFT · `notifications` follows neither table convention

`notifications` has no `is_deleted`, no `created_by`/`updated_by` — the append-only-log shape — but
**does** have `updated_at`, an UPDATE policy and a **DELETE** policy (`notifications_delete_own`).
CLAUDE.md's rule is *"soft deletes only, never hard delete"*, with a named exception for pure
append-only logs, which this is not. Dismissing a notification by deleting it is a defensible
design; it is simply not either documented convention. Lowest priority.

---

## §2 — Checked and found sound

| # | What | Evidence |
| --- | --- | --- |
| V1 | **Chat separates crew from sub threads correctly.** `chat_threads_select_visible` is `company AND can_view_project AND (kind='sub' OR role <> 'subcontractor')`. An assigned sub passes the role-blind helper and is then filtered by `kind` — **the separation is role-AWARE and the helper's blindness is a precondition, not a hole.** `chat_messages_insert_authorized` additionally requires `is_assigned_to_project` for a sub posting to a sub thread | policy read. ⚠️ **Asserted as a SHAPE, not probed:** rebuild-test holds **0 chat threads and 0 messages**, so a row probe would pass vacuously. F1 fails deliberately if rows appear, so the shape assertion gets replaced rather than silently kept |
| V2 | **`#129`'s two markup editors are one mechanism.** Both `app/dashboard/.../markup-editor.tsx` and `app/m/.../markup-canvas.tsx` import the same `saveMarkup()` from `photos-client` and pass the same `drawShapes` from `lib/markup/flatten-shapes`. **This closes the item M3's pass handed to M6's** | import census |
| V3 | **`notifications`, `push_subscriptions` and `chat_reads` are all scoped to `get_my_profile_id()`** with no company predicate — and none needs one, since a profile belongs to exactly one company | F2 |
| V4 | **`resolveMemberReachability()` is honest.** Three explicit states, the unreachable are counted rather than dropped, and the assignment route surfaces `unreachableName` to the screen | F3, and `assignment-notify.ts:43-91` |
| V5 | **The reverse lookup M6-07 depends on is indexed** — `idx_subcontractors_member_id`, partial on `member_id IS NOT NULL`. Without it every reachability call on a profile-less member would seq-scan `subcontractors` | `pg_indexes` |
| V6 | **Time tracking uses a tiered rank model**, not a role list — `time_role_rank(get_my_role()) > time_member_rank(member_id)`, with `time_segments` delegating to `can_view_time_session()`. More expressive than anything else in the platform and correct on its face | policy read |
| V7 | **`safety_incidents` handles project-less incidents explicitly** — a separate arm for `project_id IS NULL` gating on role or reporter, rather than failing open or closed by accident | policy read |
| V8 | **`push_subscriptions` soft-deletes.** No DELETE policy would be a defect if there were no other way to retire a device; it has `is_deleted` and an UPDATE policy | column + policy read |
| V9 | **Chat messages are immutable** — no UPDATE, no DELETE policy on `chat_messages` | policy census |
| V10 | **`sync_conflicts` writes are authorship-bound** — `author_member_id = get_my_member_id()` OR owner/admin. Unlike the three append-only logs in M6-02, this one got it right | policy read |

---

## §3 — Not verified, and why

| # | What | Why not |
| --- | --- | --- |
| U1 | **Chat end to end** | 0 threads and 0 messages on rebuild-test. Every chat assertion in this pass is policy-shape only, and F1 reddens the moment rows exist so it cannot quietly stay that way. The existing `s126-chat-*` harnesses seed their own fixtures and pass; **this pass did not re-derive their coverage** |
| U2 | **Push delivery on a handset** | 0 subscriptions, and a Codespace cannot enrol one. The brief named this as a known risk; M6-06 records it with a number rather than re-deriving it |
| U3 | **Whether production's `sync_conflicts` backlog resembles rebuild-test's** | `live-sql.mjs` is rebuild-test-only and that guard was not bypassed. The query is one line if Josh wants it |
| U4 | **Whether the 95% unreachable ratio holds in production** | Same reason. The mechanism is what generalises, not the ratio |
| U5 | **Whether any UI reaches the 29 unguarded writers** in M6-09 | Database behaviour is proven; per-screen reachability was not enumerated |
| U6 | **`member_pay_rates` and the approval RPC** | `approve_member_week` is a `SECURITY DEFINER` RPC and the legitimate writer of `time_session_rate_snapshots`. Its body was not read this pass — M6-02 concerns the *direct* PostgREST path that exists alongside it |
| U7 | **Offline queue behaviour end to end** | `lib/offline/*` has its own harnesses (`m6m-queue`, `m-chat-offline`). This pass read the conflict table, not the queue |

---

## §4 — Cross-system edges established this pass

| Edge | What was established |
| --- | --- |
| **M6 ← M5** | `can_view_project()` gates 14 of M6's tables. M5-07's 148× cost lands here; M5-10's client precondition opens `chat_*`, `daily_logs`, `deliveries`, `safety_incidents`, `punch_*` to a client with a member row |
| **⚠️ M5 → M6, NEW AND SHARP** | **S161's M5-07 remedy (wrap or flatten a lookup into a `SECURITY DEFINER` helper) would break M6-04's implicit containment** and open `safety_incident_injuries`/`_witnesses`. Neither change is safe without the other |
| **M6 ↔ M2** | `resolveMemberReachability()` reaches into `subcontractors.email` — M6's only path to an email for a profile-less member. M2's pass never looked at this edge; it is closed here from M6's side |
| **M6 ↔ M3** | `#129` closed (V2). `daily_logs.pdf_file_id`, `deliveries.pdf_file_id`, `safety_incidents.pdf_file_id` and chat photos all point at `files`; the category floor does not cover these categories, consistent with S155 |
| **M6 → M7** | `time_session_rate_snapshots` feeds `expenses.ts:315` labour cost — M6-02's money consequence |
| **M6 ↔ M1** | `company_members` is listed as M1-owned in `SYSTEM-AUDIT.md` §1.1 but is M6's working table. **Recorded as an ownership ambiguity, not a defect** — every M6 policy resolves through it |

---

## §5 — Proposed order of work, if Josh rules for all of it

1. **M6-02** — three policies. The payroll audit trail and the pay-rate snapshot are the platform's
   least defensible open writes.
2. **M6-04** — restate the containment explicitly. **Do this before any M5-07 work**, not after.
3. **M6-03** — one policy, once the product question is answered.
4. **M6-01** — rewrite the guard's header against the live policies.
5. **M6-09** — 32 writers onto the shared guard, with M5's 24.
6. **M6-05, M6-08** — delivery record and conflict surface; both need a ruling first.
7. **M6-10, M6-11** — batch the notify inserts, index `chat_message_photos.company_id`.
8. **M6-06** — enrol a handset and invert C1.
