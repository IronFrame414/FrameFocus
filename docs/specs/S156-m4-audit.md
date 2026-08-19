# Module 4 — Sales & Estimating — system audit, pass 4 of 11 — **S156**

> **Read-only audit. No application code, service or schema was changed.** This pass committed
> `apps/web/test/s156-m4-audit.live.ts` and this document.
> **Date:** 2026-08-18. **Branch:** `feature/s155-m3-m4-audit`. **Base:** `main` @ `2c36759`.
>
> Structure and standing rules: `docs/specs/SYSTEM-AUDIT.md` §0.
>
> **[LIVE]** = read from `framefocus-rebuild-test`. **[REPO]** = files at the base commit.
> **[UNVERIFIED]** = could not check; not asserted.

---

## §0 — What makes M4 different, and one thing that has to be said first

M4 owns **the only unauthenticated write path in the platform**. `/sign/[token]` lets someone with
no account, no session and no role change the state of a legal instrument. Everything else in this
system is gated by `auth.uid()`; this is gated by a UUID in an email.

**And M4 is the first module audited whose service-layer writers are correct.** M1 shipped 1 of 8
guarded, M2 0 of 3, M3 0 of 4. **M4 is 6 of 6** — see M4-04, which was written to assert a defect
and found the opposite. That is worth stating plainly, because four passes of the same finding could
otherwise read as a platform-wide indictment. It is not; it is three modules and one counter-example.

**What is wrong here is narrower and sharper:** one route still carries a defect a sibling had fixed,
and one compare-and-swap does not read its own result.

---

## §0a — STATUS AFTER S157 — every finding closed out

> **This audit was written findings-only. S157 is the fix pass.** **Original text is left intact
> below**, per the `53c7353` lesson: close a record, never delete it.

| # | S156 severity | S157 outcome | Commit |
| --- | --- | --- | --- |
| **M4-01** | REACHABLE | ✅ **FIXED, and the sweep found four more** — zero bare `sendEmail` sites remain | `961437a` |
| **M4-02** | REACHABLE | ✅ **FIXED** — the CAS is read; the loser is told success and stops | `961437a` |
| **M4-03** | LATENT | ✅ **FIXED WITH IT** — all **four** CAS sites, not one | `961437a` |
| **M4-04** | LATENT | ✅ **DONE** — six writers import the shared guard, and four error strings corrected | `3a05fa4` |
| **M4-05** | REACHABLE | ✅ **FIXED** — `s150` given a teardown, and the residue itself cleared | `3eab640` |

### §0b — the M4-01 sweep, in full

The finding existed because S150 fixed one file when the pattern spanned several, so the fix pass
checked **all fourteen** `sendEmail` call sites. **Five were bare. All five are wrapped.**

| Site | Mints a token? | Was |
| --- | --- | --- |
| `api/proposals/resend/route.ts` | **YES** | the finding |
| `lib/services/signing-service.ts` `notifyManagers` | no | bare, **inside a loop** |
| `lib/services/co-signing-service.ts` `notifyCoSigned` | no | bare, **inside a loop** |
| `lib/services/co-signing-service.ts` `notifyCoDeclined` | no | bare, **inside a loop** |
| `api/cron/co-reminders/route.ts` | no | bare, **inside a loop** |

**Why the four notification sites were fixed without waiting for the ruling the audit asked for.**
The audit was right that "should a failed notification fail the operation that triggered it" needs
a decision — **and these functions had already made it.** Each returns `void` and each already has a
`logEmail` call with a `status: 'failed'` + `metadata.error` branch for a **returned** error. Only a
**throw** bypassed that branch, aborting the loop partway so some recipients were notified, some
were not, and **no record existed of which** — because the per-recipient `logEmail` never ran for
the rest. Folding the throw into the same `error` variable makes the code do what it was written to
do. **It does not decide the deeper question**, which stays open: if Josh wants a failed
notification to fail the signature, that is a separate change and a real ruling.

### §0c — M4-02/03: what the loser is told

`.select('id')` on all four compare-and-swaps, through `applied()`. **The loser returns
`{ success: true }`**, deliberately — the client *did* sign, and `DISCARDED` would be a different
lie. What it must not do is re-point the estimate at its own PDF or send a duplicate notification,
so it returns before both.

All four together — `completeSignature`, `declineEstimate`, `completeCoSignature`, `declineCo` —
because M4-03 was filed precisely so the fix would not be applied to one function and called done.

> **⚠️ Still [UNVERIFIED], and stated rather than implied.** The audit did not execute two
> concurrent completions end to end, and **neither did the fix pass.** What is proven live is the
> database half: `s157-m3-m4-fixes.live.ts` **D1** shows the winning CAS returning its row and **D2**
> shows the losing one returning **zero rows and no error** — exactly what the second request sees
> and exactly what the code used to discard. The service now reads that result. The full two-request
> race remains untested.

### §0d — M4-04 corrected an error-message rule as well

The six writers were already correct, so this was hygiene. But **four of them answered a zero-row
write with `'Estimate not found'`** — naming a cause nobody verified, since an empty result cannot
tell "the policy refused you" from "the row is gone". `DISCARDED` says both. The remaining
`'Estimate not found'` strings in that file are untouched **on purpose**: they guard a FETCH that
really did come back empty, where the cause *is* verified.

`s156-m4-audit.live.ts` **F4c** — the structural guard that goes red if a new writer skips the row
count — was **widened, not inverted**: it now recognises `applied(` alongside the hand-rolled
spelling, and lists it first as the form new code should use.

---

## §1 — Findings, most severe first

---

### **M4-01 — `proposals/resend` mints a signing token, then sends bare. The §3.2 defect S150 fixed in `send` is still live one file over.** — REACHABLE (on a misconfiguration)

**What it is [REPO].** S150 fixed `api/proposals/send/route.ts`, and its comment states the defect
exactly:

> *"`sendEmail` calls `getResend()` … which throws when `RESEND_API_KEY` is unset. This call was
> BARE. The throw escaped POST before `logEmail` and before the `if (sendError)` branch that
> invalidates the session — and the session was already created. Net effect: **a LIVE SIGNING TOKEN
> for an email that was never sent.**"*

**`api/proposals/resend/route.ts:155` is still bare.** The sequence:

| line | what happens |
| --- | --- |
| `:103` | `invalidateSessionsForEstimate()` — **the client's existing link is killed** |
| `:106` | `createSigningSession()` — **a new live token is written** |
| `:155` | `await sendEmail({...})` — **bare. `getResend()` throws here if the key is unset** |
| `:177` | `logEmail()` — never reached |
| `:191` | `invalidateSessionsForEstimate()` on send failure — **never reached** |

**Worse than the defect S150 fixed**, because `resend` invalidates first: the failure leaves the
estimate with **no working link for the client AND an undelivered live token in the database.** The
user sees a 500; the link state has silently changed underneath them.

**Evidence** — `s156-m4-audit.live.ts` **F1**. F1a pins the structural difference (send is wrapped,
resend is not) and that the mint precedes the send. **F1b proves the consequence against the
database**: a session in exactly that state is `pending`, unexpired, and `getActiveSessionByToken()`
— the function every `/sign` route trusts — hands it straight back. F1c pins the invalidate-first
ordering.

> ⚠️ **Two probes in F1 are source-shape assertions, and that is a limitation, not a preference.**
> The defect only fires when `RESEND_API_KEY` is unset, which cannot be arranged against a running
> route from a harness. The mechanism (`getResend()` throws at `email-service.ts:57`) and the
> consequence (F1b) are both proven; the *conjunction* is read from source.

**Three other bare `sendEmail` call sites [REPO]**, found by sweeping all fourteen:

| Site | Mints a token first? | Severity |
| --- | --- | --- |
| `api/proposals/resend/route.ts` | **YES** | this finding |
| `lib/services/signing-service.ts:117` | no — manager notification after a signature | a throw aborts the notify loop mid-list |
| `lib/services/co-signing-service.ts:371, :433` | no — post-signature notifications | same |
| `api/cron/co-reminders/route.ts:119` | no — re-sends an existing session | a throw aborts the remaining reminders |

**Proposed fix.** Wrap `resend`'s call in the same try/catch `send` uses — the comment there says it
was *"copied from the CO route … which has always had this right"*, so the pattern is already
settled and this is the third copy of it. **Unambiguous; no ruling needed.**

**⚠️ The three notification sites are a different question and should be decided, not swept in.** A
throw there aborts a loop partway, so some recipients are notified and some are not, with no record
of which. Fixing them means deciding whether a failed notification should fail the operation that
triggered it. **That needs a ruling; the resend fix does not.**

---

### **M4-02 — the signature-completion compare-and-swap never reads its result** — REACHABLE (needs concurrency, and a double-click is enough)

**What it is [REPO, `signing-service.ts:198-221`].** `completeSignature()` ends its session update
with a correct compare-and-swap:

```ts
.eq('id', session.id)
.eq('status', 'pending');
if (sessionError) return { success: false, error: sessionError.message };
```

**A CAS is the one construct where zero affected rows is the expected losing outcome** — it is not
an error, and PostgREST reports none. The code checks only `sessionError` and then proceeds
unconditionally to:

- `UPDATE estimates SET status='accepted', signed_proposal_file_id = fileId` — **the loser's file id
  overwrites the winner's**, and
- `notifyManagers(...)` — **a second "Proposal signed" email to every manager.**

**Why a double-click is enough, rather than needing real contention.** Both requests pass
`getActiveSessionByToken()` (still pending) and both read `estimate.status === 'sent'`. Then **both
generate and composite a PDF and store it** — seconds of work — before either reaches the CAS. The
race window is not milliseconds wide; it is as wide as PDF generation.

**Evidence** — **F2a** proves the losing CAS is silent (zero rows, `error: null`); **F2b** proves a
winning one is not, so F2a is not vacuous; **F2c** pins that the source still does not `.select()`
the result.

> **Not fully executed:** I did not run two concurrent `completeSignature()` calls end to end. The
> database half is proven and the code path is read; **the race itself is [UNVERIFIED].** Stated
> rather than implied.

**Partial mitigation that already exists:** the `estimate.status !== 'sent'` check at the top means a
**sequential** second submit is refused. It is only the concurrent one that gets through.

**Proposed fix.** `.select('id')` on the CAS and treat zero rows as "someone else completed this" —
returning success (the signature *is* recorded) but **skipping** the estimate update and the
notification. **Not** a generic `DISCARDED` failure: the client did sign, and telling them it failed
would be a different lie. **Needs a one-line ruling on which answer the loser gets.**

---

### **M4-03 — the same CAS-shaped gap exists on decline and on the CO signing path** — LATENT

`declineEstimate()` (`signing-service.ts:252`) and the `co-signing-service.ts` equivalents follow the
same shape. **[UNVERIFIED in detail]** — I read `completeSignature()` closely and confirmed the
pattern's presence in the siblings, but did not trace each one's post-CAS behaviour.

Recorded so M4-02's fix is not applied to one function and called done. **Whoever fixes M4-02 must
sweep the other three.**

---

### **M4-04 — M4's writers are CORRECT, and they duplicate the check rather than importing it** — LATENT (hygiene)

**⚠️ This finding was written to assert a defect and found the opposite. Twice.**

The hypothesis was M1-01's shape, fifth module. The first probe pointed at a **converted** estimate
and got `success: false` — from the service's own freeze check, nothing to do with RLS. Re-pointed
at the one **draft** estimate, it was still refused. The reason:

**All six UPDATE-shaped writers in `estimates-client.ts` end `.select('id')` and read
`data.length`** [REPO, verified per function]: `updateEstimate`, `softDeleteEstimate`, `markAsSent`,
`submitForReview`, `approveAndSend`, `updateReminderSchedule`.

**M4 is the first module audited that got this right.** M1: 1 of 8. M2: 0 of 3. M3: 0 of 4. **M4: 6
of 6.**

**What remains is hygiene, not robustness.** They hand-roll the check with their own message strings
rather than importing `applied()`/`DISCARDED` from `mutation-result.ts` — which only came into
existence at S154, after this code was written. So this is not a miss; it is code that predates the
helper.

**Proposed fix.** Route the six through the shared pair when the file is next touched. **Low
priority — and explicitly NOT urgent**, because the behaviour is already correct. Filed so the
duplication is not mistaken for the defect the other three modules had.

**And the estimates policies are the tightest audited so far [LIVE]:** SELECT is owner/admin **or a
PM who authored it**; UPDATE adds **`AND status = 'draft'`** for the PM. A crew member cannot read
an estimate at all.

---

### **M4-05 — a live harness left `include_client_contract = true` on a real estimate** — REACHABLE (fixture hygiene)

**[LIVE]** `EST-100` (`a9aaeffa…`, status `converted`) carries `include_client_contract = true`. The
only writer is `s150-e1-contract-decoupling.live.ts`, which sets it to exercise R16 and **does not
reset it**.

**Not a product defect**, and small — but it is exactly the residue that makes a later "the toggle is
off everywhere" assumption false, and it was found by an assertion that made that assumption. The
repo has been bitten by fixture leakage twice already this audit series (`#144`, and S151's seven
leaked projects).

**Proposed fix.** Restore the flag in that harness's teardown. **Unambiguous.**

---

## §2 — Checked and found sound

| # | Checked | Result |
| --- | --- | --- |
| **V1** | `convert_estimate_to_project` — **redefined six times**, most recently by E1 | **Live body is byte-identical to `20261002000000`'s** [LIVE, md5 `13b0a5a4…`]. **No drift.** This is the S143 defect class and it is clean. |
| **V2** | 7I stage 1 half-wiring | **`clientContractAppliesToEstimate()` has ZERO callers under `app/`** — only its definition and the S146 harness [REPO]. Criterion 1 ("toggle off ⇒ byte-identical") holds structurally. Asserted by V1 in the harness. |
| **V3** | 7I's columns on `estimates` | All nine present with safe defaults; `include_client_contract` is `NOT NULL DEFAULT false` [LIVE]. Nothing half-built. |
| **V4** | Token validity | `getActiveSessionByToken()` refuses **expired**, **completed**, **declined**, **invalidated** and **unknown** tokens — all five asserted (F3a–F3c). One function, one gate, correct. |
| **V5** | `signing_sessions` policies | **ONE policy: SELECT for owner/admin** [LIVE]. No INSERT/UPDATE/DELETE, so every write is service-role and the token is the capability. Crew can neither read a token nor change a session (F3d). This is the signing-table pattern and it is right — **do not "fix" the missing policies.** |
| **V6** | Token entropy | `randomUUID()` from `node:crypto` — v4, 122 bits, CSPRNG [REPO]. |
| **V7** | The estimate freeze check | `updateEstimate()` refuses any estimate not in `draft`, ahead of RLS — and RLS carries the same clause for a PM. A sent or converted estimate cannot be edited underneath a signature. Asserted by V2 in the harness. |
| **V8** | Estimate read scoping | `estimates_select_authenticated` is owner/admin **or PM-who-authored** [LIVE]. Foreman, crew, subcontractor and client get nothing — tighter than most tables audited. |

---

## §3 — What I could NOT verify

1. **The `resend` throw end to end.** `RESEND_API_KEY` cannot be unset against a running route from
   a harness. Mechanism and consequence are each proven; their conjunction is read from source.
2. **The M4-02 race, executed.** The database half is proven; two genuinely concurrent
   `completeSignature()` calls were not run.
3. **M4-03's siblings in detail** — `declineEstimate` and the two CO paths. Pattern presence
   confirmed, post-CAS behaviour not traced.
4. **Page-load and render times.** Not measured, not estimated.
5. **Production.** Not linked.
6. **The `/sign/[token]` page itself** — rate limiting, brute-force resistance, and whether a token
   appears in any log or referrer. **A 122-bit token is not brute-forceable, but I did not check
   for rate limiting or for token leakage via `Referer` on outbound links from the signing page.**
   That is a real gap and belongs to whoever next touches that surface.
7. **PDF generation and compositing** (`generateProposalPDF`, `compositeSignedPDF`). Not audited;
   they are the slow part of the M4-02 window and were treated as opaque.
8. **`estimate_files` (0 rows) and `signing_sessions` (0 rows before this pass).** The first was not
   probed — any assertion would have passed vacuously.

---

## §4 — Grouped for ruling

Five findings, **three decisions**.

| Group | Findings | Decision needed |
| --- | --- | --- |
| **A — the bare send** | **M4-01**, and the three notification sites it uncovered | The `resend` fix is unambiguous and matches a pattern used twice already. **The ruling is on the other three**: should a failed notification fail the operation that triggered it, or be swallowed with a record? Today it aborts a loop partway with neither. |
| **B — the compare-and-swap** | **M4-02**, **M4-03** | One ruling, four functions. Row-count the CAS, and **decide what the loser is told** — the signature was recorded, so a generic failure would be its own lie. Recommend: success, skip the estimate update and the notification. |
| **C — hygiene** | **M4-04**, **M4-05** | No ruling needed. Route six writers through the shared helper when the file is next touched, and reset a flag in one harness's teardown. |

---

## §5 — Provenance

- **[LIVE]** at S156 via `scripts/live-sql.mjs` (`pg_proc` incl. a byte-comparison of
  `convert_estimate_to_project` against its migration, `pg_policies`, `information_schema`) and real
  user sessions in `apps/web/test/s156-m4-audit.live.ts` (15/15, fixtures created and swept).
- **[REPO]** at `2c36759`: `signing-service.ts`, `co-signing-service.ts`, `estimates-client.ts`,
  `api/proposals/send|resend/route.ts`, `api/cron/co-reminders/route.ts`, `email-service.ts`.
