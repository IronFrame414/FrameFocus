# S108 — SPEC D — Tooling, test debt, housekeeping

**Status: INCOMPLETE until the audit at the bottom passes.**

**RULED** = settled by Josh. **FILL-n** = CC measures. **ASK-n** = Phase 2 question.

⚠️ **A FILL you cannot fill must say why, in one line. Never delete a marker.**
⚠️ **If a measurement contradicts a RULED line, STOP and report.**

Builds second, after Spec C.

---

## D1 — The four tooling items [RULED: in scope]

**D1a — Turn off markdown format-on-save.** A formatter reflows every table in `CLAUDE.md` on
save: a two-line edit produced a 77-line diff, and `STATE.md` a 98/88 diff. It will do the same to
`TECH_DEBT.md` and every spec.

**FILL-D1a** — Which formatter (VS Code Prettier extension? a repo setting?), whether
`.vscode/settings.json` exists and is committed, and whether any CI step runs Prettier over `.md`.
⚠️ **`TECH_DEBT.md` is already Prettier-unclean on `main`** — do not reformat it; that buries every
future diff.

**D1b — A pre-push hook running `next build`.** Type-check passed and the build failed twice, and
both shipped (a client component importing a server module; a shared constant in a route file).

**FILL-D1b** — ⚠️ **This conflicts with two standing rules.** CC pushes after EVERY commit, and a
`next build` takes minutes — a hook would add that to every push. And CI now runs on every branch
push (ruled S107, `cancel-in-progress`). State: does CI already run `next build` on branch pushes?
How long does a local build take? Then ASK-D1.

**D1c — A migration-vs-ledger check.** The ledger lied twice in S104.

**FILL-D1c** — ⚠️ **Does `npm run db:verify` already exist on `main`** (S107 was told to build it)?
If it does, state what it checks and whether it covers the LEDGER — duplicate versions,
MCP-signature rows (name prefix ≠ version), rows with no matching file, files with no row, and the
ordered-version md5 fingerprint used against production in S104. Extend it to cover what is missing.
If it does not exist, build it.

**D1d — Install `gh` in the devcontainer.** Not via `apt` — that vanishes on rebuild, like Claude
Code does.

**FILL-D1d** — The devcontainer feature to use, and ⚠️ **what `gh` can actually do here**: the
Codespace token returned **403 on the Actions cancel API** in S107 (no `actions:write`). State what
it can read and what it cannot. ⚠️ **The devcontainer applies on REBUILD, not restart.**

---

## D2 — Test debt

**D2a — `#157`: the `desktop-chat-switcher.spec.ts:62` flake.** Filed with a run number and window
(CI #303/#304 overlap, run-against-run on a serial `workers: 1` suite). The next step recorded in
the entry is **one solo run on an idle rebuild-test.** Do it. ⚠️ **Do not run it while any other
suite is running** — S107 measured that load degrades the whole project with a long recovery tail.

**D2b — `#1-deliv`: the directly-invoked-handler class.** S107 found `s160` A1/A2 green for eleven
sessions over a feature that never fired, because the harness committed the user before calling the
hook. **Wherever correctness depends on WHEN a handler is called, invoking it directly proves the
opposite of what it appears to.** Suspects recorded: `/api/auth/send-email`,
`/api/webhooks/resend`, `/api/webhooks/stripe`, any `.live.ts` importing a route module and calling
`GET`/`POST`.

**FILL-D2b** — For each suspect: what the test asserts, whether its correctness depends on
call-timing, and one of: **covered / uncovered / cannot be covered from vitest.** "Uncovered" is a
legitimate answer. Fix what is cheap; file the rest. **Do not weaken an assertion to make it pass.**

---

## D3 — Housekeeping

**D3a — `docs/sessions/context2.md:12`** holds a committed `sb_publishable_` key for production.
That key was **revoked on 2026-09-21** (revoking the `sb_secret_` key took the whole new-format set,
and briefly took production auth down). Replace the value with a note that it was revoked and when.
⚠️ Git history keeps it; that is acceptable only because it is revoked and publishable.

**D3b — Re-sync rebuild-test's comment-stripped functions.** MCP `apply_migration` deployed
comment-stripped bodies for `convert_estimate_to_project`, `set_winning_bid`, and the two line-total
invariant trigger functions (possibly more).

**FILL-D3b** — List every function on rebuild-test whose deployed body does not match its **latest**
defining migration file after comment normalisation. ⚠️ **"Latest" matters** — a function redefined
in five migrations must be re-synced from the fifth. Re-apply via `supabase db push`-equivalent from
the file, never MCP, rebuild-test only. Verify by hash after.

**D3c — `apps/web/.env.local.example` is stale.** It documents Stripe only. The app reads 28
variables. Rebuild it: every variable name the app reads, **no values**, grouped, with a comment on
each group. State explicitly: `RESEND_API_KEY` is **deliberately absent from Codespaces** (S107
ruling); Supabase values come from the **rebuild-test Legacy tab** (`eyJ` keys); `QBO_*` are the
**sandbox** keys and realm `9341457813274121`. ⚠️ **No real value in the example file, ever.**

**D3d — STATE.md stale rows.** Verify S107 corrected: Send Email Hook ON; "Custom SMTP ❌ None" as a
historical note; the "2/hour while GoTrue is the sender" rate limit replaced by the new auth rate
cap (3/address/hour, 50/project/hour, `auth_recovery` exempt from the global ceiling only).

---

## ASK — Phase 2

**ASK-D1** — On FILL-D1b: keep the pre-push `next build` hook as ruled, drop it because CI now
builds every branch push, or narrow it (e.g. only on pushes to `main`).

**ASK-D2** — Add `npm install -g @anthropic-ai/claude-code` to the devcontainer's post-create
command, so a rebuild stops removing it? (Same file as D1d.)

**ASK-D3** — Add a permanent rule to CLAUDE.md naming the class this campaign hit six times: **the
thing inspected was not the thing being judged** — a wrapper's exit code, a truncated `head -20`
grep, a script that threw and fell through to a conclusion, an absent `dig`, a cached `download()`,
a Turbo cache hit reported as a build. Josh decides whether it goes in CLAUDE.md.

---

## AUDIT

1. Every FILL filled or one line why not; every ASK ruled.
2. D1a: a markdown save no longer reflows tables — shown with a one-line edit to a table file and
   its `git diff --stat`.
3. D1c: the ledger check run against rebuild-test, output pasted; then **by sabotage** on a scratch
   copy of the ledger data (never the real ledger), shown to fail.
4. D2a: `#157` result recorded in its entry with the run's printed exit line.
5. D2b: every suspect classified.
6. D3b: every listed function's hash matches its latest file after normalisation.
7. D3c: `.env.local.example` contains no value that looks like a key — grep proves it.
