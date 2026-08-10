# Project Chat — Build Spec

> **Status:** SPEC [S124]. The last unbuilt leg of the Notifications & Chat module.
> Written from the **first interview chat has ever had** (S124, Josh). Chat was ruled in
> scope at S89 (Option B) and **described rather than explored** — §3a and §10.5 of
> `notifications-architecture.md` are six bullets and five bullets of _rulings_, with no
> workflow trace behind them. Two Module 4 failures traced to exactly that gap.
>
> **Footprint before this spec — CORRECTED [S124, CC live read].** _Original claim, quoted not
> rewritten: "zero. No table, no route, no code, no mention anywhere outside
> `notifications-architecture.md` across ~300 commits."_ **The schema half is true; the code half
> is not.** Live schema has no `chat*` table and there is no `/chat` route directory, but three
> things ship today:
>
> - **`apps/web/lib/notify/links.ts:50–53`** — a live `chat` entry in the shared resolver,
>   already mapping `/m/p/{projectId}/chat` and `/dashboard/projects/{projectId}/chat`.
> - **`apps/web/test/s123-push-workers.test.ts:102,103,138`** — three assertions exercising
>   `resolveLink('chat', …)`.
> - **`apps/web/test/s123-incident-notify.test.ts:95,120`** —
>   `const PENDING_ROUTES = new Set(['chat'])`, a guard asserting the chat routes do **not**
>   exist, carrying the comment _"Fails when chat ships — remove the key, and this line,
>   together."_
>
> ⚠️ **That last one is a deliberate tripwire and it is a build instruction: the commit that
> creates the chat routes MUST clear `PENDING_ROUTES` in the same commit, or it ships red.**
>
> **Parent document:** `docs/specs/notifications-architecture.md`. That document's rulings
> hold except where amended below, **and amendments are quoted in place, never deleted**, on
> the M6M convention.
>
> **Severability (§7.2, standing):** the M8 gate is satisfied by notifications core alone,
> which is **built and deployed**. Chat is **wanted, not needed**. Every scope decision below
> was taken with that in mind — see §11.

---

## §0 — Decision register

**Continues the parent's `ND-` series, which ends at ND-18.** Verified against
`notifications-architecture.md` §0 before numbering. Do not restart at 1; do not use `D-`
(M6M owns D-1…D-65).

> ⚠ **Known numbering drift.** `docs/sessions/context99.md` lists an ND series that is
> **off by one** from ND-3 onward (context99's ND-3 is the second service worker, which the
> architecture register calls ND-4). **`notifications-architecture.md` §0 is the register of
> record.** context99 is a retrospective, not a register. Do not renumber either — record the
> drift and cite the architecture doc.

| #     | Decision                               | Ruling                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ND-19 | **Threads per project**                | **TWO: a crew thread and a sub thread.** [S124, Josh] Not one thread with a permission layer. _§4.2's shape, quoted not rewritten: `chat_messages` keyed on `project_id` with no thread concept — **one thread per project**. Superseded._ Reasoning in §2.1.                                                                                                                                          |
| ND-20 | **Sub-thread rights**                  | **POST and READ diverge.** [S124, Josh] Post: Owner, Admin, the project's PM, and that project's assigned subs **who have a profile**. Read: all of the above **plus crew who pass `can_view_project()`**, who see a banner and **no composer**. §5.2.                                                                                                                                                 |
| ND-21 | **Invite**                             | **CUT. There is no invite step.** [S124, Josh] _Josh at interview Q8: "invite only… even if they are assigned to a project, they shouldn't automatically be in the chat." Reconciled at Q19:_ invite-only was **about keeping subs out of the crew thread**. Once the sub thread is separate, there is nothing to invite into — **assignment is membership**. A permission problem solved by geometry. |
| ND-22 | **Photos**                             | **Reference, not upload.** [S124, Josh] A composer attach button opens the **project photo gallery picker**; the message carries a reference to an existing photo row. Chat never ingests a file. §5.4. _Amended by **ND-28**: the row is a **`files`** row with `category='photos'` — there is no `photos` table._                                                                                                                                                                                             |
| ND-23 | **Notification text names the thread** | **Yes.** [S124, Josh] `"Alvarez (subs)"` vs `"Alvarez"`. Amends parent §3a's output string. §6.2.                                                                                                                                                                                                                                                                                                      |
| ND-24 | **Offline**                            | **Chat fails VISIBLY. No queue.** [S124, Josh] A deliberate divergence from M6M's offline queue, chosen at interview Q16 — _"sees it fail"_. §5.5 states why this is a choice and not an omission.                                                                                                                                                                                                     |
| ND-25 | **Sub with no account**                | **No thread. Not an empty one.** [S124, Josh] Where a project has no assigned sub with a profile, the sub thread **does not render**. §5.3.                                                                                                                                                                                                                                                            |
| ND-26 | **Transport — Realtime vs poll**       | **POLLING, every 12 seconds, WHILE A THREAD IS OPEN.** [S124c, Josh] Not Realtime. _"Real-time is not needed"_ — a 10–15s delay is invisible to a foreman, and **push already covers the away case**, so this governs only what happens with a thread open on screen. Two rules are spec-level, not build detail: **polling stops when the thread is not open**, and **the poll asks for messages SINCE the last one it has**, never a refetch. §9.1. |
| ND-27 | **Client messaging**                   | **OUT, and STATE.md:514 is ANSWERED for internal chat.** [S124, Josh, Q9 — *"no"*, clients type into nothing.] The transport competition that entry recorded is **dissolved**, not resolved: internal chat and client messaging were never one decision. Client messaging remains a Module 9 / Pre-Module 9 gate question, untouched here. §10.                                                        |
| ND-28 | **Photo reference target**             | **`files(id)`, `ON DELETE CASCADE`.** [S124, Josh] There is **no `photos` table** — photos are `files` rows with `category='photos'`. A deleted photo vanishes from the thread; the message keeps its text. **An FK cannot enforce `category`**, so the category check is service-layer — §4.3. `RESTRICT` rejected: it would let chat block an owner from deleting a file, which nothing else in the app does. |
| ND-29 | **Sub thread — ⚠️ REVERSED [S125, Josh]. IT IS BUILT, IN v1.** | **ND-19 and ND-20 return to v1** — two threads per project, crew read-only in the sub thread. _Superseded text, quoted not rewritten: "**OUT of v1.** [S124, Josh] 35 subcontractor member rows exist; **one** has a profile, and it is a test account on two fixture projects. This resolves when real subs get logins, not through code. **Consequence:** `chat_messages` needs no per-role branch in v1 — `can_view_project()` and nothing else."_ **The counts were right and did not carry it** — see §2.5 for what reversed it. |
| ND-30 | **Mention email — ⚠️ CLOSED [S125b, Josh]. IT IS BUILT, IN v1.** | _Superseded text, quoted not rewritten: "**v2. In-app + push only.** [S124, Josh] Three pieces are missing … because `notify()` sends no email and every consumer sends its own."_ **The deferral's justification was FALSIFIED BY RULING 3, not abandoned by a change of mind** — it rested on "deferring costs subs nothing because ND-29 defers the sub thread too", and ND-29 was reversed. The three missing pieces are still the correct list; they are now in scope. Scope and reasoning: **ND-42**. §5.6a. |
| ND-31 | **Push truncation**                    | **CHAT ONLY, inside the render function. 140 characters of body.** [S124, Josh — length confirmed S124b] The shared push path stays untouched, so **no existing notification changes behaviour**. §6.3. |
| ND-32 | **D-4 exception, NAMED**               | **Messages render as bubbles, not card geometry.** [S124, Josh] D-4 exists to stop lists being reinvented casually; a conversation is genuinely a different thing. **Naming the exception keeps D-4 intact rather than eroding it silently.** §7.2. |
| ND-33 | **Desktop is TWO surfaces**            | **A global floating panel AND a project Chat tab. Both, not either.** [S124, Josh] The panel is the **primary** surface and is **global** — it renders on Contacts, Estimates, Settings, everywhere — with a project switcher inside, so users move between threads without navigating away. The tab is for reading and auditing a thread properly when already inside a project. §7.1. |
| ND-34 | **Switcher project list**              | **ACTIVE projects, ordered by MOST RECENT MESSAGE.** [S124b, Josh] That is what a switcher is for; archived jobs do not need to be one tap away. A thread on a project archived later is reached through the **tab**, not the switcher — the messages do not vanish. §7.1a-i. |
| ND-35 | **Chat tab gating**                    | **UNGATED.** [S124, Josh] RLS already decides who reads what via `can_view_project()`. A role list on the tab would be a second answer to a question already answered — the pattern **§4.11.10a** warns against. §7.1c. |
| ND-36 | **Mobile entry point**                 | **CHAT TAKES A BOTTOM-BAR SLOT. DAILY LOGS MOVES TO THE HAMBURGER.** [S124b, Josh] The bar stays at **five** and **D-3's "no destination appears in both" holds — Logs leaves as Chat arrives.** M6M **D-3 is amended; A-3b, A-41 and A-42 must be REWRITTEN, not satisfied.** The cost is stated rather than buried: §7.1d. |
| ND-37 | **The Chat slot opens an OVERLAY**     | **Not a screen. It does not navigate.** [S124b, Josh] Tapping Chat opens a panel over the current screen, matching the desktop shape. **This breaks M6M A-1c** — "the active tab reflects the current screen" — because an overlay has no screen to reflect. A-1c is **rewritten**, not satisfied: the Chat slot is lit **while the overlay is open**. §7.1d-ii. |
| ND-38 | **History page size**                  | **50 in the tab, 25 in a panel**, same number again per load-more. [S124b, CC's call, Josh's delegation] Sized so the first scroll never lands on a loader on the surface it is for. §7.2a. |
| ND-39 | **Mention storage**                    | **A join table, `chat_message_mentions`.** [S125, Josh] Not a `uuid[]` on the message. Matches the house pattern, sits beside `chat_message_photos`, keeps `chat_messages` at five columns and append-only clean, and leaves a mention-scoped read ("mentions of me") possible later with no schema change. §4.3a. |
| ND-40 | **Where a mobile mention lands**       | **`/m/p/{id}?chat=1` — a deep-link PARAM, not a route.** [S125, Josh] **ND-37 stays literally true**: mobile chat has no address of its own, it is a state the project screen can be in. A thin route would put a chat page back in the tree and make ND-37 half-true, which is worse than either whole answer. The null-resolver arm was rejected: it is the one shape where the recipient of `@Josh needs you on Alvarez` does **not** land in the conversation. §5.6c. |
| ND-41 | **Notification expiry — IN SCOPE**     | **Chat builds `/api/cron/notification-expiry`.** [S125, Josh] Parent R2 expires unstarred rows at 30 days and parent §5.6 specs the route; the S125 audit found **six cron routes, none of them it**, and no code reading `notifications.expires_at`. **This is notifications-core work landing in the chat module**, said plainly rather than filed under chat — chat is simply what makes it bite. §9.4, slice 0. |
| ND-42 | **Mention email — SUBS ONLY**          | **A mentioned subcontractor with a profile gets in-app, push AND email. Everyone else gets in-app and push, and NO email.** [S125b, Josh] ND-15 scoped subs to three events precisely because **a sub may not have the app** — that reasoning applies to subs and to nobody else, since staff are in it. Emailing a foreman every time somebody tags him is volume without value. **⚠️ This is an explicit exception to parent R3** — see §5.6a-i. |

---

### §0a — The precedent this document is audited against, stated accurately

**Corrected at S125**, because the earlier phrasing of it was wrong in a way that mattered: it
was being used to justify an audit, and a false precedent is worse than none.

_The claim as it circulated: "the S89 parent spec turned out to be wrong about its own
footprint, its own schema, and `notify()`'s live signature."_ **One of those three is the
parent's.**

| Claim | Whose error, actually |
| --- | --- |
| "Footprint before this spec: zero" | **This document's own front matter.** The parent makes no footprint claim. |
| `chat_message_photos → photos(id)` | **This document's own §4.3.** The parent names no `photos` table. |
| `notify()`'s signature | **The parent's §4.6** — and it is wrong on **five** counts, not three. |

**Parent §4.6 documents** `notify({ type, recipients, render, link, projectId, source, override })`.
Against the shipped `NotifyParams`: `override` does not exist; "fire internal email" is not
something `notify()` does; `link` is really **two** parameters (`linkKey`, `linkParams`);
responsibility 1, *"resolve recipients to `profiles`"*, is false — the caller resolves and
`notify()` only de-duplicates; and `admin` and `companyId` are **required** and unmentioned.

**The lesson, in the form it should be carried:** it is not that the parent is unreliable. It
is that **documents written outside the repo have a track record** — and **this document was
written by an agent with no filesystem access**, which is precisely why every shape in it
carried a `§S` block and why the S125 audit found three schema defects in §4 that no amount of
internal review would have surfaced.

---

## §1 — What the interview found that the spec did not have

Recorded because the parent document's chat sections contain **no workflow trace at all**,
and this is the material they were missing.

**The real job is request capture, not coordination.** Both real cases Josh gave are the same
shape: **crew → Josh, material shortage, incomplete on first contact.**

|           | What happened                                          | Channel                                | Failure                                                                                                                 |
| --------- | ------------------------------------------------------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Trim**  | Crew member: more trim needed                          | Text, Josh's personal number, no group | Nobody else knew. Other crew could not plan the next day.                                                               |
| **Paint** | Crew member told Josh **in person**: more paint needed | In person, then a text round-trip      | Josh had to text back for **quantity and type**. A photo of the can and the wall would have ended it in one round (Q2). |

**What happens when Josh is unreachable (Q4):** _"text just sits. they usually take a guess
and sometimes mess things up."_

**How often a request is lost (Q5):** _"countless times."_

**Where the record lives six months later (Q6):** _"nowhere."_

**Who talks to whom (Q7):** all staff assigned to a project. Not crew→Josh only.

**Subs (Q8):** they reach Josh by email, text or call. Sub conversation is **independent of
crew** — this is what became ND-19.

**Clients (Q9):** no. Never type into anything.

**Adoption (Q10, Q17):** _"it will be mandatory for staff"_, and mandatory means **Josh
enforcing it**, not the app. He will not turn off his personal number.

---

## §2 — Scope

### 2.1 Why two threads (ND-19)

The parent spec's `chat_messages` keys on `project_id` alone. That admits exactly one thread
per project, which cannot hold what the interview described:

- Subs must not see crew conversation (Q8).
- Crew **must** be able to read sub conversation (Q15) — read, not post.
- A sub thread exists per project and is populated by **assignment**, not by invitation (Q19).

A single thread with row-level filtering would mean a crew member and a sub reading the same
thread and seeing different messages in it. That is a thread that lies about its own contents
— and it makes "who said what on this job" unanswerable, which is Q6's whole complaint.
**Two threads, each honest about its membership.**

### 2.2 In scope

1. **Crew thread** — one per project. Membership `can_view_project()`.
2. **Sub thread** — one per project, **conditional on ND-25**. Divergent post/read (ND-20).
3. **@mention → notification**, via the parent's `notify()`. Chat writes no notification rows
   directly.
4. **Photo reference** in the composer (ND-22).
5. **Per-thread unread state**, separate from the notifications badge (parent R6).
6. **Both surfaces** — desktop at `/dashboard/projects/{id}/chat` **plus the global panel**
   (ND-33), and mobile as an **overlay on the project screen, reached by `/m/p/{id}?chat=1`**
   (ND-37, ND-40) — **there is no `/m/p/{id}/chat` route.** _Superseded, quoted not rewritten:
   "`/dashboard/projects/{id}/chat` and `/m/p/{id}/chat`."_ One `lib/` implementation across
   all of them (parent §10.5's parity rule, and #129's precedent).

### 2.3 Out of scope, v1

Unchanged from parent §1 except where noted:

- **Threading, DMs, reactions, edit, delete.**
- **File attachments.** ND-22's photo _reference_ is not an attachment — chat ingests nothing.
- **Client participation** (ND-27).
- **Offline write queue for chat** (ND-24) — and note this is now a **ruling**, where the
  parent had it as an inherited omission.
- **Typing indicators, presence, read receipts.**
- **Cross-project or company-wide chat.** Every thread is project-scoped.

### 2.4 The R6 risk, stated rather than designed around

**Parent R6 holds unchanged and Josh re-affirmed it** at Q11 — a plain message notifies
**no one**; only `@Josh` buzzes.

**The risk this creates, stated because it is the direct opposite of the problem chat is being
built to solve:**

> Q5 says material requests get lost _"countless times."_ Under R6, `need more trim` typed
> without a tag is **silent** — quieter than the text message it replaces, which at least
> buzzed Josh's phone.

**Josh closed this with enforcement, not with a feature** (Q17: _"me enforcing it"_). That is
a legitimate founder decision and it is recorded as one. **It is not a gap for a later reader
to "fix" by making plain messages notify.** Q12 was asked directly — would notifying on every
message be better than losing them — and the answer was **no**.

**What this spec owes as a consequence:** the composer must make `@` **easy and obvious**
(§5.1), because the entire delivery guarantee rests on a human remembering to type it.

---

### 2.5 ND-29 reversed — the sub thread is built [S125, Josh]

**Recorded as a reversal, not a silent restoration**, because the deferral was itself a ruling
and a later reader must be able to see both sides.

**What ND-29 was ruled on, and the numbers were not wrong.** Live read, S124 and re-verified at
the S125 audit: **35 subcontractor member rows company-wide, exactly one with a
`profile_id`** — `josh+qa-sub@worthprop.com`, display name "QA Subcontractor Co (TEST
IDENTITY)", assigned to `test` and `QA A — isolation fixture`, **both test projects**. On real
Bishop jobs the sub thread would render **nowhere**. Deferring a feature with no user is
ordinarily the right instinct.

**Why it did not carry.** The S125 audit established that **the schema cost is already paid
either way**: §4.1 ships `kind ENUM('crew','sub')` and `UNIQUE (project_id, kind)` in slice 1
whether or not the sub thread is built, because `chat_reads` needs a thread row to key against
and ND-25 needs one to ask "does this project have a sub thread". So the deferral never saved a
migration. **What it saved was an RLS policy and a panel.**

**And what it cost was the largest single thing the S124 interview produced** — Q8 (subs reach
Josh by email, text and call), Q15 (crew must be able to read sub conversation), Q19
(assignment is membership), §2.1's entire argument for two threads, and traces 3c, 3d and 3e.
**Trading that for one policy and one panel was not a trade Josh took.**

**Consequences, applied throughout this document:** §5.2's access table is v1 in full; A-C1…A-C10
are live v1 criteria; §S1's divergence is back in play with its two live templates; traces 3c,
3d and 3e are v1.

---

## §3 — Traces (PROPOSED acceptance examples)

**These are PROPOSED, not approved.** House rule: an acceptance example is approved once
walked against a real Bishop job with real numbers. T1 and T2 are built from the two real
cases Josh gave, but the _outputs_ below are this spec's construction and have not been walked
back to him.

### 3a-1. The trim message — plain, silent, and found later

Crew member Luis, assigned to Alvarez, opens the Alvarez crew thread and types
`running short on trim, need about 3 more sticks of the 3¼ colonial`.

- **Store:** message row in the Alvarez **crew** thread. **No notification row, for anyone**
  (R6).
- **Output:** Josh's notifications badge does **not** move. The Alvarez crew thread shows
  unread state for every other member via `chat_reads` (parent §4.3), which is a **separate**
  signal from the badge.
- **What this fixes vs. today:** not the buzz — the buzz is unchanged from a text. It fixes
  **Q6** (there is now a record) and **Q3** (the other crew on Alvarez can see it and plan for
  the next day, which the one-to-one text could not do).
- **What it does not fix:** if Josh does not open the thread, this sits exactly as the text sat
  (Q4). §2.4.

### 3a-2. The same message, tagged

Luis types `@Josh running short on trim, need about 3 more sticks of the 3¼ colonial`.

- **Store:** message row **plus** one notification row for Josh (`type: mention`).
- **Output:** badge +1. Tab and push both read
  **`Luis (Alvarez): running short on trim, need about 3 more sticks of the 3¼ colonial`** —
  the real message text, per parent R6.
- **Link:** `chat` + `linkParams` carrying the project, thread and message (parent ND-11),
  resolving to **`/m/p/{id}?chat=1`** on mobile (ND-40 — a param, not a route) and
  `/dashboard/projects/{id}/chat` on desktop. _Superseded, quoted not rewritten:
  "`chat:{project_id}#{message_id}` … resolving to `/m/p/{id}/chat`."_
- **Nobody else is notified**, including other Alvarez crew who can read it.
- **Mentionable set:** profiles passing `can_view_project(project_id)` (parent ND-3) — **not**
  `project_assignments`.

### 3b. The paint message — one round instead of two (ND-22)

Luis needs paint. He photographs the can and the wall.

- He posts the photos to the **project gallery** (the existing M6M capture path — chat does
  not ingest them).
- In the Alvarez crew thread he taps **attach**, picks those two photos from the gallery
  picker, and types `@Josh need more of this, about a gallon, wall behind the stair`.
- **Store:** one message row carrying references to two **`files` rows** (`category='photos'`
  — there is no `photos` table, ND-28); one notification row for Josh.
- **Output:** Josh's notification carries the message text (R6). The thread renders the
  message with **thumbnails** that open the existing photo viewer.
- **What this fixes:** the round-trip. Q2 — _"yes"_, a photo would have ended it in one round.
- **Note the ordering Josh described (Q18):** _"post pictures and notifies in chat. a reference
  would be helpful."_ The photo exists **first**; chat points at it. Chat is never the ingest
  path.

### 3c. Sub thread — mention across the boundary

Alvarez has one assigned sub with a login (the drywall contractor). Josh opens the Alvarez
**sub** thread and types `@Miguel can you be on site Thursday instead of Wednesday`.

- **Store:** message in the Alvarez **sub** thread; notification row for Miguel.
- **Output text (ND-23):** **`Josh (Alvarez — subs): can you be on site Thursday instead of
Wednesday`**. The thread is named because two threads on one project would otherwise produce
  two identical-looking notifications.
- **Channels (parent ND-15):** Miguel has a profile → **in-app row and email**. Chat @mention
  is one of the three sub-scoped events, so this is in scope and unchanged.
- **Crew on Alvarez are not notified** and did not need to be — but they **can read this**
  (§5.2).

### 3d. Crew reading the sub thread

Luis, crew on Alvarez, opens the Alvarez sub thread.

- **Renders:** the full message history.
- **No composer.** Not a disabled composer — **absent**.
- **A banner**, in place of the composer: wording in §7.4. Q24's requirement is _"don't post
  here, subs can see this"_, delivered _"cleaner and more professional"_ than that phrasing.
- Luis is **not** in the sub thread's mention picker (he cannot post; being mentionable in a
  thread he cannot reply in is a dead end).

### 3e. A project with no sub who has an account (ND-25)

Alvarez's four assigned subs include three with no profile.

- The sub thread renders **only** because one of the four (Miguel) has a login.
- **On a project where none do:** there is **no sub thread**. No tab, no empty state, no
  "invite a sub" affordance. Q25 — _"when sub doesn't have account, chat doesn't exist."_
- The other three subs are **unaffected and unreachable by chat**. Josh keeps texting them.
  Q25: _"the subs who have accounts, and the rest keep texting."_
- **This is not the parent §13.2 three-state contract.** That contract governs `notify()`
  delivery to a sub. This governs whether a **thread exists at all**. A sub with an email and
  no profile gets notification email under §13.2 for contract-signed and punch-assigned —
  **but cannot be mentioned**, because mention requires a profile (parent §13.3), and cannot
  read a thread.

### 3f. Offline (ND-24)

Luis is on a roof with no signal and types the trim message.

- **Send fails, visibly.** An error state on that message with a manual retry.
- **Nothing is queued.** The message is **not** handed to M6M's offline queue.
- Luis sees it fail and falls back to text (Q16 — _"sees it fail"_).
- §5.5 states why this diverges from the offline queue deliberately.

---

## §4 — Data model

**RECONCILED AGAINST LIVE SCHEMA [S124].** _Superseded, quoted not rewritten: "Design-level.
Every column shape below is PROPOSED and must be reconciled against live schema by CC — see the
§S blocks."_ **All five §S blocks are now answered or ruled**, and the one shape that was wrong
— `chat_message_photos` pointing at a non-existent `photos` table — is corrected in §4.3.
Standard column set and both standard triggers apply unless stated; note §4.2's warning that
the append-only exception covers `chat_messages` **only**.

### 4.1 `chat_threads` — NEW, and new relative to the parent spec

```
id
project_id    → projects(id)
kind          enum: 'crew' | 'sub'
created_at, updated_at, company_id  (standard set)
UNIQUE (project_id, kind)
```

**Why a table and not a `kind` column on messages.** Unread state is per person **per
thread**, and a thread must be addressable when it has zero messages. A `kind` discriminator
on `chat_messages` gives no row to key `chat_reads` against and no row to say "this project
has a sub thread" (ND-25) before anyone has spoken.

**Creation:** lazily, on first open or first message. Not backfilled across existing projects.

### 4.2 `chat_messages` — AMENDED from parent §4.2

```
id
company_id        → companies(id)        -- ADDED [S125, D1]
thread_id         → chat_threads(id)     -- REPLACES project_id
author_profile_id → profiles(id)         -- unchanged (parent ND-2/ND-3)
body              text                   -- unchanged
created_at        timestamptz
```

_Parent §4.2's shape, quoted not rewritten: `project_id → projects(id)` directly on the
message. **Superseded by ND-19** — the message belongs to a thread, and the thread belongs to
a project._

**Append-only and permanent** — parent R2, unchanged. **Only the notification row expires.**
CLAUDE.md's append-only exception **does** apply here (no `read_at`, no `starred`, nothing
UPDATEd after insert), which is the opposite of `notifications` (parent §4.1).

⚠️ **The exception applies to THIS TABLE ONLY.** `chat_reads` is UPDATEd on every thread open,
so it is an ordinary per-tenant table and carries the **full standard column set and BOTH
standard triggers** — see §4.4. `chat_threads` likewise. Reading the exception as covering
"the chat tables" would ship two tables whose `updated_at` never advances.

### 4.3 `chat_message_photos` — NEW (ND-22, ND-28)

```
id
company_id → companies(id)      -- ADDED [S125, D1]
message_id → chat_messages(id)  ON DELETE CASCADE
file_id    → files(id)          ON DELETE CASCADE
sort_order int
```

A join table, not a column. A message may reference more than one photo (3b references two).
**No file column, no storage path** — chat holds a reference to a row the gallery already owns.

> ⚠️ **§S4 — ANSWERED AND RULED [S124]. The earlier shape was wrong.**
> _Superseded, quoted not rewritten: `photo_id → photos(id)`._
> **THERE IS NO `photos` TABLE.** Live read: `information_schema` returns zero. Photos are
> **`files` rows with `category = 'photos'`** and a `project_id`. The FK is re-pointed to
> `files(id)` (ND-28).

**`ON DELETE CASCADE`, and deletion is genuinely destructive — this is not a soft-delete
table.** `files-client.ts:286` soft-deletes (`is_deleted: true`), but `files-client.ts:334`
**hard-deletes the row** after removing the storage blob, restricted by RLS to owner/admin. So
a chat message can outlive its photo's row entirely, not merely a flagged one. Under CASCADE
the reference vanishes and **the message keeps its text**.

_`RESTRICT` was considered and rejected [S124, Josh]: it would let a chat message block an
owner from deleting a file, and nothing else in the app can do that._

⚠️ **AN FK CANNOT ENFORCE `category = 'photos'`, AND THE SPEC SAYS SO RATHER THAN LETTING THE
FK IMPLY IT.** `files` holds receipts, contracts, invoices and change-order PDFs alongside
photos. `file_id → files(id)` permits a chat message to reference **any** of them. Restricting
it to photos is a **service-layer check** in chat's send path and in the picker's query
(`category = 'photos' AND project_id = …`), and it is the only thing standing between the
composer and a contract PDF appearing as a chat thumbnail. Treat it as a rule with no database
backstop — the same posture CLAUDE.md records for punch VERIFY (#146) and the project gate
(#82).

### 4.3a `chat_message_mentions` — NEW (ND-39) [S125]

```
id
company_id        → companies(id)        -- tenant scope; see §4.5a
message_id        → chat_messages(id)    ON DELETE CASCADE
mentioned_profile_id → profiles(id)      ON DELETE CASCADE
created_at        timestamptz
UNIQUE (message_id, mentioned_profile_id)
```

**Resolves D2 from the S125 audit.** §5.1 has always said mentions are *"parsed at write time
and resolved to profile ids, **stored** so a later display-name change does not break the
link"* — and until now there was **nowhere to store them**. `chat_messages` is five columns and
there was no join table. The requirement was asserted with no home; the audit caught it.

**A join table, not a `uuid[]` on the message** (ND-39):

- It **matches the house pattern** and sits directly beside `chat_message_photos`, which is the
  same shape for the same reason.
- It keeps `chat_messages` at five columns and **append-only clean** — an array column would be
  a field that wants updating the first time someone edits a mention, and edit is out of scope
  precisely so that pressure never arrives.
- It leaves a **mention-scoped read possible later** — "mentions of me", across projects —
  **with no schema change**. An array makes that a scan.

**`UNIQUE (message_id, mentioned_profile_id)` is what implements A-C14** — `@Josh … @Josh` in
one message is one row, enforced by the database rather than by the parser remembering.

**Append-only, like its siblings** — written once at message insert, never updated. §4.5a.

### 4.4 `chat_reads` — AMENDED from parent §4.3

```
id
company_id → companies(id)               -- ADDED [S125, D1]
profile_id → profiles(id)
thread_id  → chat_threads(id)            -- REPLACES project_id
last_read_at timestamptz
UNIQUE (profile_id, thread_id)
```

_Parent §4.3 keyed on `project_id`. **Superseded by ND-19** — a person has separate unread
state in the crew and sub threads of the same project._

Drives chat's own unread state, **separate from the notifications badge** (parent R6,
unchanged).

**Standard column set and BOTH standard triggers apply** — `chat_reads` is UPDATEd every time
a thread is opened, so CLAUDE.md's append-only exception explicitly does **not** cover it
(§4.2). It needs `company_id`, `created_at`, `updated_at`, `created_by`, `updated_by`,
`is_deleted`, `deleted_at`, the three column defaults, and both `chat_reads_updated_at` and
`chat_reads_set_updated_by`.

### 4.5a Tenant scope and the DELETE posture — D1 and D3 from the S125 audit

**Every chat table carries `company_id`.** The audit found it missing from the stated shapes of
`chat_messages`, `chat_message_photos` and `chat_reads` — only `chat_threads` had it. CLAUDE.md
is unambiguous (*"Every table has a `company_id` column"*) and the **append-only exception
retains it** where the table is per-tenant. It is not decorative: **every RLS policy in this
database opens with `company_id = get_my_company_id()`**, so without the column these tables
cannot follow the house pattern at all. The three column defaults apply
(`company_id`, `created_by`, `updated_by` where the table has them).

**The DELETE posture, stated rather than implied.** R2 makes the chat log permanent, which
under CLAUDE.md's append-only exception means:

| Table | Policies |
| --- | --- |
| `chat_messages` | **SELECT and INSERT only.** No UPDATE, no DELETE. |
| `chat_message_photos` | **SELECT and INSERT only.** |
| `chat_message_mentions` | **SELECT and INSERT only.** |
| `chat_threads` | SELECT and INSERT. Ordinary table, both standard triggers (§4.1). |
| `chat_reads` | SELECT, INSERT **and UPDATE** — `last_read_at` moves. Not append-only (§4.4). |

**⚠️ AND THE THING THAT LOOKS LIKE A CONTRADICTION AND IS NOT.** ND-28 gives
`chat_message_photos.file_id` **`ON DELETE CASCADE`**, so those rows *are* deleted when a file
is hard-deleted — on a table with **no DELETE policy**. That is fine, and it is written down
because it reads wrong at a glance: **an FK cascade is executed by the database, not by the
caller, and RLS does not apply to it.** A reader who "fixes" this by adding a DELETE policy
would be widening the table for no reason; a reader who removes the CASCADE to "respect"
append-only would strand references to files that no longer exist.

### 4.5 What is NOT added

- **No `chat_thread_members` table.** ND-21 cut invite; membership is derived from
  `can_view_project()` and project assignment. A membership table would be a second source of
  truth for something the existing helpers already answer.
- **No `notifications` change.** `mention` already exists in the parent's type enum.
- **No new company setting.** Notify-hours and timezone are the parent's.

---

## §5 — Behaviour

### 5.1 Composer and mentions

- `@` opens a mention picker over the **thread's postable set** (§5.2) — not the readable set.
- The picker is **prominent**, not a hidden keyboard shortcut. §2.4: the whole delivery
  guarantee rests on a human typing `@`, so the affordance carries weight it would not
  otherwise deserve. An `@` button adjacent to send on mobile.
- Mentions are parsed **at write time** and resolved to profile ids, **stored in
  `chat_message_mentions` (§4.3a, ND-39)** so a later display-name change does not break the
  link. _Until S125 this sentence had nowhere to store them — see §4.3a._
- **Multiple mentions in one message → one notification each, one row each.** No dedupe across
  recipients; dedupe **within** a message per recipient (`@Josh … @Josh` is one row) — enforced
  by `UNIQUE (message_id, mentioned_profile_id)` (§4.3a), not by the parser remembering.
- **Self-mention notifies nobody.** Precedent: parent §16.5's self-assignment rule, same
  reasoning — it would be the most common notification the platform sends and every one useless.

### 5.2 Access — the two threads (ND-20)

> ✅ **ND-29 REVERSED [S125, Josh]: this table is v1 in full.** _Superseded banner, quoted not
> rewritten: "the sub-thread columns below are v2. v1 ships the crew thread only."_ Both
> threads are built in v1 — reasoning in §2.5.

|                                | Crew thread                | Sub thread — POST             | Sub thread — READ        |
| ------------------------------ | -------------------------- | ----------------------------- | ------------------------ |
| Owner                          | ✅ by role                 | ✅                            | ✅                       |
| Admin                          | ✅ by role                 | ✅                            | ✅                       |
| PM                             | ✅ if `can_view_project()` | ✅ if assigned                | ✅                       |
| Foreman                        | ✅ if `can_view_project()` | ❌                            | ✅                       |
| Crew                           | ✅ if `can_view_project()` | ❌                            | ✅ (banner, no composer) |
| Subcontractor **with profile** | ❌ **never**               | ✅ if assigned to the project | ✅ own thread only       |
| Client                         | ❌                         | ❌                            | ❌ (ND-27)               |

**The crew thread rule is the parent's:** `can_view_project()` — Owner/Admin by role, others by
assignment.

**A subcontractor never reads the crew thread.** This is the one absolute in the table and it
is the reason ND-19 exists.

> ⚠️ **`can_view_project()` ALONE DOES NOT DELIVER THAT ABSOLUTE — CORRECTED [S125b, live
> read].** _The earlier sentence, quoted not rewritten: "The crew thread rule is the parent's,
> **unchanged**: `can_view_project()`."_ It is unchanged as a **membership** rule and
> insufficient as a **crew-thread** rule.
>
> **`is_assigned_to_project()` is ROLE-BLIND.** Its whole body is
> `EXISTS (SELECT 1 FROM project_assignments WHERE project_id = $1 AND member_id = get_my_member_id() AND is_deleted = false)`
> — no role test. And subcontractors **are** in `project_assignments`: the one sub with a
> profile is assigned to two live projects, verified. **So an assigned subcontractor passes
> `can_view_project()`**, and a crew thread gated on it alone would be readable by exactly the
> role the table marks ❌ **never**.
>
> **The crew thread's SELECT must therefore carry an explicit subcontractor exclusion**, in the
> shape §S1 already cites for the other direction:
> `get_my_role() IS DISTINCT FROM 'subcontractor'` — the same clause
> `punch_list_items_select_visible` opens with, and for the same reason.
>
> **This is a correction to the stated mechanism, not a change to the ruling.** ND-19 and ND-20
> always said a sub never reads the crew thread; §5.2 named a helper that does not enforce it.
> It is exactly §0a's class of defect — a document asserting a rule the code would not have
> produced — found in the section whose own absolute it contradicted.

> ✅ **§S1 — ANSWERED [S124, CC live read]. Precedent is abundant; nothing needs inventing.**
>
> **32 tables** on this database already resolve SELECT and INSERT to different role sets. The
> established shape is **two separate policies, one per command** — never a helper function,
> and never a `USING`/`WITH CHECK` split on a single policy.
>
> **The read-wide / write-narrow template** (what the sub thread needs) is `inspections`,
> `phases` and `tasks`, all identical in shape:
> `*_select_visible` = `company_id = get_my_company_id() AND can_view_project(project_id)`
> against
> `*_insert_authorized` = `company_id = get_my_company_id() AND get_my_role() = ANY(<list>) AND can_view_project(project_id)`.
>
> **The subcontractor-branch template** is `punch_list_items_select_visible`:
> `((get_my_role() IS DISTINCT FROM 'subcontractor' AND (can_view_project(project_id) OR assignee_id = get_my_member_id())) OR (get_my_role() = 'subcontractor' AND (assignee_id = get_my_member_id() OR created_by = auth.uid())))`
> — a per-role branch *inside* SELECT, which is the shape "a sub sees only their own thread"
> will need.
>
> **Also established:** a subcontractor currently has INSERT on exactly two things —
> `files_insert_non_client` and the storage `objects` policy. A sub-thread INSERT would be the
> third place a sub can write anything.
>
> ✅ **BACK IN PLAY [S125] — ND-29 is reversed and v1 builds the divergence.** _Superseded,
> quoted not rewritten: "BUT ND-29 DEFERS THE SUB THREAD OUT OF v1, SO v1 NEEDS NONE OF IT. …
> The two templates above are recorded here deliberately so slice 4 does not re-derive them,
> not because v1 uses them."_ **v1 uses them.** The divergence is built with the two live
> templates above — `inspections`/`phases`/`tasks` for read-wide/write-narrow, and
> `punch_list_items_select_visible` for the subcontractor branch — and it is emphatically **not
> an invented pattern**: 32 tables on this database already split SELECT from INSERT.
>
> M6M **D-54** still governs whenever the divergence is built: _a hidden button is not a
> permission._ The composer's absence must be a policy, not CSS.

### 5.3 Sub thread existence (ND-25)

The sub thread renders **only when** the project has ≥1 assigned subcontractor whose
`company_members.profile_id IS NOT NULL`.

- Where that count is 0: **no tab, no empty state, no create affordance.**
- The evaluation is **live**, not a stored flag: assigning a sub with a login makes the thread
  appear; it does not disappear when they are unassigned if messages exist (a thread with
  history is never hidden — Q6's record must survive).

> ✅ **§S2 — ANSWERED [S124, CC live read]. The data below is why ND-29 deferred the sub
> thread, and §2.5 is why that deferral was reversed at S125.**
>
> **The table is `project_assignments`.** Subs appear in it through their member row; there is
> **no separate 6-series sub-assignment table**. The chain is
> **`project_assignments.member_id → company_members.id → profiles.id` (via
> `company_members.profile_id`)**.
>
> _One arrow in the guess above was backwards, quoted not rewritten:_
> _`… → subcontractors.member_id → company_members.profile_id`._ **`subcontractors.member_id`
> points AT `company_members.id`**; it is not a step between assignment and profile. The
> subcontractor record hangs off the member row rather than sitting in the path.
>
> **There is a live precedent for the exact join** — the storage policy
> `project_files_insert_non_client` walks
> `project_assignments pa JOIN company_members m ON m.id = pa.member_id JOIN profiles p ON p.id = m.profile_id`.
>
> **The counts, and they are the reason for ND-29:**
>
> | | |
> | --- | --- |
> | Subcontractor member rows, company-wide | **35** |
> | …with a `profile_id` | **1** |
> | That one | `josh+qa-sub@worthprop.com` — display name **"QA Subcontractor Co (TEST IDENTITY)"** |
> | Projects it is assigned to | `test`, `QA A — isolation fixture` — **both fixtures** |
>
> Bishop's other projects: `test4` 3 subs / 0 with profile, `Copy of test4` 1/0, `kitchen test`
> 0/0, `test5` 0/0. **On real Bishop jobs the sub thread would render nowhere.** It is
> buildable and testable, and today it has no real user. **ND-29 deferred it on exactly that
> ground and was REVERSED at S125** — the schema cost is paid either way, so the deferral saved
> a policy and a panel rather than a migration, and that was not worth the interview's largest
> finding. §2.5.

### 5.4 Photo reference (ND-22)

- **Entry point:** an attach button **in the composer**, opening the project gallery picker
  (Q23 — Josh chose this over "share to chat" from the gallery side).
- The picker shows that project's photos only — `files` filtered to
  `project_id = … AND category = 'photos' AND is_deleted = false`. **The category filter is the
  only thing keeping contracts and receipts out of the picker; the FK cannot do it** (ND-28,
  §4.3).
- **No reusable gallery picker component exists** — established by live read; the only
  "picker" components in the tree are the expenses and time ones, which are unrelated. The
  composer's picker is **new work**, not a reuse.
- Selection attaches references; the message can carry text, photos, or both.
- Rendered as thumbnails opening the **existing** photo viewer — no chat-specific viewer.
- **Notification text is the message body only.** A message with photos and no text produces
  `"Luis (Alvarez): [photo]"` — **PROPOSED wording, not approved.**

### 5.5 Offline (ND-24) — why this diverges deliberately

M6M shipped an offline queue with Background Sync and server-side conflict holding
(`sync_conflicts`, M6M D-17). Chat **does not use it**.

**Why, and this is a ruling not an omission:** a queued message is a message whose author
believes it was sent. Q4 already describes the failure mode of a message the sender assumes
landed — _"they usually take a guess and sometimes mess things up."_ A message that silently
sends forty minutes later, after the decision has been made and the wrong trim already cut, is
worse than a message that visibly failed and sent the sender to SMS.

**Josh's answer at Q16 was `sees it fail`** — asked directly against the alternative.

**What the UI owes:** a failure that is unmistakable and a **manual** retry. Not a spinner, not
a silent grey tick. §7.3.

### 5.6 Notification integration

Chat writes **no notification rows directly**. It calls the parent's `notify()`.

> ⚠️ **CORRECTED [S124, CC read of the SHIPPED function].** _Superseded, quoted not rewritten:_
> _"It calls the parent's `notify()` (parent §4.6), which owns recipient resolution,
> per-recipient rendering (R7's floor), notify-hours, push **and email**."_ and
> _"one recipient, the message body **as text**"._ Parent §4.6 was written **before slices 1–3
> built it**, and the signature drifted. Three corrections, all load-bearing for chat:
>
> 1. **`notify()` SENDS NO EMAIL.** There is no email call in `notify.ts` at all — it writes
>    the row and pushes. Every existing consumer (`incident-notify`, `co-signing-service`,
>    the delivery check-in) makes its **own** separate `sendEmail()`. See §5.6a.
> 2. **`render` is a REQUIRED per-recipient FUNCTION**, not a text field:
>    `render: (recipient: NotifyRecipient) => { title: string; body?: string | null; linkKey?: string | null }`.
>    It is called once per recipient — R7's enforcement point. Chat's text is user-authored and
>    identical for every recipient, and **the interface tolerates that**: slice 3's incident
>    consumer already passes `render: () => ({ … })` ignoring the argument. Chat does the same.
> 3. **There is no `override` parameter.** Parent §4.6 lists one; the shipped signature has
>    none. The notify-hours override is internal, via `isOverrideType(type)`.
>
> **The live signature**, as chat must call it:
>
> ```
> notify({
>   admin,        // SupabaseClient — SERVICE ROLE. See §5.6b.
>   companyId,
>   type,         // 'mention' — confirmed present in the live notifications type CHECK
>   recipients,   // NotifyRecipient[] = { profileId, role, email?, firstName? }
>   render,       // (recipient) => { title, body?, linkKey? }   ← required
>   linkKey?, linkParams?, projectId?, source?, tag?, now?
> })
> ```
>
> `notify()` de-duplicates by `profileId` internally, so A-C14's within-message dedupe is
> already covered by the platform; A-C15's self-mention exclusion is the **caller's** job
> (parent §16.5's self-assignment rule is the precedent).

**Chat's contribution is:** `type: 'mention'`, one recipient, a `render` function returning the
truncated message body (§6.3), `linkKey: 'chat'` and `linkParams` carrying the thread.

> ✅ **§S3 — ANSWERED [S124, CC live read]. It is ONE FILE, not several.**
>
> The map is **`apps/web/lib/notify/links.ts`** — shared `lib/`, confirmed, not per surface.
> `LinkParams` is **`Record<string, string | undefined>`** (`links.ts:36`), so adding
> `threadId` (or `kind`) needs **no type change**, and `notifications.link_params` is **jsonb**,
> so it is a data change rather than a schema change.
>
> **The service workers are already insulated and do not need touching.** The **sender**
> resolves the URL — `push.ts:105` calls `resolveClickTarget(...)` and writes the finished
> string into `payload.url` — and both workers only read it back:
> `sw.js:249` and `sw-dashboard.js:97` are `data.url || '<notifications home>'`. Neither holds
> a link table.
>
> _The earlier estimate, quoted not rewritten: "a change to a **shared** `lib/` map, not a
> per-surface fix" — correct, and the Phase 1 worry that it might be "the map plus both service
> workers plus the stored `link_params` shape" is **retired**._
>
> The second consumer to keep in step is the **in-app list**, which resolves through the same
> `resolveLink()`. One function, two callers.
>
> **v1 note:** with ND-29 deferring the sub thread, a project has one thread and the existing
> `chat` key already resolves correctly. **Carrying the thread is a v2 requirement**, and the
> key must gain it *before* slice 4, not with it.

### 5.6c Where a mobile mention lands — a deep-link PARAM (ND-40) [S125]

**`/m/p/{id}?chat=1`.** Not a thin route, and not a null resolver arm.

**Why not a thin route.** ND-37 says mobile chat has **no address of its own** — it is a state
the project screen can be in. A thin `/m/p/{id}/chat` page that immediately opened the overlay
would put a chat page back in the route tree and make ND-37 **half-true**, which is worse than
either whole answer: the next reader finds a route and reasonably concludes chat is a screen.

**Why not a null resolver arm.** Returning `null` for mobile sends the tap to
`/m/notifications` via `resolveClickTarget()`. **That is the one shape where the recipient of
`@Josh needs you on Alvarez` does not land in the conversation** — an extra tap on precisely
the notification chat exists to deliver. Rejected [S125, Josh].

**What this touches — three places, and the audit found all three disagreeing:**

1. **`apps/web/lib/notify/links.ts:51`** — the `chat` key's **mobile arm** changes from
   `` `/m/p/${p.projectId}/chat` `` to the param form. The desktop arm is unchanged. This is
   still **one file** (§S3): the sender resolves and both workers only read `data.url`.
2. **The project screen** (`app/m/p/[projectId]/page.tsx`) reads the param and **opens the
   overlay on mount**.
3. **This document**, which asserted a mobile chat route in two further places — §2.2 and
   §3a-2 — both now reconciled.

**Asserted by A-C42.**

### 5.6a The mention email — SUBS ONLY (ND-30 closed, ND-42) [S125b]

_Superseded heading and rule, quoted not rewritten: "**Email is DEFERRED to v2 (ND-30)** — v1
is in-app row + push. No mention email."_ **ND-30 is closed and the email is built in v1.**

**Who gets it:**

| Mentioned recipient | In-app row | Push | Email |
| --- | --- | --- | --- |
| Subcontractor **with a profile** | ✅ | ✅ | **✅** |
| Crew, foreman, PM, Admin, Owner | ✅ | ✅ | **❌** |

**Why subs and nobody else.** ND-15 scoped subcontractors to three events precisely because **a
sub may not have the app** — that is the entire reason the email arm exists, and it applies to
subs and to no one else, because staff are in the app. Emailing a foreman every time somebody
tags him in a thread he already has open is volume without value.

#### 5.6a-i ⚠️ This is an explicit exception to parent R3, recorded as one

**Parent R3:** *"every internal notification email is also a push, and vice versa."*

**Chat mention pushes for everyone and emails only subs, so the pairing does not hold in both
directions.** Chat mention is **the first internal type where that is true.**

It is written down as an exception rather than left to be discovered because **a spec that
quietly breaks a parent rule is exactly the drift §0a warns about** — and §0a's whole lesson is
that this document has already done it three times. The direction of the break matters and is
narrow: **every email still has a push** (a sub gets both). What R3 loses is the converse —
**not every push has an email**, which was already true in spirit for staff and is now true on
the record.

#### 5.6a-ii What already exists, and what is genuinely new

Established by live read at S125b rather than assumed:

- **No `mention` row in `email_types`.** The registry holds 13 rows and none is it, and
  **`email_logs` has an FK to `email_types`** — so an insert of a mention email log **fails on
  the FK today**. The migration is a hard prerequisite, not a nicety. Lands in **slice 1** with
  the rest of the schema.
- **No mention email path exists.** The only `'mention'` in the tree is the type union in
  `notify.ts:77`. This is wholly new, not a modification.
- **The functions it binds to all exist and are reused unchanged** (parent §5.5):
  `sendEmail()`, `logEmail()`, `buildSenderAddress()`, and Reply-To via
  `resolveCompanyReplyTo()` — resolved inside `sendEmail()` from a `replyToCompanyId`, so a
  sender added later inherits it.

#### 5.6a-iii Who sends it — the fork, decided

**The chat send path fires the email alongside `notify()`. `notify()` is NOT changed.**

The fork is real and the spec picks. `notify()` **sends no email today** — parent §4.6's
responsibility 6 is false against the shipped code (§0a). So either it gains email, or the
caller sends it. **The caller sends it**, for four reasons:

1. **Every existing consumer already does exactly this.** `incident-notify.ts` computes its
   recipient set **once** and drives two channels — in-app+push through `notify()`, email
   through its own `sendEmail()`. `co-signing-service` and the delivery check-in are the same
   shape. Chat would be the **fifth** to follow the pattern, not an exception to it.
2. **Making `notify()` send email would double-send for the four consumers that already do.**
   The only way round that is an opt-in flag per call — which is the caller deciding, just
   further away and with a shared function carrying the risk.
3. **ND-42's audience rule is a CHAT rule, not a platform rule.** "Subs only" is an R3
   exception this module is taking; putting it inside `notify()` would make a shared function
   carry a filter exactly one consumer uses.
4. **It keeps ND-41's precedent honest.** The expiry cron genuinely *is* notifications-core —
   parent §5.6 specs that route by name. This is not, and calling both "core work landing in
   chat" would blur a distinction worth keeping.

**⚠️ So parent §4.6's responsibility 6 remains false after this spec ships, and this spec does
not fix it.** That is owed to a notifications-core pass, and it is said here so the next reader
does not take a working mention email as evidence that `notify()` gained an email arm.

#### 5.6a-iv Content

- **Subject and body carry the real message text**, per parent **R6** — the notification shows
  what was said, not "you were mentioned". The email is not an exception to R6 just because it
  has more room.
- **Thread named**, per **ND-23**: `{author} ({project} — subs): {body}`. A sub only ever
  receives a sub-thread mention, so the `— subs` token is always present.
- **Reply-To is the company**, per the parent's S97 platform ruling, resolved in `sendEmail()`.
- **No dollar figures — and this is accepted, not solved.** Parent **R7** as extended keeps
  company money away from subcontractors, but **chat text is user-authored**, so §6.4's posture
  applies here unchanged: if someone types a figure into a sub thread and mentions the sub, the
  email carries it. **The email is not safer than the in-app row and must not be described as
  if it were** — the mitigation is the same one §6.4 names, that the mention picker only offers
  people who can already read the thread.

#### 5.6a-v The link — and what a subcontractor can actually open

**⚠️ THE DESKTOP DESTINATION IS THE WRONG ONE FOR THIS AUDIENCE, established by live read.**

- `DASHBOARD_ROLES` (`packages/shared/constants/roles.ts:62`) is `owner, admin,
  project_manager, foreman, crew_member` — **`subcontractor` is absent.** The desktop shell is
  not built for them. _(Honest caveat: the constant is **declared and never consumed** — no
  redirect enforces it — so a sub is not actively bounced from `/dashboard`. It states intent,
  not a gate.)_
- `/m` has **no role gate**, and the mobile tree carries explicit subcontractor handling
  (`app/m/detail-access.ts`). Subs are a field role.

**So the email links to the MOBILE destination: `{origin}/m/p/{project_id}?chat=1`** (ND-40).
Not the desktop chat tab.

This is **not** ND-8's text-without-link case. ND-8 applies when the floor makes every
destination a dead end; here a live destination exists and the email points at it. The
precedent is cited only to be distinguished, so a later reader does not reach for it.

### 5.6b Chat calls `notify()` from a SERVER ROUTE

`notify()` takes a service-role client, and `notifications` has **no INSERT policy at all** —
which is precisely what stops one user forging a notification addressed to another. So chat
cannot call it from the browser.

**The pattern to copy is parent §16 / ND-18's assignment routes** (`/api/punch-items`,
`/api/project-assignments`): the **write runs as the caller** through `createClient()` so RLS
still decides, and **only the notify call** uses `getSupabaseAdmin()`. Chat's send route is the
same shape — insert the message as the caller, notify as the platform.

---

## §6 — Notification text (ND-23)

### 6.1 Format

| Thread | Text                                          |
| ------ | --------------------------------------------- |
| Crew   | `{author} ({project}): {message body}`        |
| Sub    | `{author} ({project} — subs): {message body}` |

**Parent §3a's string is amended** — it reads `"Pat (Alvarez): …"` with no thread token,
written when one thread per project was the shape.

### 6.2 Why the thread is named

Q22, asked directly: does the notification need to say which thread. **Yes.** With two threads
per project, `Josh (Alvarez): …` is ambiguous, and the ambiguity matters most in the case that
motivated the split — Josh needs to know whether he is being pulled into a sub conversation or
a crew one before he taps.

### 6.3 Truncation

**RULED [S124, Josh] — ND-31: chat truncates, in its own render function. The shared push path
is not touched.**

> ⚠️ **There was nothing to match.** _The instruction here, quoted not rewritten: "CC should
> match whatever the parent's push send path already does, if it does anything."_ **It does
> nothing** — `lib/notify/push.ts` contains no `slice`, no `substring`, no length logic
> anywhere. Bodies are sent whole today.

**Where:** inside chat's `render(recipient)` (§5.6), which is the function that builds the
title. Truncating there and not in `push.ts` means **no existing notification type changes
behaviour** — incidents, signed COs, timesheets and the rest keep sending whole bodies, which
is a property worth keeping rather than a limitation.

**RULED [S124b, Josh]: 140 characters of BODY**, cut at the last word boundary at or before 140 and
suffixed with `…`. The prefix — `{author} ({project}): ` — is **never** truncated (ND-23's
thread token is the part that tells Josh whether to tap at all, so it cannot be what gets cut).

**Why 140 and not a payload figure.** The binding constraint is **display, not bytes**: a Web
Push payload has roughly 4 KB to play with, which no realistic chat message approaches, while a
collapsed OS notification shows on the order of two to four lines. 140 keeps the whole of a
real message in almost every case — **3a-1's actual text is 62 characters** and passes through
untouched — and caps only the genuine outlier. It is a display budget, and the reasoning — that the constraint
is display rather than payload — is what the ruling confirmed it on.

### 6.4 The financial floor

Parent **R7** applies to notification text and chat is no exception — but chat text is
**user-authored**, so the floor cannot be enforced by rendering.

**Stated plainly:** if a PM types a dollar figure into chat and mentions a foreman, the
notification carries it. **This is accepted, not solved.** The floor governs what _the platform_
renders per recipient; it has never governed what one human tells another, and chat does not
change that. The mitigation is that the mention picker only offers people who can already read
the thread — nobody receives chat text they could not have read by opening the thread.

---

## §7 — UI

_A spec without a UI section is incomplete (CLAUDE.md, S86). This is that section._

### 7.1 Entry — DESKTOP IS TWO SURFACES (ND-33)

> ⚠️ **AMENDED [S124, Josh]. The earlier text described one desktop surface and chat has two.**
> _Superseded, quoted not rewritten: "**Desktop:** a `Chat` tab in the project tab strip →
> `/dashboard/projects/{id}/chat`."_ That tab survives — it is (b) below — but it is **not the
> primary surface** and it is not the whole of desktop chat.

**Both. Not either.**

#### 7.1a (a) The floating panel — PRIMARY, and GLOBAL

- A **persistent chat icon, bottom-right, on every dashboard page.** Not project-scoped: it
  renders on Contacts, Estimates, Settings, Billing — **everywhere** in `/dashboard`.
- Clicking **opens a panel over whatever the user is on.** No navigation, no route change, no
  loss of the form they were filling in.
- **Inside the panel: a project switcher.** Users move between project threads **without
  navigating away** from the page they are on.
- This is where the interview's problem actually lives. Q4's failure — _"text just sits"_ — is
  a failure of *reachability*, and a surface you must navigate into to answer is one more
  reason not to answer.

**What this touches that the tab does not:** the dashboard **layout**, since the icon and panel
must mount once, above the page, on every route. A per-page mount would be a second
implementation of the same surface — #129's shape.

#### 7.1a-i The switcher's project list — RULED (ND-34) [S124b]

**ACTIVE projects, ordered by MOST RECENT MESSAGE.** _That is what a switcher is for; archived
jobs do not need to be one tap away._

- **Filter:** `projects.status = 'active'`, intersected with `can_view_project()`.
- **Order:** most recent message in that project's thread, newest first. A project with no
  messages sorts last — it has nothing to return to.

**⚠️ BOTH OF THESE ARE NEW SERVICE WORK AND THE SPEC SAYS SO [S125 audit].** Neither exists:

- **"Ordered by most recent message"** needs a query joining projects to the latest
  `chat_messages.created_at` per thread. There is no such function today.
- **The per-thread unread dot** needs a count of messages newer than the viewer's
  `chat_reads.last_read_at`, **per thread in the list** — the naive shape is N+1 across the
  switcher.

Both belong in slice 2's `lib/` core, and both should be **one query, not a loop**. Named here
because a spec that lists a behaviour without noting it has no implementation is how a slice
gets estimated at half its size.

**⚠️ THE LIST IS A PRESENTATION OF `can_view_project()`, NEVER A DIFFERENT SET.** The status
filter and the ordering are applied *on top of* the helper. A switcher that assembled its own
membership would be a second definition of who can read a thread, and the two would drift.

**What happens to a thread when its project is archived — asked and answered, because the
messages do not vanish (R2).** The project leaves the **switcher**; the thread stays exactly
where it was:

- **The tab is how you reach it.** `/dashboard/projects/{id}/chat` still resolves, still shows
  the full history, still enforces the same RLS. Q6's _"where does the record live six months
  later"_ is answered by the tab — which is precisely what §7.1b said the tab was for.
- **Nothing is deleted and nothing is hidden.** R2 makes the log permanent, and archiving a
  project is not a retention decision.
- **A mention notification on an archived project still links correctly**, because the resolver
  keys on `projectId` and never consults status.

**Consequence worth naming:** the switcher is a *working set*, not an index. Finding a
conversation on a finished job goes through the project, not the panel — and the spec would
rather say that than quietly grow the switcher into a search surface nobody ruled.

#### 7.1b (b) The project Chat tab — for reading and auditing

- A `Chat` tab in the project tab strip → `/dashboard/projects/{id}/chat`.
- For reading a thread **properly** when already inside a project: full height, full history,
  the auditing view. Q6's _"where does the record live"_ is answered here, not in a panel
  corner.
- The tab strip is `TABS` in **`app/dashboard/projects/[id]/project-header.tsx:24`** — an array
  of `{ slug, label, roles? }`, currently 14 entries.

#### 7.1c Tab gating — UNGATED (ND-35)

**No `roles` entry on the Chat tab.** RLS already decides who can read a thread, via
`can_view_project()`. A role list on the tab would be **a second answer to a question already
answered** — the pattern **§4.11.10a** warns against — and the two answers would then have to
be kept in step forever. Several existing tabs do carry `roles`; chat deliberately does not.

#### 7.1d Mobile — CHAT TAKES A BOTTOM-BAR SLOT (ND-36) [RULED S124b]

**Ruled:** mobile keeps the **panel shape**, not a full screen. _Superseded, quoted not
rewritten: "**Mobile:** a chat entry in the project screen → `/m/p/{id}/chat`. **A real
screen**, per M6M **D-28** (pages, not sheets)."_

**And the entry point is ruled: Chat takes a bottom-bar slot, and DAILY LOGS MOVES TO THE
HAMBURGER.**

```
BEFORE (D-3)   Projects · Timeclock · [camera] · Logs · Field
AFTER          Projects · Timeclock · [camera] · Chat · Field
```

**The bar stays at FIVE**, so ND-14's arithmetic is untouched — no envelope shrinks, the camera
keeps a true centre, and the six-slot question stays closed. **D-3's "no destination appears in
both" also holds**, because Logs *leaves* the bar as Chat *arrives*; the rule is preserved by
the swap rather than excepted.

##### 7.1d-i What this costs, stated plainly rather than buried

> ⚠️ **CORRECTED [S125 audit]. The earlier statement of this cost was wrong on the facts, and
> it was the one thing Josh asked to be stated plainly rather than buried.** _Superseded,
> quoted not rewritten: "**several screens carry it as their primary amber button.** Those
> buttons route to `/m/logs/new` and **keep working exactly as they do today** — the capture
> path is untouched."_

**"Log the day" is the end-of-shift action, and there are exactly TWO entry points to
`/m/logs/new`** — not "several", and one of them is the screen being demoted:

| Entry point | Effect of the swap |
| --- | --- |
| `app/m/p/[projectId]/page.tsx:286` — the **project screen** (M-3) | **Untouched.** This is the one a foreman standing on a job uses, and it still routes straight to `/m/logs/new`. |
| `app/m/logs/log-rows.tsx:140` — the **primary 60px amber button** (§4.6's *"Primary 60px amber 'Log the day' at the bottom"*) | **It lives ON `/m/logs`, the screen moving behind the hamburger.** Reaching it becomes hamburger → Logs → button. |

**So the honest cost is not "review only".** The review path costs an extra tap, **and so does
the capture path from that second entry** — hamburger → Logs → Log the day, where it used to be
one slot. What is genuinely untouched is the project-screen entry, which is the primary one in
the field.

**The ruling still holds on that basis** — a foreman logs the day from the job, not from the
company-wide log list — but the spec says the real shape rather than a flattering one.

##### 7.1d-ii Four M6M criteria are BROKEN by this and must be REWRITTEN, not satisfied

**The sheet goes from six tiles to seven.**

- **A-3b** — asserts the sheet contains **exactly** the six tiles *named*: Schedule, Expenses,
  Subs & Vendors, Team, Contacts, Settings. It is a named list, so a seventh tile fails it by
  design. _It was already rewritten once, at S100/D-38, when the set went from seven to six._
  **Rewrite to seven, naming Logs.**
- **A-41** — walks `/m/schedule`, `/m/expenses`, `/m/subs`, `/m/team`, `/m/contacts`,
  `/m/settings` and asserts exactly one tile carries the blue border and label. **Add
  `/m/logs`** to the walk. The criterion's own note says walking all of them is deliberate
  because "a build can get the highlight right for one tile and wrong for the rest".
- **A-42** — "On **all six routes** the tab bar renders and **no tab** carries the active
  state." **Seven routes now**, and the assertion still holds for `/m/logs` because the Logs
  slot no longer exists to light. **CC found this one; it is not in the ruling's list and it
  would have failed silently as an off-by-one.**
- **A-1c** — "the active tab reflects the current screen on every `/m/**` route." **The Chat
  slot has no screen to reflect** (ND-37). See below.

**And one M6M ruling is inherited rather than broken:** **D-39** gives the hamburger
destinations the **hamburger**, not a back chevron, because A-3c can only be observed by
opening the sheet while standing on one of them. `/m/logs` joins that set and **must keep the
hamburger** — giving it a chevron would strand A-3c for the third time.

##### 7.1d-iii A-1c rewritten (ND-37) — the Chat slot opens an overlay

**Tapping Chat opens a panel over the current screen. It does not navigate**, matching the
desktop shape (7.1a).

_A-1c as written, quoted not rewritten: "The active tab reflects the current screen on every
`/m/**` route — arriving at `/m/p/{id}` by any path leaves Projects active."_ That sentence
assumes every slot owns a route. **The Chat slot owns none.**

**Rewrite:** the four route-owning slots keep A-1c unchanged. **The Chat slot's active state
means the overlay is open** — lit while it is, unlit the moment it closes, and **never lit by
the route underneath**. A build that lights Chat because the user happens to be on a project
misstates where they are, which is the same defect A-42 exists to prevent one level up.

**A-1 and A-1b, checked as instructed:**

- **A-1** — "the tab bar renders on every `/m/**` route except M-9 and M-10, and does not
  scroll out of view." **Unaffected in principle, but it constrains the overlay's geometry:**
  the panel **must not unmount the tab bar**, and the Chat slot must stay **reachable while the
  overlay is open** — it is how the overlay is closed. A panel that covers the bar fails A-1
  and traps the user in one move. **This is a design constraint the ruling implies and the
  spec states.**
- **A-1b** — "on M-9 and M-10 the tab bar is replaced by that screen's own action row." **Not
  affected.** There is no tab bar on the photo viewer or the markup editor, so there is no Chat
  slot there and chat is simply unreachable from those two screens — the same as every other
  destination, and not a new exception.

#### 7.1e Thread selection within a surface

- **v1 (ND-29): one thread per project.** No segmented control — a control with one option is
  not a control.
- **v2, where both threads exist:** a two-item segmented control — `Crew` · `Subs` — each
  carrying its own unread dot. _Where only the crew thread exists (ND-25): no segmented control
  at all, and not a disabled second segment._

### 7.2 Thread view

- Newest at bottom, scrolled to bottom on open, author + timestamp per message.
- ✅ **§S5 — ANSWERED, AND RULED AS A NAMED EXCEPTION (ND-32) [S124, Josh].**

  **There is no message-shaped precedent in M6M.** D-4, quoted as written
  (`docs/specs/M6M-mobile-pwa-spec.md:216`):

  > **The project card** (§4.2) is the one list pattern. Every other mobile list reuses its
  > geometry.

  And it is obeyed literally elsewhere — daily-log rows use "project-card geometry (D-4)"
  (`:890`), and `:1454` / `:3068` both repeat _"Patterns are reused, never re-invented."_
  Chat would be the **first** mobile list that is not a card.

  **Ruling: messages render as bubbles. This is a named D-4 exception, not a quiet drift.**
  D-4 exists to stop lists being reinvented casually, and a conversation is genuinely a
  different thing from a list of records — author, time and adjacency carry meaning that card
  geometry throws away. **Naming the exception is what keeps D-4 intact**: an unnamed
  divergence would make the next one easier and the rule would erode without anyone deciding
  to erode it.

  **The exception is scoped to the message list itself.** Everything around it — the thread
  picker, the project switcher, any list of threads — stays on card geometry.
- Opening a thread writes `chat_reads.last_read_at` for that thread.
- **No infinite history load in v1** — a page of recent messages with load-more. R2 makes the
  log permanent and therefore eventually large.

##### 7.2a Page size — RULED (ND-38) [S124b]

**50 in the tab. 25 in a panel.** The same number again per load-more.

**Why two numbers, and why these.** The page size has one job: **the first scroll must not land
on a loader.** That is a function of how much the surface shows, and the two surfaces show very
different amounts — a full-height tab holds roughly 15–20 messages, a panel corner perhaps
8–10. Both numbers are therefore about **two and a half screenfuls**, which absorbs the first
scroll and leaves the loader for someone genuinely reading back.

**The mobile panel uses the panel number (25), not a third one.** It is the same component and
a smaller canvas; inventing a mobile-specific size would be a third constant to keep in step
for no observable gain.

Chat messages are small rows, so neither number is a payload concern — this is a scroll-feel
decision, and it is cheap to revisit once there is a thread long enough to judge it on.

### 7.3 Composer

- Text input, `@` button, attach button, send.
- **Failure state (ND-24):** the failed message stays visible in the thread, visually distinct,
  with an explicit retry. It is **not** removed, and it is **not** shown as sent.
- No draft persistence in v1.

### 7.4 The crew-reading-sub-thread banner (3d)

Replaces the composer. Josh's requirement (Q24) is _"don't post here, subs can see this"_,
delivered _"cleaner and more professional."_

**PROPOSED wording:** **"Read-only — this thread includes subcontractors."**

Two things it must do and one it must not:

- State that they cannot post.
- State **why** — the sub audience is the reason, and a crew member who does not know that will
  assume it is a bug.
- **Not** scold. It is a normal thread they are welcome to read.

### 7.5 Mention picker

- Triggered by `@` in the composer or the `@` button.
- Lists the **postable** set for that thread (§5.2), name and role.
- Filters as typed.
- **Empty picker is possible** — a sub thread where the only postable people are Owner and
  Admin and the viewer is one of them. Shows the other, or an empty state; never crashes.

---

## §8 — Acceptance criteria

**New criteria use `A-C` to avoid colliding with the parent's `A-N` series.**

**Superseded parent criteria:** **A-N31–A-N34** were written against a one-thread model and
must be re-read at build time. A-N31 (plain message notifies no one), A-N32 (mention notifies
only that person, push text is the body) and A-N33 (deleting a notification leaves the message)
survive unchanged in substance. **A-N34** (both surfaces call the same `lib/` path) survives
and is strengthened by A-C16.

**Threads (ND-19)**

- **A-C1** A project with an assigned sub who has a profile exposes **two** threads. `[live]`
- **A-C2** A project with **no** assigned sub who has a profile exposes **one** thread and renders **no segmented control at all** — not a disabled second segment — **while a project that has one renders two segments in the same build.** `[Playwright]` _(ND-25. **Amended [S125]:** under ND-29 this was **vacuous** — no project could expose two, so "exposes one" was true by construction and could never fail. With the sub thread built it can fail, and the trailing clause is what makes it fail on a build that simply never renders a second segment: without it, a chat that forgot sub threads entirely still passes.)_
- **A-C3** A message posted in the crew thread never appears in the sub thread of the same project. `[live]`
- **A-C4** Unread state is per thread: reading the crew thread leaves the sub thread unread. `[live]` _(The `chat_reads` re-key. A build that kept `project_id` passes every other criterion here.)_

**Access (ND-20) — ✅ ALL v1. ND-29 is reversed (§2.5).**

_Superseded banner, quoted not rewritten: "⚠ A-C5…A-C10 are v2 (ND-29 defers the sub thread).
v1's only access criterion is A-C5b below."_

- **A-C5b** A member who fails `can_view_project()` can neither SELECT nor INSERT a message on either thread of that project. `[live]` _(The floor under both threads, and the only access rule the crew thread needs.)_


- **A-C5** A subcontractor cannot SELECT any crew-thread message, on any project. `[live]` _(The one absolute. §5.2.)_
- **A-C6** A crew member can SELECT sub-thread messages and **cannot INSERT** one. `[live]` _(The divergence. §S1.)_
- **A-C7** The crew member's sub-thread view renders **no composer element in the DOM**. `[Playwright]` _(M6M D-54 — a hidden button is not a permission; this asserts the render side and A-C6 asserts the policy side. Both are required.)_
- **A-C8** An Owner not assigned to a project can post in both its threads. `[live]` _(Parent ND-3 — role, not assignment. An assignment-keyed build fails.)_
- **A-C9** A PM not assigned to a project can read neither thread. `[live]`
- **A-C10** A crew member does not appear in the sub thread's mention picker. `[live]`

**Mentions and notifications**

- **A-C11** A plain message writes no notification row for anyone, including thread members with unread state. `[live]` _(Parent R6. §2.4 — this is the criterion a well-meaning later change breaks.)_
- **A-C12** A crew-thread mention notification reads `{author} ({project}): {body}`; a sub-thread one reads `{author} ({project} — subs): {body}`. `[live]` _(ND-23.)_
- **A-C13** A sub-thread mention opens the **sub** thread, not the crew thread. `[Playwright]` _(§S3. **v1 again [S125]** — ND-29 is reversed, so the resolver must carry the thread from the start rather than "before slice 4". This is the failure that ships silently: with two threads and a thread-blind link, every sub-thread mention opens the crew thread and nothing errors.)_
- **A-C14** `@Josh … @Josh` in one message writes **one** notification row. `[unit]`
- **A-C15** A self-mention writes no row. `[unit]`
- **A-C16** Both surfaces call the same `lib/` send-and-parse path. `[unit]` _(Parent A-N34, #129's precedent — a second implementation that "does the same thing" **is** the divergence.)_

**Photos (ND-22)**

- **A-C17** A message can reference two photos (`files` rows, `category='photos'`) and renders both as thumbnails opening the existing viewer via `photos.ts`'s `displayUrl`. `[live]` _(ND-28. `displayUrl` at `lib/services/photos.ts:40,121–130` is D-31's resolution — chat must never resolve a file path itself.)_
- **A-C17b** Hard-deleting a referenced file removes the reference and **leaves the message and its text intact**. `[live]` _(ND-28's CASCADE. `files-client.ts:334` hard-deletes the row and the storage blob, so this is a real case, not a soft-delete flag.)_
- **A-C17c** The composer refuses a `files` row whose `category` is not `'photos'`. `[unit]` _(**The FK cannot enforce this** — §4.3. This criterion is the only backstop, which is exactly why it exists.)_
- **A-C18** Chat exposes no file-upload path. `[unit]` _(Reference, not ingest. A build that adds an upload "because it's easier" fails here and nowhere else.)_
- **A-C19** The gallery picker offers only that project's photos — `project_id` scoped **and** `category='photos'`. `[live]` _(A receipt or contract PDF appearing in the picker is the failure this catches.)_

**Offline (ND-24)**

- **A-C20** A send with no connectivity fails visibly and the message is **not** enqueued to the M6M offline queue. `[live]` _(The deliberate divergence. A build that "helpfully" reuses the queue fails.)_
- **A-C21** A failed message is never displayed as sent. `[Playwright]`

**Desktop surfaces (ND-33, ND-35)**

- **A-C24** The chat icon renders on a dashboard page that is **not** a project page — Contacts, Estimates and Settings all carry it. `[Playwright]` _(ND-33's "global, not project-scoped". A build that mounts it per project page passes every other criterion here.)_
- **A-C25** Opening the panel does **not** change the route, and the underlying page keeps its state. `[Playwright]` _(The whole point of a panel over a tab.)_
- **A-C26** Switching project inside the panel does not navigate. `[Playwright]`
- **A-C27** The `Chat` tab carries **no** `roles` entry in `TABS`. `[unit]` _(ND-35 — asserting the absence, because adding one would look like a safety improvement.)_
- **A-C28** The panel and the tab render messages through the **same** `lib/` component. `[unit]` _(A-C16's rule applied to the two desktop surfaces; #129 is what two implementations cost.)_

**Mobile navigation (ND-36, ND-37) — all four rewrite an M6M criterion rather than satisfying it**

- **A-C30** The bottom bar renders **five** slots: Projects · Timeclock · [camera] · Chat · Field. **No Logs slot.** `[Playwright]` _(ND-36. Asserting the absence matters as much as the presence — a build that adds Chat without removing Logs is six slots and reopens ND-14's arithmetic.)_
- **A-C31** The hamburger sheet contains **exactly seven** tiles, Logs among them. `[Playwright]` _(**M6M A-3b rewritten** — it names six by name, so a seventh fails it by design. A-3b was already rewritten once, at S100/D-38.)_
- **A-C32** Opening the sheet on `/m/logs` lights the **Logs** tile and no other. `[Playwright]` _(**M6M A-41 extended** to a seventh route; and **M6M D-39** — `/m/logs` keeps the hamburger, not a back chevron, or A-3c is stranded again.)_
- **A-C33** On `/m/logs` the tab bar renders and **no** slot carries the active state. `[Playwright]` _(**M6M A-42 rewritten** from six routes to seven. Found by CC, not in the ruling — it would have failed as a silent off-by-one.)_
- **A-C34** Tapping Chat opens the overlay and **does not change the route**; the Chat slot is lit **only while the overlay is open**, and never by the route underneath. `[Playwright]` _(**M6M A-1c rewritten**, ND-37. A slot that opens an overlay has no screen to reflect.)_
- **A-C35** With the overlay open, the tab bar is **still in the DOM and the Chat slot is still tappable**. `[Playwright]` _(M6M **A-1** constrains the overlay's geometry: a panel that covers the bar both fails A-1 and traps the user, since the slot is how the overlay closes.)_
- **A-C36** The primary "Log the day" buttons still route to `/m/logs/new` and are unchanged. `[Playwright]` _(§7.1d-i — the capture path must not pay for the nav swap. Only the review path moves.)_

**Switcher (ND-34)**

- **A-C37** The switcher lists only `status='active'` projects, ordered by most recent message. `[live]`
- **A-C38** Archiving a project removes it from the switcher and **leaves its thread reachable through the tab**, with history intact. `[live]` _(R2. The messages do not vanish, and this is the criterion that says so.)_

**Transport (ND-26)**

- **A-C39** Polling **stops** when the thread is not open — closing the panel, navigating away, and the document becoming hidden each halt it; becoming visible resumes it. `[Playwright]` _(§9.1d rule 1. The expensive failure is invisible on screen, which is why it needs a criterion rather than a code comment. This is the line most likely to be "fixed" into a global interval by someone making chat feel snappier.)_
- **A-C40** A poll requests only messages **newer than the newest the client holds**, and a thread with 500 messages polls the same payload as a thread with 5. `[unit]` _(§9.1d rule 2. **A refetch is functionally correct and invisible in the UI** — only a test that watches the request catches it, and without it an old thread silently costs more to keep open than a new one.)_
- **A-C41** Nothing above the service function knows the transport — no component subscribes directly. `[unit]` _(§9.1c. This is the property that keeps the Realtime swap at one file plus a migration; a component that subscribes destroys it.)_

**Mobile deep link (ND-40)**

- **A-C42** A mobile mention notification opens **`/m/p/{id}?chat=1`** — the project screen with the chat overlay already open — and **no `/m/p/{id}/chat` route exists in the app tree.** `[Playwright]` _(ND-37 + ND-40. Both halves are required: the positive proves the recipient lands in the conversation, and the negative is what keeps ND-37 literally true rather than half-true.)_

**Notification expiry (ND-41) — notifications-core, landing here**

- **A-C43** An unstarred notification past `expires_at` is deleted by the cron; a **starred** one past `expires_at` is **not**. `[live]` _(The pair is the criterion. A job that deletes everything past the date passes any "expired rows are removed" assertion and quietly destroys the rows a user deliberately kept.)_
- **A-C44** The expiry route is **registered in `vercel.json`**. `[unit]` _(A correct handler that nothing schedules never runs — the exact defect parent §5.6 flagged for `/api/cron/invoice-reminders`, which has had a handler and no schedule since before this module.)_
- **A-C45** The route is gated by `CRON_SECRET` and answers 401 without it. `[unit]` _(Every other cron route does; a delete endpoint is the last one that should not.)_

**Mention email — subs only (ND-30 closed, ND-42)**

- **A-C46** A mentioned **subcontractor with a profile** receives an in-app row **and** an email, and the email is logged to `email_logs` with `email_type = 'mention'`. `[live]` _(The whole of ND-42. The log assertion also proves the `email_types` migration landed — without it the insert fails on the FK.)_
- **A-C47** A mentioned **crew member** receives an in-app row and a push and **NO email**. `[live]` _(⚠️ **The R3 exception, and the criterion that carries it.** Without this, a build that emails every mentioned recipient passes every other criterion in this block — and it is the likeliest wrong build, because emailing everyone is what R3 reads like.)_
- **A-C48** The email's subject and body carry the **real message text** and the **sub-thread name** — `{author} ({project} — subs): {body}`. `[live]` _(R6 + ND-23. A "you were mentioned" email passes a naive "an email was sent" assertion and defeats the point.)_
- **A-C49** A subcontractor **without a profile** does not appear in the mention picker, and no email is attempted for them. `[live]` _(§5.6a-vi — the state that never arises. Asserting it keeps a later build from "helpfully" emailing `subcontractors.email`, which is nullable.)_
- **A-C50** The email's link is the **mobile** destination, `{origin}/m/p/{id}?chat=1`. `[unit]` _(§5.6a-v. `DASHBOARD_ROLES` excludes subcontractor, so a desktop chat link is the wrong surface for the one audience this email has.)_

**The tripwire (S124 correction)**

- **A-C29** `PENDING_ROUTES` in `s123-incident-notify.test.ts` no longer contains `'chat'`, and the whole suite is green. `[unit]` _(The guard is designed to fail when chat ships. **The commit creating the chat routes must clear it in that same commit**, or it ships red.)_

**Retention (parent R2)**

- **A-C22** Deleting a mention notification leaves the message intact. `[live]` _(Parent A-N33.)_
- **A-C23** No chat message has an `expires_at`, and **running `/api/cron/notification-expiry` deletes zero chat messages** while deleting the expired unstarred notification rows in the same pass. `[live]` _(R2. **Amended [S125]:** the second half used to be untestable — there was no cron. ND-41 builds it, so this now asserts a real interaction rather than an absence. It fails on a build whose expiry job reaches past `notifications`.)_

---

## §9 — Open, and what each costs

### 9.1 ND-26 — transport. **RULED [S124c, Josh]: POLLING, 12 SECONDS, WHILE OPEN.**

_Superseded heading, quoted not rewritten: "**The one decision this spec does not make.**"_

**The ruling: poll every 12 seconds while a thread is open on screen. Not Realtime.**

#### 9.1a Why — Josh's reasoning, recorded

**Real-time is not needed.** A **10–15 second delay is invisible to a foreman**; nobody is
watching a thread waiting for a keystroke to appear. The interview's problem (§1) is a request
being *lost*, not a request arriving twelve seconds late.

**And push already covers the away case.** If someone is mentioned while the app is closed,
they get a push regardless of transport — that path is built and shipped (parent slices 1–3).
**So this decision governs one narrow thing: what happens with a thread open on screen.** It
was easy to mistake for a bigger decision than it is, which is why the scope is written down.

#### 9.1b Why Realtime was REJECTED, not merely not-chosen

Recorded as a rejection with reasons, so it is not re-litigated as an oversight:

- **`supabase_realtime`'s publication is EMPTY** — verified again at S124, zero tables. This is
  **opt-in work per table**, not a configuration flip.
- It is **new operational surface that nothing else in the app uses**. Every other read path on
  this database is request/response. Realtime would be the first, and the first of anything
  carries the cost of being the first — no precedent, no failure mode anyone has seen here.
- **To serve three test accounts today.** The live population is what it is: one subcontractor
  with a profile, a handful of staff identities. Standing up new infrastructure at that scale
  is cost before evidence.

_The parent's line — §5.1's "Chat without Realtime is a materially worse product" — is
acknowledged and overruled on the ground above: it is true of a chat product, and this is a
request-capture tool for a crew of a dozen where the alternative to a 12-second delay is a text
message that never gets logged at all._

#### 9.1c The reversal path — the reason starting simple is safe

**The client calls a service function either way.** Nothing above the transport knows how a
message arrived, so swapping is:

1. **one file** — the service function that fetches new messages, and
2. **a migration** adding `chat_messages` to the `supabase_realtime` publication (plus replica
   identity).

No component changes, no route changes, no criteria change except the transport's own. **This
is the property that makes 12-second polling a safe starting point rather than a decision to
regret** — and it is a property the build must preserve: if a component ever subscribes
directly, the swap stops being one file.

**⚠️ WHAT WOULD TRIGGER THE SWAP, so the next person watches for it rather than guessing:
cost appearing on the Supabase bill as concurrent open threads grow.** The arithmetic is
simple and worth writing down: one open thread is **5 requests/minute, 300/hour**. Ten
simultaneous open threads is 3,000/hour; fifty is 15,000/hour. **Watch the request count on the
Supabase usage dashboard, not the user count** — the driver is *threads left open*, not people
employed, and one foreman who leaves the panel open all day costs the same as eight who open it
briefly.

#### 9.1d Two rules that are SPEC-LEVEL, not build detail

**1. Polling STOPS when the thread is not open.**

A panel that keeps polling after it closes, or a background tab that keeps asking, is the
version of this that gets expensive — and it gets expensive invisibly, because nothing on
screen is wrong. Polling is bound to a thread being **open and visible**:

- Closing the panel stops it.
- Navigating away from the tab stops it.
- The document becoming hidden (`visibilitychange` — a backgrounded tab, a locked phone) stops
  it, and it resumes on becoming visible.

**Asserted by A-C39.** This is the single line item most likely to be "fixed" into a global
interval by someone making chat feel snappier.

**2. The poll asks for messages SINCE THE LAST ONE IT HAS. It never refetches the thread.**

The request carries the newest message the client already holds — its `created_at` (or id) —
and the server returns only what is newer. **A refetch grows with history**, which would make
an old thread more expensive to keep open than a new one, and the oldest threads are exactly
the ones on the longest-running jobs. It would also make ND-38's page size meaningless, since
every poll would re-transmit the page.

**Asserted by A-C40**, which is written to fail on a build that refetches — a refetch is
functionally correct and invisible in the UI, so only a test that watches the payload catches
it.

### 9.4 Notification expiry — IN SCOPE, and it is NOT chat work (ND-41) [S125]

**Chat builds `/api/cron/notification-expiry`.** One route, one delete, one Vercel schedule
slot.

**⚠️ SAY WHAT THIS IS: notifications-core work landing in the chat module.** It is not a chat
feature and it should not be filed as one. Parent **R2** expires unstarred notification rows at
30 days, and parent **§5.6** already specs the route by name — *"a route at
`/api/cron/notification-expiry` deletes unstarred rows past `expires_at`, mirroring the
existing cron handlers."* **It was never built.** The S125 audit found **six cron routes and
none of them it**, and **no code anywhere reading `notifications.expires_at`**.

**Why it lands here rather than staying unbuilt.** Chat is the module that makes it bite: every
mention writes a notification row, R2 says the **chat log is permanent and the notification is
not**, and today **neither expires**. Shipping chat without it means the one table designed to
be transient grows forever, and A-C23 — which asserts chat messages are *not* deleted by the
expiry cron — is untestable because there is no cron.

**Shape**, mirroring the existing handlers:

- `CRON_SECRET` gate, as every other cron route has.
- Delete `notifications` where `expires_at < now()` **and `starred = false`**. Starred rows are
  kept indefinitely — that is what starring means.
- Service role; `notifications` has no DELETE policy for any authenticated role.
- **Registered in `apps/web/vercel.json`.** The Pro schedule slot is available — Hobby's
  two-a-day cap was what forced the upgrade (context99 §5), so this is not competing for a
  scarce slot.

**Sequenced as slice 0** (§12): it is independent of every chat table and can land before them.

### 9.2 Carried from the parent, unchanged by this spec

- **FFNav position** for the desktop notifications item — owned by the deferred reindex.
- **`/api/cron/invoice-reminders` has no schedule** (parent §14.4) — pre-existing, unrelated.
- **TECH_DEBT #117** — untouched.

### 9.3 New, opened by this spec — STATUS AFTER S124's LIVE READ

**Closed by ruling:**

- ~~**§S4** — photo deletion behaviour.~~ **RULED, ND-28** — `files(id)`, CASCADE. §4.3.
- ~~**A message-shaped list precedent (§S5).**~~ **ANSWERED: none exists. RULED as a named D-4
  exception, ND-32.** §7.2.

**Answered by live read, no ruling needed:**

- ~~**§S1**~~ — 32 precedents; two policies is the shape. And v1 needs none of it (ND-29).
- ~~**§S2**~~ — `project_assignments → company_members → profiles`. One sub has a profile.
- ~~**§S3**~~ — one file, `lib/notify/links.ts`. The workers are insulated.

**Closed at S124b — all four of §13's questions are ruled:**

- ~~Push truncation length~~ — **140**, ND-31. §6.3.
- ~~Mobile entry point~~ — **a bottom-bar slot; Logs moves to the hamburger**, ND-36. §7.1d.
- ~~Switcher project list~~ — **active, by most recent message**, ND-34. §7.1a-i.
- ~~History page size~~ — **50 tab / 25 panel**, ND-38. §7.2a.

**Closed at S124c:**

- ~~**ND-26 transport.**~~ **RULED: 12-second polling while a thread is open.** §9.1.

**Nothing in this spec is awaiting a ruling.**

_Superseded at S125, quoted not rewritten: "**ND-29's revisit condition** — the sub thread
returns when real subcontractors have logins." **ND-29 is reversed and the sub thread is
built** (§2.5), so there is no revisit condition._

**Closed at S125b:**

- ~~**ND-30, the mention email.**~~ **BUILT, subs only (ND-42).** With it, **no parent rule is
  left half-satisfied by this spec** — ND-15's three sub-scoped events all have both channels.
  The R3 exception it creates is recorded in §5.6a-i rather than taken silently.

**One thing remains, and it is not a decision:**

- **A cost signal to watch, not answer** — §9.1c: request volume on the Supabase usage
  dashboard as concurrent open threads grow. It has a stated trigger and a documented reversal
  path, so it is monitoring rather than an open question.

**And one fixture reality that is a fact, not a question:** the sub thread has **one** testable
identity — `josh+qa-sub@worthprop.com`, on two test projects (§5.3). Enough to prove A-C1,
A-C3, A-C5 and A-C6 against; not enough to demo. That constrains what slice 4 can *show*, not
whether it is correct.

---

## §10 — STATE.md:514 is answered for internal chat (ND-27)

STATE.md:514 reads: _"Client portal messaging. Real-time chat or async email-style?"_, tied to
the Pre-Module 9 gate.

**The entry treats internal chat and client messaging as one transport decision. They are not,
and Q9 dissolves the competition rather than resolving it:** clients type into nothing. There
is no client participant in any thread this spec builds, so nothing here constrains what
Module 9 chooses for client messaging.

**What to amend and what not to:**

- **Amend** STATE.md:514 to record that internal chat is decided and does not gate it.
- **Do not close it.** Client messaging remains a real Pre-Module 9 question, and the
  Pre-Module 9 gate's own rule stands: every client deliverable is delivered **by email**;
  the portal is an additional access surface, not the delivery mechanism.

---

## §11 — Severability, and what scope is worth

**§7.2 of the parent stands:** the M8 gate is satisfied by notifications core, which is built.
**Chat is wanted, not needed.**

**What that bought in this spec, recorded so the reasoning survives:**

- **Two threads (ND-19) was not trimmed**, because it is the difference between chat working
  for subs and chat being crew-only. It came from the interview, not from ambition.
- **Photo reference (ND-22) was not trimmed**, because it is 50% of the real cases Josh gave
  and it is a _reference_, not an upload — the cheap half of the feature.
- **Offline was trimmed to nothing (ND-24)** and that is the largest saving in the spec.
- **Invite was trimmed to nothing (ND-21)** by asking one more question rather than building
  a membership table.

**The honest risk, stated once:** §2.4. Chat's delivery guarantee depends on humans typing `@`,
and Josh's mitigation is enforcement. If adoption fails, it will fail there, and the fix is
**not** more notifications — Q12 already ruled that out.

---

## §12 — Suggested build order

**Not a ruling. Each slice ends at a stop-point.**

0. **Notification expiry** (ND-41) — `/api/cron/notification-expiry`, its `vercel.json` slot,
   and A-C43…A-C45. **Notifications-core work, not chat** (§9.4). Independent of every chat
   table, so it can land first and unblocks A-C23. **Stop.**
1. **Schema** — `chat_threads`, `chat_messages`, `chat_message_mentions`, `chat_reads`.
   **RLS includes §S1's divergence** — ND-29 is reversed (§2.5), so the sub thread's
   read-wide/write-narrow split is built here, following `inspections`/`phases`/`tasks` and
   `punch_list_items_select_visible`. Every table carries `company_id`; the DELETE posture is
   §4.5a's. **Plus the `email_types` row for `mention`** (ND-42) — `email_logs` has an FK to
   that registry, so the row must exist before any mention email can be logged.
   `chat_message_photos` stays in **slice 6** with ND-22, since its FK and CASCADE (ND-28) are
   only exercised there. Rebuild-test first, RLS probes under the impersonation
   harness (failing-then-passing evidence, never as postgres). **Stop.**
2. **`lib/` core** — thread resolution, send, mention parse, `notify()` call. Both surfaces
   consume it (A-C16). **Stop.**
3. **Desktop chat** — crew thread only. Walk 3a-1 and 3a-2 against a real Bishop job. **Stop.**
4. **Sub thread** — both surfaces, §5.2's divergence (including the crew thread's
   subcontractor exclusion), the banner, **and the ND-42 mention email** — its `email_types`
   row lands with the schema in slice 1, its send path here with the audience that needs it. ✅ **BACK IN v1 [S125] —
   ND-29 reversed (§2.5).** _Superseded, quoted not rewritten: "CUT FROM v1 (ND-29) … revisit
   when real subcontractors have logins."_ The RLS half lands in slice 1; this slice is the UI
   and the banner. **Note the fixture reality: one sub with a profile, on two test projects**
   (§5.3) — that is enough to test against and is not enough to demo.
5. **Mobile chat** — panel shape, entered from the **bottom-bar Chat slot** (ND-36, ND-37).
   **Unblocked at S124b.** This slice also carries the M6M edits in §14 — the bar swap, the
   seventh tile, and the four rewritten criteria — because the bar changes here or nowhere.
   **Stop.**
6. **Photo reference** (ND-22, ND-28) — includes the picker, which is **new work**; no
   reusable gallery picker exists. **Stop.**
7. **Transport** — **ND-26 is RULED (S124c): 12-second polling while open.** No longer gated.
   In practice this is not a slice of its own — the poll belongs in **slice 2's service
   function**, and A-C39/A-C40/A-C41 are asserted there. **Kept as a numbered entry only so the
   Realtime swap has somewhere to live if the bill ever calls for it (§9.1c).**

**v1 = slices 0 through 6 plus the desktop panel (ND-33).** Nothing is deferred: ND-29 is
reversed, and slice 7 is absorbed into slice 2's service function.

**§S blocks are filled by CC from live reads at the start of the slice that needs them**, not
in advance and not by this document.

---

## §13 — Open questions: CLOSED at S124b

**All four are ruled.** Recorded with their answers rather than deleted, so the reasoning
survives the way the parent's superseded text does.

1. ~~**Push truncation length.**~~ **140 characters of body** (ND-31). Confirmed on the
   reasoning that the constraint is display, not payload. §6.3.
2. ~~**Mobile entry point.**~~ **Chat takes a bottom-bar slot; Daily Logs moves to the
   hamburger** (ND-36). The bar stays at five, D-3's "no destination appears in both" holds
   because Logs leaves as Chat arrives, and the cost — one extra tap to *review* logs, with the
   *capture* path untouched — is stated in §7.1d-i. **Four M6M criteria are rewritten, not
   satisfied:** A-3b, A-41, A-42 and A-1c. §7.1d.
3. ~~**Switcher project list.**~~ **Active projects, ordered by most recent message** (ND-34),
   with archived threads reachable through the tab. §7.1a-i.
4. ~~**History page size.**~~ **50 in the tab, 25 in a panel** (ND-38), sized so the first
   scroll never lands on a loader on the surface it is for. §7.2a.

5. ~~**ND-26 — transport.**~~ **RULED at S124c: polling, 12 seconds, while a thread is open**
   (§9.1). Realtime rejected with reasons rather than merely not-chosen, the reversal path
   documented with its trigger, and the two rules that are spec-level rather than build detail
   written down: **polling stops when the thread is not open**, and **the poll asks for
   messages since the last one it has**.

**NOTHING IN THIS SPEC IS AWAITING A RULING.**

**S125 closed four**, raised by the audit rather than by the interview: mention storage
(ND-39), where a mobile mention lands (ND-40), the ND-29 reversal (§2.5), and notification
expiry (ND-41).

**S125b closed the fifth — ND-30, the mention email (ND-42)** — which S125 had left as a
recorded *partial breach of ND-15*. It was not a change of mind: **Ruling 3 falsified the
deferral's justification**, and a spec carrying a knowingly half-built parent rule is not a
finished spec. §9.3 records the one item that remains, which is a cost signal to watch rather
than a decision.

---

## §14 — What this spec now owes M6M

Chat cannot ship without editing `M6M-mobile-pwa-spec.md`, and this is the list, so it is not
discovered mid-slice:

| M6M item | Change |
| --- | --- |
| **A-3** | ⚠️ **THE WORST OMISSION, found by the S125 audit.** `M6M:4356` reads *"The hamburger sheet contains **no** tile for Projects, Timeclock, **Logs**, or Field."* Moving Logs **into** the sheet makes this **false by design** — not an off-by-one, a direct inversion. Remove Logs from the no-tile list. |
| **D-3** | Bar contents amended: `Projects · Timeclock · [camera] · Chat · Field`. Still five, still "no destination appears in both". |
| **A-3b** | Six named tiles → **seven**, naming Logs. |
| **A-41** | Six-route walk → **seven**, adding `/m/logs`. |
| **A-42** | "all six routes" → **seven**. |
| **A-1c** | Add the Chat slot's rule: lit while the overlay is open, never by the route underneath. |
| **A-42b** | `M6M:4636` — *"**All six** carry the hamburger, not a back chevron."* Six → **seven**. The same off-by-one as A-42; §14 previously cited D-39 (the ruling) but not the criterion enforcing it. |
| **D-39** | Behaviour inherited — `/m/logs` keeps the hamburger. **But the row's own title reads "App bar on the six destinations" and becomes seven.** Previously marked "inherited, not changed"; the title is a change. |
| **D-4** | Gains a **named exception** (ND-32): the chat message list renders as bubbles. |

**Nine items, not seven** — A-3 and A-42b were missing until the S125 audit, and A-3 is the one
that fails immediately rather than subtly.

**These are edits to another spec and are deliberately not made here.** They belong in the M6M
document, in the same commit as the slice that changes the bar.
