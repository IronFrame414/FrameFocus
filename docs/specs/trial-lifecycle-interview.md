# Trial lifecycle — INTERVIEW MATERIAL

> # ⚠️ THIS IS NOT A SPEC.
>
> **It is the interview-first pass that must happen before one exists.** There is deliberately
> **no schema, no acceptance criteria, no build order and no code** here, and none should be added
> to this file — a spec is a separate document written *after* these questions are answered and an
> `input → store → output` trace is approved.
>
> House rule (CLAUDE.md, "Spec completeness rule"): every module spec needs this pass first.
> **Two Module 4 failures traced to skipping it.** This work destroys customer data permanently and
> carries legal exposure, so it is the last place to skip it.
>
> **Status:** questions only. Raised S136 (2026-08-12) from the ruling recorded in `GATED.md` →
> "TRIAL LIFECYCLE".

---

## 1. What is already ruled — do not re-ask these

These are Josh's decisions and the interview starts from them.

| | Ruling |
| --- | --- |
| **Trial expiry** | All data **permanently deleted**. |
| **Warning** | **3 days** before deletion. |
| **Paying customer who cancels** | Data kept **30 days**. |
| **Export** | Must exist **before** deletion. |
| **Trial count** | **3 per email address**, tracked. Data does **not** transfer between trials. |
| **Export contents** | **Everything**, with **per-category selection** — files, photos, chat log, budget, and so on. |
| **Export format** | **Zip**, with a **CSV bundle** option. |
| **What "deleted" means** | **Live database rows and storage objects, immediately.** Encrypted backups age out on the platform's retention schedule and are never restored into the product. **The warning must say this plainly** — claiming backups are purged cannot be stood behind, since Supabase PITR snapshots are not per-row deletable. |

---

## 2. What the code already says — established, not assumed

Read from the applied schema and the running code in S136, so the interview argues from facts
rather than from memory. Where a document and the code disagreed, the code won.

- **The deletion and export surface is 71 tables.** 73 tables exist; **71 carry `company_id`**.
  Any answer about "everything" is an answer about those 71 plus storage.
- **Two storage buckets:** `company-logos` and `project-files`. Photos, PDFs, signed artifacts and
  delivery/incident attachments all live in `project-files`.
- **No export capability exists today.** No zip library, no archive route, nothing. This is
  greenfield, and it is the ruling that gates every other one.
- **Cron infrastructure exists and is proven** — seven handlers under `app/api/cron/`, scheduled in
  `apps/web/vercel.json`. ⚠️ **Six of the seven are scheduled.**
  `/api/cron/invoice-reminders` has a handler and **no schedule entry**, so it never runs
  (pre-existing, already recorded in `notifications-architecture.md` §675 and §1137). It matters
  here because the warning would ride the same mechanism, which has already lost one entry
  silently.
- **`trial_emails` is `id, email, created_at` with `UNIQUE(email)`.** It is append-only and holds
  **one row per address, ever**. "Three trials per email" cannot be a row per trial without
  dropping that constraint.
- **Today's fourth-attempt experience already exists, by accident.** A burnt address gets
  `subscriptions.status = 'incomplete'`, and `middleware.ts:168` treats `incomplete` as
  `needsPayment` and redirects **every dashboard route** to `/dashboard/billing/plans`. Nobody
  designed that as the "you have used your trials" screen; it is what falls out.
- **Email delivery is currently unreliable.** Invitations are being accepted by Resend and
  discarded at Gmail (S136, under investigation separately). A 3-day warning delivered only by
  email is a warning delivered on a channel that is currently not working.

---

## 3. Questions

### 3.1 The export — it gates everything

A 3-day warning is only meaningful if the export **completes inside 3 days**. If it cannot, the
warning period is the wrong length, and that changes a ruling.

1. **How long does a full export of a real company take?** What is the largest company we should
   design for — number of photos, total storage bytes, number of projects? Nobody has measured
   this; the answer decides synchronous vs. job.
2. **Synchronous download, or a job that notifies when ready?** If a job: what does the user see
   while it runs, and what happens if they close the tab?
3. **Where does the zip live once built?** A storage bucket, and if so under what path and what
   RLS? Is the export itself a company-scoped object that would then be caught by the deletion it
   exists to precede?
4. **How is it retrieved, and how long is the link good for?** ⚠️ **If the link outlives the data,
   that is a hole** — a signed URL that still works after deletion means the data was not deleted.
   If the link expires *before* the person downloads it, the export did not happen.
5. **Can an expired-but-not-yet-deleted account still export?** They are inside the 3-day window,
   which is exactly when they will try. Today an `incomplete` subscription cannot reach any
   dashboard route at all — does the export live outside that redirect?
6. **Can a deleted account export?** Presumably not, but say so explicitly, because the support
   request will arrive.
7. **What does "per-category selection" mean at the boundaries?** If someone exports "budget" but
   not "files", do budget rows that reference a file export a broken reference, a filename, or
   nothing?
8. **What is in the CSV bundle that is not in the zip, and vice versa?** Photos cannot be CSV. Is
   the CSV bundle a *subset* (tabular data only) or a *companion* (CSV plus the same binaries)?
9. **Does an export include other people's contributions?** A subcontractor's chat messages, a
   client's signature — see §3.3.4.
10. **Who can run an export?** Owner only, or Admin too? Can a PM export the project they manage?
11. **Is the export audited?** If a departing employee exports everything on their last day, is
    there a record?

### 3.2 The warning

12. **Who receives it — Owner only, or every user?** A crew member has no billing power; the
    Owner may have stopped reading. If everyone, an inactive foreman gets a "your data will be
    destroyed" email about a company that is not his.
13. **How many times, and on what days?** "3 days before" is one send. Is there a 7-day or 1-day
    notice as well?
14. **Through which channels?** ⚠️ **Email is the obvious one and email delivery is currently
    unreliable** — mail is being accepted and discarded at Gmail today. If email is the only
    channel, permanent deletion depends on a channel we currently cannot trust. Is in-app or push
    required as a second channel, and is push acceptable given it needs a home-screen install on
    iOS?
15. **Does anything in-app show it?** A banner, an interstitial, a blocking modal? Today an
    expiring trial redirects to `/dashboard/billing/plans`, which is about payment, not about
    data loss.
16. **What exactly does it say about backups?** The ruling is that live rows and storage go
    immediately and encrypted backups age out. That sentence has to be written for a non-technical
    reader without over-promising. **See §3.5 — this is legal-review material, not copy to be
    drafted here.**
17. **Does the warning link straight to the export, and does that link work for an account that
    is already blocked from the dashboard?**
18. **Is the warning recorded?** If a customer says "I was never told", what proves otherwise —
    an `email_logs` row is a send, not a receipt.

### 3.3 Deletion mechanics

19. **What runs it?** A Vercel cron like the other six, a Supabase scheduled function, or a manual
    operator action with a queue? Note the existing cron mechanism has already lost one schedule
    entry silently.
20. **How does it prove it finished?** What is written, where, and what does an operator read to
    confirm a company is gone rather than half-gone?
21. **⚠️ What happens on partial failure?** Half a company deleted is worse than either outcome —
    the customer has lost data *and* still appears to exist. Is deletion one transaction across 71
    tables plus storage (storage cannot join that transaction), or a resumable job with a state
    machine? What is the retry, and what is the alarm?
22. **Storage and database cannot be atomic.** Which goes first? Rows-then-objects leaves orphaned
    files nobody can reach; objects-then-rows leaves rows pointing at nothing. Which failure is
    preferable?
23. **What survives, and whose is it?**
    - A **subcontractor** belongs to their own company but their `company_members` row, punch
      items, chat messages and assignments live in the company being deleted.
    - A **client** may have signed a contract or a change order that is a legal document.
    - `email_logs` is a record that mail was sent to third parties.
    - `ai_tag_logs` is append-only cost data with an `ON DELETE SET NULL` FK — it was deliberately
      built to survive file deletion. Does it survive company deletion?
    - `trial_emails` **must** survive, or the 3-trial count resets and the mechanism is defeated.
24. **What about the auth users?** Deleting `auth.users` rows removes the login; leaving them
    leaves accounts with no company, which is the state D1 (S135) was built to prevent.
25. **Is a company ever *un*-deletable?** An active dispute, an unpaid invoice, a legal hold — is
    there a flag that stops the job, and who can set it?
26. **Does Stripe need anything?** Cancelling a subscription, deleting a customer object, or
    retaining it for financial records.

### 3.4 The 3-trial count

27. **Does `trial_emails` become a counter, or a row per trial?** It has `UNIQUE(email)` today, so
    a row per trial means dropping that constraint. A counter is a smaller change; a row per trial
    keeps the dates, which matters if "3 trials" ever gains a time window.
28. **Is it 3 trials ever, or 3 in a period?** "3 per email address" as ruled reads as forever.
29. **What is the identity being counted?** An email address is trivially varied
    (`josh+1@`, `josh+2@`). Is `+`-addressing normalised? Is it counted per address, per domain,
    or per person by some other signal? **Note this is anti-abuse, and the honest answer may be
    "an email address is not a person, and we accept that."**
30. **⚠️ What does the 4th attempt see, and is it recoverable self-serve?** Today it is
    `status='incomplete'` plus a redirect to the plans page — a payment screen, not an explanation.
    **Establish whether that is the intended experience or an accident.** If intended, it needs
    copy that says "you have used your three trials" rather than showing a price list.
31. **Does paying convert a burnt address into a good one?** If someone uses three trials and then
    subscribes, is that a normal customer?
32. **What resets the count, and who can reset it?** Support will be asked. If nobody can, say so;
    if an operator can, that is a privileged action that needs a record.
33. **Does data transfer between trials?** Already ruled: **no**. Then the second trial from the
    same address starts empty — **is that stated to the user at signup, or discovered at the end?**

### 3.5 The question that outranks the rest

34. **⚠️ What does the product say to a customer whose construction records were permanently
    deleted?**

    Some of what is destroyed is material a construction company is **legally required to
    retain** — signed contracts, change orders, lien releases, safety incidents, daily logs that
    evidence what happened on site on a given day, timesheets. A contractor who loses a safety
    incident record may be unable to answer a regulator; one who loses a signed change order may be
    unable to defend a payment claim.

    **This wording and the retention question are routed to professional legal review — the posture
    Module 7 took on lien waivers. They are NOT hand-authored here, and no draft appears in this
    file on purpose**, so that no placeholder can be mistaken for approved language.

    What legal review needs to be asked:
    - May we delete this material at all, on this timetable, for a customer in these jurisdictions?
    - Does a trial customer's agreement have to say so **at signup**, not only at expiry?
    - Is 3 days' notice defensible for records of this kind?
    - Does the export discharge the obligation, or only reduce it?
    - What must the warning say about backups so that it is true and not a promise we cannot keep?

35. **Does the same answer apply to a paying customer who cancels?** They get 30 days, which is
    longer but ends the same way.

---

## 4. Open-decisions register

Everything below is **open**. Nothing here is a recommendation; several are recorded precisely
because two reasonable answers exist and nothing in the code picks one.

| # | Decision | Why it is not derivable | Blocks |
| --- | --- | --- | --- |
| TL-1 | Export synchronous vs. job | Nobody has measured a real company's export time | The 3-day window's viability |
| TL-2 | Where the export zip lives, and its RLS | No export exists to follow | TL-3, deletion scope |
| TL-3 | Export link lifetime vs. deletion date | A link outliving the data contradicts "deleted" | The warning's content |
| TL-4 | Whether an expired account can reach the export | Today `incomplete` blocks every dashboard route | Whether the ruling is achievable at all |
| TL-5 | Per-category selection at reference boundaries | Product choice about broken references | Export contents |
| TL-6 | CSV bundle: subset or companion | Product choice | Export contents |
| TL-7 | Warning recipients (Owner vs. all users) | Product choice with a privacy edge | Warning design |
| TL-8 | Warning channels, given email is currently unreliable | External dependency, unresolved as of S136 | Whether deletion can proceed on schedule |
| TL-9 | Warning cadence (one send or several) | Product choice | Warning design |
| TL-10 | Proof-of-notice requirement | Legal-adjacent; `email_logs` proves send, not receipt | Disputes |
| TL-11 | Deletion runner and its failure/retry model | Architecture choice; partial failure is the risk | Everything in §3.3 |
| TL-12 | Storage-first vs. rows-first ordering | Cannot be atomic; both leave a different mess | Deletion design |
| TL-13 | What survives deletion (subs, clients, signed docs, logs) | Ownership question, partly legal | Deletion scope |
| TL-14 | Whether `auth.users` rows are deleted | Interacts with S135 D1's no-orphan-account rule | Deletion scope |
| TL-15 | Legal-hold / un-deletable flag | Product + legal | Deletion design |
| TL-16 | Stripe-side actions on deletion | Financial-records retention | Deletion design |
| TL-17 | `trial_emails`: counter vs. row-per-trial | `UNIQUE(email)` makes them materially different changes | Trial counting |
| TL-18 | Identity counted (address, normalised address, domain) | Anti-abuse; may be accepted as imperfect | Trial counting |
| TL-19 | 4th-attempt experience — intended or accidental | Today's behaviour was never designed | Trial counting UX |
| TL-20 | Whether a burnt address can become a paying customer cleanly | Product choice | Trial counting |
| TL-21 | Who can reset a trial count, and is it recorded | Support reality | Trial counting |
| TL-22 | Whether "no data transfer between trials" is disclosed at signup | Ruled behaviour, undisclosed timing | Signup copy |
| TL-23 | **Customer-facing deletion wording** | **Routed to professional legal review. Not drafted here.** | The warning, signup terms |
| TL-24 | **Whether these records may be deleted on this timetable at all** | **Legal review.** May override the expiry ruling | The entire feature |

---

## 5. What must exist before a spec is written

1. Answers to §3, or an explicit "defer" against each with a reason.
2. **A measured export time** for a representative company — TL-1 is not answerable from a desk.
3. **Legal review's response** on TL-23 and TL-24. TL-24 can invalidate the expiry ruling, so it is
   the first thing to send, not the last.
4. An approved **`input → store → output` trace** for the export and for the deletion job, per the
   house rule this file exists to satisfy.
