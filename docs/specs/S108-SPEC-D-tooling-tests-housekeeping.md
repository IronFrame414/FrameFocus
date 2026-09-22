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

> **MEASURED [S108].** The formatter is the **VS Code Prettier extension**, turned on by a
> **committed repo file**: `.devcontainer/devcontainer.json` → `customizations.vscode.settings` sets
> `"editor.defaultFormatter": "esbenp.prettier-vscode"` and `"editor.formatOnSave": true`, and lists
> the extension under `extensions`.
> **`.vscode/settings.json` does NOT exist** (the directory is absent) — but `.gitignore:27-29`
> ignores `.vscode/*` while explicitly un-ignoring `settings.json` and `extensions.json`, so creating
> it is the mechanism the repo already anticipates, **and it is the one that takes effect without a
> rebuild** (workspace settings override the machine settings a devcontainer seeds).
> **No `.prettierignore` exists.** **No CI step runs Prettier over `.md` or anything else** —
> `grep -in "prettier|format"` over `.github/workflows/ci.yml` returns one unrelated prose line.
>
> **Damage measured on scratch copies; no repo file was reformatted.**
> `npx prettier --write`: `CLAUDE.md` **4** lines, `STATE.md` **6**, **`TECH_DEBT.md` 295** —
> confirming it is already Prettier-unclean on `main`, exactly as warned. **Not touched.**
> The live failure reproduced: a **one-line** edit to `CLAUDE.md`'s Technology Stack table whose cell
> is **wider than the current column** → **34 changed lines**, every row re-padded.
> *(⚠️ My first attempt measured 6 and also showed Prettier rewriting a `typescript` fence's quotes —
> both artefacts of running on a copy in `/tmp`, **outside the repo, where `.prettierrc` does not
> apply**. Re-run with `--config .prettierrc`. Recorded: it is the named failure class.)*
>
> **Proposed fix, two parts.** (i) `.vscode/settings.json` with a language-scoped
> `"[markdown]": { "editor.formatOnSave": false }` — the actual ask. (ii) a `.prettierignore`
> containing `*.md`, because **(i) cannot be proved from a terminal** and (ii) can: after it,
> `npx prettier --write CLAUDE.md` is a no-op, which is a measurable audit result rather than an
> assertion about an editor.


**D1b — A pre-push hook running `next build`.** Type-check passed and the build failed twice, and
both shipped (a client component importing a server module; a shared constant in a route file).

**FILL-D1b** — ⚠️ **This conflicts with two standing rules.** CC pushes after EVERY commit, and a
`next build` takes minutes — a hook would add that to every push. And CI now runs on every branch
push (ruled S107, `cancel-in-progress`). State: does CI already run `next build` on branch pushes?
How long does a local build take? Then ASK-D1.

> **MEASURED [S108]. The premise is already satisfied by CI, and the cost is large.**
> `.github/workflows/ci.yml` triggers `on: push: branches: ['**']` — every branch — with
> `concurrency` + `cancel-in-progress`. Job `check` runs type-check, lint and vitest and does **not**
> build. Job **`e2e` runs `next build` as its own step** — `:295-296`, `- name: Build (production)` /
> `run: npm run build`, working-directory `apps/web` — with **no `if:` and no `needs:`**, so it runs
> on every branch push unconditionally. Its own comment records why it is a separate step (`#135`:
> a compile error must fail with the compiler's output, not as a webServer timeout).
>
> **Local cold build, measured this session:** `rm -rf .next && npm run build` →
> **`BUILD_EXIT_LINE=0`, `WALL_SECONDS=227`** (3 m 47 s). Corroborated independently by
> `.next/BUILD_ID` present, 250 route-manifest lines, and `✓ Compiled successfully`.
> *(⚠️ The first timing run wrapped the build in `/usr/bin/time`, which is **not installed**; the
> task notification reported "exit code 0" while the **printed** line said `BUILD_EXIT_LINE=127` and
> no build had run. Read the printed line — the named failure class again.)*
>
> **So a pre-push hook would add ~3m47s to every push**, and the standing unattended rule pushes
> after **every commit**, to duplicate a gate CI already applies to the same commit. → **ASK-D1.**


**D1c — A migration-vs-ledger check.** The ledger lied twice in S104.

**FILL-D1c** — ⚠️ **Does `npm run db:verify` already exist on `main`** (S107 was told to build it)?
If it does, state what it checks and whether it covers the LEDGER — duplicate versions,
MCP-signature rows (name prefix ≠ version), rows with no matching file, files with no row, and the
ordered-version md5 fingerprint used against production in S104. Extend it to cover what is missing.
If it does not exist, build it.

> **MEASURED [S108]. `npm run db:verify` exists and does NOT check the ledger — at all.**
> A full-text grep for `ledger|schema_migrations|duplicate|md5` over `scripts/db-replay-schema.py`
> returns **only the two docstring lines naming the ledger as a BLIND SPOT**
> (*"3. ANYTHING APPLIED OUTSIDE THE LEDGER — a hand-run `ALTER` in the dashboard SQL editor, or MCP
> `apply_migration`, which writes no ledger row."*). It fingerprints tables, columns, NOT NULL,
> CHECK, UNIQUE and FK from the migration FILES. **The ledger check must be built.**
>
> **Baseline measured on rebuild-test**, so the new check starts from a known-clean state:
> `supabase_migrations.schema_migrations` = **222 rows, 222 distinct versions, 0 null names, 0 rows
> whose name is not a `2026%` version** (no MCP-signature rows). Ordered-version md5
> **`d0d8670294d11ffa303e2d26341f46e4`** — **identical** to the md5 of the 222 filenames on disk;
> files-not-in-ledger and ledger-not-in-files are both empty.
>
> **What to build, extending `db:verify` rather than duplicating it:** duplicate versions · rows whose
> `name` prefix ≠ `version` (the MCP signature) · rows with no matching file · files with no row ·
> the ordered-version md5. Exit non-zero on any, and print the offending versions, not a count.


**D1d — Install `gh` in the devcontainer.** Not via `apt` — that vanishes on rebuild, like Claude
Code does.

**FILL-D1d** — The devcontainer feature to use, and ⚠️ **what `gh` can actually do here**: the
Codespace token returned **403 on the Actions cancel API** in S107 (no `actions:write`). State what
it can read and what it cannot. ⚠️ **The devcontainer applies on REBUILD, not restart.**

> **MEASURED [S108].** `gh` is **not installed** (`command not found`). Devcontainer feature:
> **`ghcr.io/devcontainers/features/github-cli:1`**. ⚠️ Applies on **rebuild**, not restart.
>
> **What the token can actually do.** `GITHUB_TOKEN` is present (length checked only — **the value
> was never printed**, and no `echo $VAR`). `x-oauth-scopes` on `GET /user` is **empty**, i.e. a
> fine-grained Codespaces token, not a classic scoped PAT. Probed by HTTP status, token passed in a
> header:
>
> | call | result |
> | --- | --- |
> | `GET /repos/{owner}/{repo}` | **200** |
> | `GET /repos/.../actions/runs` | **200** |
> | `GET /repos/.../actions/workflows` | **200** |
> | `GET /repos/.../pulls` | **200** |
> | `GET /repos/.../issues` | **200** |
> | `GET /repos/.../branches/main/protection` | **403** |
> | `GET /repos/.../actions/secrets` | **403** |
>
> Consistent with S107's measured **403 on the Actions cancel API**.
> **What `gh` buys: `gh run list` / `gh run view` / `gh run watch`** — precisely the tool the standing
> "quiet period until the run is green" rule needs, which is currently done by polling the REST API
> by hand. **What it cannot do: cancel a run, read branch protection, read or write secrets.**
> Creating a PR was **not probed**, because probing it would create one.


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




> **MEASURED [S108]. Every suspect classified. The class has one member and it is already fixed.**
> The question asked of each is `#1-deliv`'s own: *does this handler read state that its caller is
> concurrently writing?*
>
> | test | asserts | timing-dependent? | verdict |
> | --- | --- | --- | --- |
> | `auth-email-hook-signature-headers.test.ts` | `/api/auth/send-email` accepts `webhook-*` **and** `svix-*`; neither → 400 | No — pure request shape | **covered** |
> | `s160-auth-email.live.ts` A1/A2 | P3 auto-confirm | **was the defect** | **covered — already fixed.** A1/A2 inverted to assert the *trigger* `on_auth_user_created_autoconfirm`, superseded lines quoted, **plus A1c**, a discriminating control ("no invitation, no auto-confirm") so A1b cannot pass against a trigger that confirms everyone |
> | `webhook-resend.live.ts` | delivered/opened/bounced stamping, rank monotonicity, bad sig → 401, **unknown id → 200** | **Yes** — a Resend event can beat our own `logEmail()` INSERT | **covered**: case 6 *is* that race, asserted |
> | `card-signup-webhook.test.ts` (`/api/stripe/webhook`) | `mode:setup` sets `payment_method_on_file` | No — Stripe calls out-of-band | **covered for handler logic; the event SHAPE is uncovered and the file ALREADY SAYS SO** ("MOCK-VERIFIED, NOT ROUND-TRIP-VERIFIED… Josh must confirm the real event"). That is the explicit note `#1-deliv` asks for, already present |
> | `s107-estimate-files-route-order.test.ts` | session read precedes the admin client | No — ordering inside one request | **covered**, and `:102` is a MIRROR case so it is not vacuous |
> | `s107-bid-request-send-order.test.ts` | floor precedes service-role client; origin guard precedes send | No | **covered** |
> | `email-unsubscribe.live.ts` | token roundtrip, one-click idempotence, forged token writes nothing, bounce guard outranks consent | No | **covered** |
> | `s146-generate-route.live.ts` | lien-release arms, route floor, caller cannot choose type | No | **covered** |
> | `s174-selections-email.live.ts`, `s175-stage6`, `s175-stage7` | selection release/offer/spec-sheet/portal pick+sign | No | **covered** |
> | `signed-url-error-contract.test.ts` | 403 vs 500 stay distinguishable, cause logged | No | **covered** |
>
> **Nothing was weakened to reach this.** Nothing remaining is timing-dependent; the one declared gap
> (`card-signup-webhook`'s event shape) is Josh's to close in Stripe test mode and is already
> recorded in the file itself.


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

> **⚠️ NOT YET FILLED — this is the one FILL that needs a live per-function comparison, and it is
> Phase 3 work rather than Phase 1 measurement.** The instrument is built and proved: the
> quote-parity normaliser specified in Spec C FILL-C3 is exactly what this needs, and running it
> per-function against each function's **latest** defining migration file is the comparison.
> Measured groundwork done this session: **285 functions** in `public`, **267,630 bytes** of
> definition text, **80** bodies containing `--`, and **1** function (`qb_vault_put`) where a `--`
> sits inside a string literal and would be mis-normalised by the naive strip.
> Building C's normaliser first and reusing it here is why C builds before D.
>
> **FILLED [S108 Phase 3].** Built as `scripts/db-function-sync.py` (`npm run db:functions`).
> Of **287** live functions: **253 exact**, **32 comment-stripped**, and **2 REFORMATTED** —
> `enforce_no_rows_on_override_line` and `qb_vault_put`, where the deployed text had `( SELECT`
> collapsed and adjacent string literals merged (behaviourally identical, textually not the file).
> **0 real drift**, and the config (SECURITY DEFINER / `search_path`) agreed for all 287. All 34
> re-applied from their LATEST file on rebuild-test via the Management API query endpoint — never
> MCP — and afterwards **287/287 byte-equal**. The 32 include all four this spec named. ⚠️ One
> residual is recorded in the S108 report: the first 10 were applied before a config pre-flight
> existed, so their prior config was not snapshotted.


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

### RULED [Josh, S108 Phase 2] — all three answered.

**ASK-D1 → A. DROP the pre-push `next build` hook.** It is not built. CI already runs `next build`
as its own ungated step on every branch push (`ci.yml:295`), and a cold local build measured **227
seconds** — the hook would add ~4 minutes to every push to duplicate a gate already applied to the
same commit.

**ASK-D2 → A.** `npm install -g @anthropic-ai/claude-code` goes in the devcontainer's post-create
command, alongside the `gh` feature. Both apply on **rebuild**, not restart.

**ASK-D3 → C. GENERALISE THE EXISTING EXIT-STATUS SECTION in `CLAUDE.md`** rather than adding a new
one. ⚠️ **Josh authorised editing `CLAUDE.md` for THIS CHANGE ONLY.** Nothing else in that file may
be touched in this session, and the markdown formatter must be off first (D1a) so the edit does not
reflow tables.

**D3c → Q11 answer A.** ⚠️ **CC cannot read or write `apps/web/.env.local.example`** — the path is
denied by this session's permission settings. **The complete file content goes in
`docs/sessions/S108-report.md` and Josh pastes it.** This is a delivery route, not a reduction in
scope: the content is still owed in full.

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


---

## BUILD RESULTS [S108 Phase 3] — branch `feature/s108-d-tooling`

Evidence for every line is in `docs/sessions/S108-report.md` under "SPEC D".

| audit | result |
| --- | --- |
| 1. FILLs / ASKs | every FILL filled (D3b filled above); ASK-D1/D2/D3 ruled and applied |
| 2. D1a — no reflow | ✅ one-line edit to a CLAUDE.md table cell wider than its column: **1 line** after `prettier --write`; **16 lines** in the control with the ignore file bypassed |
| 3. D1c — ledger check | ✅ `npm run db:verify` → `LEDGER CLEAN` on rebuild-test (223 rows, md5 `8c0372e5…` = files, cross-checked in the shell); **7 sabotages on scratch copies**, each named with the offending version; the "pending tail" case correctly passes |
| 4. D2a — `#157` | see the report and the `#157` entry — the first attempt was **contaminated by this session's own CI runs** and discarded |
| 5. D2b | ✅ every suspect classified (FILL-D2b above) |
| 6. D3b — hashes | ✅ 287/287 byte-equal to their latest file |
| 7. D3c — no key | ✅ 0 assignments carry a value; key-pattern grep → 0 matches. Content delivered in the report for Josh to paste (path is permission-denied to CC) |

Also in this branch: D1d (`gh` feature + Claude Code in post-create — **applies on rebuild**),
D3a (revoked key removed from `context2.md` and from this session's own report), D3d (STATE.md
Custom SMTP historical; auth rate cap 3/50 with `auth_recovery` exempt from the 50 only), ASK-D3
(CLAUDE.md exit-status section generalised, nothing else in the file touched), and **#158** filed in
`TECH_DEBT_IDEAS.md` (Spanish translation — a deferred decision), authority advanced to #159.
D1b (pre-push hook) was **dropped by ruling** and not built.
