# S147b — `#2-s147`, the five remaining company leakers

**Branch:** `feature/s147b-company-leak-sweep`, cut off `510e6ed` (`origin/main`, with
`#1-s147` merged). **Test-only.** No shipped code, no migration.

---

## RESUME HERE

**`#2-s147` DONE, committed and pushed. Nothing is blocked.**

**Acceptance test met:** full live suite, companies **before `2 / 0 orphans`, after
`2 / 0 orphans`**. Previously one run re-created 12.

Nothing is owed on this thread. The one remaining known-red harness,
`s138-trial-deletion-run.live.ts`, is the S146 intermittent and is **not** this work —
see below.

---

## The attribution was wrong in one place, and measuring found it

`#2-s147` attributed the leak by company-name marker, with my own caveat that this was
not instrumentation. Re-done properly — purge to zero, run each harness **alone**,
measure the delta:

| harness | measured leak/run | filed guess |
| --- | --- | --- |
| `s136-company-slug` | 3 | ✓ |
| `s137-trial-lifecycle` | 2 | ✓ |
| `s138-trial-unlock` | 2 | grouped as 4 across three files |
| `s138-trial-export` | 1 | ✓ |
| `s138-trial-deletion-run` | 1 | ✓ |
| **`s97ct-7e-clicktest`** | **2** | **filed as "live-session `adoptSignupProfile`"** |
| `s135-invite-fallthrough` | 1 | ✓ |
| `s133-subcontractor-read-floor` | **0** | — not a leaker |
| `s97ct-reply-to` | **0** | control; `#4-s146` holds |

**Why the marker misled.** `"My Company"` is `handle_new_user()`'s DEFAULT name for any
`createUser` that passes no `company_name`. `adoptSignupProfile()` is the **mechanism**;
`s97ct-7e-clicktest` is its only caller. Attribution by name could never have told those
apart.

**And `s133` creates users while leaking nothing** — it passes `invitation_token`, so the
invited path joins an existing tenant instead of building one. That is the clean
counter-example: the leak is not "creating a user", it is "taking the owner path".

## How many did the shared helper cover? One.

Fixing `live-session.ts:107-111` first, as ruled, took `s97ct-7e-clicktest` from **2 → 0**
with 34/34 still passing. It has exactly one caller, so it covered **one of the six** —
which is why the remaining five each needed their own wiring. Establishing that before
touching the rest was the point of measuring first.

## The fix

**One shared module** — `apps/web/test-support/company-purge.ts` — imported by both the
vitest tree and the Playwright tree:

- `COMPANY_CHILDREN` — the child list, in FK order
- `deleteCompanies()` — deletes children then the parent, **and throws if the parent
  survives**
- `purgeCompaniesNamed()` — keyed on the **name**, matched **case-insensitively**

`#4-s146` and `#1-s147` had each grown their own copy of this idea. The child list is the
thing that goes stale, and it now goes stale in **one place** — the parity ruling's point
that "a second implementation that does the same thing is the divergence".

**Case-insensitivity is load-bearing**: `s136-company-slug` names companies both
`S136 Idem …` and `s136-walk-…`, and a case-sensitive match silently misses half — the
same class of bug as the leak itself.

Each harness now purges from **both ends** and asserts it worked.

## Acceptance test

| | companies | orphans |
| --- | --- | --- |
| before full live suite | 2 | **0** |
| after full live suite | 2 | **0** |

**Zero new companies.** Previously: 12.

## Mutation proof — and the `COMPANY_CHILDREN` question

`contacts` is deliberately **not** in `COMPANY_CHILDREN`, and `s138-trial-export`
populates it. Removing that harness's own `contacts` delete gives:

```
Error: purge companies: update or delete on table "companies" violates foreign key
constraint "contacts_company_id_fkey" on table "contacts"
```

The run fails, **naming the table to add**. So the flagged risk holds as designed: a
company that acquires a child outside the list **fails loudly rather than leaking**. The
next run then refuses to start over the residue rather than proceeding — the same
property one layer earlier. Reverted; 6/6 green after.

## Verification — printed exit codes

| Gate | Printed | Signal |
| --- | --- | --- |
| `type-check` | `0` | 0 `error TS` |
| `lint` | `0` | 0 `Error:`, 16 pre-existing `Warning:` |
| per-harness re-attribution | all `0` | every fixed harness leaks **0** |
| full live suite | **`1`** | 65 files, 747 passed, **7 failed in 1 file** |

**The live-suite failure is `s138-trial-deletion-run.live.ts`** — the S146 intermittent,
identical safe-fail signature (`expected [] to deeply equal [<id>]`: its own fixture is
not due, so it never risks deleting anything). **I edited that file, so I did not assume**
— it passes **9/9 alone, twice**, after the change. Across seven full-suite runs now:
fail, pass, pass, fail, pass, fail, fail. Order- and state-dependent; not this work.

⚠️ **Two traps hit and caught by reading logs rather than exit codes**, both already on
record: a vitest run launched from the repo root gives `Cannot resolve entry module
test/live.vitest.config.ts`, which reads as a failure and is a cwd error — it happened
twice here after a `cd` for `git status`. And the background-task notification again
reported `exit 0` for the live-suite run whose printed line said `LIVE_ALL_EXIT=1`.

## One thing not reproduced

During the re-attribution sweep `s137-trial-lifecycle` failed once on *"a postponed
company is not warned"* (`expected 1 to be +0`) — `runTrialWarnings()` sweeps every
company holding a `trial_lifecycle` row, so that assertion depends on no other warnable
tenant existing. It did **not** reproduce: 20/20 alone, and 20/20 again run directly
after `s136`. Recorded rather than diagnosed, because a cause I cannot reproduce is a
guess. If it returns, the shape to look at is cross-harness `trial_lifecycle` state, not
the purge.
