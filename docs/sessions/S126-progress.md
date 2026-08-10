# S126 — Chat slices 1–3, unattended run

> **Written for a reader with no memory of this session.** Josh was away; this file is the
> pickup record. Every entry: what was attempted, what actually happened, the **real exit
> code**, and the next action.
>
> **Finishing was never the goal. A resumable, verified, honest state was.**

---

## Entries

> ⚠️ **Timestamp note.** Two entries below were first written with estimated times (03:05,
> 03:40) that ran ahead of the clock; corrected to ~02:50 and ~02:55 against Mon Aug 10 02:56:02 AM UTC 2026. Flagged
> rather than quietly fixed, because a pickup log whose timestamps are invented is worth less
> than one with none.

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
### ~02:50 UTC — SLICE 1 COMPLETE AND VERIFIED. Committed `fc2b910`.

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
### ~02:55 UTC — SLICE 2 CORE COMMITTED (`lib/chat` + route). PARTIAL — read the split below.

Two commits, grouped by concern: services, then route + tests.

**Exit codes, all from the printed line:**

| Step | Exit | Corroborating signal |
| --- | --- | --- |
| `npx turbo run type-check` | **0** | **5 successful, 5 total** |
| `npx vitest run` (from `apps/web`, not the repo root) | **0** | **607 passed** — 592 before + 15 new |
| `next lint --dir lib/chat --dir app/api/chat` | **0** | no warnings |

**Built:** `lib/chat/mentions.ts` (pure parser, 15 tests), `lib/chat/threads.ts`
(resolve + postable set), `lib/chat/messages.ts` (send, since-based poll, mark-read),
`lib/chat/mention-notify.ts` (notify() + ND-31 truncation),
`packages/shared/validation/chat.ts`, `app/api/chat/messages/route.ts`.

#### Derived decisions (logged, not guessed)

- **Ambiguous `@token` resolves to NOBODY and is reported back.** Two people called Chris —
  guessing tells the wrong person they are needed on site. Derived from §5.1's premise that the
  delivery guarantee rests on the mention being right; the composer can surface `unresolved`.
- **`@josh.` vs `@josh.bishop`** — trailing dot stripped, internal dot kept. Without it every
  message ending in a mention resolves to nobody.
- **Audience resolution uses the service role; all writes use the caller.** Working out who may
  be mentioned is not the same act as writing the message.
- **The mention email is NOT built here.** §12 places the send path in **slice 4**; slice 1
  already landed the `email_types` row. `mention-notify.ts` ends with a **named seam** — no stub
  function, because an empty `sendMentionEmail()` reads as "built" to a later grep.
  ⚠️ *The run brief listed the email under slice 2's non-negotiables; §12 places it in slice 4.
  Read as: the brief constrains WHERE it lives when built, §12 constrains WHEN. Followed §12.*

---

## ⚠️ VERIFIED vs WRITTEN-BUT-UNVERIFIED — read this before trusting anything above

**VERIFIED (evidence in this file):**

- **Slice 1, completely.** Migration applied and confirmed against the catalog; seven RLS
  probes run as `authenticated` with output pasted; policy inventory read from `pg_policy`.
- **The mention parser.** 15 unit tests, exit 0.
- **Everything type-checks and lints**, whole monorepo, 5/5.

**WRITTEN BUT NOT VERIFIED — no runtime evidence exists for any of these:**

- **`/api/chat/messages` has never been called.** Not once, by anything. No dev server was
  started this run.
- **`resolveThread`, `insertMessage`, `insertMentions`, `messagesSince`, `postableSet`,
  `markThreadRead` have never executed against the database.** They type-check. That is all.
- **`notifyMentions` has never fired.** No notification row has been written by chat.
- **The 12-second poll does not exist as a loop.** `messagesSince()` is the query it will call;
  nothing calls it on an interval yet, and A-C39 (polling stops when the thread is not open) has
  no implementation to test.

**NOT STARTED:** ND-34's switcher query and per-thread unread count — §12 assigns both to slice
2's `lib/` core and neither is written. **Slice 3 (desktop UI) was not begun.**

**So: slice 1 is done. Slice 2 is roughly two-thirds written and one-third verified.**
### 02:58 UTC — SLICE 2 IS NOW VERIFIED. Live harness 13/13.

`apps/web/test/s126-chat-core.live.ts` drives the real service functions against rebuild-test
with real session clients. **This is what moved slice 2 from written to verified** — the
previous entry's unverified list is now largely discharged.

```
npx vitest run --config test/live.vitest.config.ts s126-chat-core   ->  exit 0
Test Files  1 passed (1)
     Tests  13 passed (13)
```

Covered, each paired so it cannot pass vacuously: `resolveThread` idempotency (one row, twice);
sub gets NULL for the crew thread **and** resolves their own sub thread; `postableSet` excludes
crew from sub-thread candidates and includes the Owner; crew post in crew / **refused** in sub
with `denied: true`; forged authorship refused; `messagesSince` returns exactly the delta and a
quiet thread polls **empty**; plain message notifies nobody (R6) while a tagged one writes the
join row, one notification, the real text, and `link_params.threadId`; `markThreadRead` upserts
one row and moves `updated_at`.

#### ⚠️ One failure on first run — the TEST was wrong, not the code

I filtered the notification query with `.gte('created_at', notifySince)` where `notifySince`
came from `new Date()` — the **client** clock — while `notifications.created_at` defaults to
`now()`, the **database** clock. Milliseconds of skew put the row just before the watermark;
the query returned `[]` while `notify()` had correctly reported `written: 1`. Fixed by
selecting on `source_id`, which is already unique to the message.

**Carry this forward:** comparing a client timestamp to a server-generated one is the same
family as reading a masked exit code — the result looks authoritative and is an artifact.

#### State after this entry

- **Rebuild-test:** all four chat tables **empty**, 0 mention notifications. Teardown verified.
- **Tree clean**, branch pushed.
### 03:23 UTC — SLICE 2 IS COMPLETE. ND-34 + poll + the route, all exercised.

Five commits: two migrations, services, tests, route spec.

| Step | Exit | Corroborating signal |
| --- | --- | --- |
| `supabase db push` ×2 | **0** | Both verified applied against the catalog; `prosecdef = false` on both RPCs — SECURITY INVOKER confirmed, not assumed |
| `npm run db:types` | **0** | 6905 → **6917** lines |
| `npx turbo run type-check` | **0** | **5 successful, 5 total** |
| `npx vitest run` (from `apps/web`) | **0** | **617 passed** |
| live harness `s126-chat-core` | **0** | **17 passed** (was 13) |
| `npx playwright test m-chat-send-route` | **0** | **8 passed** |
| `next lint --dir lib/chat` | **0** | no warnings |

**1a — ND-34.** `chat_switcher_threads()`, a SECURITY INVOKER RPC. **The N+1 and the trap
behind it are both recorded in the migration header:** the loop is one count per thread; the
shape that *looks* like the fix — bulk fetch, count in JS — cannot express a **per-thread**
cutoff through PostgREST, so the nearest expressible query is "everything since my oldest
watermark", bounded by whichever thread the user has ignored longest. Proven under impersonation
to inherit RLS: sub sees **1** row, crew sees **2**.

**1b — the poll.** `lib/chat/poll.ts`, 10 unit tests. Imports no Supabase client and is not
`server-only` — that is A-C41. Timers and visibility are injected because **A-C39's failure is
invisible**: nothing on screen is wrong while a backgrounded tab polls all day.

**1c — the route.** Called for the first time. 401 by curl; 400/403/200 by Playwright.

#### ⚠️ A REAL BUG, FOUND BY A FAILING TEST — and the diagnosis took three wrong turns

`markThreadRead()` wrote `last_read_at` from `new Date()` — the **client** clock — while
everything it is compared against (`chat_messages.created_at`) is the **database** clock. Unread
is `created_at > last_read_at`, so the two clocks were being subtracted from each other. **When
the client runs fast, the unread badge silently never lights again.** Nothing looks wrong.

The wrong turns, each of which looked convincing:

1. I "measured" skew by comparing `new Date()` in node against `now()` from a separate MCP round
   trip. **That compares two instants, not two clocks.** It cannot show skew and nearly
   exonerated the bug.
2. I reproduced the comparison in one SQL batch and got `last_read_at == created_at`, because
   `now()` is the **transaction** timestamp. My repro's artifact, not the failure.
3. Calling the RPC directly against the exact rows the test creates settled it — **the RPC
   returned the correct count.** The reader was right; the writer was wrong.

Fixed by `chat_mark_read()` (migration `20260908000000`), so the **server** stamps it.

**And in the same run, the opposite:** "a thread never opened counts everything as unread" failed
with 0, and **0 was correct** — the sub thread had no messages, because every earlier sub-thread
write in that file is a refusal. **The test's premise was wrong.** One failure was the code, one
was the test, and they were indistinguishable from the console. *Establish which is wrong before
changing either* earned its keep twice.

---

## CARRIED GAP — ND-30, for slice 4

**ND-30 is closed in the spec and unbuilt in the code**, and the only thing standing between a
closed ruling and a silently missing feature is a comment at the bottom of
`lib/chat/mention-notify.ts`.

- **What is owed:** the sub mention email. `email_types.mention` already exists (slice 1), so
  the remaining work is a template and a send call.
- **Where it goes:** the chat send path, **alongside** `notify()`, never inside it — four
  consumers already drive their own email and moving it in would double-send.
- **Scope:** SUBS ONLY (ND-42). A mentioned crew member, foreman, PM, Admin or Owner gets **no**
  email. That is an explicit recorded exception to parent **R3**.
- **Why it is flagged here:** this is the same shape as the §4.6 debt — a correct decision whose
  only trace in the code is prose. **Slice 4 inherits it explicitly from this entry**, not from
  anyone's memory.

---

## RESUME HERE

**Single next action:** start **slice 3** — the desktop crew thread. `lib/chat/` is complete and
verified, so this is UI only: the global panel (ND-33), the switcher wired to
`switcherThreads()`, the composer with a **prominent** `@` affordance (§5.1), and the mention
picker over the **postable** set. Crew thread only — sub-thread UI is slice 4.

Page size is ruled: **50 in the tab, 25 in a panel** (ND-38, `PAGE_SIZE` in
`lib/chat/messages.ts`). Opening a thread calls `markThreadRead()`.

**Playwright must run in four chunks** — a single run does not survive this Codespace.

---

## Where things stand

**VERIFIED — slice 1 and slice 2, both complete.**

- Slice 1: migration applied, seven RLS probes as `authenticated` with output pasted.
- Slice 2: 17 live tests through real sessions, 25 unit tests, 8 route tests through HTTP.
  The route has been called; the poll has been seen starting, stopping, and refusing to run
  while hidden.

**WRITTEN BUT NOT VERIFIED:** nothing. Everything committed in slices 1–2 has been executed.

**NOT STARTED:** slice 3 (desktop UI), slice 4 (sub-thread UI + the ND-30 email), slices 5–6.

## BLOCKED — NEEDS JOSH

**Nothing is blocked.** No ruling was required and none was guessed. Two judgement calls are
logged with their reasoning: the switcher as an RPC (§7.1a-i left the shape open) and the `m-`
prefix on the route spec (the config's authenticated selector).

**Rebuild-test:** all four chat tables and `notifications` at **0 rows**. Port 3000 free.
