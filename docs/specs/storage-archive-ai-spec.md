# Storage, trash, the project archive, and the AI cap — spec

> **Status: PHASE 1 COMPLETE [2026-08-30] — all eleven `§S` blocks filled from the tree; awaiting
> Josh's Phase-2 rulings on the question batch (Q1–Q7, delivered in-session).** Then the spec is
> finalised and built. §S3/§S4/§S6/§S10 carry the deletion-sweep session's verified findings as
> recorded by Josh; the rest were read or measured this session.
>
> Register entries: `outstanding-work-register.md` **M4 · M5 · M6 · M7 · M8**.

---

## §0 — Why these four are one piece of work

They share a fact base, and **storage measurement is what connects them:**

- The **cap** needs a number.
- The **trash rules** exist because deleted files still occupy that number.
- The **archive (ZIP)** is the escape hatch when the number is at its limit.
- The **AI cap** is the same shape — a counter, a limit, an honest message.

⚠️ **And they are on the critical path to something bigger.** The privacy policy and terms are written
and legally reviewed but **cannot be published until they are accurate.** They describe plan storage
limits, trash behaviour, and an export — **none of which is true today.** Publishing gates on this;
**Intuit's sandbox keys gate on publishing**; and **7G gates on the keys.**

---

## §1 — Storage measurement

### RULED: sum `files.size` from the database

Not the bucket. **One query, always available, and it is the number the app already partly knows** —
the Billing page displays a figure today.

⚠️ **The trade-off, recorded so it is not a surprise later:** if an object is ever orphaned in the bucket
— a failed upload, or a delete that removed the row but not the file — **the sum reads lower than
reality and the customer gets slightly more room than they paid for.** That errs in the customer's
favour, which is the right direction to be wrong.

### ⚠️ Trashed files COUNT

A soft-deleted file still holds its bytes. **It counts against the cap until it is permanently
deleted.** This is the fact that makes §3 necessary.

> ### §S1 — FILLED [Phase 1, 2026-08-30]
>
> **`files.file_size` is `bigint NOT NULL` from the baseline schema** (`20260101000000:1380`) — it has
> never been nullable, so **every row ever written has a size and no backfill is needed.** The sum is
> right from day one by constraint. (A 50 MB per-file ceiling also already exists at upload:
> `MAX_FILE_SIZE_BYTES`, `files-client.ts:98-102`, user uploads only.)
>
> **The Billing page displays NOTHING about storage today — deliberately.** Its own header comments
> (`app/dashboard/billing/page.tsx:13,19`) record that the old copy — *"File storage 2.4 GB of
> 100 GB"* and an *"Extra storage $15"* add-on — was REMOVED because *"storage is never measured
> anywhere"* and the add-on *"does not exist."* So there is no wrong number to correct, only an
> absent one to build.
>
> ⚠️ **Found while verifying, and it needs a ruling (batch Q1): the plan catalog's feature text
> disagrees with this spec's ruled caps.** `lib/billing/plan-catalog.ts` advertises **10 GB / 50 GB /
> 200 GB** while §2 rules **50 / 120 / 500 GB**. The catalog renders on `/dashboard/billing/plans`
> AND the locked-account `/resubscribe` page, so customers are being shown numbers this spec
> contradicts.

> ### §S2 — FILLED [Phase 1] — proposal: PER REQUEST, via one SQL function
>
> **Nothing computes it today, anywhere** (confirmed by sweep — no `storage_used` column, nothing
> reads `SUM(file_size)`). Proposal: a `SECURITY DEFINER` SQL function
> `company_storage_used_bytes()` returning `SUM(file_size)` over ALL the company's rows —
> **including `is_deleted = true`, which is the §1 ruling** — backed by a covering index on
> `files (company_id, file_size)` so the aggregate is index-only. Called per request at the points
> that need it (the four capped upload paths, the Billing display, the limit screen).
>
> **Costs, honestly:** per-request is one index-only aggregate per upload attempt — microseconds at
> current scale, and always current. A cached column would be faster at a scale we do not have, and
> buys that speed with an invalidation obligation across **18 writer paths plus permanent delete,
> Empty Trash and the 6-month purge** — the "second implementation of the same fact" shape the parity
> ruling exists to prevent. Revisit ONLY if the aggregate ever measures slow.
>
> **Enforcement point, stated as an assumption (batch Q7):** the check lives in the service layer at
> the four user-upload paths (server-verified where a route exists, client-checked where the browser
> uploads direct to storage). That is bypassable by a determined API caller — accepted, because the
> ruling classifies storage as a **billing limit, not a security boundary**, and a DB-level gate
> would have to run the aggregate inside storage RLS on every object write.

---

## §2 — The cap

| Plan         | Limit      |
| ------------ | ---------- |
| Starter      | **50 GB**  |
| Professional | **120 GB** |
| Business     | **500 GB** |

### RULED: warn at 80% and 95%, block NEW UPLOADS at 100%

⚠️ **Never delete anything automatically. Never block anything else.** A contractor at their cap can
still invoice, schedule, run their jobs, log time and get paid. **Only uploads stop.**

⚠️ **This is a hard rule.** Storage is a billing limit, not a reason to take someone's business offline.

> ### §S3 — FILLED [Phase 1; carried from the deletion-sweep session's sweep, recorded by Josh]
>
> **18 storage writers exist. FOUR are user uploads and subject to the cap; the other FOURTEEN are
> system artifacts and ⚠️ must never fail at the cap.**
>
> **Capped (user picks a file):** the project file picker (`files-client.ts:156`), estimate bid
> documents (`files-client.ts:252`), company logos (`company-client.ts:199`), portal chat photos
> (`app/api/portal/messages/route.ts:82`).
>
> **Never capped (system-generated):** markup rasterisation (`photos-client.ts:131`), contractor
> signature images (`company-client.ts:250`), the seven PDF services (incident, daily log, delivery,
> invoice, change order, proposal, selection spec), the lien-release PDF route, selection link
> thumbnails, the trial-export zips (`exports` bucket), and the deletion sweep's archive copies
> (`archives` bucket). A cap that blocks any of these takes a contractor's business offline over a
> billing limit — the exact thing the §2 ruling forbids.
>
> The raw material for the sum exists (`files.file_size`, §S1); **nothing sums or enforces it today**,
> and the only current limit is 50 MB per file on user uploads.

### The limit screen

When an upload is refused, the message must say:

1. **What the limit is and what they are using.**
2. ⚠️ **That trash still counts, and that a file must be permanently deleted for the space to come
   back** — and that **permanent delete is an Owner or Admin action.**
3. **Empty Trash** as an offered action, right there.
4. **Download a project archive** (§4) — the other way to free space.
5. Upgrading the plan.

⚠️ **Do not render this as an error.** It is a limit with four ways out.

---

## §3 — Trash

### RULED: auto-purge at 6 months

A file in trash for six months is permanently deleted. ⚠️ **This is a retention behaviour the privacy
policy must state**, and it is one of the changes that document is waiting on.

### RULED: the cap message names the Owner/Admin requirement

**Permanent delete is Owner/Admin only** (`files_delete_owner_admin`) and the UI already hides it
otherwise. ⚠️ **A foreman at the cap who deletes fifty photos frees nothing and has no way to know
why.** The message must tell them who can.

### Empty Trash

A bulk action on the trash screen, **Owner/Admin**, purging every trashed file in scope.

> ### §S4 — FILLED [Phase 1; verified in code, carried from the deletion-sweep session]
>
> **The OBJECT is removed, and in the right order.** `permanentDeleteFile()`
> (`files-client.ts:352-420`) deletes the storage object FIRST, **verifies the removal actually
> happened** (an empty `remove()` result stops the operation *before* the row is touched, with the
> reason in a comment: claiming success while the bytes are still served would strand them with no
> record pointing at them), and only then deletes the row. **The cap is genuinely relievable; the
> limit screen's actions are real.**
>
> ⚠️ **But there is NO Empty Trash bulk operation today — that is a BUILD item, not wiring** [Josh].
> The mobile bulk action is soft-delete only (`photo-grid.tsx:375`); trash rows are permanently
> deleted one at a time (`trash-row.tsx:41`). §3's Empty Trash is new code that must loop the same
> verified object-first deletion.

> ### §S5 — FILLED [Phase 1] — facts, plus a proposal for each half (batch Q3)
>
> **The existing trash surface is PER-PROJECT**: `/dashboard/projects/[id]/files/trash`, reading
> `getFiles({ only_deleted: true, project_id })`. No company-wide trash view exists. **Proposal:**
> Empty Trash lands in both places it is needed — a per-project button on the existing trash screen
> (matching its scope), and a **company-wide** action on the §2 limit screen, because the CAP is
> company-wide and a customer at the limit should not have to visit every project to relieve it.
>
> **The 6-month purge gets its OWN small cron — not the deletion sweep's machinery.** The sweep's
> job (`runTrialDeletion`) destroys whole tenants, is deliberately unscheduled behind the Q8 chain,
> and is the wrong tool by scope. The precedent is `notification-expiry` (daily 3:30, already
> deletes aged rows on a schedule): a daily `/api/cron/file-trash-purge` that selects
> `is_deleted = true AND deleted_at <= now() - interval '6 months'` and applies the SAME verified
> object-first deletion as §S4, per file, service-role. ⚠️ Being a retention behaviour the privacy
> policy states, its cron entry ships WITH this build — an unscheduled purge here would repeat the
> exact promise-without-mechanism failure this project has already made twice.

---

## §4 — The project archive (ZIP)

**Everything in the project, separated into folders.** ⚠️ **Including trash**, in its own folder so it
is obvious what it is.

### The flow, ruled

1. Owner/Admin asks for an archive of a project.
2. ⚠️ **It generates in the background** — it reads every file and cannot run in a normal request.
3. **The user waits for the link**, then downloads.
4. ⚠️ **THEN, and only then, they are prompted to delete the project — with a button.**
5. ⚠️ **The prompt warns them to CHECK THE ZIP FIRST, and that deletion is IRREVERSIBLE.**

⚠️ **Nothing is automatic.** The archive never deletes anything. **The delete is a separate, deliberate
act after the customer has the file in hand.**

⚠️ **This is the humane half of the cap.** Download the project, empty the trash, delete the project —
that is the answer to "I am at my limit and I do not want to upgrade."

### Costs, to be aware of, not to solve

**It reads every file, so a 500 MB project is 500 MB of egress per download** at $0.09/GB. Not a reason
to avoid it; a reason not to make it one click from everywhere.

> ### §S6 — FILLED [Phase 1; carried from the deletion-sweep session, recorded by Josh]
>
> **The ONLY on-demand mechanism in this deploy is: insert a job row, let a 5-minute cron advance
> it.** The trial export is the whole precedent and the whole repertoire: `POST /api/trial/export`
> inserts an `export_jobs` row; `/api/cron/export-worker` (`*/5 * * * *`) picks up the oldest
> unfinished job, works ~240s of its 300s `maxDuration`, saves a cursor, and the next invocation
> continues. No queues, no `waitUntil`, no Edge Functions, no pg_cron — and `qb_sync_queue` exists
> as a table that **nothing processes**.
>
> ⚠️ **So the worst case is ~5 minutes before the archive STARTS, and the §4 flow must be shaped by
> that** [Josh]: the UI says so honestly — *"building your archive; this takes a few minutes,
> we'll show the link here"* — **never a spinner** implying request-scale progress. The archive
> adopts the export-worker pattern (job row + the same or a sibling cron; §S7).

> ### §S7 — FILLED [Phase 1] — proposal: REUSE `export_jobs`, with a discriminator (batch Q4)
>
> **The table already has the archive's exact shape** (`20260918000000`): `state`
> pending/running/complete/failed/expired, `cursor jsonb` for 300s-window resumption,
> `bytes_written`, `object_path`, `expires_at`, `format`, `requested_by`, and the audit indexes.
> The archive needs two additions: a **`kind`** discriminator (`'trial_export' | 'project_archive'`)
> and a nullable **`project_id`**.
>
> **Why reuse over a new `archive_jobs` table:** one worker cron advances both kinds (the export
> worker already exists and sweeps); one audit trail (the SURVIVES rationale — *"who took what, and
> when"* — describes the archive exactly, and the row already survives tenant deletion by Q2's
> SET NULL); and **no new `company_id` table**, which means no new entries owed to
> `COMPANY_CHILDREN` / `COMPANY_TABLES` / the census guard — the registry-drift class this project
> has detonated three times stays undisturbed. The cost is one CHECK-constrained column and a
> branch in the worker. A separate table buys cleaner naming and pays for it with a third job
> table, a second worker, and three registry entries.

> ### §S8 — FILLED [Phase 1] — the at-cap problem dissolves under the §1 ruling
>
> **Where:** the `exports` bucket, under `{company_id}/{job_id}…` — exactly where trial-export zips
> live. **How long: 24 hours.** The export worker's sweep already expires completed exports past 24h
> AND removes the objects (`export-sweep.ts:42,58`); archive jobs riding `export_jobs` (§S7) inherit
> it for free. The UI states the window: *"link valid for 24 hours; you can regenerate."*
>
> **Does it count against the cap? NO — by construction, and this is why at-cap archiving is safe.**
> The ruled measurement is `SUM(files.file_size)`; export/archive artifacts **never get a `files`
> row** (the export reads `files`, writes only the bucket — verified). A 500 MB archive for an
> at-cap customer occupies real bucket bytes for ≤24h without touching their number — the same
> customer-favourable direction as §1's orphan trade-off, bounded by the sweep. ⚠️ **This is also
> load-bearing for the flow: the archive is the escape hatch AT the cap — if it counted, the escape
> hatch would be locked precisely when needed.**

> ### §S9 — FILLED [Phase 1] — proposal, built on the categories the files already carry
>
> Every file row carries a category from the 14 system-seeded `file_categories`
> (`20261039000000`), so the folders are the categories a contractor already uses, kebab-cased:
>
> ```
> {project-name}-archive.zip
> ├── MANIFEST.txt          ← project, dates, per-folder counts, and the missing-file list
> ├── photos/
> ├── contracts/
> ├── plans/
> ├── permits/
> ├── invoices/
> ├── change-orders/
> ├── daily-logs/
> ├── receipts/
> ├── safety/
> ├── deliveries/
> ├── compliance/
> ├── lien-releases/
> ├── selections/
> ├── other/
> └── trash/                ← soft-deleted files, in their original names — obvious what it is
> ```
>
> Files keep their `file_name`, with an 8-char id suffix only on collision. Empty folders are
> omitted. `MANIFEST.txt` follows the export's honesty rule (`MISSING-FILES.txt` precedent): any
> referenced object the job could not read is NAMED, never silently absent — a manifest that
> undercounts is how "I checked the ZIP" fails the one customer the §4 delete-prompt warning exists
> for. Multi-part `part-NNN.zip` above the single-invocation budget, self-contained per part, as the
> trial export already does.

---

## §5 — The AI photo tagging cap

### RULED

**$20/month · 1,500 photos · HARD CAP, no overage · resets monthly.**
_(Was $29 and unlimited on the old Billing page.)_

**Costed from the code and current OpenAI pricing:** `gpt-4o` at $2.50/$10 per million tokens. A phone
photo is ~765 image tokens plus the tag-list prompt — **about a third of a cent per photo.** At the cap
that is ~$4.50 in tokens plus egress: **roughly 4× margin.**

**What exists:** `autoTagFile()`, `companies.ai_tagging_enabled`, and `ai_tag_logs` (which the deletion
sweep deliberately preserves with `company_id` nulled — _"our AI spend"_).

**What does not:** the counter, the cap, the message, and the $20 price.

⚠️ **Why a hard cap and not overage:** metering into Stripe usage records is real work, and **1,500
covers a contractor shooting 30 photos a day twice over.** If someone genuinely hits it regularly,
**that is the signal to build overage — with a real customer asking, not speculative machinery.**

### ⚠️ At the cap, uploads still work — the photos just arrive untagged

**The message must say exactly that.** It is a limit on a convenience, not a failure, and it must not
read like one.

> ### §S10 — FILLED [Phase 1; carried from the deletion-sweep session, recorded by Josh]
>
> **YES — the counter is a QUERY, not a new table, with one filter that matters.** `ai_tag_logs` is
> one row **per GPT-4o call**, and `autoTagFile()` makes one call per file — so per tagged photo in
> practice. `created_at` is indexed DESC for exactly this aggregation. ⚠️ **Failed calls are logged
> too** (Module 3H: a failed call still cost money), so the quota count **must filter
> `success = true`** — a customer must never burn cap on our failures. The month's count:
> `WHERE company_id = ? AND success AND created_at >= <period start>` (period per §S11).
> `company_id` is nullable only because tenant deletion nulls it — live rows always carry it.
>
> ⚠️ **Found while verifying (batch Q2, and Josh has pre-ruled the direction):** the plan catalog
> advertises *"5 / 25 / Unlimited AI ESTIMATES per month"* — **display text with zero enforcement
> anywhere, describing a feature that is not built at all** (AI estimates ≠ photo tagging). The new
> pricing removes AI estimates entirely and prices photo tagging as the $20 add-on; that catalog
> text is part of what changes in this build.

> ### §S11 — FILLED [Phase 1] — proposal: CALENDAR MONTH in the company's timezone (batch Q5)
>
> **The billing period the add-on would anchor to does not exist.** `ai_tagging_enabled` is a bare
> boolean — there is no Stripe object for the $20 add-on, so it has no period of its own; and
> `subscriptions.current_period_start/end` are **nullable** (Stripe-written; absent for comped
> companies, which production has five of). Anchoring "monthly" to a period that is sometimes NULL
> means a fallback anyway — at which point the fallback IS the rule.
>
> **Proposal: calendar month in `companies.timezone`** (the column exists, default
> `America/New_York`; the retention emails already format dates with it). Implementable today,
> explainable in one sentence ("1,500 photos per calendar month"), and NULL-proof. When the $20
> add-on becomes a real Stripe subscription item, revisit anchoring to ITS period — with a real
> billing object, not a proxy. The counter query's period start is
> `date_trunc('month', now() AT TIME ZONE companies.timezone)`.

---

## §6 — Acceptance

- **A company over its cap cannot upload — and can still invoice, schedule and clock in.**
- ⚠️ **Generated PDFs are not blocked by the cap** (§S3).
- The limit screen names **the trash rule, the Owner/Admin requirement, Empty Trash, and the archive.**
- **Emptying trash actually reclaims bytes** — ⚠️ **prove the storage object is gone, not just the row.**
- **The 6-month purge removes trashed files and their objects.**
- **An archive contains every file including trash**, in folders, and **opens.**
- ⚠️ **The delete prompt appears only AFTER the download**, warns to check the file, and says
  irreversible.
- **Tagging stops at 1,500 and uploads still succeed**, with the honest message.
- ⚠️ **The negative case, and it matters most:** a company **under** its cap is unaffected by every one
  of these — uploads work, nothing is purged, tagging runs.

---

## §7 — Out of scope

Thumbnails for the photo gallery (**M8** — a real cost lever, its own work) · overage billing for AI ·
enforcing seat limits · the public site · 7G · the deletion sweep.
