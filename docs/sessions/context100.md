# Context 100 — chat, two security rulings, the trial lifecycle, and Module 7 to schema-complete

One very long session, S124 through S149. Roughly twenty-five migrations to production, all
attended. `main` at `59812f4`; production schema current through `20260930000000`.

The through-line: **almost every finding of consequence came from running something, not reading
it.** Two live production exposures, six leaking test harnesses, a service that reported success
over a discarded write, and a test that survived the mutation designed to catch it — none of them
were visible in the source.

---

## 1. Project chat — the last unbuilt leg of Notifications

Chat had been ruled in scope at S89 and **described rather than interviewed**. `§3a` and `§10.5`
of `notifications-architecture.md` were eleven bullets of rulings with no workflow trace behind
them, and chat had **zero footprint** across ~300 commits.

The interview (S124) produced what the spec did not have. The real job is **request capture, not
coordination** — both real cases Josh gave were crew → Josh material shortages, incomplete on
first contact. Trim, by text, no group. Paint, in person, then a round-trip for quantity and type.
Where the record lives six months later: _"nowhere."_ How often a request is lost:
_"countless times."_

### What the interview produced that the ruling set didn't have

- **Two threads per project** (ND-19), not one with a permission layer. Subs must not see crew
  conversation; crew **must** read sub conversation.
- **Invite disappeared** (ND-21) — it was a permission problem solved by geometry. Once the sub
  thread is separate, assignment is membership.
- **Photo reference, not upload** (ND-22) — composer attach opens the gallery picker.
- **Offline fails visibly** (ND-24), deliberately diverging from M6M's queue: _a queued message is
  a message whose author believes it was sent._
- **STATE.md:514 dissolved, not resolved.** Clients type into nothing, so internal chat and client
  messaging were never one transport decision.

### The R6 risk, accepted rather than solved

Plain messages notify nobody; only `@mention` does. So `need more trim` untagged is **quieter than
the text it replaces.** Josh closed that with enforcement, not a feature — recorded as a stated
risk so a later reader does not "fix" it.

### Built across six slices

Schema → `lib/` core → desktop crew thread → sub thread + the ND-30 mention email → mobile → photo
reference. Plus ND-41's notification-expiry cron, which R2 had described and nobody had built.

### The findings

- **`is_assigned_to_project()` is role-blind.** A bare EXISTS on `project_assignments.member_id`,
  no role test — and subs are in `project_assignments`. So an assigned subcontractor **passes
  `can_view_project()`**, and a crew thread gated on it alone is readable by the one role §5.2
  marks ❌ never. Caught only because the spec stated an absolute in a table beside the mechanism
  that broke it.
- **The counterfactual that proved nothing.** The first attempt evaluated the naive predicate
  _inside_ a query against `chat_threads`, whose RLS had already filtered the rows. It returned 0
  and 0, which reads as agreement. **A counterfactual run under the policy it is trying to bypass
  is not a counterfactual.**
- **`markThreadRead()` wrote a client clock against a server clock.** Unread is
  `created_at > last_read_at`; when the client runs fast the badge silently never lights again.
  Three wrong diagnostic turns before the RPC settled it.
- **Every mobile mention notification pointed at a 404.** `links.ts` resolved to
  `/m/p/{id}/chat`, a route ND-37 forbids. **The ruling was recorded in the spec and the code
  never followed.**
- **A caret bug produced `con it — @caseyan you count what is left?`** and every mention assertion
  was green, because none of them typed after picking a name.

---

## 2. Two security rulings — dashboard access and roster visibility

Chat's audit exposed something bigger. `DASHBOARD_ROLES` excludes `subcontractor` and `client`,
and **no code consulted it.** Measured with real JWTs on the anon key: a subcontractor and a client
each read the company's full contacts list, sub roster and team roster — **6/4/7 rows, identical to
the owner's.** Not an empty shell.

**Ruling A** — enforced. Subs → `/m/projects`. Clients → a placeholder Module 9 replaces. The
Pre-M9 gate stays untouched; a placeholder is not a portal.

**Ruling B** — the roster floored, and later narrowed: Owner and Admin visible company-wide, **PM
only where they share a project**, own row always (94 direct `profiles` reads depend on it).

**The consequence nobody predicted:** flooring `profiles` blanked the author name on another
subcontractor's chat message — the #129 silent-loss shape. Resolved by decorating names through
the service-role path, following the mention picker's existing separation: _working out who may be
mentioned is not the same act as reading the thread._ The same defect then turned up on punch —
**three joins, not one** — assignee, completer and verifier.

---

## 3. The invitation flow — four defects

Josh invited two real employees. Neither received an email.

- **There is no invite email.** The form renders a copyable link saying _"share this with
  {email}"_. No send call anywhere.
- **`handle_new_user()` fell through silently to the owner path.** An absent, expired or consumed
  token **provisions a whole tenant** — company, subscription, `trial_emails` row, seeded tags. No
  error. One of the two addresses had done exactly that four months earlier.
- **A repeated address burns trial eligibility**, which `trial_emails` records permanently.
- **No resend, no way to retrieve the link.**

**And the trigger on `auth.users` was not in version control.** The baseline is a `--schema public`
dump; the trigger lives in `auth`. It had been created by hand on production and **rebuild-test
never had it** — so every signup test ever run there tested nothing. Fixed with a name-independent
DO block, since production's trigger name was recorded nowhere.

### The email that still does not arrive

Resend reports Delivered; Gmail accepts and discards. Ruled out: missing DMARC (added), duplicate
DMARC (two `v=DMARC1` records, which receivers treat as no policy), the hex sender suffix (dropped
— and disproven, since Bishop's clean slug arrives and Worth's clean slug does not),
sending-vs-link domain mismatch (`NEXT_PUBLIC_APP_URL` matches). **Open. Postmaster Tools is
verifying.**

---

## 4. Trial lifecycle — specced, built, deliberately unscheduled

Interview-first, 35 questions and a 24-row register. The shape changed materially during the
interview: warnings at **−7 and −3 before expiry**, account **locked** at expiry, 14 days retained
and unreachable, deletion at day 14. **The export window is pre-expiry**, not the retention period.

- **Lock is session revocation**, not routing — chosen to avoid touching `get_my_company_id()`.
  Then measured: **a banned user's already-issued access token keeps working for up to an hour.**
  Sign-in and refresh die immediately; PostgREST never consults `banned_until`. So a lock guard was
  owed after all.
- **`unlockCompany()` had zero callers.** Written, never wired — and the lock cron _was_ scheduled.
  A trial would have expired, banned everyone for a year, and paying would have done nothing. The
  unlock rule ended up in **SQL**, because every comped account on production was a direct DB edit
  that fires no webhook.
- **Running the deletion job found the defect a review could not.** It destroyed every tenant row,
  storage object and auth user, then **returned `completed: 1` while leaving companies standing** —
  the parent delete's error was discarded.
- **The deletion cron is deliberately absent from `vercel.json`**, pending TL-24 with legal. The
  route file opens by saying so, and a probe fails if the string ever appears.

---

## 5. Module 7 — surveyed, then finished to schema-complete

The survey existed because **nobody knew what was built.** It found the answer was not what the
documents said.

- **7C recorded its compliance blocker as RESOLVED and nothing shipped.** `STATE.md` said `7C ✅`.
- **Gate 1's opening sentence was false** — three external surfaces had already shipped under it.
- **`project_budget_items` was never the gap it was recorded as.** Module 7 had already taken a
  position: sell is **derived** at billing time from `instrument_rates` and materialised only on
  `invoice_lines`. `project-income.ts` names storing-on-the-budget-line as the thing it refuses.
  GATED.md's M9-D1 needed **correcting, not resolving.**

Built: 7C's compliance half, 7H profitability, 7F client-outbound then sub-inbound, 7I's schema
and services, and 7G's complete schema.

### The live production hole

`invoice-builder.tsx` passed `hasPayment: false` **hardcoded**, with a comment saying _"7E owns
payments and is not built."_ 7E landed at S97. And underneath it, `invoices_update_authorized`
admits `project_manager` while nothing consults `client_payment_applications` — so **a PM could
void any invoice, paid or unpaid, by direct PostgREST call.** The hardcoded `false` was the display
half of a database hole.

Closed with `enforce_invoice_void_authority`, and the credit effect fell out of existing doctrine:
7E derives credit as `amount − Σ live applications`, so voiding just retires the applications.

### `#1-s146` — a service that lied

`voidContractDocument()` took `role` as a **parameter**, so a PM passing `'owner'` cleared the
check. RLS then matched zero rows — **not an error in Postgres** — and the function returned
`{success: true}` over a document still live. Fixed both halves, and the sweep found why both were
needed: `saveContractBoxMap`'s clear legitimately affects zero rows on first save, so a row count
alone would refuse the commonest case, while the role half alone missed nothing else. **The two
halves are not interchangeable.**

### 7G, and Intuit verified from Intuit

Cadence ruled **hourly** — ~694 companies on the free tier against 15-minute's ~173, and Builder
**blocks rather than throttles**. Confirmed from Intuit's own Partner Program Guide: 500,000
CorePlus/month, **aggregated per Workspace**, Core writes free and uncapped, **only 2xx calls
metered**, and webhooks carry a reference payload only — so a webhook costs a paid follow-up read.

Token store built on **Vault**: `service_role` holds SELECT on `decrypted_secrets` and
anon/authenticated hold nothing — correct by construction rather than by our care. Three wrapper
functions keep the schema unexposed. Three clocks encoded: access 1 hour, refresh 100-day rolling
and rotating every 24–26 hours, hard ceiling 5 years.

---

## 6. Test-infrastructure findings, which were larger than expected

**Rebuild-test held 111 companies. 109 were orphans.** 872 blocking templates went with them.

The mechanism, three times over: **7F's seed trigger fires on every company insert and creates 8
templates the FK will not cascade**, so every teardown written before `20260922000000` is a
candidate. And the deletes failed silently — one discarded its `.error` entirely, another pushed
the failure into a `console.log` that **Vitest suppresses for a passing file.**

> **A cleanup that cannot fail its own run is not a cleanup.**

Six harnesses leaked; only one asserted a company count, and it was the only one telling us. The
attribution by marker name turned out wrong in one place — `"My Company"` is `handle_new_user()`'s
default for any `createUser` without a name. And the clean counter-example: a harness passing
`invitation_token` leaks nothing. **The leak is not "creating a user" — it is "taking the owner
path."**

Now: 2 companies in, 2 out, across a full live suite.

### Other recurring shapes

- **`.limit(1)` with no `ORDER BY`** — three fixture failures. Heap order shifts when a row is
  updated, so they pass for four runs and then don't.
- **A test that had encoded a defect as expected behaviour**, citing its TECH_DEBT number as the
  reason. Fixing the defect turned it red.
- **A mutation that stayed green.** An "OWNER cannot INSERT" test asserted
  `/row-level security|violates/i` — which `"duplicate key value violates unique constraint"` also
  matches. It was testing the unique index, and **survived a deliberately added INSERT policy.**
- **The background-task notification reported `exit 0` for six runs whose printed line said `1`**,
  across four sessions. Only the printed line is true.

---

## 7. FFNav — six sessions of deferral closed

Seven documents deferred to a reindex nobody had ever specified, with **three incompatible item
counts** — which turned out to be successive snapshots, each true when written.

Interviewed and ruled: eight ungrouped daily items with Notifications 8th, a **Reference** group of
four, an **Admin** group of two, Plex Mono labels. The index sweep everyone feared was **moot** —
active is pathname-based, and the only `active="6"` references are in a prototype nothing imports.

The `6B-1` vs `6a-ui-build-report` contradiction resolved as **both right**: "RESOLVED" had only
ever meant the order, never the grouping or the two items appended afterwards. A reader seeing that
word reasonably stopped looking, for six sessions.

---

## 8. Where things stand

**On production:** chat, both security rulings, the invitation fixes, the trial lifecycle (deletion
cron unscheduled), 7C compliance, 7H, 7F both directions, 7I schema and services, 7G's complete
schema, the FFNav reindex, and the invoice-void guard.

**Owed rulings:** TL-24 with legal (can invalidate the expiry ruling) · `#3-trial`, behind it ·
`#1-m7cpl` (foreman committed columns — the ruling was right and the code is behind it) ·
`#2-s147`'s residue.

**Unbuilt by choice:** 7I's UI · §6.5's tokenised sub e-signature (Gate 1) · 7G's OAuth route and
worker.

**Open and unresolved:** Gmail deliverability · push enrolment on a real device, which has never
been verified and which chat's entire delivery guarantee rests on.

**The rule this session earned, repeatedly:** a document asserting something the applied schema
contradicts has been found five times, twice from reading a baseline rather than the live state.
**The code wins, and say so.**
