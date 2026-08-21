# S167 — Fixture inventory: what a click-test can change from the product UI

> **Raised:** August 20, 2026 (Session 167), after the S165 click-test signed a seeded fixture by
> accident and two `s164-m9-read-arms` assertions went red.
> **Parent debt:** [`TECH_DEBT.md` #149](../../TECH_DEBT.md) — *"the pinned fixtures are hand-curated
> on rebuild-test and reproducible from no script."* This document is that problem in miniature and
> at a scale we can actually work through.
> **Related:** `#1-s167fx` — **CLOSED at S168** (`20261023000000`); see the update below.
> `docs/specs/S165-m9-clicktest.md` §A.0 / §B.5.

---

## ⚠️ UPDATE [S168] — half of the worked example below is no longer true

**`#1-s167fx` is fixed.** An UNSIGNED change order now deletes cleanly, line items and all: the
`ON DELETE CASCADE` that `enforce_co_line_parent_open()`'s comment always assumed now exists, and
void gained a required reason and a reissue path. Josh's ruling and the migration are
`20261023000000`.

**What did NOT change, and is the reason the repair block still stands:** a **signed** change order
is refused by `enforce_change_order_delete_boundary()` for *every* caller, service role included —
*"a change order is a legal document, and being able to prove you never sent one is a claim the
system must not be able to make falsely"* [Josh, S168]. `CO-QA-M9-DRAFT` was signed, so it is still
unrepairable and still renamed aside rather than rebuilt.

### ⚠️ AND THE SECOND HALF OF THE PAIR WENT THE SAME WAY — `CO-QA-M9-SENT`, 2026-08-20 23:15 [found S168]

**`QA M9 — sent CO` is now `signed`.** Found while investigating unrelated residue; nobody reported
it, and nothing went red. Evidence, from `co_signing_sessions`:

```
status            completed
signer_channel    portal_session
signer_name       QA Client Linked
signed_at         2026-08-20T23:15:43
```

**It was signed from the PORTAL, during the Part B click-test** — not by a harness and not by a
migration. `9-spec.md` R10 puts a **Sign** affordance on exactly that row, B.2.2's expected-contents
table says so in as many words, and B.5 §1 says not to sign it. Both statements were true at once.

**Three things this proves that the CO-QA-M9-DRAFT incident did not:**

1. **The inventory's "reachable" column was too narrow.** It asked whether a fixture is reachable
   from *the product UI*, meaning the dashboard. This one was reached from the **portal** — a third
   surface, by a different identity, on a page built the same week.
2. **It is silent.** ARM 4a only requires the CO to be non-draft and ARM 5a only requires its line
   to be visible, so `s164-m9-read-arms` stayed **188/188 green over a moved fixture** across three
   separate runs. This is CLAUDE.md's S157 rule from the other end: not a test that contradicts a
   shipped rule, but a test whose assertions are all *satisfied* by the wrong state.
3. **It is unrepairable, and now for a reason the repo chose.** `signed_at` cannot be cleared
   (S164) and the row cannot be deleted (`enforce_change_order_delete_boundary`, S168). Unlike the
   draft, it cannot even be renamed aside and rebuilt: `CO-QA-M9-SENT`'s `co_number` is frozen, and
   the seed's `ensureRow` key is its **title**, so a rename frees the title but the number stays
   taken — a rebuild must take `CO-QA-M9-SENT-2`.

**Not repaired in S168, deliberately** — Josh's click-test is mid-flight against these rows and
re-seeding under him is the S167 mistake repeated. **What is owed:** the same rename-aside-and-rebuild
the draft got, plus a decision on whether the seeded pair should carry a Sign affordance in the
portal at all. A fixture whose whole job is to sit in one state should probably not be the row the
click-test is told to click.

**And the tests should not have stayed green.** ARM 4a should assert the seeded sent CO is
specifically `sent`, not merely non-draft — that is the assertion that would have caught this at
23:15 instead of two hours later by accident.

**And the inventory's own point survives intact** — arguably it is sharpened. The fixture was still
reachable in two clicks from the product UI; the class of problem was never the FK. Everything below
this line reads as written, with that one correction applied to the "Not deletable" bullet.

---

## The question this inventory exists to answer

`seed-test-identities.mjs` is described everywhere — including in the click-test doc it hands to a
human — as **"idempotent and self-repairing."** That is true of most of it and it is the reason
clicking around rebuild-test feels safe.

**It is not uniformly true, and the exceptions are invisible until one of them fires.** So every
fixture needs to be placed on two axes:

1. **Reachable** — can a human sitting in the product UI, following the click-test, change it?
2. **Repairable** — does re-running the seed put it back?

The dangerous quadrant is **reachable + not repairable**, and until S167 nobody had written down
which fixtures were in it.

> **The sharper form of the rule:** a fixture whose *state* is a product action away is not
> protected by a warning in a document. It is protected by the seed being able to undo that action,
> or it is not protected.

---

## What happened, as the worked example

`CO-QA-M9-DRAFT` ("QA M9 — draft CO") existed to prove one thing: **a client cannot see a draft
change order.** It sat in the CO list of the fixture project, **directly under the throwaway CO the
click-test tells you to create** (the list orders by `co_number` ascending, and `CO-159-64` sorts
above `CO-QA-M9-DRAFT`). Being a draft, the page offered **Send** in one click and printed a signing
link the moment it was sent. It was signed on 2026-08-20.

**Two clicks. Two red tests. And the fixture could not be put back:**

- **Not revertable** — `enforce_change_order_immutability()` refuses to clear `signed_at`, refuses
  to clear `contractor_signed_at`, and refuses to restore `net_delta`. Those refusals are *correct*
  — they are the S164 signature fix and the S123-era money freeze doing their jobs. Service role
  does not help; it bypasses RLS, not triggers.
- **Not deletable** — at S167, because the line-item FK had no `ON DELETE CASCADE` so the parent
  could not go first, and the line was frozen with its parent so the line could not go first either
  (`#1-s167fx`). **At S168 that deadlock is fixed and this row is still not deletable, for a
  different and deliberate reason: it is SIGNED.**

So the seed's S167 repair does the only thing left: **renames the corpse aside and builds a new
draft next to it.** Each accident of this kind leaves one more permanent row in the fixture project,
and `s164-m9-read-arms` ARM 5b had to be re-anchored from the line's *name* to its *parent id*,
because the dead CO keeps a line called "QA M9 line on the DRAFT co" that is now — correctly —
visible to the client.

**The three things that made it likely, all of which generalise:**

1. The warning named **one** fixture ("QA M9 — sent CO") and there were **two**.
2. The dangerous one was adjacent to the safe one in the list, and looked like it.
3. The document said "reseed fixes most mistakes", and the reader had no way to know this was not
   one of them.

---

## The inventory

Scope: the fixtures `S165-m9-clicktest.md` §B.5 already tells a human not to touch, plus the CO pair
that caused this. **This is a start, not a survey** — the seed creates far more rows than these, and
the rest have not yet been walked. Rows are marked ❓ where reachability or repair was inferred from
the click-test doc rather than confirmed against the seed code.

> ⚠️ **"Reachable from the UI" means EVERY surface, not the dashboard.** The `CO-QA-M9-SENT`
> casualty above was reached from the **portal**, which this table did not consider when it was
> written. Re-read every row with `/m` and `/portal` in mind, not just `/dashboard`.

| Fixture | Reachable from the UI? | Repaired by a reseed? | Notes |
| --- | --- | --- | --- |
| **`QA M9 — draft CO`** (`CO-QA-M9-DRAFT-2`) — must stay `draft` | 🔴 **Yes, in two clicks** — Send, then the signing link on the page | 🔴 **NO.** Only renamed aside and rebuilt | The S167 incident. Seed: S167 repair block. Sits directly under the click-test throwaway. |
| **`QA M9 — sent CO`** (`CO-QA-M9-SENT`) — must stay `sent`, with its line | 🔴 **Yes, from TWO surfaces** — the staff signing link, **and the portal's own Sign button** | 🔴 **NO — and it has now happened.** Signed from the portal 2026-08-20 23:15. Not even renameable-and-rebuildable: `co_number` is frozen | The pre-existing repair block covers the wrong failure mode: it handles "sent too early", not "signed by hand". See the S168 section above. |
| **`qa-m9-visible.jpg` / `qa-m9-hidden.jpg`** `client_visible` flags | 🟠 Yes ❓ | 🟢 **Yes** — the seed re-asserts both flags every run and logs `REPAIRED` | **This is the pattern to copy.** The flags *are* the test, so the seed states them rather than assuming them. |
| **Client R17 state** (`profiles.client_access_state`) | 🔴 Yes — a settings toggle | 🟢 **Yes** — reset to `active` every run, logged `REPAIRED` | Also reset in `s164-m9-read-arms`'s own `afterAll`. |
| **`QA A — M9 completed 200d`** — `status`, `actual_end_date` | 🟠 Yes ❓ | 🟢 **Yes** — the seed re-asserts both and rewrites them if they drift | Guards the R5 45-day window. |
| **Control client `josh+qa-client@`** must stay **unlinked** (`contact_id IS NULL`) | 🟠 Yes ❓ — B.5 warns against linking it | 🔴 **NO.** The seed links the *linked* client and never re-asserts the control's NULL | **Silent if it fires:** linking the control makes every "refused by rule" assertion vacuous, and nothing goes red. Worst failure mode on this table. |
| **`ZZ click-test CO`** (`CO-159-64`) — the throwaway | n/a — you create it | n/a | Cannot be deleted once signed (`#1-s167fx`). Number future throwaways rather than reusing the title. |

---

## What to do about it

**Ranked by the failure being silent, not by effort.**

1. **The control client's NULL `contact_id` should be re-asserted by the seed**, the way the photo
   flags are. It is the only row here whose corruption produces **green tests that prove nothing** —
   every other row on this table goes loudly red. One `.update({contact_id: null})` guarded on the
   email, with a `note(..., 'REPAIRED', ...)`.
2. **Extend the pattern, don't extend the warnings.** Every fixture whose *state* (not existence) is
   the test should be re-asserted and logged each run — `ensureRow` only creates what is missing, so
   a row that exists in the wrong state is silently accepted. The photo-flag block is nine lines and
   is the model.
3. **Where the seed genuinely cannot repair, say so at the point of danger.** Done for the CO pair
   in `S165-m9-clicktest.md` §A.0 / §A.4 / §B.5. The claim "a reseed fixes it" must not be made
   blanket in a document a human is following while clicking.
4. **Finish the survey.** Walk the rest of `seed-test-identities.mjs` and place every fixture on the
   two axes above. The rows marked ❓ get confirmed in the same pass.
5. **⚠️ THE HARNESSES NOW LEAK ~3 INVISIBLE ROWS PER FULL RUN, AND THAT IS THE RULING'S PRICE
   [S168].** Three probes genuinely CONSUME a signature-bearing change order —
   `s168-co-lifecycle` L1d (signed → voided), and `s164-m9-client-writes` W7 (portal signature) and
   W8 (the first-stamp guard). A signed change order cannot be deleted by anyone, so each run leaves
   one row apiece. They are **soft-deleted**, so they leave every listing and stop contributing to
   the revised-contract derivation (`CONTRACT_CONTRIBUTING_CO_FILTER` includes `is_deleted: false`),
   and the teardown PRINTS the count rather than hiding it. Their `co_number`s are timestamped, so
   they can never collide with a later run — the growth is invisible, bounded per run, and
   deliberate. **Do not "fix" it by adding a service-role escape to
   `enforce_change_order_delete_boundary()`.** That is the one thing the boundary exists to refuse.

6. **Prefer fixtures the product cannot reach.** Where a proof needs a row in a state a user can
   change, ask whether a *dedicated* row — not one shown in a list the click-test walks through —
   would do. This is the cheap version of #149's real fix and it does not need the reproducible
   seed to land first.
