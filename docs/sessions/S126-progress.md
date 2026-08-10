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

### 10:31 UTC — SLICE 3 WRITTEN. Type-check 5/5, unit 633/633. Browser not yet run.

**Phase 0 re-established before reading anything:** `pwd` `/workspaces/FrameFocus-work`, branch
`feat/chat`, HEAD **`4ddc129`**, tree clean, **0/0 vs `origin/feat/chat`**. CLI linked to
**`nmyphyhmfttxkdoposvf` / framefocus-rebuild-test**. All four chat tables **0 rows**.
`spec/chat-s124` is now on origin at `4b61b9d` — §7 and §12 were read from `origin/`, not from
this branch and not from memory.

**Built:** the global panel (ND-33), the switcher, the shared thread view, the composer with the
`@` affordance, the mention picker, the project Chat tab, and the four API routes the panel talks
to. `lib/chat/` was consumed, not rewritten — the two additions to it are named below.

**Four things found by building that were not in the brief:**

1. **`chatPollSchema` would have rejected every real timestamp.** Slice 2 wrote
   `since: z.string().datetime()`. Plain `.datetime()` accepts only a `Z` suffix; PostgREST
   returns `2026-07-11T22:13:07.184263+00:00`. **Measured, not assumed** — parsed a real
   `projects.created_at` through both forms: plain `false`, `{ offset: true }` `true`. The poll
   would have 400'd on its second request forever. Invisible until now because slice 2 wrote the
   schema and built no route that used it — the "written but unverified" category, caught by
   wiring it.
2. **The switcher cannot bootstrap.** `chat_switcher_threads()` starts `FROM chat_threads`, and
   threads are created lazily, so a company that has never used chat gets **zero rows** — the
   panel opens onto an empty list with no way to start a conversation anywhere. The route now
   merges in active projects with no thread row yet. **Membership is not re-derived**, which
   §7.1a-i explicitly forbids: it is a plain `projects` select under the caller's own RLS, and
   `projects_select_visible` was read live and is byte-for-byte `can_view_project()`'s body.
3. **A-C29's tripwire could not be cleared as written.** Building the desktop route made
   `expect(routeExists(resolved)).toBe(false)` fail — the reminder firing as designed. But
   simply emptying `PENDING_ROUTES` broke the *mobile* arm, because `links.ts` still resolved
   mobile chat to `/m/p/{id}/chat` — **a route ND-37 says must never exist and A-C42 asserts the
   absence of**. Neither leaving the key nor removing it could pass. Fixed at the cause:
   `links.ts` now returns ND-40's ruled `/m/p/{id}?chat=1`. `mention-notify.ts` has asserted that
   shape in a comment since slice 2 while this file produced the other one — the comment was
   right and the code was not.
4. **A second test pinned the old mobile path** (`s123-push-workers.test.ts`, A-N19). **Which was
   wrong was established before either was touched:** that file is S123, ND-40 is S125, and what
   A-N19 asserts — one key, two *different* destinations — is untouched by the literal. The test
   was stale; the literal was updated and the property kept.

**Two additions to `lib/chat/`, both additive, neither a second implementation:**

- `insertTokenFor()` in `mentions.ts` — the inverse of `parseMentions`, in the same file so the
  two cannot drift. The picker must not insert `@chris` where two Chrises are postable: the
  parser resolves ambiguity to **nobody** on purpose, so that message would notify neither of
  them while the picker had just confirmed the choice. Returns `null` when no unambiguous token
  exists, and the composer says so rather than inserting something inert.
- `messagesBefore()` in `messages.ts` — §7.2's load-more, which had no lib function. Without it
  the first thread past one page silently loses its history.

**The clock, checked deliberately because unread is what this slice renders.** Every `since` is
a `created_at` Postgres stamped and the client echoes back; `markThreadRead` stays the RPC. A
unit test asserts `new Date()` and `Date.now()` appear nowhere in `use-chat-thread.ts`.

**Ruled and logged — the sub thread in the switcher.** Slice 3 filters the switcher to
`kind: 'crew'`, in one named constant the slice-4 build deletes. Reasoning: (a) it hides nothing
that exists, because threads are created lazily and nothing in the app asks for a sub thread
before slice 4; (b) rendering it dead is refused on the spec's own precedent — §7.1e will not
have "a disabled second segment" in the analogous case; (c) letting it open the crew view would
put a composer in front of roles the policy refuses, which is M6M **D-54 inverted** and worse
than either alternative.

- **Exit codes:** `npx turbo run type-check --force` → **0**, 5/5 tasks, 0 cached, 0 `error TS`.
  `npx vitest run` from `apps/web/` → **0**, **633 passed (633)**, 44 files.
- **Next:** Playwright, in four chunks.

---

### 11:20 UTC — SLICE 3 COMPLETE AND SEEN WORKING. Playwright 20/20 across four chunks.

**Four chunks, each run on its own**, after `scripts/e2e-preflight.sh` (exit **0**, one server,
bound 3000 — no silent move to 3001):

| Chunk | File | Result |
| --- | --- | --- |
| 1 | `desktop-chat-panel.spec.ts` | **6 passed**, exit `0` |
| 2 | `desktop-chat-switcher.spec.ts` | **5 passed**, exit `0` |
| 3 | `desktop-chat-send.spec.ts` | **3 passed**, exit `0` |
| 4 | `desktop-chat-mentions.spec.ts` | **6 passed**, exit `0` |

Chunks 1–3 were re-run after the fixes below and stayed green.

**SEEN, not inferred.** Screenshots were taken of the panel over `/dashboard/contacts` and read.
That is how two of the three defects below were found — every assertion was green at the time.

- The panel over the Contacts table, the table still behind it, the switcher listing QA A and
  `test` with unread badges and the threadless projects below them by name.
- The picker showing four people with names and roles — **no subcontractor, no client** — and the
  `Mention` button sitting beside `Send` at the same size.
- A sent message rendering right-aligned as **You** with a timestamp, composer cleared.

**THREE DEFECTS, ALL FOUND BY RUNNING IT.**

1. **The picker proposed a token the parser cannot read back.** `insertTokenFor` returned the
   first *unique* token, and `MENTION_RE` stops at whitespace — so a spaced surname produced
   `admin a`: genuinely unique, read back as `admin`, matching nobody. Found against the real
   roster (`QA Admin A`, `QA Foreman A`), not by reading the code. Fixed by refusing any token
   the parser cannot re-read; for those two the honest answer is now `null` and the composer says
   so.
2. **The first character typed after picking a name landed at index 0.** The caret was restored
   in a `requestAnimationFrame`, which fires after pending input is processed. Typing straight
   after choosing Casey produced `con it — @caseyan you count what is left?`. **Every mention
   assertion passed**, because none of them typed afterwards — it was found in a screenshot.
   Fixed with `useLayoutEffect`; a regression test now types after inserting.
3. **"Load older messages" offered itself on a thread with one message.** Now shown only when the
   first page came back full, with the page size taken from the server's response rather than a
   component literal.

**One test failed and the TEST was what was wrong** — chunk 2 looked for the launcher badge after
opening the panel, and the badge deliberately shows only while closed. Established before
changing either side: the per-project counts either side of it were already correct.

**The database is exactly as it was found.** `chat_threads`, `chat_messages`,
`chat_message_mentions`, `chat_reads` and `notifications` all at **0**. The first teardown left a
`notifications` row behind — a mention writes one and it is not in a `chat_*` table — caught by
counting `notifications` rather than trusting the four chat tables. The fixture now removes it.

- **Exit codes:** `npx turbo run type-check --force` → **0**, 5/5, 0 cached, 0 `error TS`.
  `npx vitest run` from `apps/web/` → **0**, **635 passed (635)**, 44 files. Playwright as tabled
  above.

---

### 11:40 UTC — PHASE 1: RULING SWEEP. Read-only. 24 chat rulings + the parent set.

**Ground truth first:** branch `feat/chat`, HEAD **`acb4f94`**, tree clean, **0/0 vs origin**,
CLI on **`nmyphyhmfttxkdoposvf` / framefocus-rebuild-test**. All four chat tables and
`notifications` at **0**. Spec read from `origin/spec/chat-s124` @ `4b61b9d`.

**Highest ND is 42**, checked rather than assumed (`grep -oE "ND-[0-9]+" | sort -n | tail`) — 32
distinct ND references, the chat series running ND-19…ND-42.

**Method used:** for each ruling, name the artifact that makes it true and ask what would happen
if that artifact were deleted. *"The spec says so"* was not accepted as evidence.

#### RECORDED BUT UNIMPLEMENTED — listed first

| # | Ruling | What is missing | Where it goes |
| --- | --- | --- | --- |
| 1 | **ND-41** — notification expiry | `/api/cron/notification-expiry` **does not exist**. `ls app/api/cron/` returns six routes — `co-reminders`, `daily-log-missing`, `estimate-reminders`, `invoice-reminders`, `still-clocked-in`, `timesheets-ready` — and none is it. Nothing reads `notifications.expires_at`. | **Outside 4–6.** Carried gap; slice 0, still owed. |
| 2 | **ND-42's registry half** | `email_types.mention` landed in the DB with slice 1, but the **TypeScript `EmailType` union** (`lib/services/email-service.ts:109`) was never extended. `logEmail({ email_type: 'mention' })` does not type-check today. Half the registry landed and the half that would fail a build did not. | **Slice 4.** Folded in. |
| 3 | **ND-23's sub-thread form** | `mentionTitle()` produces `— subs` only on the `kind === 'sub'` branch, and **that branch has never executed**. The one assertion (`s126-chat-core.live.ts:282`) pins the CREW form: `'Casey Crew (Alvarez): ' + body`. A-C12 requires **both** forms. | **Slice 4.** Folded in. |
| 4 | **ND-31** — push truncation | `truncateBody()` exists and **no test anywhere calls it**. The live title assertion uses a short body, so truncation is a no-op there: **deleting the function entirely would fail nothing.** | **Slice 4.** Unit test folded in. |
| 5 | **ND-24 / A-C20** — the absence of enrolment | Chat genuinely does not touch `lib/offline/*` — grep over `lib/chat/`, `app/api/chat/`, `components/chat/` returns **zero** references (the only `queue` hit is a comment in `poll.ts:84`). But **nothing asserts the absence**, so a later build that "helpfully" enrols chat writes passes every criterion. A-C20 asserts non-enrolment and has no test. | **Slice 5** (mobile is where offline happens). |

#### IMPLEMENTED — artifact named

| Ruling | The artifact, and what its absence would cost |
| --- | --- |
| **ND-19 / ND-20** | `(t.kind = 'sub' OR get_my_role() IS DISTINCT FROM 'subcontractor')` inside `chat_threads_select_visible` and `chat_messages_select_visible`, read from `pg_policy`. Probed live: the sub passes `can_view_project` = `true` and sees `crew_msgs_visible` = **0**. Delete the clause and an assigned sub reads the crew thread. |
| **ND-21** — invite cut | Implemented **by geometry, not by code**: zero references to any chat membership/invite concept anywhere. Assignment *is* membership. ⚠️ Nothing tests this and nothing can — there is no artifact to assert, only an absence with no natural guard. |
| **ND-22** — no ingest | Zero `upload` / `storage.from` / `FormData` / `multipart` references in chat code. A-C18's *test* is slice 6. |
| **ND-26** | Three properties, all three present: `DEFAULT_INTERVAL_MS = 12_000`; stop / hidden-document / listener-removal / idempotency / mid-flight-drop covered by **6 unit tests**; `messagesSince` is `.gt('created_at', since)`, not a refetch. |
| **ND-33 / 34 / 38** | `ChatPanel` mounted once in `dashboard-shell.tsx`; `chat_switcher_threads()` RPC; `PAGE_SIZE = { tab: 50, panel: 25 }`. Slice 3's 20 browser tests. |
| **ND-37** | Verified by listing `app/m/p/[projectId]/` — **no `chat` directory**. Plus a unit assertion that the route is absent from the app tree. |
| **ND-39** | `chat_message_mentions` with `UNIQUE (message_id, mentioned_profile_id)`. |
| **ND-40** | `links.ts` returns `/m/p/{id}?chat=1`; two tests pin it, one asserting the forbidden route's absence. |
| **ND-11** | The `routeExists` sweep over the real app tree, with `PENDING_ROUTES` now empty. |
| **ND-2 / ND-3** | `mentioned_profile_id` is a profile id; owner-by-role probed live (unassigned Owner posts in both threads). |
| **R6, clause 1** | `expect(plainRows).toBe(0)` — a plain message notifies nobody. |
| **R7** | `render` is a per-recipient function in `notifyMentions`. |

#### NOT YET DUE

ND-25, ND-30, ND-42 (slice 4) · ND-36/37's bar work (slice 5) · ND-22/ND-28 photos, A-C18/19 (slice 6).

#### UNVERIFIABLE

- **A-C23's second half** — "running `/api/cron/notification-expiry` deletes zero chat messages"
  cannot be settled because the route does not exist. *Would settle it:* building slice 0.
- **ND-27** — client messaging is out of scope by ruling; there is no artifact to inspect, and
  its correctness is the absence of a feature nobody has started.

#### Sequence-blind tests — the class that produced slice 3's caret defect

Reported because these pass **without exercising the sequence a human performs**:

1. **A-C39** — the poll controller is unit-tested thoroughly, but **the component wiring is not**.
   No browser test closes the panel and observes that polling stopped. The controller is proven;
   the thing that calls it is not.
2. **ND-23 / A-C12** — the title is asserted from a live fixture, never from a message sent
   through the composer on a sub thread.
3. **ND-38's load-more** — asserted only in the negative (the control is absent on a short page).
   No thread on rebuild-test exceeds one page, so a second page has never been returned.
4. **ND-24** — no test induces a send failure, so the unsent-bubble path has never rendered.

**Nothing found makes a slice unbuildable.** Continuing to Phase 2.

---

### 12:16 UTC — SLICE 4 COMPLETE AND SEEN. Sub thread + ND-30's email. Pushed `4f89d22`.

**Both completion conditions the brief set are met:** the sub thread has been seen with the QA
sub identity in a browser, and the mention email has been observed reaching a **sub** and **not**
a crew member.

| Check | Exit | Signal |
| --- | --- | --- |
| `supabase db push` ×2 | **0** | Verified against `schema_migrations`, not the CLI line: `20260909000000`, `20260909010000` |
| `npm run db:types` | **0** | 6917 → **6928** lines |
| `npx turbo run type-check --force` | **0** | 5/5, 0 cached, 0 `error TS` |
| `npx vitest run` (`apps/web/`) | **0** | **650 passed (650)**, 45 files |
| live `s126-chat-sub.live.ts` | **0** | **7 passed** |
| live `s126-chat-email.live.ts` | **0** | **4 passed** |
| Playwright `desktop-chat-sub` | **0** | **5 passed** |
| Playwright slice-3 regression (switcher, send) | **0** | 5 + 3 passed |

**Two SQL functions, and both exist to stop the UI holding a second copy of a rule.**
`chat_can_post()` mirrors the INSERT policy so the composer can be **absent rather than
disabled** (D-54); `chat_sub_thread_exists()` / `chat_sub_thread_projects()` answer ND-25 before
any thread row exists, because threads are lazily created. Probed under the S90 harness **before
any UI depended on them**.

**The agreement test is the load-bearing one.** `s126-chat-sub.live.ts` runs **eight** role/thread
combinations, asks `chat_can_post`, then attempts a **real INSERT**, and requires the two to
match. A mirror nobody checks is how two definitions of one rule drift; edit the policy and not
the function and this fails.

**ND-30 closed.** `lib/chat/mention-email.ts`. Subs only (ND-42) — a mentioned crew member gets
**no email**, asserted end to end from one mention naming both. The subject comes from
`mentionTitle()`, the same function the in-app row and push use, so three channels cannot
describe one event three ways. Address is `profiles.email`; `subcontractors.email` is deliberately
unused (nullable, null on one of four live rows).

**Nothing was actually emailed.** The transport is stubbed and the assertions are on `email_logs`,
following `s97ct-invoice-email.live.ts`. `RESEND_API_KEY` here is a live key, and a test that
really sent would put mail in a person's inbox on every run. The `email_logs` row landing at all
is what proves slice 1's `email_types.mention` row exists — the insert carries an FK to it.

**Three of phase 1's five recorded-but-unimplemented findings are now closed:** ND-42's registry
half (the `EmailType` union), ND-23's `— subs` branch, ND-31's truncation.

**Two wrong tests, both established as wrong before anything was changed:**

1. **A-C50 in the live file** read `sends[0].react.props.estimateUrl` and got `undefined`. The
   template is invoked as `NotificationEmail({...})` — the house pattern — which returns rendered
   output, so the input props are not on the returned element. The **spec marks A-C50 `[unit]`**;
   the URL is now a named function and the criterion sits where the spec puts it.
2. **A-C28's two assertions** pinned *where* the tab imported `ChatThreadView` from — a proxy that
   broke the moment the tab grew a client wrapper for the segmented control. The property never
   broke. Rewritten to assert the property.

**One test-harness defect:** `signIn()` hung on `#email` until timeout when signing in as a second
identity mid-test, because middleware redirects an authenticated request away from `/sign-in` —
the behaviour `auth.setup.ts` already documents. It now clears cookies first.

**⚠️ A new finding, outside slices 4–6, logged not fixed:** `DASHBOARD_ROLES`
(`packages/shared/constants/roles.ts:62`) excludes subcontractor and client — and a repo-wide grep
finds **no code consulting it**. A subcontractor can currently sign in to `/dashboard`. This is
pre-existing and is *why* the sub-thread browser test can observe the sub at all; it is recorded
under BLOCKED below because enforcing it is a product decision with real consequences.

- **Next:** slice 5 — mobile chat, and §14's **nine** M6M edits in the same commit as the bar change.

---

### 12:44 UTC — SLICE 5 COMPLETE AND SEEN. Mobile overlay + §14's nine edits. Pushed `8c5d4c5`.

**The bar swap, the sheet, the nine M6M spec edits and the rewritten criteria all landed in ONE
commit** (`97dfb96`) — the hazard the brief named. All nine were verified against
`M6M-mobile-pwa-spec.md` **as committed** before editing, and §14's own line citations hold
(A-3 at 4356, A-42b at 4636).

| Check | Exit | Signal |
| --- | --- | --- |
| `npx turbo run type-check --force` | **0** | 5/5, 0 cached, 0 `error TS` |
| `npx vitest run` (`apps/web/`) | **0** | **653 passed (653)**, 45 files |
| Playwright `m-chat-shell` | **0** | **10 passed** — A-C30, A-C33, A-C34, A-C35, A-C42 |
| Playwright `m-chat-offline` | **0** | **4 passed** — A-C20, A-C21 |
| Playwright `m-shell` regression | **0** | **54 passed** |
| Playwright `m-destinations` regression | **0** | **74 passed**, 3 skipped |

**SEEN.** The overlay was screenshotted on the project screen: five slots with **Chat where Logs
was**, the tab bar fully visible **below** the overlay, the Crew/Subs segments, the composer and
the `@` hint. Worth recording — **both Projects and Chat are lit at once**, and that is correct:
§7.1d-iii keeps A-1c unchanged for the four route-owning slots and gives the Chat slot the overlay
as its meaning.

**A-C20 and A-C21 are now MET.** They were reported unmet since slice 3 and were the sharpest of
the sweep's sequence-blind findings: the unsent bubble and retry existed and **had never
rendered**, because nothing took the network away. A-C20 is asserted three ways, because an error
on screen proves the send failed and not that nothing was queued — no chat module imports
`lib/offline`; `QueueEntity` is a closed union with no chat entity (paired with a positive
assertion so it cannot pass vacuously); and IndexedDB is read directly after an offline send, with
the test **failing rather than skipping** if `indexedDB.databases()` is unavailable.

**Parity, done properly.** `ChatBody` now holds the whole of chat's behaviour — switcher,
segments, thread — and the desktop panel and mobile overlay each wrap it in their own chrome. The
alternative was a second mobile switcher, which is #129 written in the form that looks like
agreement.

**Three tests failed and ALL THREE WERE THE WRONG TEST**, each established before either side was
touched:

1. **A-40c** counted `TABS` to count slots — valid while every slot was a link. Chat owns no
   route, so the count went 4 → 3 and the bar is still five. **Mechanism rewritten, reversal guard
   kept**, and it now names the two non-link slots so the count cannot drift into meaning
   something else.
2. **A-1c** — two cases asserted `/m/logs` lights `m-tab-logs`. That slot is gone by ruling;
   `/m/logs` is now covered by A-C33.
3. **A-C28** pinned the panel rendering `ChatThreadView` directly, which broke when the behaviour
   moved into `ChatBody`. The property never broke.

Plus one omission of mine: `/m/logs` was added to A-41's walk but not to its tile map, so it
expected `m-sheet-tile-undefined`. **The app was right.**

- **Next:** slice 6 — the photo reference (ND-22, ND-28). **NOT STARTED.**

---

## RESUME HERE

**Single next action:** start **slice 6** — the photo reference (ND-22, ND-28). **Not started.**

It needs a migration (`chat_message_photos`), which is the first chat migration since slice 4.
Rebuild-test only, **verified against the catalog** — a 14-digit prefix collision reports success
on a silent skip — then `db:types` and `wc -l`.

Four things to hold on to going in:

- **Reference, not upload.** A-C18 asserts chat exposes **no** file-upload path. Today that is
  true by absence — a grep over `lib/chat/`, `app/api/chat/` and `components/chat/` returns zero
  `upload`/`storage.from`/`FormData` hits — and **the criterion has no test**. Write it before the
  attach button, or the build that adds an upload "because it's easier" fails nowhere.
- **The composer's attach button opens the PROJECT GALLERY PICKER** (Josh chose this over sharing
  from the gallery side). Reuse an existing picker if one exists; the spec says none does.
- **Thumbnails open the EXISTING viewer via M6M D-31's `displayUrl`** (`lib/services/photos.ts`).
  Chat must never resolve a file path itself.
- **A-C17c is the only backstop for `category='photos'`** — the FK cannot enforce it (§4.3).

---

## Where things stand

**VERIFIED — slices 1, 2, 3, 4 and 5.**

- Slice 1: migration applied, seven RLS probes as `authenticated`, output pasted.
- Slice 2: 17 live tests, 25 unit, 8 route tests through HTTP.
- Slice 3: 20 browser tests across four chunks, plus 12 unit. Seen on screen.
- Slice 4: 7 live (including `chat_can_post` agreeing with a real INSERT across **eight**
  role/thread combinations), 13 unit, 4 live email, 5 browser. **Both of the brief's completion
  conditions met** — the sub thread seen with the QA sub identity, and the mention email observed
  reaching a sub and **not** a crew member.
- Slice 5: 10 browser (shell criteria) + 4 browser (offline) + 128 mobile regression, and the nine
  M6M edits in the same commit as the bar change. Seen on screen.

**WRITTEN BUT NOT VERIFIED:** one thing, named rather than implied.

- **`messagesBefore()` / load-older** — still never exercised. **No thread on rebuild-test exceeds
  one page**, so a second page has never been returned. Its *absence* is asserted (the control does
  not render on a short page); its *success* is not. It was listed as closeable "if a fixture can
  seed past `PAGE_SIZE`" — that fixture was **not** written, because slices 4 and 5 both ran long.
  It is the cheapest remaining gap: seed 26 messages and open the panel.

**NOT STARTED:** slice 6 (photo reference), and slice 0 (notification expiry), which remains owed
and untouched by this run.

## BLOCKED — NEEDS JOSH

Nothing blocked a slice. Two decisions are yours, **stated as options rather than as findings with
a recommendation attached**:

### 1. `DASHBOARD_ROLES` is declared and enforced NOWHERE

`packages/shared/constants/roles.ts:62` excludes `subcontractor` and `client` from the dashboard.
A repo-wide grep finds **no code consulting it** — the only two references are comments written
during this run. **A subcontractor can sign in to `/dashboard` today**, and that is why slice 4's
browser test can observe the sub thread on desktop at all.

This is pre-existing and outside slices 4–6, so it was logged rather than fixed.

- **Option A — enforce it** (middleware or the dashboard layout redirects non-dashboard roles to
  `/m`). Consequence: the sub's only surface becomes mobile, which is what ND-42/A-C50 already
  assume. One slice-4 browser test would start failing, and its failure would be correct.
- **Option B — delete the constant.** If subs are meant to reach the dashboard, a constant saying
  otherwise is a trap for the next reader.
- **Option C — leave it and record why.** Cheapest, and it keeps a live discrepancy between a
  named rule and the code.

### 2. The Chat tab's position in the desktop project strip

Still appended last, after Team (slice 3's call, unchanged). §7.1b names the tab and not its place.
One line to move. Worth deciding alongside the deferred FFNav reindex rather than on its own.

## Carried gaps — recorded, not fixed, outside slices 4–6

- **ND-41 / slice 0** — `/api/cron/notification-expiry` **does not exist**. Six cron routes, none
  of it; nothing reads `notifications.expires_at`. **A-C23's second half remains UNVERIFIABLE**
  until it is built.
- **ND-21** — the invite cut is implemented **by geometry** (assignment is membership) and has no
  guard, because there is no artifact to assert, only an absence with no natural test.
- **A-C39's component wiring** — the poll controller is thoroughly unit-tested (stop, hidden
  document, listener removal, idempotency, mid-flight drop) and **no browser test closes the panel
  and observes that polling stopped**. The controller is proven; the thing that calls it is not.

**Rebuild-test:** all four chat tables, `notifications`, and `email_logs.mention` at **0 rows**.
Tree clean, branch pushed.
