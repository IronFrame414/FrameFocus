# S111 — session prompt: a project-scoped role, plus photo routing and camera-roll upload

Fresh context. Read this whole prompt, then the spec, before doing anything.

**Three phases:** analyze read-only → ask everything in one plain-text message and STOP → build.

---

## ⚠️ HOW TO ASK — read before Phase 2

⚠️ **Never the interactive picker.** Josh is notified when a turn ends; the picker does not trigger
that notification, so he will not see it and the session sits idle.

Plain text, in your final message, then **end the turn**. No timers, no loops.

```
Q1. [ASK-1] <the question, stated in full — Josh may be reading it with no memory of the spec>
    Options: A) ...  B) ...
    My recommendation: <which, why, one line>
```

⚠️ **State each question in full.** A ruling that says only "Q3: option A" is useless to a future
session; so is a question that assumes the reader has the spec open.

Ask **all** questions from both parts in that one message. Do not ask Part One's, build, and then
come back for Part Two's.

---

## The work

**`docs/specs/S111-SPEC-project-scoped-role.md`** — the scaffold. Fill it in place; do not
restructure it and do not write a new spec file.

**It has two parts, and they are independent of each other.**

**Part One — a new role.** Josh needs an account with complete access to a project, financials
included, and no company-level access. He has ruled this is a new role, not per-user permissions.

⚠️ **The first real question is whether a new role is needed at all.** FILL-1 measures what
`project_manager` already does. If the gap is small, say so — a narrower change to PM plus a
scoping rule may be the better answer, and Josh would rather hear that than receive a role he did
not need.

**Part Two — photos.** Two defects, in Josh's words:

> "the photo from site visit and estimate are under files when converted to project. they should be
> under photos so they can be marked up. also, there is no way to add pictures from the camera roll"

⚠️ **Do not propose a Part Two fix before FILL-8 is filled.** FILL-8 establishes what actually
separates a photo from a file in this schema. Until that is answered, you do not know whether this
is a write-path bug, a conversion bug, or a query bug, and the three have different fixes.

⚠️ **FILL-11 may end Part Two early.** If image markup does not exist yet, this stops being a
routing fix and becomes a feature Josh has not scoped. Say so in one line and ask; do not build it.

**Two branches, one per part** (FILL-14). ⚠️ **One branch's CI at a time.**

---

## State — verify against git, do not trust this

- `main` carries S110 in full (seven sections) plus the company-email work. Production has every
  migration through `20261760000000`, verified by object.
- `feature/m-visual-sweep` is built and awaiting CI and a merge; it is not this work. ⚠️ **Its CI
  may still be running — check before you push anything.**
- The CLI is linked to **rebuild-test** (`nmyphyhmfttxkdoposvf`). ⚠️ **It can reach production** —
  check `supabase/.temp/linked-project.json` before any `db push`.
- Josh and three real staff use this in production daily.

---

## Phase 1 — analyze, read-only

Fill every FILL by measurement.

⚠️ **Confirm the instrument measured the thing.** This campaign has lost time to a wrapper's echo,
a `grep` truncated by `head`, a script that threw and printed a conclusion anyway, a cached read,
and a Turbo cache hit reported as a build. One of those shipped a production regression: a
`head -10` search for a route's consumers missed the eleventh hit and every site-visit photo went
blank. **Never truncate a search whose completeness is the point. State the command and the full
count.**

⚠️ **Part One's version of that trap is the literal role array.** Role lists are written out by
hand in policies, triggers, functions and TypeScript. Miss one and you get a silent denial or a
silent leak. FILL-3.1 exists for that reason; treat its count as load-bearing.

⚠️ **Part Two's version is the upload entry point.** FILL-10 must find every one of them across
`/m` and desktop. This is the same shape of search that already shipped one production regression
when it was truncated.

## Phase 2 — ask, then stop

⚠️ **ASK-1 is Josh's product language, not ours** — what the role is called appears in the invite
form, the team list and the database.
⚠️ **ASK-2 and ASK-4 draw the company/project boundary.** An invoice belongs to a project and to
the company's books; say how you divided them rather than assuming.
⚠️ **ASK-8 carries a row count.** Josh cannot decide whether to move existing production images
without knowing how many there are.

Also ask, explicitly: **may these branches be merged**, and in what order.

## Phase 3 — build

Stop rules, which override "do not stop":

1. Anything that writes to **production** — including any backfill of existing image rows.
2. A decision not settled in the spec.
3. Destroying existing rows, or **moving** them between surfaces.
4. ⚠️ **Any change that weakens the Financial Visibility Floor.** A gate controlling only rendering
   still ships the data in the payload (`#136`). Authority belongs in the database.
5. Merging, unless Josh authorized it — and ⚠️ **never a branch carrying a migration before Josh
   has applied that migration to production.** A merge to `main` deploys.

---

## Standing constraints

Push the branch after every commit. Commit path-scoped; never `git add -A`. Migrations
rebuild-test only, via `supabase db push`, never MCP `apply_migration`; ⚠️ **count the rows any new
constraint governs on PRODUCTION first and give Josh the query** — a constraint written against
rebuild-test's rows has aborted on production twice. `next build` must pass; type-check is not
enough. Read the printed exit line. **A test that passes on zero rows is a failure — state row
counts.** Green means no regression, not a working feature.

⚠️ **One branch's CI at a time.** Check the Actions API for an in-progress run before pushing and
before any local e2e. Concurrent suites against rebuild-test produced two false reds in S110.

Append to `docs/sessions/S111-report.md` after every step, commit the append, push. ⚠️ **The
Codespace restarts without warning — three times on 2026-09-23/24; the pushed report is what
survives.** A rebuild also removes Claude Code — `npm install -g @anthropic-ai/claude-code`.

Final report in plain text: what is built and proven, what is built and untested, what is blocked;
every migration owed to production with its row count; anything awaiting a ruling; and **what a
person still has to click before this is trusted** — for Part Two that includes taking a photo on a
real phone, choosing one from the camera roll, and marking one up.