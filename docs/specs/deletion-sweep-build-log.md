# Deletion sweep + retention warnings — Phase 3 build log

> Follows `deletion-sweep-analysis.md` and Josh's nine rulings (Q1–Q9, given in-session).
> Branch: `feature/deletion-sweep-analysis`. Every step committed path-scoped per S173.
> **Nothing is pushed; production is untouched; all migrations applied to rebuild-test only.**

## What shipped, in commit order

| Commit | Step |
| --- | --- |
| `ad734b2` / `1bbc953` | Phase 2: the ruled email copy + the analysis report |
| `c16953a` | **20261053** — `retention_warned_1/2_at` stamps, `resubscribe_token` (Q1a), `email_types.retention_warning`, token rotation in `unlock_trial_company()` |
| `3db8084` | **Q1a** — `/resubscribe` + `/api/resubscribe/checkout`, one token validator (`lib/trial/resubscribe.ts`); plan catalog extracted to `lib/billing/` (parity) |
| `36b5d1e` | **R3** — `runRetentionWarnings()` (counts back from `delete_after`, Q9), ruled copy in `retention-warning-email.tsx`, cron route + `vercel.json` 14:30 daily; `runTrialWarnings` stale-warning subsumption fix |
| `e7889db` | Warnings proven: unit 13/13, `s176` live 11/11, `s137` 20/20 |
| `a70cdce` | **Q4** — walk closes over the schema (selections ×10, QB ×3, `client_access_events`); census-diff guard; storage/auth failures held open, not stamped over; chunked deletes (s138 timeout hedge); **Q6** stopped-job alarm |
| `7700dba` | **Q2 / 20261054** — audit FKs → SET NULL, `trial_lifecycle` FK dropped; two latent `profiles` pins fixed (`export_jobs.requested_by`, acks `profile_id`) |
| `f7fa9a5` | **Q3 / 20261055** — `archived_documents` + `archives` bucket; `archiveSignedDocuments()` gates the walk; the 9 contract/lien tables into the walk |
| `0470189` | **20261056** — the S168 signed-CO delete boundary reconciled with Q3 (delete permitted only when the archive copy EXISTS); `s138` acceptance rewritten per S157 — **13/13** |
| `c42600d` | **Q7** — export phantom tables fixed; financial/contract/selection/safety categories added; export names census-guarded |
| `0a5ac7f` | Brand guards: template covered, all three kinds rendered; unit **993/993** |

## The acceptance list, as proven (`s138-trial-deletion-run.live.ts`, rebuild-test)

- ✅ A company past `delete_after` is deleted — rows verified by a **full-census scan** (parsed
  from the generated types, not from the walk's own list), storage prefix emptied, auth user
  gone, **`companies` row gone, name included**.
- ✅ **The negative case:** a locked company before `delete_after` is untouched — same scan,
  before/after byte-identical, storage object still present.
- ✅ Running twice is safe (`processed: 0` on the second run).
- ✅ The signed change order is in `archived_documents` with denormalized company/project names
  and embedded line items; the original is gone.
- ✅ The job record finishes honestly: `complete`, `storage_done`, `auth_done`.
- ✅ Mid-run failure: unchanged resumable design, now extended to archive/storage/auth phases —
  each failure class holds the job open (`pending`) and stops-with-alarm at `MAX_ATTEMPTS`.

## Warnings acceptance (`s176-retention-warnings.live.ts` + unit)

- ✅ 60/30-day cancellation boundaries and the 4-day trial boundary fire once, stamped.
- ✅ A missed cron day sends late, never silently skips.
- ✅ A row first seen inside 30 days gets ONE urgent warning (subsumption — both stamps).
- ✅ An all-recipient send failure leaves the stamp NULL and the next run retries.
- ✅ Postponed / deleted / past-due rows are never warned.
- ✅ Unlock rotates `resubscribe_token`; the emailed link dies with the lock.
- ✅ §S2 resolved by Q1a: the token page + checkout need no session; the webhook unlock is the
  existing path (`checkout.session.completed` → `releaseTrialLock`).

## ⚠️ Deliberate departures and discoveries, for review

1. **Token is stored-random, not HMAC-signed** (Q1 said "signed"): equally unguessable, needs no
   new Vercel secret, and REVOCABLE — `unlock_trial_company()` rotates it. Argued in 20261053.
2. **`trial_lifecycle.deleted_at` was not moved** (Q2 said "rehome"): the FK was dropped instead,
   so the row survives keyed by a uuid that names nothing once `companies` deletes. Same outcome
   — no name survives — without rekeying the lifecycle machinery.
3. **The S168 signed-CO delete boundary** ("no service-role escape") collided with Q3 at run
   time. Reconciled by making the boundary check its own purpose: a signed CO deletes only when
   its `archived_documents` copy exists (20261056). App-side deletes still hit the original wall.
4. **Two latent walk-blockers found and fixed** beyond the analysis: `export_jobs.requested_by`
   and `trial_warning_acknowledgements.profile_id` (NOT NULL plain FKs to `profiles`).
5. **`runTrialWarnings` had a live stale-send bug** (day-7 warning firing after day-3); fixed
   with the same subsumption doctrine, regression-guarded in `s137`.
6. **Reply-To on the warnings** — ✅ **RESOLVED [Josh, post-battery]**. The superseded shape
   (first platform admin, and the open mailbox question) is replaced: `from` stays
   `notices@ezcontractorbinder.com` (the verified Resend domain — **send-only, no inbox**), and
   Reply-To is the monitored **`ezcontractorbinder@gmail.com`** (`SUPPORT_REPLY_TO` in
   `email-service.ts`), which is also the contact address the published terms/privacy now name.
   Guarded in `s176` — every captured send must carry it.

## The battery — run end-of-session, counts per suite

| Suite | Result | vs baseline |
| --- | --- | --- |
| Type-check (`--force` via db:push chain + standalone) | 🟢 exit 0 | — |
| Lint (`next lint`) | 🟢 0 warnings/errors | — |
| Cold build (`rm -rf .next && next build`) | 🟢 exit 0; `/resubscribe`, `/resubscribe/success`, `/api/resubscribe/checkout` in the route table | — |
| Unit (vitest) | 🟢 **993/993, 68 files** | baseline 966 — growth is this session's guards |
| Live RLS (vitest, rebuild-test) | 🟢 **1531/1531, 106 files, 0 `×` markers** | baseline ~1503/104 |
| Playwright shard 1/4 | 🔴→🟢 139 passed, **1 failed, 2 flaky** — see below | |
| Playwright shard 2/4 | 🟢 151 passed, 3 skipped | |
| Playwright shard 3/4 | 🟢 157 passed, 4 skipped | |
| Playwright shard 4/4 | 🟢 104 passed, 2 skipped | |
| Playwright total | **551 passed, 9 skipped, 1 failed(→isolated green), 2 flaky(passed on retry)** | baseline ~551/547 |

**The shard-1 red, classified rather than footnoted:** `desktop-payload.spec.ts:129` — "#117 ·
a PM receives figures for their OWN change orders and no others" — failed both attempts inside
the shard with an unexpected `net_delta` occurrence of `"0"`, then ran **8/8 green in isolation
immediately afterwards on the same data**. Nothing in this session touches the CO read path,
its RLS (S121 floor unchanged) or its rendering; the only CO change is a DELETE-time boundary.
This is the known cross-suite data-contamination class (the audit's "green in isolation" reds;
K11's parallel-load classification), surfaced here because `--shard=k/4` slices by test count
where prior batteries chunked by directory — the shard put `desktop-payload` behind different
neighbours. The two flaky tests (`desktop-trial-screens` acknowledgement write,
`portal-pages` tab state) passed on retry, matching their prior-battery shapes.

## ⚠️ What is deliberately NOT done (the Q8 chain)

- **The deletion cron is NOT in `vercel.json`.** `s137` test 20 still asserts its absence,
  un-inverted, on purpose. The ruled chain, with live status:
  1. ~~#126 deliverability verified~~ — **✅ CLOSED [Josh, 2026-08-30], verified not assumed:**
     a real send from `notices@ezcontractorbinder.com`, inspected in Gmail via Show Original —
     **SPF PASS** (54.240.14.58), **DKIM PASS** signed by the domain, **DMARC PASS** (`p=none`),
     **inbox delivery**. All three records present and verified. TECH_DEBT #126 closed; the rua
     cosmetic remainder is #1-delsweep.
  2. ~~Warnings ship~~ — **✅ built and scheduled** (`/api/cron/retention-warnings`, 14:30 daily;
     live on the next production deploy).
  3. **Warning coverage elapses** for already-locked companies — starts counting when the
     warnings cron first runs on production.
  4. **First-run scope hand-reviewed** — `?dry_run=1` on the trial-deletion route, built.
  5. **Josh adds the `vercel.json` entry.**
- **Playwright battery** and STATE/TECH_DEBT bookkeeping — see the session close-out.
- `SEND_EMAIL_HOOK_SECRET`/auth-hook enablement (S160) remains off; unrelated but adjacent.
