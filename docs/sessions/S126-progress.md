# S126 — Chat slices 1–3, unattended run

> **Written for a reader with no memory of this session.** Josh was away; this file is the
> pickup record. Every entry: what was attempted, what actually happened, the **real exit
> code**, and the next action.
>
> **Finishing was never the goal. A resumable, verified, honest state was.**

---

## Entries

### 02:37 UTC — progress log created, before Phase 0

Created this file first, per the run brief, so a dead run is still recoverable.

- **Ground truth at start:** `pwd` `/workspaces/FrameFocus-work`, branch `spec/chat-s124`,
  HEAD **`4b61b9d`**, tree **clean**.
- Spec confirmed at `4b61b9d` — the ND-30 closure commit.
- **Exit code:** n/a (no command under test).
- **Next:** Phase 0 — read §12 as committed, confirm slice contents, branch off `origin/main`.

### 02:39 UTC — Phase 0 complete; build branch cut

**§12 read as committed** (`4b61b9d`), not from memory:

- **Slice 0 (notification expiry) — SKIPPED, and this is the pre-authorised call.** §12 states
  it is *"Independent of every chat table, so it can land first"*. Independent, therefore not a
  prerequisite for slice 1. Per the run brief's ruling 3: skip and log. **It remains owed** and
  is unaffected by anything in this run.
- **Slice 1 table list confirmed:** `chat_threads`, `chat_messages`, `chat_message_mentions`,
  `chat_reads` — four tables, all carrying `company_id` (D1).
- **`email_types` mention row: YES, in slice 1** — §12 says the row must exist before any
  mention email can be logged, because `email_logs` has an FK to that registry.
- **`chat_message_photos`: slice 6**, confirmed — not this run.

**Build branch: `feat/chat`, cut from `origin/main` (`35ec6ab`).**

⚠️ **Consequence a reader needs:** the chat spec is **NOT on this branch**. It lives on
`spec/chat-s124` at **`4b61b9d`**, which is unmerged. `origin/main` is `35ec6ab`. To read the
spec that this build implements, check out `spec/chat-s124`. `lib/notify/` **is** present on
`origin/main` (the S123 notifications core came in via `e90a578`), so slice 2 has what it
depends on.

- **Exit code:** branch creation 0; all reads 0.
- **Next:** slice 1 — re-verify the `is_assigned_to_project()` role-blindness finding from live
  schema before writing any policy.
### 03:05 UTC — SLICE 1 COMPLETE AND VERIFIED. Committed `fc2b910`.

Migration `20260906000000_chat_core.sql`. **Rebuild-test only** — CLI link checked
immediately before the push (`LINKED: framefocus-rebuild-test nmyphyhmfttxkdoposvf`,
`production linked? false`).

**Exit codes, all read from the printed line:**

| Step | Exit | Corroborating signal |
| --- | --- | --- |
| `supabase db push` | **0** | Not trusted alone — see below |
| migration applied? | — | `schema_migrations` has `20260906000000`; 4 tables, 9 policies, 4 triggers present |
| `npm run db:types` | **0** | `database.ts` 6692 → **6905** lines, 18 chat references |
| `npx turbo run type-check` | **0** | **5 successful, 5 total** |

The push was verified against the catalog rather than the CLI's own "Finished" line,
because a 14-digit prefix collision makes `db push` report success on a silent skip.

#### The probes — run as `authenticated`, never as postgres

Every probe wrapped in `BEGIN; SET LOCAL role authenticated; SET LOCAL request.jwt.claims …;
ROLLBACK;` and every one returned `running_as: authenticated`.

**1. The decisive one — subcontractor cannot read the crew thread.**

```
running_as              | authenticated
role_seen               | subcontractor
is_assigned             | true
passes_can_view_project | true      <-- the helper admits them
crew_msgs_visible       | 0         <-- the policy does not
sub_msgs_visible        | 1
crew_threads_visible    | 0
```

**The counterfactual, evaluated against the helper directly:**

```
name | naive_predicate_says | shipped_predicate_says | crew_threads_sub_can_see
test | true                 | false                  | 0
```

**2. Crew member** — `crew_msgs_visible: 1`, `sub_msgs_READABLE: 1`; INSERT into the crew
thread **ACCEPTED**; INSERT into the sub thread **REFUSED**:
`ERROR: 42501: new row violates row-level security policy for table "chat_messages"`.
That is §S1's divergence, live.

**3. Owner NOT assigned** (`QA A — isolation fixture`) — `owner_assigned: false`,
`can_view_BY_ROLE: true`, 2 threads / 2 messages visible, INSERT into **both** threads
ACCEPTED. Role, not assignment.

**4. PM NOT assigned** (`kitchen test`) — `can_view: false`, `threads_visible: 0`,
`msgs_visible: 0`. Reads neither.

**5. Assigned sub, own vs other project** — INSERT into own project's sub thread ACCEPTED;
`other_project_threads_visible: 0`; INSERT into another project's sub thread **REFUSED**
(`42501`).

**6. No UPDATE/DELETE** on `chat_messages` or `chat_message_mentions` — full policy inventory
read from `pg_policy`: 9 policies, and the only UPDATE is `chat_reads_update_own`.

#### Derived decisions (logged, not guessed)

- **`kind` is a CHECK, not an ENUM.** Live: **0** native enum types in `public`, **139** CHECK
  constraints; `projects.status` and `files.category` are both CHECKs.
- **`author_profile_id = get_my_profile_id()` on INSERT** — derived from
  `daily_logs_insert_authorized`'s `author_member_id = get_my_member_id()`.
- **Pre-authorised ruling 1 checked and NOT triggered:** §4.5a already distinguishes
  `chat_reads` (SELECT/INSERT/UPDATE) from the append-only pair. **No spec defect to log.**

#### ⚠️ A methodological catch worth carrying forward

My first counterfactual evaluated the naive predicate *inside* a query against
`chat_threads` — whose own RLS had already filtered the rows. It returned **0 and 0**, which
reads as agreement and proves nothing. The valid form evaluates the **helper** directly,
outside the protected table. **A counterfactual run under the policy it is trying to bypass is
not a counterfactual.**

#### State

All probe fixtures deleted — **0 rows** in all four chat tables. Tree clean.

- **Next:** push the branch, then slice 2.

---

## RESUME HERE

**Next action:** push `feat/chat`, then start slice 2 — `lib/chat/` core: thread resolution,
send, mention parse, the `notify()` call, and the 12-second poll.
