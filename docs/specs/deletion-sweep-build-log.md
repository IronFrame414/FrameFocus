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
6. **Reply-To on the warnings** resolves to the first platform admin (`platform_admins`,
   ordered). The `from` is `notices@ezcontractorbinder.com` — ⚠️ **whether that mailbox/inbound
   route exists is an ops question for Josh**; the copy promises a readable reply address.

## ⚠️ What is deliberately NOT done (the Q8 chain)

- **The deletion cron is NOT in `vercel.json`.** `s137` test 20 still asserts its absence,
  un-inverted, on purpose. The ruled chain: **#126 deliverability verified → warnings ship →
  warning coverage elapses → first-run scope hand-reviewed (dry run) → sweep scheduled.**
- **#126 (Resend/Gmail deliverability) is unverified** — it gates the chain and needs a real
  send inspected. Attended.
- **A dry-run mode** (list what WOULD be deleted, no writes) is not yet built — small, and owed
  before the cron entry lands.
- **Playwright battery** and STATE/TECH_DEBT bookkeeping — see the session close-out.
- `SEND_EMAIL_HOOK_SECRET`/auth-hook enablement (S160) remains off; unrelated but adjacent.
