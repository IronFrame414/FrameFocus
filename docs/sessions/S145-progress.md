# S145 — progress log

**Branch:** `feature/s145-7i-audit-subinbound`, cut off `b267ed1`.
**Unattended run.** Josh answered Phase 2 in full; Phase 3 runs without him.

**Scope, as ruled:**

- **Part 1** — fix the 7I audit findings (documentation pass). Gates Part 3.
- **Part 2** — 7F sub-inbound: schema, services, probes.
- **Part 3** — 7I **schema + services + `contracts-shared.ts` + probes only** [C4 = (b)].
  **UI is explicitly next session, not this run.**

**Rulings applied this run:** A1(ii) accept the `v_is_signed` edge · B1(b) explicit
`completed_at` + "Mark sub complete" · B2 completion→`sub_contract_id`, payment→`expense_id` ·
B3 four sub templates · B4 single catalog + second resolver · B5 seed the sub templates ·
C1 build everything except §6.5's tokenised sub e-sign route (Gate 1) · C2 two signature steps in
one session · C3 proposal keeps its link on the notary path · C5 a DB guard on contract void.

---

## RESUME HERE

**Parts 1 and 2 are DONE and committed. Next: Part 3 — 7I schema, then services,
then `contracts-shared.ts`, then probes. UI is NOT this run [C4=(b)].**

---

## Log

### Part 1 — 7I audit fixes — **DONE**

Documentation only; no code, no migration. All five DANGEROUS items corrected in place with the
superseded text quoted, per house convention.

- **§4.3 rewritten.** Two false claims replaced with the live policy set read from `pg_policies`:
  the SELECT role floor S133 added, and the column-scope triggers that refuse a PM's
  `contract_value` write. Third correction: the S97 `999999` demo cited a **dropped** column.
- **§8 rewritten.** Leg (c) — "a UI gate over an open database" — was the opposite of the truth and
  was the most dangerous paragraph in the document. Legs (a) and (b) survive; the ruling is
  unchanged; the conclusion is now consistent with 7F's shipped Owner/Admin shape.
- **§14** — "the notification system does not exist" corrected; `notify()` ships.
- **§9** — Gate 1 citations refreshed after the S140 re-scope. The conclusion holds and the
  re-scope makes subcontractors the *paradigm* case rather than merely a named one.
- **§0.2 #1 · §3.4 · §7.1 · §7.5c** — 7F's engine, `signatory_name`/`signatory_title` and
  `projects.legal_description` are all BUILT; `retainage_percent` is pre-filled on insert by
  `20260814000000`, so §7.1's "left NULL" was wrong.
- **§5.1a** — ruled A1(ii), accept the edge. **And the citation was stale by two migrations:** the
  live owner of `convert_estimate_to_project` is `20260817000000`, not `20260731030000`. Predicate
  byte-identical across all five redefinitions, so the edge itself is unchanged.
- **§1** — 7I's ownership of the sub-contract agreement recorded; its own text never said so.
- **The stale-provenance banner** replaced with an audited-at-`b267ed1` banner that still warns
  that unchecked tags remain.

Exit codes: no build step — documentation only.

### Part 2 — 7F sub-inbound — **DONE**

`20260925000000_7f_sub_inbound.sql`, applied to rebuild-test and verified against the catalog:
2 columns, 104 sub templates (26 companies x 4), 2 partial unique indexes, both functions updated.

- **`completed_at` / `completed_by` on `subcontractor_contracts`** [B1(b)] — the signal that did
  not exist. Frozen below Owner/Admin by extending the existing column-scope trigger (recreated
  verbatim from the live body, not ALTERed — the S143 lesson applied pre-emptively).
- **Four sub_inbound templates seeded per company**, pre-named not pre-filled; the shipped seed
  trigger now owns both directions.
- **Two partial unique indexes** — one release per expense per type, one per sub-contract per type.
- **`resolveSubReleaseValues()`** — the second resolver. One catalog, inverted sources: the SUB is
  the lienor, so `claimant_*` resolves to the subcontractor and `contractor_furnished_to` stays the
  company. Deliberately never touches `subcontractor_financials` (the EIN trap 7G cites).
- **Generate route** gains a sub-inbound arm; the TYPE is fixed by the trigger, never accepted from
  the caller. **Never stamps our signature on an inbound release**, and sub-inbound is always
  `draft` at generate — the sub signs on paper and the copy comes back by upload.
- **Client writes:** `markSubContractComplete`, `reopenSubContract`, `attachSignedSubRelease`.

Evidence: `s145-sub-inbound.live.ts` 12/12 as real users. Proved load-bearing by removing
`completed_at` from the column-scope guard — red at exactly the PM case, "a PM marked a
subcontract complete: expected null to be truthy", exit 1; restored, re-verified in `pg_proc`,
12/12 again. One false alarm on the way: a re-run appeared red but had been launched from the
repo root instead of `apps/web` — a config-resolution error, not a test failure.

type-check 0 · vitest 761/761 · eslint clean.
