# Module 7 Architecture — Session Context / Handoff

> **This file is a claim, not ground truth.** Per the project's own rule: a handoff's assertions
> about repo state are claims to verify with `git`, not facts. Where this file states repo/branch
> status, it is repeating the _session brief_ — **none of it was verified from git this session**,
> because this session was planning + interview only (the founder explicitly set current status
> aside). Next session: run the git snapshot before trusting any state claim below.
>
> **Session type:** Module 7 (Job Finances) ARCHITECTURE + interview traces. Explicitly NOT spec
> files, NOT a build, NOT a migration. (Session number: assign per your convention — prior session
> referenced was 64.)

---

## 1. THE ONE THING THAT MATTERS MOST

**The deliverable is drafted and presented in-chat ONLY. It is NOT in the repo. It is NOT committed.**

- File produced: `module7-architecture.md` (797 lines).
- It exists only as this session's chat output. It has **not** been pulled into the repo, **not**
  committed, **not** verified against any live schema.
- **FIRST ACTION NEXT SESSION:** pull `module7-architecture.md` into the repo via **Claude Code**
  (NOT clipboard — it contains `|`, `<`, `>`, and box-drawing characters that a paste will mangle;
  this is the Session 64 code-fence failure). Land it at `docs/specs/` alongside
  `module5-architecture.md`. Then commit path-scoped. Claude Code never commits — you commit. Never
  `git add -A`.

---

## 2. WHAT THIS SESSION PRODUCED

Both deliverables from the session brief are complete, inside the one doc:

1. **Architecture** — sub-module breakdown, dependency map, owns-vs-inherits contract table,
   collected inherited debts, cross-cutting design principles, open design constraints.
2. **Approved input→store→output traces** for all four workflow-heavy sub-modules, captured as
   sections inside the architecture doc.

Sub-module map (8 total):

- **7A** Job Cost Ledger — the spine — **traced (INVENTED)**
- **7B** Contract Value & CO Write-Through — a rule — not traced (correct)
- **7C** Accounts Payable — **traced (REAL/INVENTED)**
- **7D** Invoicing — **traced (REAL/INVENTED)**
- **7E** Payments & AR — **traced (REAL/INVENTED)**
- **7F** Lien Releases & Waivers — a document lifecycle — not traced (correct)
- **7G** QuickBooks Connector — an integration — not traced (correct)
- **7H** Job Profitability — a report — not traced (correct)

Provenance meaning (from the doc): **INVENTED** = Bishop does not do this today; trace built forward
from stated intent; acceptance example is PROPOSED and unproven until a real job runs through it.
**REAL/INVENTED** = the mechanics are lived (mostly via QuickBooks) but the per-job cost tie is new.
Bishop does not track job cost against jobs at all today — that is why M7 exists.

---

## 3. DECISIONS LOCKED THIS SESSION (do not re-litigate — they are in the doc)

Pointer index, not a re-derivation. Read the doc section for detail.

- **Cash basis (P1):** "actual" = money left the account. Committed vs. actual is the core axis.
- **Advisory, not enforced (P2):** every financial gate warns; none hard-blocks a payment.
- **Cost row** = one money event against one job; carries **cost AND sell** (the M5 budget-row gap);
  state committed | actual; single category enum (P3).
- **Burden:** member profile holds pay + a burden multiplier + a **toggle** (use member multiplier |
  use company fixed). Company settings holds the fixed figure. The toggle flips the on-screen math
  operator (`×` vs `+`) — what the user sees is the arithmetic that runs.
- **Verification gate (P5):** any member can enter an expense; PM/foreman/crew entries are
  unverified until owner/admin verify; unverified rows are excluded from job cost until then.
- **Material selection IS a change order** — same class, same back-end path. Specialized spec adds
  images + allowance-aware fields pulled from the original contract; saved as a PDF via the existing
  signed-artifact pipeline. Writes through to contract value (debt #1).
- **Allowance overage flow:** signed material selection (= the pay agreement / CO) → auto-generated
  DRAFT invoice → owner/admin approval → client. **Killing the invoice VOIDS the CO** (invariant: no
  signed CO stands without a live invoice behind it).
- **Invoice approval (one rule, every invoice):** a PM can CREATE any invoice; it does NOT reach the
  client until owner/admin APPROVES. Create and send are separate; approval is the gate.
- **T&M knobs:** billable hourly rate + material markup rate — founder states both already exist in
  company settings (VERIFY at build).
- **Money-in ≠ money-out permission:** only owner/admin RECORD payments received; PM cannot.
- **Terminology standardized on "contract value"** throughout (likely the `contract_value` column).

Two items surfaced this session that had **no prior home** anywhere in the project:

- **Negative change orders** — a CO can remove scope: issues a credit, LOWERS contract value,
  reduces remaining owed, comes off the final payment. 7B write-through is therefore **bidirectional**
  (prior CO references all assumed additive).
- **Outbound lien release** — the contractor issues a lien release TO the client at final payment,
  the mirror of the inbound sub release 7C collects. 7F is therefore **bidirectional**.

Cut this session:

- **View-only financial role (bookkeeper / outside accountant)** — removed from M7 launch scope,
  deferred to a real `TECH_DEBT.md` entry (see §5). M7 introduces **no new roles at launch**.

---

## 4. AUDIT PERFORMED THIS SESSION

The doc was audited against the interview (internal consistency, fidelity, cross-reference integrity,
terminology). Four findings, all resolved:

- **F1** terminology — standardized on "contract value" (caught 3 buried in code-fences).
- **F2** — no edit: two flagged items were confirmed by the founder, converting them from inference
  to stated fact (owner/admin-only recording; the committed−actual formula).
- **F3** — escalated: the phone-ping approval depends on **mobile push infrastructure that may not
  be built** → now a tracked constraint (§7.7 #8), flagged possibly-build-first; approval works
  in-app without it.
- **F4** — role cut (above).

**Limit of that audit, stated honestly:** it certified the doc is internally sound and faithful to
the interview. It did **not** certify that any cross-module dependency actually holds — that needs
the live repo and is the whole of §5 below.

---

## 5. CARRIED FORWARD — VERIFICATION TASKS (all need the live repo)

These are from the doc's §7.12. None could be done this session (no repo access; interview-only by
design). All are owed before any 7-series **spec** is written:

1. **Run the grep pass** across all specs + `TECH_DEBT.md` for items naming Module 7; reconcile
   against the doc's §7.1 debt list. (This was original session-order step 3, deferred.)
2. **Confirm the reopen path.** Founder believes a recent spec built `complete → reopen`; UNVERIFIED.
   Hard dependency of BOTH 7A (late cost) and 7C (late bill). Confirm against the actual
   spec/migration before either is specced.
3. **Read the M4 allowance model** before the material-selection/overage flow is specced.
4. **Read the signed-artifact / CO schema** (once `feat/signed-artifacts` merges) — including whether
   "material selection = change order" holds at the table level — before 7B or the overage flow.
5. **Read Module 6's schema** (once M6 code exists) — time entries, deliveries, POs — before 7A/7C
   source integration.
6. **Read Module 5's budget baseline (5E)** — confirm the cost-only gap; design the sell/profit
   addition.
7. **Resolve TECH_DEBT numbering** — prior chat cited #80/#81; confirm against actual `TECH_DEBT.md`.
8. **Confirm the T&M settings** exist in the live company-settings schema.
9. **File the negative-CO behavior** as a 7B design point (bidirectional write-through; nothing in
   repo currently models a downward adjustment).
10. **File the deferred view-only financial role** in `TECH_DEBT.md` with a REAL number (not invented
    here — this session had no sight of the live file; a fabricated number risks colliding with an
    existing immutable address).
11. **Confirm mobile push infrastructure state** (constraint §7.7 #8) — gates the phone-ping approval.

---

## 6. BRANCH / REPO STATE — PER SESSION BRIEF, UNVERIFIED THIS SESSION

Repeated from the session brief. **Verify all of it with git before trusting it.**

- `main` — carries five Module 6 specs (6A–6E), all committed; 6E deferred post-launch. No Module 6
  code claimed to exist anywhere in repo history.
- `feat/signed-artifacts` — claimed to carry migration `20260710120000_signed_artifacts.sql` plus a
  full CO signing / PDF / email / reminder build. Pushed, **UNMERGED**, migration **NOT applied** to
  any database.

Note: the founder's project-knowledge copies of `STATE.md`, `CLAUDE.md`, and the architecture doc
may be stale; this session's reads of them flagged two drifts (a signed-artifact spec still marked
DRAFT that the brief says is built; `ip_address` naming that is actually `signer_ip`). Treat every
column name and file path as unverified until read against the migration.

---

## 7. NEXT SESSION — FIRST ACTION

Do the two things in order, one at a time, stopping after each:

1. **Land the doc.** Route `module7-architecture.md` into `docs/specs/` via Claude Code (not
   clipboard), then commit it path-scoped. Nothing else in that step.
2. **Then** run the git snapshot + the §5 verification tasks — starting with the grep pass (task 1)
   and the reopen-path confirmation (task 2), since those two gate whether 7A/7C can be specced at
   all.

Do **not** start writing any `7A-spec.md` or other spec file until §5 tasks 2–8 are cleared for the
relevant sub-module. The traces are the durable capture; the specs wait on schemas that can be read.

---

_End of context file. This document itself should be routed through Claude Code to land in the repo
(it contains backticks and pipes). It is a handoff, not a source of truth — git is._
