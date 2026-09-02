# context102 — session record

> **Session date:** 2026-09-01. **Branch at close:** `feature/register-batch2` (pushed).
> **`main` at close:** `38b9c5a`, pushed, deployed.
> ⚠️ **A CC session is still running unattended when this was written.** See §6.

---

## §1 — WHAT SHIPPED THIS SESSION

| Landed on `main` | What |
| --- | --- |
| `0d3ee17` | ⚠️ **The auth email hook fix — every auth email on production was broken.** Supabase posts `{ user, email_data }`; the route validated for `{ record, email_data }`. **Invites, password reset, email confirmation, magic link — all failing.** Surfaced as *"Invalid payload sent to hook"* on a real invite to a real employee. **The validator now accepts both shapes.** |
| `b0f0517` | **Self-service name edit** — a personal account page for every role, name only, guarded by `profiles_update_self` + `enforce_profiles_self_column_scope`. ⚠️ **The trigger is the safety: the policy alone would admit a role change.** `s177` proves each forbidden column RAISEs, including the "name AND role in one update" smuggle. |
| `9692038` | **Shared Supabase client per request** — `createClient()` was building ~28 clients per render, each standing up a GoTrue instance contending on a process lock. Now memoized via React `cache()`. ⚠️ **A test fails if a client is ever reused across two callers, proven red against an injected singleton.** |
| `0b63de5` | Layout fetches reordered to start concurrently. **Within noise; kept as correct and free.** |
| `25fa4d5` | ⚠️ **The dev-mode latency rule**, in `CLAUDE.md` and `GATED.md`. See §3. |
| `82a3d75` | **TECH_DEBT split from owed work** — only `#155` and `#156` are debt. Plus the DMARC supersession. |
| `1ec69aa` | **The chat-mention fixture fix** — an eighth casualty of the rename. |
| `38b9c5a` | ⚠️ **Billing → Settings**, the `display_name` sync trigger, K8 token consolidation, V1 grep widening, the branch audit. **28 commits from five sessions, audited before merge.** |

**Migrations to production this session:** `20261090000000` (payment_method_on_file) ·
`20261100000000` (display_name sync trigger + backfill).

---

## §2 — ⚠️ THE FINDINGS THAT MATTER MORE THAN THE FIXES

### 2.1 — Four sessions chased a latency problem that did not exist
**`/dashboard/projects` "taking 11 seconds" was `next dev` compiling 3,111 modules on first hit.**
**Production is 337ms cold, 231ms warm.**

**The four suspects, three of which looked structurally damning and were not the cost:**
| Suspect | Measured |
| --- | --- |
| `getDashboardData`'s 28 sequential awaits | **~50ms** |
| `getMyMember`'s nine-table `!inner` join | **1.5ms of SQL** — the apparent 4.5s was HTTP round-trip |
| `createClient()` per call | ✅ **real, fixed** — the one genuine win |
| **Dev-mode compilation** | ✅ **the actual answer** |

⚠️ **A near-miss worth keeping:** one session's round-trip reconstruction (~285 calls × ~38ms)
**coincidentally reproduced ~11s and read as confirmation.** **That is a measurement of a MODEL of the
page, not the page.** It caught itself.

### 2.2 — The test harness had been sending real email
**423 real Resend sends since July 14, ~368 into Josh's inbox, 51 hard bounces to a reserved TLD** —
from a domain then 24 days old. **`sendEmail()` had no environment guard, and a live key sat in the test
env via a personal Codespaces secret that returns after every rebuild.**

**A send gate now refuses before `getResend()`.** ⚠️ **Verified by measurement: ~430 real sends all dated
on or before the day the gate shipped; zero since.**

⚠️ **"Fixed" and "recovered" are different milestones.** Reputation returns over weeks of clean sending.

### 2.3 — Gmail spam-filtering is not an auth problem
**SPF, DKIM and DMARC all pass.** The cause is the volume above, on a young domain, plus **no
`List-Unsubscribe` header.** ⚠️ **Ruled: unsubscribe on three recurring types only. The retention
warnings get NONE** — an honoured opt-out converts *"we warned you three times"* into *"you told us not
to warn you."*

### 2.4 — The fixture rename cost eight casualties
`Bishop Contracting` → **`Sabal Point Construction`**, owner `Josh Bishop` → **`Dave Whitfield`**.
⚠️ **The original sweep searched only `apps/web/`** — seven references survived, including one in
`seed-test-identities.mjs` that would have broken the next `npm run seed`.
⚠️ **An eighth surfaced later: `@Josh` as a NAME LITERAL in a test body** — the sweep fixed name-column
lookups, not strings. **The company SLUG stays `bishop-contracting` deliberately** — it preserves the
email From-address and the `s136` slug test.

### 2.5 — A shadow migration reached rebuild-test with no file in the repo
**And a real committed migration was missing from its ledger.** ⚠️ **Both invisible until a routine
`db push` failed.** **The lesson: `db push` compares VERSIONS, never OBJECTS.** Recorded at
`docs/incidents/rebuild-test-out-of-band-sql.md`.

---

## §3 — STANDING RULES ADDED THIS SESSION

⚠️ **Dev-mode first-hit page timings are NOT a latency signal.** Measure against production or a
production build. *(In `CLAUDE.md` under Known Codespaces Gotchas.)*

⚠️ **Read real exit statuses from the printed line, never a wrapper's echo.** **Twelve false greens
caught in this project; the most recent was in tooling** — a wrapper reported `exit 0` on a real exit
of 1.

⚠️ **`TECH_DEBT.md` is for what has been DECIDED to live with. It is not a backlog.** Owed work goes on
the register. **Only `#155` (custom composable roles) and `#156` (safety-incident fan-out) are debt.**

⚠️ **Filing is a step, not a sentence.** The register once claimed three items were filed when none
were.

---

## §4 — THE QUICKBOOKS CRITICAL PATH

> **screenshots → publish `/terms` + `/privacy` → Intuit sandbox keys → build 7G → Intuit review**

**Done:** the deletion sweep is live · seat limits 3/7/20 enforced · the legal documents are written,
reviewed, in the repo and rendering · the fixture renamed · card-at-signup shipped · the Stripe Prices
created and verified in test mode.

⚠️ **Blocked on:** **screenshots**, which are blocked on fixture data (§6).
⚠️ **And separately: Stripe is TEST MODE ONLY** — live mode needs a bank account, so **production
cannot take a payment.** **Josh has ruled this unchanged for now.**

---

## §5 — OPEN ITEMS AT CLOSE

**Ranked. See the next-session prompt for the plan.**

1. ⚠️ **Screenshots** — blocked on fixture data. **The only thing between here and Intuit.**
2. **`feature/sign-in-latency`** — PERF instrumentation, unmerged for days.
3. ⚠️ **The Resend webhook is built but NEVER REGISTERED** in the dashboard — so `delivered_at` and
   `bounced_at` stay null and **a bounced retention warning is invisible.**
4. **DMARC** — the RFC 7489 record was published at `worthprop.com` this session.
   ⚠️ **Closing evidence is a report LANDING, not the DNS edit.**
5. ⚠️ **The live Resend key still returns to the Codespace after every rebuild.** The gate protects us;
   the key does not.
6. **Four test tenants on production** — `Bishop Contracting`, `Bis Contracting`, `test const`,
   `H&H Signature Renovations` — beside the real `Worth Properties`. ⚠️ **The deletion sweep runs there
   daily.**
7. ⚠️ **The live app has never been clicked.** Forty screens, thirteen migrations, all trusted to a
   green battery.
8. **Estimate `Review & Send`** — raised this session, unrecorded. **No such tab exists; the builder has
   eight tabs and no summary step.**
9. **K8's 41 rewritten call sites** have had no visual check.
10. ⚠️ **`m-chat-send-route`'s fix is unverified** — committed, awaiting a CI Playwright verdict.

---

## §6 — ⚠️ WHAT CC IS DOING RIGHT NOW

**Running unattended on `feature/register-batch2`.** Prompt: `cc-batch2-finish-prompt.md`.

**Two items:**
1. **K7 row tints** — ⚠️ **tint needs-attention rows on `14a` ONLY.** **`14d` subs is SKIPPED** —
   tinting from either insurance store would pick a side in a dual-store question §8.4 ruled
   **LEAVE AS IS.**
2. ⚠️ **The screenshot blockers** — Expenses shows `hd`/`asdf`/`test`/`p` as suppliers with **$0.00
   spend**; the dashboard crew schedule is **completely empty.** **Both must look like a real
   contractor's data.**

**Already committed on that branch:** K11's purge retry-on-timeout · L4's four permanent cuts marked
⛔ WILL NOT BUILD · a register reconciliation · the battery log.

⚠️ **The live RLS and Playwright suites are OWED** — the previous session's battery got as far as
type-check 5/5, lint clean, unit 1021/1021 and a cold build, then ended.

⚠️ **Verify its work before merging.** **Two items the register called outstanding turned out already
built** — K2's compliance CHECK and L3's six dialog e2e.