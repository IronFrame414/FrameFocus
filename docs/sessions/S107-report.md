# S107 — session report

**Branch:** `feature/s107` (cut from `main` @ `ca562dc`)
**Started:** 2026-09-09
**Spec:** `docs/specs/S107-spec.md` — filled in place, not restructured.

Appended after every step. The report is only as durable as the last push.

---

## Phase 1 — analyze (read-only)

Started. No source writes, no migrations in this phase.

### Phase 1 complete — all FILLs measured

Every FILL in `docs/specs/S107-spec.md` is filled in place by measurement. Headlines:

**Part A**
- **FILL-A.3 — the spec's premise is STALE.** The `!navigator.onLine` weak-signal gap was
  already fixed by S105b (ASK-7.B), and the spec itself lists that fix two bullets earlier.
  Measured against the real `@supabase/supabase-js` 2.100.1 on a dead network: storage and
  PostgREST both **RESOLVE with `{error}`**, they do not throw — so the fallback runs.
  **The real unhandled rejection is the IndexedDB queue write** (`idb-storage.ts`, zero
  `try`), which leaves the "Saving…" spinner up forever with nothing on screen.
- **FILL-A.6 — held shots do NOT survive backgrounding.** Memory-only `useState`, deliberately
  (a project-less photo cannot legally be persisted, §7a). **The "nothing lost" ruling is not
  met**, and multi-shot turns one lost retake into a lost site visit. → ASK-A.2 gates the build.
- **FILL-A.4 — the clock wiring is half-verified.** The precedence *rule* has 7 passing pure
  tests; `getOpenClockProjectId()` (the actual DB read) is exercised by **nothing**.
- **New ASK-A.4** — the spec assumes a burst mechanism it never states, and a
  `capture="environment"` input returns one photo per shutter. Three candidate shapes.

**Part B**
- **FILL-B.1 — the email is NOT BUILT.** No sender, no template, no route, no
  `email_logs.email_type` value. This is bigger than "email is disabled".
- **FILL-B.0 — nothing disabled email; it is default-deny and was never on outside production.**
  The `EMAIL_SEND_ENABLED=true` override is sanctioned. **The obstacle is the missing live
  Resend key**, whose removal was remediation option 2 for the 423-send incident. → ASK-B.3.
- **The sub cannot download the PM's scope files** — the anonymous route is POST-only.
- **FILL-B.4 — `allowance_amount` is money on the anonymous page**, contradicting "the sub
  sees NO money". Reported, not reconciled. → ASK-B.4.
- **FILL-B.6 — the existing floor test never invokes the route**; its own header says so.
  The test to build asserts the admin client was **never called** on a denied read.

**Cross-cutting**
- **FILL-X.1 — one migration**: widen `email_logs_email_type_check`. Rebuild-test only.
- **FILL-X.0 — 3 figures confirmed, 3 corrected, 1 qualified.**

Phase 2 questions go to Josh next. **Build is gated** on ASK-A.2 (stop rule 6) and ASK-B.3.

### Phase 2 — six rulings recorded; spec audited and complete

**Rulings [Josh]:** B.3 → **B** (the live Resend key does NOT return to this box; the real
send is Josh's, against a four-check definition of "the email works"). B.4 → **A** (the
allowance stays; "no money" amended to mean totals/margin/cost, exception recorded permanently).
A.2 → **B** (held shots persist in an IndexedDB store outside the sync queue; cleanup rule
stated: 7-day TTL, swept at app start and after adoption, refuse-at-capacity never evict,
cap 25, always visible). A.4 → **B+C** (manual re-tap with a tray; `multiple` on the library
input). A.3 → **A+C at 25** (serial conversion, cap as backstop).

**Audit run. One self-correction worth recording:** audit row 5 was first written ✅ claiming
FILL-A.8's failure table existed. **It did not** — the verification script matched adjacent
text. Caught by re-checking the file directly rather than trusting the audit line. The table
is now written (seven modes) and the audit row records the miss.

**Audit result: 20/20 FILLs, 6/6 ASKs ruled, one measurement-vs-ruling conflict resolved by
amendment.** Two items carry stated blockers rather than answers (FILL-B.4's wire check and
FILL-0's deploy confirmation — both need env this box lacks). Audit item 11 (the route-floor
test) is open by design: it is Phase 3's first build item.

### Audit re-verification, and FILL-B.7 settled

**Re-verified every audit row by opening the file, not by re-running the script. Two rows were
wrong; the rest were true.**

| Row | Claim | Re-verified |
| --- | ----- | ----------- |
| 1 | Every FILL filled | ✅ true — all 20 have an answer block immediately after the marker |
| 2 | 6/6 ASKs ruled with the alternative each beat | ✅ true — A.2/A.3/A.4/B.3 carry an explicit `Beat:`; **B.4's alternatives are recorded inside the Q2 amendment**, not under a `Beat:` heading; A.1 was pre-ruled and its owed record is written |
| 3 | One contradiction, reported not reconciled | ✅ true — the Q2 amendment exists |
| 4 | FILL-A.6 answered, ASK-A.2 ruled with cleanup rule | ✅ true |
| 5 | FILL-A.8 table exists | ❌ **WAS FALSE** — already caught and corrected before this pass |
| 6 | FILL-B.1 exact: 8 pieces, 2 NOT BUILT | ✅ true — 8 rows, exactly 2 marked NOT BUILT |
| 8 | FILL-B.7 answered | ⚠️ **answered but WRONG on causation** — rewritten, see below |
| 9 | Payload has no money beyond the ruled exception | ⚠️ **conclusion true, FIGURE WRONG — the payload has 23 keys, not 21.** The two I had missed (`reply_exclusions`, `reply_holds_until`) are not money, so the conclusion stands. Corrected in all four places. |
| 10 | 7 figures, 3 confirmed / 3 corrected / 1 qualified | ✅ true — 7 table rows |
| 11 | Route-floor test not yet built | ✅ true by design — Phase 3 item 1 |

**FILL-B.7 — settled, and my earlier risk claim was overstated.** `dig`/`nslookup`/`host` are all
absent here; the first attempt exited 127 and its empty output read as "no DNS records exist".
Re-measured through node's resolver against 8.8.8.8/1.1.1.1:

- **DKIM** `resend._domainkey.ezcontractorbinder.com` present, **on the root domain, so it aligns
  with the `From:` domain.** **SPF** `v=spf1 include:amazonses.com ~all` on `send.`, with the SES
  feedback MX. **DMARC** `p=none`, `rua` → `josh@worthprop.com` (that is `#1-delsweep`, known).
  Root has no SPF of its own — acceptable, DMARC passes on DKIM alignment.
- **The 52 bounces were all ONE address, `qa-client-a@example.invalid`.** `.invalid` is an RFC 2606
  reserved TLD that does not resolve, so SES hard-bounced them internally — **no mail provider ever
  saw them, and Gmail's view of the domain is unaffected.** My earlier sentence claiming Gmail
  weighs those bounces was wrong and is corrected in place.
- ⚠️ **They are logged `sent` in `email_logs`, not `failed`** — the app never learns about a bounce,
  which is exactly why the send's own logs cannot prove delivery.
- **`JSBishop14@gmail.com` has already received 15 messages from this domain, last 2026-08-20.**

**So the end-to-end test can prove something.** Residual risk is spam-foldering of a per-company
`From:` slug, so ASK-B.3's check 4 is sharpened: **Josh reports which folder**, not just arrival.

Read on rebuild-test (`nmyphyhmfttxkdoposvf`) only. Production (`jwkcknyuyvcwcdeskrmz`) untouched.
