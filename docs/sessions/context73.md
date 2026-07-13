# Session 73 — Context & Handoff

> **Filename is a guess.** I could not see `docs/sessions/` this session (mobile, no repo access).
> Session 72 was the M7 spec thread (7D/7E). This session continued M7 planning (**7G, 7F, 7H**). A
> parallel M6 thread was last at Session 70–71. Verify the next number in `docs/sessions/` and rename
> before committing — numbering has drifted off-by-one before.
>
> **This is a session record, not STATE.md.** Reconcile against STATE.md and git next session —
> **git wins on any conflict.** No git state was verified this session (see §Git).
>
> **Session type:** Module 7 **plan-writing** — 7G, 7F, 7H. Research + interview-mirror + audit.
> Docs/plans only. **No build, no migration, no schema, no repo access from this chat.**

---

## 1. THE ONE THING THAT MATTERS MOST

**Three plan files were produced and are NOT yet in the repo — Josh places them manually via CC.**

- `7G-plan.md` (QuickBooks Connector), `7F-plan.md` (Lien Releases & Waivers), `7H-plan.md` (Job
  Profitability).
- All three: **workflow/decisions complete and audited**; the **schema layer is deliberately absent**,
  captured as a `§S — TODO for Claude Code` block (same method as 7D/7E — no tables, columns, or file
  paths asserted until CC reads the live upstream schemas).
- **Land all three at `docs/specs/`.** Path-scoped commit (CC never commits; Josh commits manually):

  ```
  git add docs/specs/7F-plan.md docs/specs/7G-plan.md docs/specs/7H-plan.md
  git commit -m "docs(specs): add 7F, 7G, 7H module 7 plans"
  ```

- **Verify 7D/7E are already committed** (from Session 72) before assuming anything needs re-adding.

---

## 2. WHAT THIS SESSION PRODUCED

Each plan ran research/interview → mirror → approve → draft → **audit** → fix. All three audited clean
at close.

- **7G (QuickBooks Connector).** Researched the QB API; locked the decisions (below); **resolved both
  build risks from Intuit's docs** (pay-link works on the accounting scope alone; sub-customer income
  posting). Audit fixed dangling `[verify]` references, added provenance tags, softened an overclaim,
  and added rate-limits/metering, invoice void/update propagation, and token-reconnect handling.
- **7F (Lien Releases & Waivers).** Interviewed the document lifecycle; locked the PDF-overlay template
  model, value catalog, conditional/unconditional handling, signing, and home/lifecycle. Audit fixed a
  provenance error, reconciled the signature-box model, normalized terminology, and added
  void/supersede + invoice-void cleanup.
- **7H (Job Profitability).** Locked profit = contract − actual cost, the report structure, the
  portfolio roll-up, Owner/Admin-only access, and PDF export. Audit reconciled committed-cost to the 7A
  ledger, segmented the portfolio total, and added export.
- **Established that 7A–7C are blocked on schema-readability, not on decisions** (see §5).

---

## 3. DECISIONS LOCKED THIS SESSION (full detail + provenance tags in the plan files)

**7G — QuickBooks Connector:**

- Owner connects QB via OAuth 2.0 in Company Settings (Admin cannot) `[inherited]`.
- **Client = QB Customer; job = sub-customer** (`ParentRef`); invoice `CustomerRef` → the job. The QBO
  Projects feature is **not** used — `IsProject` is read-only/API-uncreatable, so sub-customer was the
  only viable path.
- Electronic pay = **Model A**: client pays via QB's pay-link, FrameFocus listens via webhook; a
  redirect notice shows before hand-off; requires the company to have QB Payments enabled, else manual.
- Income = single **"Construction Income" Item**, remappable; the cost-category → cost-account mapping
  belongs to **7C**, not invoices.
- **Per-record sync** at each record's own approval; no batch gate.
- **Accounting scope is sufficient** for Model A (no Charges/payment scope) — resolved from docs.

**7F — Lien Releases & Waivers:**

- v1 = document lifecycle + a Company Settings builder + client-outbound triggers; **sub-inbound
  trigger deferred** (TODO for CC, blocked on M6 sub-scheduling).
- Doc model: company **imports its own PDF, drops overlay boxes** mapped to values; FrameFocus stamps
  at generate time (`pdf-lib`). Company supplies all wording; **no default legal text**.
- Two templates: **conditional** (money owed; prompted at invoice; the collection-gate doc) +
  **unconditional** (after payment clears; **manual button** under job financials; **no cleared-state
  tracking**).
- Signer = **contractor**; app path stamps the saved contractor signature (**already in Settings —
  confirm reusable**), notary path prints → notarizes → uploads. **No external surface in v1.**
- Sub-inbound (deferred): the sub signs via an emailed link → **Pre-Module 9 external-surface gate**.
- Home: **Lien Releases list under job financials**; Draft → Signed/Notarized → Sent; void/supersede
  supported.

**7H — Job Profitability:**

- **Profit = Contract − actual cost** (final at close; labeled "so far" mid-job).
- Per-job cost table (categories × Budget/Committed/Actual/Remaining) + job headline; **profit is
  job-level in v1** (per-category blocked by **debt #7**, budget side has no sell).
- **Portfolio roll-up in v1**, segmented Active vs. Completed (no blended total).
- **Access: Owner/Admin only — PM excluded.** View-only bookkeeper role stays deferred (TECH_DEBT).
- Verified-only; cash basis; **committed read from the 7A ledger** (7C is the source, not a direct
  read). **PDF export** (Owner/Admin).

---

## 4. ARCHITECTURE AMENDMENTS RECORDED

1. **7G is upstream of 7E for the electronic-payment path** (not export-only). §7.3's map is incomplete
   here — confirmed against the doc and the QB research. Non-QB parts of 7E build first; the
   electronic-payment half stubs until 7G.
2. **7F is bidirectional** (§7.11) — confirmed. v1 builds the client-outbound direction only.
3. **No 7E "cleared" payment state was added** — deliberate (7F's unconditional release is a manual
   action). Recorded so a future session does not flag it as a "missing" dependency and build it.
4. **7H reads committed cost from the 7A ledger**, not directly from 7C (7C originates the commitment).

---

## 5. STILL OWED / OPEN

- **Place + commit the three plans** (§1).
- **7A–7C are blocked on schema-readability, not decisions.** They need: **Module 6** (time entries,
  material deliveries, POs, **sub-scheduling model**), the **signed-artifact / CO branch merged**, and
  the **5E budget** readable from git. 7A is specced first (the spine; it has an approved interview
  trace in architecture §7.8), then 7B (a rule) and 7C (accounts payable — owns debts #3/#4 and the
  sub-side lien-release gating 7F's deferred half leans on).
- **§7.12 owed before ANY 7-series spec:** the grep pass for M7 items across specs + `TECH_DEBT.md`;
  resolve TECH_DEBT numbering; file the negative-CO behavior as a 7B design point.
- **Notification system** — undesigned, cross-cutting, v1-mandatory (from Session 72). Still owed.
- **Pre-Module 9 external-surface gate** — governs 7F's deferred sub-side e-sign link and the client
  pay surface.
- **TECH_DEBT filings** (read live `TECH_DEBT.md` first — do not invent numbers): debt #7 (budget-side
  sell) blocks 7H per-category profit; the view-only financial role; deferred AIA/draw billing (7D).

---

## 6. HOW TO START THE NEXT SESSION

1. **Verify git — git is ground truth.** `git status`, `git log --oneline -15`. Reconcile session
   numbering and this file's name against `docs/sessions/`; reconcile the M7 plan line vs. the parallel
   M6 line.
2. **Confirm the three plans landed** at `docs/specs/` and are committed; confirm 7D/7E are already in.
3. **Do NOT try to spec 7A–7C** until M6 schemas + the signed-artifact branch + 5E are live and
   readable. The next real M7 move (7A) is gated on M6 — finish M6 far enough that those tables are
   stable and readable.
4. When M6 is ready: **open 7A fresh**, spec against the live schemas (its interview trace is already
   approved in architecture §7.8). Same discipline that kept this session clean: assert no schema until
   it can be read.

---

## §Git — state at close

**NOT VERIFIED THIS SESSION.** Mobile, no repo access — this was a planning/plan-writing thread. Every
repo/branch/commit claim must be checked against `git` next session before it is trusted.

- The three plan files (`7F/7G/7H-plan.md`) exist **only as chat artifacts** — Josh places them at
  `docs/specs/` and commits (§1). They are **not** in the repo yet.
- M7 plan line: this session (73?), following **Session 72** (7D/7E, landed manually that session).
- Parallel M6 line: last known **Session 70–71** (unverified).
