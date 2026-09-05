# fix/list-screens-and-ui — work log

> ⚠️ **This log IS the report.** Eleven restarts on this campaign; two destroyed reports. Committed
> after every item, path-scoped. Branch cut from `main` @ `638f814`.

Scope: `docs/sessions/redesign-structure-audit.md` (this session's audit, brought onto the branch).

**Stops:** production (never) · a decision not in the prompt · altering/destroying existing rows ·
anything that cannot be done without weakening a floor. Type-check is necessary but NOT sufficient —
pages must COMPILE.

Plan:
- §0 — rename the mislabelled `docs/design/current-state/` → mockups; rewrite its README. (own commit, first)
- §2 — trivial fixes: (1) remove header "Send to Client"; (2) contract_type enum leak; (3) remove cost codes from add-items sheet + file in IDEAS.
- §3 — estimates UI: (4) add-items inside each category; (5) 9b summary rows; (6) chat icon overlap; (7) sub-bid grid fixed; (8) scope box size; (9) allowance relabel; (10) returned-bid prompt.
- §4 — files: (11) build estimate Files tab; (12) sub upload via tokenised link (`#5-estred`, security-sensitive).
- §5 — the six list screens as ONE shared anatomy (14b, 14d, 14e, 14f, Files, Field-Ops); 14a is the reference.
- §6 — DO NOT TOUCH: ruled conformance (Coverage check, crew-load, company Gantt/By-crew, permit-clears, Proposals variable editor, Payments 5th bucket, Files revision column). All Money screens match — leave them.

---

## §2 item 1 — DONE (commit: remove header Send to Client)
- `estimate-builder.tsx` draft-manager branch: removed the `est-send` "Send to Client" button. Send
  path is now solely Review & Send → Send to client (`est-review-send`, renders for draft/review).
  "Mark as Sent" (`est-mark-sent`) KEPT. `review`-status "Approve & Send" untouched (out of scope).
  `openSendModal` still used by Approve & Send. type-check PASS.

## §0 — DONE (commit: rename mockups dir)
- `git mv docs/design/current-state → docs/design/mockups` (47 files).
- README rewritten: "DESIGN MOCKUPS, NOT shipped screenshots" with the four-way proof + "compare CODE
  vs handoffs, never these images."
- Path refs updated: `redesign-structure-audit.md` (§B + 2), `ui-gap-log.md` (2). False matches left
  alone: `client-portal.ts:189` / `context19.md:36` use the words "current-state" as prose, not the path.
