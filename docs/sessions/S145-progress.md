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

**S145's three parts and S146's four are all DONE, committed and pushed. Nothing is blocked.**

**NEXT ACTION: build 7I's UI** — Company Settings template CRUD + box placement
(`catalogForKind()` drives the field picker), the estimate-side toggle on the proposal
send screen, and the contract document list. The schema, services, `contracts-shared.ts`
and probes all landed at S145 [C4=(b)]; S146 then EXECUTED the service layer and the
generate route, so the UI is now building on exercised code rather than reviewed code.

✅ **`#1-s146` is FIXED** — applied at S146 on Josh's ruling, before merge. Role is
resolved server-side through `get_my_role()` and is no longer a parameter, and every
UPDATE-shaped write in `contracts-client.ts` treats zero affected rows as a failure.
**`voidContractDocument()` lost its `role` argument** — its signature is now
`(id, status, reason)`. It had no production caller yet, so nothing else moved.

**Do NOT build §6.5's tokenised sub e-signature** — still behind Gate 1.

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

### Part 3 — 7I schema, services, shared, probes — **DONE**

`20260926000000_7i_contracts.sql`, verified against the catalog: 4 tables, 11 policies,
8 table triggers, 4 void-authority triggers, 7 estimate columns, 1 company toggle.

- **Four tables** — `contract_templates`, `contract_template_boxes`, `contract_documents`,
  `contract_signing_sessions` (one session table, §10.5). Owner/Admin on all, SELECT included.
- **`enforce_contract_void_authority` [C5]** — closes a hole that is LIVE ON PRODUCTION.
- **`contracts-shared.ts`** — the third leg of the triple; 7I's own value catalog, side-scoped.
- **Server reads and client writes** appended to the existing 5A pair, which 7I extends.

**NOT built, deliberately:** §6.5's tokenised sub e-signature (Gate 1); the conversion RPC
amendment (A1(ii) — accepted, recorded as owed); all UI (C4=(b)).

Evidence: `s145-contracts.live.ts` 19/19, `contracts-shared.test.ts` 22/22. Both proved
load-bearing by mutation. **Two latent fixture defects in my own harnesses found and fixed:**
both picked contracts without constraining to a PM-assigned project, so the PM refusals
would have passed for the wrong reason (no visibility, not no authority). They passed on
first run by row ordering and broke as soon as the two files ran in sequence.

type-check 0 · vitest 783/783 (53 files) · eslint clean.

---

---

# S146 — close what S145 left unexercised

**Same branch. Two things were red or latent; two had never run.**

### The process point that produced Part 1 — **recorded so it is not repeated**

**S145 seeded sub-inbound default templates and never re-ran S140's harness.** The log
above claims 12/12 on the new harness while an old one went red on the same data:
`s140-lien-releases.live.ts` counted default templates per company with no `direction`
filter and expected 4, and the seed made it 8. It was found by S146's verification run,
not by S145.

**A build that changes seed data owes a run of every harness that reads it.** Asserting
the new thing is not the same as checking what the new thing displaced. The full live
suite is cheap — ~250s for 65 files — and was skipped in favour of the two new files.

**And the rule caught S146's OWN new harness, which is the strongest evidence for it.**
`s146-generate-route.live.ts` picked its invoice with a bare `.limit(1)` and no
constraint that the project carried a property address. §6.3's build guard refuses to
render without one, so G1 — the positive control that gives every "no signature was
stamped" assertion its meaning — returned **422 instead of 200**. It passed standalone
three times and went red the first time it ran inside the full suite, behind harnesses
that churn invoices. Fixed by selecting subjects that are PM-assigned **and** addressed;
the two sub-side picks were constrained the same way, since they had passed twice by
luck rather than by construction. **Another file's row ordering is not a fixture** — and
a harness that has only ever run alone has not been tested at all.

**The same lesson turned up a THIRD instance during S146's own verification**, and it
is the most interesting because it never went red on an assertion. `#4-s146`:
7F's seed trigger creates 8 templates on every new company, and
`lien_release_templates_company_id_fkey` is `NO ACTION` — so
`s97ct-reply-to.live.ts`, which creates and deletes an orphan company with a CONSTANT
slug, can no longer delete it. It leaks, and the next full-suite run dies in its
`beforeAll` on `companies_slug_key`. A seed change broke a harness's **cleanup**, not
its assertions, which is why nothing caught it for four sessions.

### Part 1 — the S140 fixture drift, both instances — **DONE**

- **`:99–103`** scoped to `client_outbound`, **expectation kept at 4** per the ruling.
  Widening to 8 would have stayed green and lost what it tested.
- **`:66–71`** the same filter on the `.limit(1)` template pick. Nothing in
  `pg_constraint` ties a template's direction to a release's, so a sub template bound to
  a client-outbound release **passes silently** — filed as `#3-s146`, not built,
  per ruling.
- **One assertion added** because that second fix could not otherwise be proved:
  the fixture's template and its release must agree on direction. Mutation-proved —
  pointing the fixture at a sub template gives *"expected 'sub_inbound' to be
  'client_outbound'"* while **the other 17 tests still pass**, which is the silent
  failure demonstrated rather than described.

Red → green: `1 failed | 16 passed`, EXIT=1 → **18/18, EXIT=0**.

### Part 2 — the generate route's sub-inbound arm, EXECUTED — **DONE**

`s146-generate-route.live.ts`, **9/9**. The route MODULE is imported and called; only
the client factory is mocked (`s97ct-7e-clicktest.live.ts:37`'s technique), so the
shipped path runs under real user JWTs. No refactor of shipped code — a re-implementation
in the harness would have been the divergence CLAUDE.md's parity ruling is about.

- **Completion → conditional against `sub_contract_id`; payment → unconditional against
  `expense_id`.** Both arms run end to end: row shape, subject columns, `filled_values`
  snapshot, `draft` status, and the storage key on the sub path.
- **`renderRelease()` rendered a sub-inbound release for the first time** — the four
  seeded sub templates carry no PDF, so a fixture template with a real one-page PDF and
  a box map was created rather than mutating a seeded default.
- **"Never stamps our signature" is proved against a POSITIVE CONTROL.** The same
  fixture PDF goes through the client-outbound arm first and must embed an image;
  only then does zero on the sub side mean anything. Counted as image XObjects, because
  pdf-lib re-encodes PNGs and searching for the original bytes would pass for the wrong
  reason.
- **The caller cannot choose the type** — a body carrying `type: 'unconditional'` on a
  completion trigger still produces a conditional release.
- Mutation-proved twice, against the route itself: dropping
  `&& direction === 'client_outbound'` from the signature condition turns both
  sub-inbound assertions red (*expected 2 to be +0*); honouring `body.type` turns the
  type assertion red. Reverted; route byte-identical to HEAD.

**Found by running it:** the two resolvers have **different §6.3 build guards**, and
correctly so. Client-outbound refuses without `signatory_name`/`signatory_title`
(`lien-releases.ts:255`) because we sign that instrument; sub-inbound does not, because
the sub does — the same reason §12 leaves the signature box empty. Asserted in S146-G5
so a future tidy-up that merges the two blocker lists fails loudly.

### Part 3 — the trigger→type mapping — **FILED, NOT BUILT [Josh, S146]**

Establishing whether it could be a CHECK was the task; it can, and it should not be.
Full reasoning in `TECH_DEBT.md` `#2-s146` and written into the harness above S145-S4.
Short form: the four precedents cited are about **authority**, which belongs in the
database; this is **which of two legal instruments the workflow offers by default**, and
the ruling makes that layer optional. Both arms of the proposed CHECK would block real
instruments, and both partial unique indexes are keyed `(subject, type)` on purpose.

### Part 4 — the 7I services, EXECUTED — **DONE, and it found a defect**

`s146-contract-services.live.ts`, **20/20**. Template CRUD, box map, document reads,
void authority, the two-level toggle, and the trigger contract on `updated_at`.

⚠️ **`#1-s146` — an UPDATE-shaped write reports SUCCESS when RLS filtered the row away.**
`voidContractDocument(id, role, …)` takes the role as a parameter, so a PM passing
`role: 'owner'` walks past `canVoidContract()`. `contract_documents_update_owner_admin`
then matches **zero rows** — the document is safe, but a zero-row UPDATE is not an error,
so the function returns `{ success: true }`. General to the pattern:
`updateContractTemplate()` does the same. INSERT-shaped writes are unaffected.

**This is exactly what C4(b) chose to land the service layer for**, and it is invisible
to a probe that writes to the tables directly, which is what S145's did. Also recorded:
`contract_documents_void_authority` is unreachable in practice there — RLS is strictly
narrower than the trigger — while remaining genuinely load-bearing on the two 5A tables.

### Part 5 — `#1-s146` APPLIED [Josh ruled both halves, before merge] — **DONE**

**Half 1 — role resolved server-side.** `role` is gone as a parameter. It is read from
`get_my_role()`, **the same SECURITY DEFINER function every RLS policy calls** — chosen
over a `profiles` read so the service check and the database gate cannot disagree about
who the caller is. `voidContractDocument(id, status, reason)`; no production caller
existed, so nothing else moved. `status` stays a parameter deliberately: it selects the
message, not the authority.

**Half 2 — zero affected rows is a failure**, applied to all six UPDATE-shaped writes
in the file, not the two already named.

**The sweep turned up the interesting case.** `saveContractBoxMap`'s `.delete()` clear
**legitimately affects zero rows on the first save of every template**, so a row count
there would refuse the commonest case — and that left a hole the count could not reach:
a PM passing `[]` cleared nothing and was told the map was emptied. Closed with the
ROLE half instead. The two halves are not interchangeable, and this is where that shows.

Mutation-proved separately. Making `myRole()` return `'owner'` — trusting the caller,
as the old parameter did — turns both half-1 tests red, and the PM falls through to the
database and gets the discard message instead of the service refusal, which is exactly
the old shape. Making `applied()` return `true` turns all three half-2 tests red.

**The half-2 probe is a cross-tenant owner, not a bogus id, on purpose:** company B's
OWNER voiding company A's document passes the role gate for real, and the row EXISTS
and is merely invisible — which is what "RLS discarded it" means. It doubles as a
tenant-isolation assertion.

**And the verification run turned up a FOURTH instance of the fixture-drift class**
(`#5-s146`), which is the one that looked most like a real defect. `s97ct-isolation`
reported *"B's owner cannot soft-delete company A's invoice"* as FAILING. It was not a
breach: `firstIdFor()` picked with `.limit(1)` and neither an `is_deleted` filter nor an
ORDER BY, company A has four of ten invoices soft-deleted, and the pick handed the test
a row whose `is_deleted` was already `true`. B's owner was refused correctly and the
assertion failed anyway. Ruled out as a regression from the service change by checking
rather than assuming — that diff touches `contracts-client.ts` only and its single
occurrence of "invoice" is in a comment — and ruled out as a cross-harness race because
it **failed standalone**. Fixed by selecting live rows in a deterministic order; 14/14
after, which is itself the proof the isolation was never broken.

Box-map replace-not-merge was mutation-proved: removing the clear gives 3 boxes where 1
is expected. Reverted; service byte-identical to HEAD.

### S146 verification — printed exit codes, with corroboration

| Gate | Printed | Independent signal |
| --- | --- | --- |
| `type-check` | `TYPECHECK_EXIT=0` | 0 lines matching `error TS` |
| `lint` | `LINT_EXIT=0` | 0 `Error:`, 16 `Warning:` (all pre-existing) |
| `npm test` | `UNIT_EXIT=0` | **783 passed (783)**, 53 files |
| `next build` | `BUILD_EXIT=0` | `✓ Compiled successfully`, 95/95 pages |
| `s146-generate-route` | `EXIT=0` | **9/9** |
| `s146-contract-services` | `EXIT=0` | **20/20** |
| `s140-lien-releases` | `EXIT=0` | **18/18** (was `1 failed \| 16 passed`) |
| **full live suite** | **`LIVE_ALL_EXIT=0`** | **65/65 files, 752/752 tests, 0 failures** — after `#4-s146` |

⚠️ **The background-task notification reported `exit 0` for all four full-suite runs —
including the three whose printed line said `LIVE_ALL_EXIT=1`.** Only the printed line
is true; the summary is not, and it happened to be right only on the last run. Third
session in a row it has misreported.

**Four full-suite runs were needed, and each one earned its keep:** run 1 exposed the
`s97ct-reply-to` leak, run 2 exposed S146's own fixture drift, run 3 confirmed both
diagnoses and the `s138` intermittency, run 4 came back **clean**.

**The two residual failures, both pre-existing, both now resolved or characterised:**

- **`s97ct-reply-to.live.ts`** — `#4-s146`. **FIXED [Josh, option (a)]** after the
  fourth suite run was requested: one `purgeMarkerCompanies()` called from both ends,
  and a teardown that ASSERTS it worked instead of logging into a stream vitest
  suppresses. Before: pass, then fail. After: three consecutive passes, the first
  self-healing a leaked orphan. Mutation-proved.
- **`s138-trial-deletion-run.live.ts`** — **INTERMITTENT, and the S145 verification's
  description of it was too confident.** It was recorded as "passes alone, fails
  in-suite". Across four full-suite runs it **failed, passed, passed, failed**. It
  passes alone every time (`9/9`, `EXIT=0`, re-confirmed at S146). Across FIVE
  full-suite runs: **failed, passed, passed, failed, passed.** The trip is always the
  same safe-fail — its own fixture is not due for deletion, `expected [] to deeply
  equal [<id>]` — so it never risks deleting anything. Order- and state-dependent, not
  deterministic. Still not this branch's; still worth stating precisely rather than as
  "fails in-suite". **Left alone deliberately** — it is the one harness that permanently
  destroys a company, and its safety gate failing CLOSED is the behaviour you want.

---

## Owed, recorded so it is not lost

- **A1(i)** — teaching `v_is_signed` about the client-contract toggle. Accepted as not-done;
  the Contracts panel shows the contract's own state instead.
- **7I UI** — the next action above. **Read `#1-s146` first.**
- **§6.5 tokenised sub e-signature** — behind Gate 1. Confirmed still not built at S146:
  the only tokenised routes in the tree are `/sign` and `/sign-co`, both pre-existing.
- **#1-s143** — `enforce_time_clock_sessions_column_scope` still has no service-role escape.
- ~~**#1-s146**~~ — **FIXED at S146 before merge**, both halves, on Josh's ruling.
- **#2-s146** — trigger→type has no DB backstop. **Ruled: filed, not built.** Revisit only
  if a second writer to `lien_releases` appears.
- **#3-s146** — no constraint ties a template's `direction` to a release's. **Ruled: filed,
  not built** — it would foreclose a template serving both directions. Revisit on a bug.
- **`createContractDocument()` does not exist.** Noticed while writing S146 Part 4: 7I has
  no service function that creates a `contract_documents` row — the send flow that would
  own it is part of the UI. S146's harness seeds documents service-role to exercise the
  read and void paths. Not a defect; recorded so the UI session knows the write half of
  that table is still to be written.
