# PO void + edit, and the five deferred sweep items — running log

Branch: `fix/po-void-and-sweep` (cut from `main`; `fix/silent-wrong-answers` is NOT merged and this
does not depend on it). Session S103, 2026-09-04.

The Codespace has restarted repeatedly. This log is the durable deliverable — appended and committed
after every step.

## Plan (from the prompt)
- §2 PO void (ruled): reason always required; PARTIAL closeout (completed lines keep committed value,
  incomplete lose it); nothing-complete → 0; fully-complete → allowed, unchanged; decide what
  `softDeletePurchaseOrder` becomes.
- §3 issued PO editable in place, with an audit trail (differs from estimates/COs/contracts on
  purpose — internal vendor doc). Check for an existing audit mechanism first.
- §4.1 #116 UTC calendar-date bug — 10 measured sites → `companyToday(timeZone)`; check desktop test
  complicity; pin the 21:00-EDT boundary.
- §4.2 `.limit(1)` sweep — 140 candidates; find the risky subset first; report that count.
- §4.3 #3-s168 — rebuild `CO-QA-M9-SENT` as `-2`; tighten ARM 4a to assert `sent`.
- §4.4 #54 — trash page server-side `is_deleted` filter.
- §4.5 #67 — delete the dead `packages/shared/utils/index.ts` barrel.

## Log

### Step 0 — setup
- Confirmed clean tree on `fix/silent-wrong-answers`; `git checkout main && git checkout -b
  fix/po-void-and-sweep`. Created this log.
- Next: Phase 1 analysis for §2 (PO schema, how "completed" is determined per line,
  `countsTowardCommitted`, `voidContractWithCloseout` precedent).
