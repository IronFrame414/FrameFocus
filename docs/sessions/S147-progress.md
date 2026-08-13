# S147 — progress log

**Branch:** `feature/s147-trial-screens-teardown`, cut off `198be2a` (`origin/main`).
**One task, test-only.** No shipped code, no migration.

---

## RESUME HERE

**`#1-s147` DONE, committed and pushed. Nothing is blocked.**

**NEXT ACTION: `#2-s147` — the same leak in five more harnesses.** Start with
`test/live-session.ts:107-111` (`adoptSignupProfile()`), because it is the SHARED helper
and every harness that adopts a signup profile inherits it. The fix is the same shape
each time and they can go in one pass.

⚠️ **Reproduce and verify Playwright with `--workers=1`.** `playwright.config.ts` sets
`workers: process.env.CI ? 1 : undefined`, so a local run forks and executes `beforeAll`
**per worker**. Without the flag this file leaked 12 companies per run rather than 2 and
showed two extra failures that are parallel-fixture artifacts CI never sees.

---

## The failure

CI #210 on `main`, `desktop-trial-screens.spec.ts:74` — *"an S139% company survived
teardown"*: **2, then 4, then 6** across the attempt and its two retries.

**The retries were the diagnosis.** Two more companies per attempt, none cleaned up —
a fixture creating rows it cannot delete, with the retry mechanism making it worse.

## The cause, measured rather than assumed

87 tables reference `companies` with `NO ACTION`. A query across **all** of them found
exactly one holding rows for the orphans:

| blocking table | rows |
| --- | --- |
| `lien_release_templates` | **96** (12 companies × 8) |

7F's seed trigger (`20260922000000`) creates 8 templates on every company insert and the
FK does not cascade:

```
23503: update or delete on table "companies" violates foreign key constraint
"lien_release_templates_company_id_fkey" on table "lien_release_templates"
```

`destroyThrowawayCompany()`'s inline child list never knew about them — **and the parent
delete discarded its error entirely**, `await admin.from('companies').delete()` with no
`.error` read. So the company survived, the auth user was deleted successfully, and the
orphan became **unreachable by email forever**, which is why the fixture's own by-email
self-heal could never recover it.

**Same cause as `#4-s146`**, confirmed before assuming rather than after.

**The fixture's header asserted the property it lacked** — *"deletes children in FK order
and **verifies** the parent is gone, rather than assuming."* It did neither. Quoted in
place rather than deleted: a comment claiming a property the code does not have is what
stops the next reader checking.

## The fix

One `purgeMarkerCompanies()`, called from **both ends** — self-healing in `beforeAll`,
complete in `afterAll` — keyed on the **name** (`S139%`) rather than ids captured this
run, deleting in FK order through a shared `deleteCompanies()` that
`destroyThrowawayCompany()` now also uses, with the parent delete's error **checked and
thrown**.

A unique-per-run slug was rejected again, for the reason ruled at `#4-s146`: it stops the
collision and keeps leaking companies.

## Red → green

From a **clean database**, serial (`--workers=1`, as CI runs):

| run | result |
| --- | --- |
| red 1 | `Expected: 0 / Received: 2` — `EXIT=1` |
| red 2 | `Received: 4` — `EXIT=1` |
| **green 1** | **16/16, `EXIT=0`** — started with **4 orphans present**, self-healed |
| **green 2** | **16/16, `EXIT=0`** |
| **green 3** | **16/16, `EXIT=0`** |

Database after the three green runs: **2 companies, 0 orphans.**

**Mutation-proved.** Dropping `lien_release_templates` from the child list turns the run
red **naming the cause**: *"purge companies: update or delete on table "companies"
violates foreign key constraint "lien_release_templates_company_id_fkey""* — the exact
condition that was silent before. Reverted; the next run self-healed the 2 the mutation
had leaked.

## Orphan purge — before and after

| | companies | orphans (no profile) | `S139%` |
| --- | --- | --- | --- |
| **before** | 111 | **109** | 12 |
| **after** | 2 | **0** | 0 |

Only Bishop Contracting (7 profiles) and Ridgeline Builders (1) are real. 872 blocking
templates removed with them.

## Verification — printed exit codes, with corroboration

| Gate | Printed | Signal |
| --- | --- | --- |
| `type-check` | `0` | 0 lines matching `error TS` |
| `lint` | `0` | 0 `Error:`, 16 `Warning:` (all pre-existing) |
| `desktop-trial-screens` ×3 | `0` each | **16/16** each |
| Playwright chunk 1 (12 desktop specs) | `0` | **80 passed** |
| Playwright chunk 2 (9 mobile chat/capture) | `0` | **146 passed** |
| Playwright chunk 3 (`m-photos` alone) | `0` | **42 passed** |
| Playwright chunk 4 (9 remaining) | `0` | **248 passed** |
| **Playwright total** | **all `0`** | **516 passed, 0 failed** |
| full live suite | **`1`** | 65 files, 747 passed, **7 failed in 1 file — not this branch's** |

Four processes with a dev-server restart between each, `#145`'s accepted workaround,
`--workers=1` throughout to match CI.

⚠️ **The background-task notification again reported `exit 0` for the live-suite run whose
printed line said `LIVE_ALL_EXIT=1`.** Fifth occurrence across three sessions. Only the
printed line is true.

**The live-suite failure is `s138-trial-deletion-run.live.ts`** — the intermittent S146
characterised (fail, pass, pass, fail, pass over four runs; now a fifth fail). Identical
safe-fail signature, `expected [] to deeply equal [<id>]`: its own fixture is not due for
deletion, so it never risks deleting anything. **Re-confirmed rather than assumed** —
`9/9`, `EXIT=0` standalone. Not this branch's, and left alone deliberately: it is the one
harness that permanently destroys a company, and a safety gate failing *closed* is what
you want.

**The full Playwright suite added ZERO orphans.** After all four chunks: `S139% = 0`. The
one company that appeared between measurements was `S138 Doomed Co`, created by the
`s138-trial-deletion-run` standalone re-run above, not by any e2e spec.

## ⚠️ `#2-s147` — S139 was the smallest of six leakers

`S139%` is the one CI named; it was not alone. **One full live-suite run after the purge
re-created 12 orphans, none of them `S139%`:**

| leaker | orphans before purge | re-created by ONE live-suite run |
| --- | --- | --- |
| `s138-trial-*` | 30 | 4 |
| `live-session.ts` `adoptSignupProfile()` — "My Company" | 21 | 2 |
| `s136-company-slug` | 21 | 3 |
| `s137-trial-lifecycle` | 15 | 2 |
| `s135-invite-fallthrough` | 10 | 1 |
| `desktop-trial-screens` (**fixed**) | 12 | **0** |

**Nine harnesses create a company** — three by direct insert (`s136-company-slug`,
`s137-trial-lifecycle`, and `s97ct-reply-to`, already fixed as `#4-s146`) and six via
`auth.admin.createUser()` → `handle_new_user()`. **Any harness that creates a company
inherits this.**

So: **this has already surfaced a fourth, fifth and sixth time** — silently, because only
`desktop-trial-screens` asserts a company count. The others leak without going red, which
is precisely the `#4-s146` lesson: *a cleanup that cannot fail its own run is not a
cleanup.*

**`live-session.ts:107-111` is the one to fix first** — it is the shared helper, it
deletes `tag_options`, `subscriptions`, `companies` and nothing else, and it checks no
error.

## Three harnesses, two sessions, one mechanism

`#4-s146` (`s97ct-reply-to`), `#5-s146` (`s97ct-isolation`) and now `#1-s147`. The common
cause is **7F's seed trigger**: it fires on every company insert and creates 8 templates
the FK will not cascade. Every teardown written before `20260922000000` is a candidate.

**A build that changes what gets seeded owes a run of every harness that creates the
thing being seeded.**
