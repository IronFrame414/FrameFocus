# Storage, trash, the project archive, and the AI cap — spec

> **Status: INCOMPLETE.** The `§S` blocks are facts this spec cannot assert until CC reads the tree.
> CC fills them in Phase 1, Josh rules in Phase 2, the spec is finalised, then it is built.
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

> ### §S1 — owed
>
> **Does `files` carry a size column, is it populated on every row, and what does the Billing page
> display today?** ⚠️ **If size is null on historical rows, the sum is wrong from day one** — report it
> and propose a backfill.

> ### §S2 — owed
>
> **Where is this computed, and how often?** Per request is simplest and always current; a cached total
> is faster but can drift. **Propose, with the cost of each.**

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

> ### §S3 — owed
>
> **Every upload path** — desktop files, `/m` capture, receipts, markup derivatives, generated PDFs.
> ⚠️ **A generated PDF is not a user upload** — does an invoice PDF fail to generate at the cap? **It
> must not.** Report every writer and propose which are subject to the cap.

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

> ### §S4 — owed
>
> ⚠️ **Does purging delete the STORAGE OBJECT, or only the row?** **The whole point is reclaiming
> bytes** — if `permanentDeleteFile()` leaves the object, this feature does nothing and the cap can
> never be relieved. **Verify against the code, not the name.**

> ### §S5 — owed
>
> **Scope of Empty Trash** — per project, or company-wide? And does the 6-month purge reuse the
> deletion sweep's cron, or its own?

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

> ### §S6 — owed
>
> **What runs a background job in this deploy?** `lib/notify/crons/*` is the scheduled precedent, but
> this is on-demand, not scheduled. ⚠️ **Report what exists; do not assume a worker runtime.**

> ### §S7 — owed
>
> **`export_jobs` already exists** and is on the deletion sweep's SURVIVES list as _"the export audit —
> who took what, and when."_ **Does the archive reuse it, or need its own?**

> ### §S8 — owed
>
> **Where does the ZIP itself live, how long, and does it count against the cap?** ⚠️ **A 500 MB archive
> written into the `exports` bucket while the customer is AT their cap is a real problem.** Propose an
> answer.

> ### §S9 — owed
>
> **Folder structure.** Propose it. Something a contractor can open on a laptop three years later and
> navigate without the app — photos, documents by category, contracts, invoices, and trash in its own
> folder.

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

> ### §S10 — owed
>
> **Does `ai_tag_logs` already give the count?** It exists to record AI spend — **if it has one row per
> tagged photo with a timestamp, the counter is a query, not a new table.**

> ### §S11 — owed
>
> **When does "monthly" reset** — the calendar month in the company's timezone, or the billing period?
> ⚠️ **The billing period is more defensible** (they paid for a month of tagging), **the calendar month
> is easier to explain.** Propose one.

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
