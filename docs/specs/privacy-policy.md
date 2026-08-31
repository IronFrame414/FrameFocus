# Privacy Policy

**EZ Contractor Binder**

**Last updated:** August 30, 2026

---

## The short version

I built EZ Contractor Binder to run construction jobs, not to collect data about you. I don't sell your
information, I don't share it with advertisers, I don't run analytics or tracking on your use of the
app, and I don't use your data to train anything.

The information in EZ Contractor Binder is there because the software needs it to do the job you're
paying it to do. Nothing else.

This policy explains exactly what's stored, why, who can see it, and how long it stays.

---

## Who this is

EZ Contractor Binder is operated by Josh Bishop.

**Contact for any privacy question or request: ezcontractorbinder@gmail.com**

I read that address personally.

---

## Who this policy is about

Two different groups of people, and the difference matters:

**Contractors** — the businesses and people who sign up and use EZ Contractor Binder to run their work.
You're my customer.

**Your clients, employees, subcontractors and vendors** — people whose information a contractor enters
into the system to run their jobs. They aren't my customers; a contractor put their information here.

For that second group: **the contractor controls that information, not me.** If you're a homeowner, an
employee or a subcontractor and you want your information corrected or removed, ask the contractor who
entered it. I'll help them do it, but it's their decision and their data.

---

## What is collected, and why

### When a contractor signs up

Name, email address, phone number, business name, business address, trade type and licence number.
Used to identify the account, to print on the documents the software generates, and to contact you
about the service.

### What a contractor enters to run their business

This is the bulk of it, and it's entered by the contractor, not collected by me:

- **Clients and contacts** — names, emails, phone numbers, job-site addresses.
- **Employees and crew** — names, emails, pay rates, hours worked, timesheets.
- **Subcontractors and vendors** — names, trades, insurance certificates, licences, W-9 forms, tax
  identification numbers.
- **Jobs** — estimates, budgets, invoices, payments, change orders, purchase orders, schedules, punch
  lists, daily logs, safety incidents.
- **Files and photos** — anything uploaded: plans, permits, receipts, job-site photographs, including
  photos with markup drawn on them.

### Location

If a contractor turns on location capture for their company, **the app records GPS coordinates when a
crew member clocks in or out.** This is off unless a contractor enables it, the browser always asks
permission first, and a refusal never blocks anyone from clocking in.

Coordinates are stored with the clock-in record. **There's no tracking between clock-in and clock-out,
and no background location collection ever.**

### Signatures

When a client signs a proposal or a change order electronically, the record stores **their name, the
signature itself, the time, and their IP address.**

The IP address is stored deliberately. An electronic signature is a legal document, and the record of
who signed, when and from where is what makes it hold up. It exists for that reason and no other.

### When a client opens a proposal

When a proposal link is opened, the record stores **the time and the browser's user-agent string** so
the contractor knows their proposal was read.

**IP addresses are not stored for proposal views.** The user agent is kept only to tell a real person
apart from an automated email-security scanner, which follows links without anyone reading them. The
contractor's own views of their own proposals aren't counted.

### Payment information

Subscription payments are handled by **Stripe**. **I never see or store your card number.** What's
stored on my side is a reference that lets Stripe recognise your account, plus your billing history.

### QuickBooks, if you connect it

Connecting QuickBooks is optional. If you do, secure access tokens are stored so the software can send
your expenses and payments to your own QuickBooks company.

**Those tokens are stored so that no user of the software — including me — can read them.** Only the
server uses them, only to talk to QuickBooks on your behalf. You can disconnect at any time.

---

## What is NOT collected

I want to be specific, because most policies are vague here:

- **No analytics.** No Google Analytics, no session recording, no heat maps, no behavioural tracking of
  how you use the app.
- **No advertising.** No ad networks, no tracking pixels, no advertising cookies. Nothing in EZ
  Contractor Binder is paid for by an advertiser.
- **Your data is never sold.** Not to anyone, for any purpose, ever.
- **Your data is not used to train AI models.**
- **No background location.** Location is captured only at clock-in and clock-out, only when a
  contractor has enabled it.
- **No card numbers.** Stripe holds those.

---

## AI features

If a contractor enables the optional photo auto-tagging add-on, uploaded photos are processed to
suggest tags describing what's in them. **The add-on covers 1,500 photos a month.** Past that, photos
still upload normally — they just arrive without suggested tags.

**Photos processed this way are not used to train any model** and are not retained by the processing
service beyond producing the tags. The feature is off unless a contractor turns it on.

---

## Who can see your information

### Inside your company

Each person sees what their role allows. Owners and administrators see everything; project managers,
foremen and crew see progressively less, and financial information in particular is restricted by role.

**These limits are enforced by the database, not just hidden in the screen** — which means someone
can't get around them by guessing a web address.

### Your clients

If you invite a client to the client portal, they see only their own job: their documents, their
selections, their invoices. **They can't see your costs, your margin, or anything about your other
clients.**

### Your subcontractors

A subcontractor invited to a job sees only what they need for that job. They can't see client contract
values, your margin, or your other jobs.

### Me

I can access data when it's necessary to operate the service — fixing a fault, investigating a problem
you've reported, or responding to a lawful legal request. **I don't browse customer data**, and I don't
use it for anything other than running and supporting the service.

### Nobody else

Your information isn't shared with any other party except the service providers listed below, each of
which does one specific job.

---

## Service providers

| Provider                | What it does                                | What it holds                                                 |
| ----------------------- | ------------------------------------------- | ------------------------------------------------------------- |
| **Supabase**            | Database, file storage, sign-in             | Your data, stored in the United States (Ohio)                 |
| **Vercel**              | Runs the application                        | Serves the app; no separate copy of your data                 |
| **Resend**              | Sends email                                 | Email addresses and the contents of emails the software sends |
| **Stripe**              | Subscription payments                       | Your card details and billing history                         |
| **Intuit / QuickBooks** | Accounting sync, **only if you connect it** | The expenses and payments you choose to send                  |

Each of these has its own privacy policy. **None of them is permitted to use your information for their
own purposes.**

---

## Where your data is stored

**In the United States**, in Supabase's Ohio region.

---

## How long it's kept

While your subscription is active, your data is kept so you can use it. Construction records outlive
the job — warranties, liens and disputes surface years later — so **nothing is deleted just because a
job finished.**

**Each plan includes a storage allowance.** If you reach it, new uploads stop until you free up space
or move to a larger plan — **nothing is deleted to make room, and the rest of the software keeps
working.**

**If your trial expires without a subscription:** the account locks, and the data is retained for
**14 days** so you can subscribe and get it back. You can't read it while locked.

**If you cancel a paid subscription:** the account locks, and the data is retained for **90 days** so
you can resubscribe and get it back. You can't read it while locked. **Your clients keep their portal
access during this period** — they may still need documents from a job you did for them.

**After those windows, your data is deleted.** Permanently, and it cannot be recovered. This isn't a
flag in a database marking it hidden — the records are removed.

⚠️ **Export what you need before your account locks.** You can't read or export your data while the
account is locked, and once the retention window passes it's gone.

**Deleted files sit in the trash and still count against your storage.** They are permanently removed
when an Owner or Admin empties the trash, and **anything left in the trash for six months is
permanently deleted automatically.**

**Proposal view records** — the log of when a proposal was opened — are kept for six months, or longer
while the estimate is still open.

**You can ask for your data to be deleted at any time** — you don't have to wait for a retention
window to run out. Email ezcontractorbinder@gmail.com.

---

## Your rights

Whatever your location, you can ask me to:

- **Tell you what's stored** about you.
- **Correct** anything wrong.
- **Delete** your information.
- **Export** your data so you can take it elsewhere. **You can also download any project as a single
  zip file** — every document, photo and record in it, sorted into folders, including anything sitting
  in that project's trash.

Email **ezcontractorbinder@gmail.com**. I'll respond within 30 days, and usually much sooner.

**If a contractor entered your information** — you're their client, employee or subcontractor —
**contact that contractor first.** Their data is theirs to control. If you can't reach them, email me
and I'll help.

---

## Security

- Everything is encrypted in transit and at rest.
- Access limits are enforced at the database, not in the screen.
- QuickBooks tokens are stored so no user of the software can read them.
- Card details are held by Stripe, not by me.

**No system is perfectly secure, and I won't claim otherwise.** If a breach affects your information,
I'll tell you — promptly, plainly, and with what I actually know rather than a form letter.

---

## Children

EZ Contractor Binder is business software and isn't intended for anyone under 18. I don't knowingly
collect information from children.

---

## Where this service is offered

EZ Contractor Binder is offered **in the United States**. It isn't marketed to or intended for users in
the European Union or the United Kingdom.

---

## Changes

If this policy changes, the date at the top changes and material changes are emailed to active
customers. Changes aren't applied retroactively to information already collected under a previous
version.

---

## Contact

**ezcontractorbinder@gmail.com**

Any question about this policy, any request about your data, or anything that seems wrong — write to me
directly.
