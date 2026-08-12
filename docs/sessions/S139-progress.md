# S139 — finish what can be finished. UNATTENDED.

**Josh is away.** Four independent parts, in priority order. A resumable, verified, honest state is
the goal — not all four.

**Standing:** rebuild-test only (`nmyphyhmfttxkdoposvf`). Production is READ-only via the
Management API and every such read is stated. Commit and push allowed, path-scoped. **Nothing is
merged to `main`.** **No cron entry for `trial-deletion`, ever.**

---

## Step 0 — environment confirmed

| Check | Result |
| --- | --- |
| `pwd` | `/workspaces/FrameFocus-work` |
| branch at start | `feature/trial-lifecycle` @ `06ed1de`, tree clean |
| CLI link | `nmyphyhmfttxkdoposvf` (rebuild-test) ✅ |
| `uv` | 0.11.29 |
| node / node_modules | v20.20.2, root + web both present |
| Playwright browsers | present in `~/.cache/ms-playwright` |

Exit codes n/a (read-only).

**Derived, not assumed:** `origin/main` is `04c261e` as the prompt states, and
**`feature/trial-lifecycle` is already merged into it** (`git merge-base --is-ancestor` → true).
So Part 1 branches off `main`, not off the trial branch.

⚠️ **`main` is checked out in a SECOND WORKTREE** — `/workspaces/FrameFocus` — so it cannot be
checked out here. Part 1 gets its own branch cut from `origin/main` in this worktree.

---

---

## Part 1 — Playwright for the four trial screens

Branch `feat/trial-screens-e2e`, cut from `origin/main` = `04c261e`.

**Written:** `e2e/trial-fixture.ts` and `e2e/desktop-trial-screens.spec.ts` (16 tests).

**Fixture design, and why it is split.** The warning screen borrows the shared QA company
(Bishop Contracting, `03bb903f-…`) — a `trial_lifecycle` row with `locked_at IS NULL` changes
nothing any other spec observes. **The locked and 4th-attempt cases must NOT borrow it:** setting
`locked_at` there would redirect every route for every QA identity to `/locked`, and Playwright
runs spec files in parallel, so it would fail whatever else was running. Each gets a throwaway
company and user.

The 4th-attempt fixture seeds **three real `trial_emails` rows and then signs up**, so
`handle_new_user()` takes the `v_trial_count >= 3` branch for real rather than the end state being
written by hand. A separate test asserts that state, so the screen cannot pass for the wrong reason.

**Run 1:** `npx playwright test e2e/desktop-trial-screens.spec.ts` → **exit 0, 16 passed**, ✘ 0.

⚠️ **A new suite passing first time is when to check it is load-bearing.** Counterfactual: replaced
`/locked`'s `CopyPendingLegalReview` with prose that reads like finished wording
("Your data will be permanently deleted in 14 days.") and added a `/dashboard/projects` link.
→ **exit 1, 2 failed / 2 passed**, naming the reasons: `element(s) not found` for the gap, and
`locked screen links back into the app: /dashboard/projects`. Reverted → **exit 0, 16 passed**.

**Teardown verified independently of the test's own assertions**, via read-only catalog queries:
`S139%` companies **0**, `s139` auth users **0**, `s139` trial_emails **0**, **banned auth users on
rebuild-test: 0**, `trial_lifecycle` rows on the shared QA company **0**.

---

---

## Part 4 — Gmail deliverability. REPORT ONLY. Nothing was changed.

Done out of order, in parallel with the Playwright chunks, because it is read-only and touches no
files. **No DNS was changed, no sending domain was changed, and no test mail was sent.**

### DNS — checked with Node's resolver (no `dig` in this container)

⚠️ First attempt used `dig`, which **is not installed**; the `grep -c` after it returned `0`,
which would have read as "no DMARC record". Caught because the "command not found" line was on
screen. Redone with `dns.resolveTxt`.

| Record | Value | Verdict |
| --- | --- | --- |
| `_dmarc.ezcontractorbinder.com` | `v=DMARC1; p=none; rua=mailto:josh@worthprop.com` | ✅ resolves, and **SINGULAR** — one TXT record, one `v=DMARC1`. The duplication is fixed. |
| `send.ezcontractorbinder.com` TXT | `v=spf1 include:amazonses.com ~all` | ✅ |
| `send.ezcontractorbinder.com` MX | `feedback-smtp.us-east-1.amazonses.com` | ✅ bounce processing |
| `resend._domainkey.…` TXT | RSA public key present | ✅ |
| apex TXT | only `google-site-verification=…` — **no SPF** | ✅ **not a fault** |
| apex MX | none | ✅ expected |

**The missing apex SPF is not a problem and should not be "fixed".** DMARC's SPF leg aligns on the
**envelope** domain, which SES sets to `send.ezcontractorbinder.com`; under relaxed alignment (the
default) its organisational domain matches the From apex. The DKIM leg aligns outright —
`d=ezcontractorbinder.com`. Both legs align, so **DMARC passes**.

Also worth stating: DMARC was **never capable of causing this**. The policy is `p=none`, which is
monitor-only — a duplicated (and therefore ignored) `p=none` and a valid `p=none` instruct a
receiver to do exactly the same thing: nothing.

### Google Postmaster Tools — **NOT CHECKED, and I cannot check it**

It requires an interactive Google account sign-in. There is no API key or service account for it in
this environment. **Saying "no data yet" would be an inference dressed as a finding**, so: unknown,
and it stays Josh's to read.

### Production `email_logs` — read-only via the Management API

⚠️ **The headline answer to "are proposals and invoices also failing?" is NEITHER — they have
never been sent.**

Production `email_logs` holds **12 rows in total**, every one `email_type = 'invite'`, all from
2026-08-11/12. **Zero proposals. Zero invoices. Zero change orders. Zero reminders. Ever.** So
there is no evidence of a domain-wide failure and none of a path-specific one — the entire sample
is a single code path, and "everything from this domain vanishes" has not actually been tested.

| | |
| --- | --- |
| delivered | **11** |
| failed | **1** (23:03, the earliest row, **no webhook metadata at all** → it failed before Resend accepted it, consistent with the pre-DNS window) |
| to `gmail.com` | **5, all `delivered`** |
| to `worthprop.com` | 6 delivered, 1 failed |

⚠️ **AND THIS IS THE PART THAT REFRAMES IT.** Those gmail rows carry Resend webhook events:

```
"webhook_email.sent":      "2026-08-12T00:35:20.569Z"
"webhook_email.delivered": "2026-08-12T00:35:21.248Z"
```

**Resend `delivered` means the receiving MTA ACCEPTED the message.** Gmail accepted it, ~700ms
after send. A message Gmail accepts and then files to Spam — or suppresses under its bulk-sender
and reputation rules — reports exactly this. So authentication and transport are **working**, and
what is failing is **placement**. That is a reputation/content question, not a DNS one, which is
why fixing DMARC changed nothing.

### Code side — nothing wrong found, one thing I cannot settle from here

- **`From`**: `buildSenderAddress()` → `` `${company.name} <${company.slug}@ezcontractorbinder.com>` ``.
  Live example from production: `Worth Properties <worth-properties-768f378f@ezcontractorbinder.com>`.
  Well-formed. Worth *noting* only: the local part varies per tenant and carries a hex suffix, so a
  brand-new domain presents many distinct local parts — a mild reputation consideration, **not a
  defect**, and not something to change without a ruling.
- **`resolveCompanyReplyTo()`**: `companies.email` → owner's email → **omit the header entirely**.
  Never an empty header, never the recipient. A resolution failure is caught and downgraded to "no
  Reply-To" rather than failing the send. Clean.
- **Headers**: the send passes `from`, `to`, `subject`, `react`, `attachments` and conditionally
  `replyTo`. **No custom headers at all** — nothing a receiver would object to. Also **no
  `List-Unsubscribe` header** anywhere (the estimate-reminder template has an unsubscribe *link* in
  the body). Not required at this volume; it is on Gmail's list for bulk senders.
- **⚠️ Sending domain vs link domain — UNRESOLVED FROM HERE, and it is the one code-side thing
  that could matter.** Links are built from `NEXT_PUBLIC_APP_URL`. I cannot read production's
  value. Both hosts are live and neither redirects to the other:
  `https://ezcontractorbinder.com` → 200 (A record `216.198.79.1`, Vercel) and
  `https://frame-focus-eight.vercel.app` → 200. **If production's `NEXT_PUBLIC_APP_URL` is the
  `vercel.app` host, then every link inside mail sent from `@ezcontractorbinder.com` points at a
  different domain** — a genuine Gmail placement signal. One env-var read settles it; see BLOCKED.

---

### Part 1 — the four chunks

`scripts/e2e-preflight.sh` → **exit 0** before each attempt. `tsc` **0**, `lint` **0** (0 errors).

| Chunk | Files | Exit | Result |
| --- | --- | --- | --- |
| 1 — desktop + **trial screens** + harness + sign-in | 13 | **0** (2nd attempt) | **79 passed** |
| 2 — m shell / hubs / sections / details / destinations / hydration | 6 | **0** | **246 passed**, 7 skipped |
| 3 — writes / photos / capture / camera / logs / pwa | 6 | **0** (2nd attempt) | **155 passed**, 2 skipped |
| 4 — chat shell / sub / offline / send-route / CO recalc | 5 | **0** | **26 passed** |
| **Total** | **30** | | **506 passed, 9 skipped, 0 failed** (490 before + 16 new) |

⚠️ **BOTH RE-RUNS WERE REAL FAILURES, AND NEITHER WAS A REGRESSION. Read this before trusting a
green chunk here.**

⚠️ **The background-task notification reported "exit code 0" for BOTH failing runs while the
printed line said `CHUNK1_EXIT=1` / `CHUNK3_EXIT=1`.** This is CLAUDE.md's trailing-command trap
exactly: the wrapper's status is the `echo`'s. **Only the printed line was true.** If a future
session trusts the notification summary, it will ship red as green.

**Chunk 1, attempt 1 — one flake.** `desktop-chat-send.spec.ts:45` (A-C28) timed out at 30s waiting
for a sent chat message to appear. Established which side was wrong before touching anything:
isolation **3/3 pass**, paired with the new trial spec **19/19 pass**, full chunk re-run
**79/79 pass**. So: not a regression, not caused by the new spec, and not a product defect visible
here — a poll-based assertion losing a 20s race on `next dev` under parallel load. Logged, not
"fixed".

**Chunk 3, attempt 1 — the dev server DIED mid-run.** 99 passed, then **58 consecutive failures
averaging 1.2s each** — the shape of a dead origin, not of assertions. Confirmed rather than
inferred: port 3000 gave no answer afterwards, no `next dev` process remained, and
`/tmp/ff-dev-3000.log` ends mid-stream after a successful request with **no exception and no stack**
— a kill, not a crash. `oom_kill 0` in `/proc/vmstat`, `/dev/shm` 64 MB and empty, 3.7 GB free at
inspection, so the cause is not established beyond "the process went away"; this is the territory
of TECH_DEBT #145 and the `next dev` RSS growth the Playwright config documents. Restarted via
preflight → **155/155**.

**Teardown re-verified after the last chunk**, independently: `S139%` companies **0**, `s139` auth
users **0**, banned auth users on rebuild-test **0**, `trial_lifecycle` on the shared QA company
**0**.

---

---

## Part 2 — `feat/ffnav-reindex` brought up to main

**Merge, not rebase, and the reason is that the branch is already published.** Rebasing its 4
commits onto main's 97 rewrites pushed history and needs a force-push, and would replay the
`dashboard-shell.tsx` change once per commit that touches it. A merge resolves it once and records
honestly when main was integrated. Commit `2619c59`, pushed. **NOT merged to main.**

⚠️ **NO CONFLICT AROSE, and both of the prompt's expectations about it were wrong.** It predicted a
conflict in `dashboard-shell.tsx` from *the trial work*. Main's **only** change to that file since
the fork is from the **chat** slice (`ec4188e`): a `ChatPanel` import, a `myProfileId` prop, its
destructure, and the panel mounted in the JSX tail — **10 insertions**, none of them near
`NAV_ITEMS`, which is the only region the reindex rewrites (171 insertions / 58 deletions).

**A clean auto-merge of a file where one side rewrote 171 lines is exactly when to check nothing
was dropped**, so both sides were verified present rather than assumed: main's four additions each
grep to `1`, and the branch's `section:` field and three-section `NAV_ITEMS` are intact.

**Is it mergeable? Yes** — `git merge-base --is-ancestor origin/main HEAD` is true, tree clean.

**What changed in substance rather than position: nothing.** The stale-nav-literal risk the prompt
anticipated was already handled **on the branch itself** by `21e2041` ("unpin the Notifications
literal"), so no test needed touching.

| Check after the merge | Exit | Corroboration |
| --- | --- | --- |
| `npm install` | **0** | main brought `fflate` |
| `tsc --noEmit` | **0** | 0 `error TS` |
| `next lint` | **0** | 0 Errors |
| `next build` | **0** | |
| `vitest run` | **0** | **50 files / 713 tests** (main's 49/702 + `s130-ffnav.test.ts`) |
| Playwright: ffnav + dashboard-guard + chat-panel + harness | **0** | **28 passed**, ✘ 0, incl. all 10 ffnav tests |

---

## Part 3 — TECH_DEBT renumbering

**The next free number was re-verified, not trusted.** Main's own entries stop at **`#150`**; its
header table allocates `#151`–`#154`. S137/S138 filed only branch-scoped ids (`#1-trial`…
`#3-trial`) under CLAUDE.md's rule, so they consumed no numbers. The prompt's `#151` is correct.

| branch | moved | commit |
| --- | --- | --- |
| `feat/notifications` | `#149` → **`#151`** (one) | `2955d21`, pushed |
| `feature/m6m-mobile` | `#147`→**`#152`**, `#148`→**`#153`**, `#149`→**`#154`** (three) | `c47b3bc`, pushed |

**Citations were grepped before each move.** `feat/notifications`: exactly two hits, both in
`TECH_DEBT.md`; its `#147`/`#148` are byte-identical to main's and were deliberately left alone.

⚠️ **`feature/m6m-mobile` had a citation IN CODE**, which is the whole reason the rule exists.
`apps/web/playwright.config.ts` read
`LOCAL IS 1, NOT 0 — TECH_DEBT #147(a) [S123]. THIS NUMBER IS THE EVIDENCE.` A comment calling a
number "the evidence" is worse than useless pointing at the wrong entry; it moved in the same
commit and now reads `#152(a)`. Occurrences enumerated before (`#147`×3, `#148`×4, `#149`×3 across
two files) and confirmed **zero** after.

⚠️ **A type-check scare that was neither side.** `tsc` on `feature/m6m-mobile` first returned
**exit 2, four `TS2307`s** — all in `.next/types` for `app/api/chat/threads` and
`app/client-placeholder`, routes that exist on main and **do not exist on that branch**. Stale
build output from having built the merged ffnav branch in the same worktree. Established rather
than assumed (the named routes are genuinely absent); `rm -rf .next` → **exit 0, 0 errors**.

**CLAUDE.md compliance.** The provisional `#N-<tag>` form applies to *new* items filed on a branch.
These four were filed in S123, before the rule, and Josh ruled they convert to real numbers at
merge; converting them to bare `#151`–`#154` is that conversion, which is the form the rule
prescribes post-landing. **Any NEW debt filed on either branch from here must use `#N-<tag>`.**

⚠️ **Residual, and it is real:** `#151`–`#154` are reserved by *convention* only. Nothing enforces
them, and main's own table says whichever branch merges second must re-check against the file as it
then stands. If some other branch lands first and files debt, these collide again.

---

## BLOCKED — NEEDS JOSH

Neither is a coding decision I can derive; both are information or rulings only Josh holds.

**1. Production's `NEXT_PUBLIC_APP_URL` — one env-var read, and it decides whether Part 4 has a
code-side cause at all.** Mail is sent from `@ezcontractorbinder.com`. Links are built from
`NEXT_PUBLIC_APP_URL`. Both hosts are live and neither redirects to the other
(`ezcontractorbinder.com` → 200 on a Vercel IP; `frame-focus-eight.vercel.app` → 200). I cannot
read Vercel env vars.

- *If it is `https://ezcontractorbinder.com`* — sending domain and link domain match. Nothing to do
  code-side; the investigation is entirely reputation/placement.
- *If it is `https://frame-focus-eight.vercel.app`* — every link inside mail from
  `@ezcontractorbinder.com` points at an unrelated domain, which is a real Gmail placement signal.
  Then there is a decision: point `NEXT_PUBLIC_APP_URL` at the custom domain (aligns them; changes
  every generated link, including ones already sent), or leave it and accept the mismatch.

**2. Google Postmaster Tools.** Needs an interactive Google sign-in; no API key or service account
exists here. Stating "no data yet" would be an inference dressed as a finding. Unknown — Josh's to
read. What it would settle: whether Gmail is reporting a spam-rate or reputation problem, which is
where Part 4's evidence now points.

---

## RESUME HERE

**Next action:** read production's `NEXT_PUBLIC_APP_URL` in Vercel and answer BLOCKED item 1 —
everything else in this session is finished and pushed.
