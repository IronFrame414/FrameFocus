# Desktop redesign — build log

> Incremental recovery log (precedent: `S166-battery-log.md`). Append-only.
> Each entry: step · what was done · files · commit hash · what was verified · decisions/contradictions.
> The Codespace can restart and take uncommitted work with it — this log is the recovery point.

**Working tree at start:** `main @ 6ab116e` ("docs: the desktop redesign spec and its six source
inventories"). Spec: `docs/specs/desktop-redesign-spec.md` (1358 lines). CLI linked to rebuild-test
(`nmyphyhmfttxkdoposvf`) for read-only verification.

**Phase order (hard stop after each):** A audit → B tokens → C sidebar → D six sections. Build step 4
(the six list screens) is NOT in scope.

---

## Log

### Entry 0 — build log created
- **Step:** pre-Phase-A setup.
- **Did:** created this log as the first action.
- **Files:** `docs/specs/desktop-redesign-build-log.md` (new).
- **Commit:** (this entry's commit).
- **Verified:** spec present at `6ab116e` (1358 lines); on `main`; CLI on rebuild-test.

### Entry 1 — Phase A: citation audit (new session, resumed after Entry 0's session ended)
- **Step:** Phase A, complete.
- **Did:** audited every file path, `file:line`, schema claim, line count and cross-reference in
  the spec against `main @ ee2feaa`. Six parallel read-only audit passes; every ❌/⚠️ independently
  re-measured before it entered the audit file (one agent's wrong-methodology grep counts and a
  policy-superseded-by-later-migration near-miss were both caught this way).
- **Branch note:** this session works on `feature/desktop-redesign` (cut from `origin/main @
  ee2feaa`), per the run protocol's no-edits-on-main rule — Entry 0's session sat on `main`
  directly. `main` is checked out in a second worktree (`/workspaces/FrameFocus`), so the branch
  was reset to `origin/main` rather than branched from a local `main` checkout.
- **Files:** `docs/specs/desktop-redesign-spec-citation-audit.md` (new).
- **Commit:** (this entry's commit).
- **Verified:** `npx turbo run type-check` → exit 0, 5/5 (read from redirected log per the
  exit-status protocol).
- **Headline results:** 0 wrong paths, 0 citations pointing at wrong code, ~23/25 line cites exact,
  2 hard ❌s — the header's "invoice floor outstanding" (it shipped at `2ff9966` +
  `20261038000000_invoice_payment_floor.sql`, keyed on **`author_member_id`, not `created_by`**),
  and §3 R8's "lib/notify verified empty" (`push.ts:29` still has `support@frameFocus.app`).
- **Found, not ruled anywhere:** `money-representation.md` / `7d1-spec.md` §12a still state the
  overturned S97 carve-out — the fix commit did not amend them; the five deliberate `prompt()`
  leftovers (`#1-dialogsweep`) sit on screens later build steps restyle.
