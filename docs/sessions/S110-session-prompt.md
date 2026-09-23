# S110 — session prompt: site-visit access, desktop path, carried debt

Fresh context. Read this whole prompt, then the spec, before doing anything.

**Three phases:** analyze read-only → ask everything in one plain-text message and STOP → build.

---

## ⚠️ HOW TO ASK — read before Phase 2

⚠️ **Never the interactive picker.** Josh is notified when a turn ends; the picker does not trigger
that notification, so he will not see it and the session sits idle.

Plain text, in your final message, then **end the turn**. No timers, no loops.

```
Q1. [SECTION A / ASK-A.A] <question>
    Options: A) ...  B) ...
    My recommendation: <which, why, one line>
```

All questions in one message. Ruling changes first, marked `[RULING CHANGE]`.

---

## The work

**`docs/specs/S110-SPEC-site-visit-access-and-debt.md`** — the scaffold. Fill it in place; do not
restructure it and do not write a new spec file.

| § | what | note |
| --- | --- | --- |
| A | site-visit access rewritten — read/edit widen to every employee; lock at SEND not promotion; adding stays open at every status | **largest, riskiest, build LAST** |
| B | a desktop path to site visits | depends on A's read rule |
| C | the missing `/m` link to `/m/account` | small |
| D | two S109 click-test defects — no row reorder inside a line; a grip click does not focus | small |
| E | carried S109 debt — `/reset-password`, catalog link, `#161`'s remaining sites, `#1-deliv` | |
| F | a guard so a route-contract change cannot silently break a consumer again | **build FIRST** |
| G | Josh's items — prepare only, execute none | |
| H | language — a per-user setting, `/m` chrome in Spanish, and user-entered text translated for the reader on every surface | **new infrastructure; build after A** |

⚠️ **Section A overturns rulings enforced in the DATABASE and live on production since
2026-09-23.** Read `docs/sessions/S108-report.md` Step 5 before touching it. Quote every superseded
ruling in place; delete none.

⚠️ **Section H is new infrastructure and has a hard boundary: EVERYTHING CLIENT-FACING IS ENGLISH.**
Proposals, contracts, lien releases, invoices, the client portal and every outbound client email
render in English and are never translated. System text is translated on `/m` only — `/dashboard`
chrome stays English, and the rest of the product is a LATER campaign that does not start here.
**User-entered text is translated for the reader on every surface, desktop included** — that is the
point of the section.

---

## State — verify against git, do not trust this

- `main` carries S109 in full plus the photo-regression fix. `20261700000000` and `20261710000000`
  are on production, verified by object.
- The CLI is linked to **rebuild-test** (`nmyphyhmfttxkdoposvf`). ⚠️ **It can reach production** —
  check `supabase/.temp/linked-project.json` before any `db push`.
- Test identities were reseeded 2026-09-23; every one is on the documented password.
- Josh and three real staff use this in production daily.

---

## Phase 1 — analyze, read-only

Fill every FILL by measurement.

⚠️ **Confirm the instrument measured the thing.** This campaign has lost time to a wrapper's echo, a
`grep` truncated by `head`, a script that threw and printed a conclusion anyway, an absent `dig`, a
cached read, and a Turbo cache hit reported as a build. **The most recent instance shipped a
production regression**: a `head -10` search for consumers of a route missed the eleventh hit, and
site-visit photos went blank for every user. Section F exists because of it.

**Never truncate a search whose completeness is the point. State the command and the full count.**

## Phase 2 — ask, then stop

⚠️ **ASK-A.A, ASK-A.B and ASK-A.C decide who may read and write other people's field notes.**
⚠️ **ASK-B.A is new capability, not a missing link.**
⚠️ **ASK-E.A is the only password-recovery path on production.**
⚠️ **ASK-H.D decides whether a machine translation can reach a client's contract.** Section H's
RULED line 5 exists to prevent exactly that; do not settle it yourself.

Also ask, explicitly: **may this branch be merged**, and as one branch or one per section.

## Phase 3 — build

Order: **F first**, then C, D, E in any order, then **A**, then **B**, then **H last**.

⚠️ **H after A, deliberately.** `SiteVisitRecord` is one component mounted by `/m` and two desktop
pages, and Section A rewrites who may write to it. Translating its strings before A has rewritten
them means doing the work twice.

Stop rules:

1. Anything that writes to **production**.
2. A decision not settled in the spec.
3. Destroying existing rows.
4. Any change that weakens the **Financial Visibility Floor** — a gate controlling only rendering
   still ships the data in the payload (`#136`). Authority belongs in the database.
5. **Section A before its ASKs are ruled.**
6. ⚠️ **Any translation reaching a client-facing document, email or the portal.**
7. Merging, unless Josh authorized it in Phase 2 — and ⚠️ **never a branch carrying a migration
   before Josh has applied that migration to production.** A merge to `main` deploys.

---

## Standing constraints

Push the branch after every commit. Commit path-scoped; never `git add -A`. Migrations
rebuild-test only, via `supabase db push`, never MCP `apply_migration`; ⚠️ **count the rows any new
constraint governs on PRODUCTION first and give Josh the query** — a constraint written against
rebuild-test's rows has aborted on production twice. `next build` must pass; type-check is not
enough. Read the printed exit line. A test that passes on zero rows is a failure — state row counts.
**Green means no regression, not a working feature.**

⚠️ **Do not run two heavy suites at once against rebuild-test, and check the Actions API for an
in-progress run before any e2e work** — under "push after every commit" this session is the most
likely second consumer.

Append to `docs/sessions/S110-report.md` after every step, commit the append, push. ⚠️ **The
Codespace restarts without warning; the pushed report is what survives.** It restarted twice on
2026-09-23. A rebuild also removes Claude Code — `npm install -g @anthropic-ai/claude-code`.

Final report in plain text: per section — built and proven, built and untested, blocked and why;
every migration owed to production with its row count; anything awaiting a ruling; and **what a
person still has to click before this is trusted.**