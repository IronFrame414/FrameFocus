# S108 — Session report

**Branch base:** `feature/s108` @ `f1b2de1` (five specs + four mockups committed there, not on `main`).
**`main`:** `ad4e9b8`.
**Started:** 2026-09-22.

This file is appended after every step and pushed. Assume the Codespace dies without warning.

---

## Phase 1 — Analyze (read-only)

### Step 0 — Orientation

- Confirmed on `feature/s108`, tip `f1b2de1`, working tree clean.
- Five specs present and read in full:
  - `docs/specs/S108-SPEC-A-site-visit.md` (178 lines)
  - `docs/specs/S108-SPEC-B-estimates-line-items.md` (141)
  - `docs/specs/S108-SPEC-C-email-and-drift.md` (136)
  - `docs/specs/S108-SPEC-D-tooling-tests-housekeeping.md` (123)
  - `docs/specs/S108-SPEC-E-production-and-attended.md` (82)
- Four mockups present in `docs/design/mockups/`.

---

### Step 1 — Spec C measured

**Tooling guard checked first:** `cat supabase/.temp/linked-project.json` →
`{"ref":"nmyphyhmfttxkdoposvf","name":"framefocus-rebuild-test",...}`. Every live read below went
through `scripts/live-sql.mjs`, which is read-only (rejects any write keyword) and refuses any ref
other than `nmyphyhmfttxkdoposvf`. **No production read or write.**

#### C1 — warming Reply-To

- **Confirmed `apps/web/lib/services/warming-email.ts:370`** — `replyToCompanyId: company.id`, the
  only place warming mail sets Reply-To. Sole caller: `apps/web/app/api/cron/email-warming/route.ts`.
- `sendEmail()` (`email-service.ts:588-596`) prefers an explicit `params.replyTo` over
  `replyToCompanyId`, so the fix is a one-line substitution at the call site — no change to the
  shared resolver, therefore no other email type can be affected by construction.
- `resolveCompanyReplyTo()` (`email-service.ts:501-529`) is `companies.email` → owner profile email
  → null. `h-h-signature-renovations` has `companies.email` NULL, so warming today resolves to the
  owner's personal Gmail. **Defect confirmed as specified.**
- Two comments also state the old behaviour and must move with the code:
  `warming-email.ts:365-368` and `apps/web/lib/email/templates/warming-email.tsx:25-26`.
- ⚠️ **A third comment is now factually stale and Spec C did not name it.**
  `email-service.ts:56-60` (the `SUPPORT_REPLY_TO` docstring) asserts the sending domain
  *"has no inbox — so a Reply-To on the domain would silently eat replies."* The Spaceship catch-all
  makes that false, and it is the exact sentence a future reader would cite to reject C1's ruling.
  Correcting it is part of C1.

#### C2 — drift detection

- **FILL-C2, first half: the cron-route proposal does NOT exist.** `grep -in "cron"` and
  `grep -in "drift|fingerprint|db:verify|replay"` over `docs/sessions/S107-report.md` (438 lines)
  and `docs/specs/S107-spec.md` return **nothing**; both greps were proved able to fire by a control
  grep on the same files. `docs/sessions/S107-live-suite-repair.md` mentions "cron" only as test
  names. **The design is new work in S108.**
- **FILL-C2, second half: `npm run db:verify` DOES exist on `main`** — `package.json:18`
  `"db:verify": "python3 scripts/db-replay-schema.py"`, landed in `536a43e`, with the companion
  `scripts/db-verify.sql`. It replays the migration files and fingerprints tables, columns,
  NOT NULL, CHECK, UNIQUE, FK. Its own docstring lists what it cannot see:
  *"FUNCTION BODIES, RLS POLICIES, TRIGGERS, INDEXES, DEFAULTS, GRANTS. Out of scope."*
- ⚠️ **`scripts/.db-expected.json` is GITIGNORED** (`.gitignore:72`). The baseline FILL-C4 asks for
  ("committed") does not exist as a committed artefact today.

**Measured, both sides, this session:**

| dimension | replay of 222 migration files | live rebuild-test |
| --- | --- | --- |
| tables | 123 | 123 |
| columns | 1918 | 1918 |
| NOT NULL | 772 | 772 |
| CHECK | **230** | **230** |
| UNIQUE | 42 | 42 |
| FK | 566 | 566 |
| latest ledger version | — | `20261600000000` |

**Exact agreement. Zero drift on rebuild-test, measured rather than claimed.**

⚠️ **Correction to Spec C's "Established by S107" block.** It records *"all 223 migration files"*
and *"231 CHECK"*. Both are pre-revert figures. `2e7c4e6` deleted `20261610000000` outright and
dropped its constraint and ledger row from rebuild-test (*"checks 231 -> 230, latest migration
20261600000000"*). The file count is **222** and the CHECK count is **230**. Spec C and Spec E
(FILL-E1) corrected.

**The dimensions the drift route must add**, counted live on rebuild-test:
RLS policies **363**, triggers **268**, functions **285**, indexes 525, constraints (c/u/f/p) **961**.
Total `pg_get_functiondef` text: **267,630 bytes**, largest single body 10,911 bytes.

**Cost (FILL-C7), measured not estimated.** A single catalog query computing four md5 digests over
policies + triggers + function bodies + constraints returned in **0.536 s wall including the
round-trip from this Codespace**. It reads `pg_catalog` only — no tenant table is touched, so cost
does not grow with row count.

**⚠️ FILL-C3, comment normalisation — the naive answer is measurably wrong.** Stripping every `--`
to end-of-line is the obvious normaliser. Measured against the live catalog by counting single
quotes before the `--` on each line (odd = inside a literal):

- `--` that is a real comment: **391 occurrences**
- `--` that sits **inside a string literal: 2 occurrences, in 1 function — `qb_vault_put`**, both in
  `RAISE` message text (`'... for company % -- a company row still points at this secret ...'`).

A naive strip truncates those two messages, so an edit to the text after the `--` would be
**invisible to the detector**. The normaliser must strip a line comment only when the quote count
before it on that line is even. (My first probe for this used `'[^']*--`, which reported 80/80 — a
false positive, because any earlier quote anywhere in the body satisfies it. Re-measured with quote
parity. Recorded because it is this campaign's named failure class.)

