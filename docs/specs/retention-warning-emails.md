# Retention warning emails — copy and rules

> Content for the three warnings that precede permanent deletion. **Ruled by Josh; implement as
> written.** Wording changes here need a ruling, not a judgement call — these emails are the notice
> that stands behind the published policy's deletion promise.

---

## The rules that apply to all three

**These are PLATFORM emails.** EZ Contractor Binder writing to its customer — not a contractor writing
to their client. So per the ruled email/PDF boundary they carry **EZ Contractor Binder's identity**, the
platform palette, and the standard brand footer. **Not the tenant's logo or brand colour.**

⚠️ **The deletion date is exact, not relative.** `delete_after` is **stored as a fact on the row**, not
recomputed — so name the day. *"Deleted on January 3, 2027"* is actionable; *"deleted in 60 days"* makes
the reader do arithmetic and get it wrong.

**Format the date in the company's timezone**, long form: `January 3, 2027`.

⚠️ **Say plainly that they cannot export while locked.** This is the thing customers will be angriest
about discovering too late, and the published terms already warn about it. **Resubscribing is the only
way to get the data out.** Do not soften this.

**Tone:** plain, direct, and not alarmed. These go to a contractor who is busy. **No marketing, no
win-back pitch, no "we miss you."** State the fact, give the date, name the one action.

**Every one ends with a real link** to the billing/resubscribe page and a real reply address.

---

## Email 1 — cancellation, day 30 (60 days remain)

**Subject:** `Your EZ Contractor Binder data will be deleted on {{deletion_date}}`

---

Hi {{first_name}},

Your EZ Contractor Binder subscription was cancelled on {{cancellation_date}}, and your account is
locked.

**Your data will be permanently deleted on {{deletion_date}}.** That includes your projects, estimates,
invoices, photos, contracts and financial records. Once it's deleted it can't be recovered.

**If you want any of it, resubscribe before that date.** Your account unlocks immediately and everything
is exactly where you left it — you can work in it again, or export what you need and cancel.

While the account is locked you can't sign in, read or download anything. **Resubscribing is the only
way to reach your data.**

[**Resubscribe**]({{billing_url}})

If you meant to cancel and don't need the records, you don't have to do anything. They'll be deleted on
{{deletion_date}}.

Questions, or want your data deleted sooner? Reply to this email.

---

## Email 2 — cancellation, day 60 (30 days remain)

**Subject:** `30 days left — your EZ Contractor Binder data is deleted on {{deletion_date}}`

---

Hi {{first_name}},

A second reminder, because this one can't be undone.

**Your EZ Contractor Binder data will be permanently deleted on {{deletion_date}}** — 30 days from
today. Projects, estimates, invoices, photos, contracts, financial records. All of it, and permanently.

**Resubscribe before {{deletion_date}} and everything comes back**, exactly as you left it. You can
export what you need and cancel again the same day.

You can't sign in or download anything while the account is locked. **Resubscribing is the only way to
reach your data.**

[**Resubscribe**]({{billing_url}})

⚠️ **This is the last reminder you'll get.** After {{deletion_date}} there is nothing to restore.

Questions? Reply to this email.

---

## Email 3 — trial, day 10 (4 days remain)

**Subject:** `4 days left — your EZ Contractor Binder trial data is deleted on {{deletion_date}}`

---

Hi {{first_name}},

Your EZ Contractor Binder trial ended on {{lock_date}}, and the account is locked.

**Anything you set up during the trial will be permanently deleted on {{deletion_date}}** — 4 days from
today.

If you were still deciding, **subscribing before {{deletion_date}} keeps everything** you built:
your projects, estimates, contacts and settings, exactly as you left them. Start over after that date
and you start from an empty account.

[**Subscribe**]({{billing_url}})

If the trial wasn't for you, no action is needed — it'll be deleted on {{deletion_date}}.

Questions, or want it deleted now? Reply to this email.

---

## Variables

| Variable | Source |
| --- | --- |
| `{{first_name}}` | The recipient's first name |
| `{{deletion_date}}` | ⚠️ **`delete_after`, formatted long-form in the company's timezone.** Never computed in the template. |
| `{{cancellation_date}}` | When the subscription ended |
| `{{lock_date}}` | When the trial locked |
| `{{billing_url}}` | The resubscribe page — ⚠️ **must be reachable by a locked account**, or the one action the email names does not work |

> ### §S — owed by CC
> ⚠️ **Confirm `{{billing_url}}` is reachable while locked.** Every one of these emails names
> resubscribing as the only way out. **If the middleware blocks a locked account from the billing page,
> the emails are pointing at a door that will not open** — report it before building.

---

## What these emails must NOT do

- ⚠️ **Do not offer an export link.** There isn't one — the account is locked, and offering it would
  contradict the terms.
- **Do not compute the date in the template.** Use the stored value.
- **Do not send after deletion.** A warning to an account whose data is already gone is worse than
  silence.
- **Do not soften the permanence.** The published policy says *"not hidden, not archived"* — the emails
  must agree.
- **No marketing.** No feature list, no discount, no "here's what you're missing."

---

## Delivery

**Email only.** ⚠️ **A locked user cannot see an in-app notification**, so email is the only channel
that reaches them.

**Each fires once.** ⚠️ **A missed cron day must not silently skip a warning** — if day 30 is missed,
the day-31 run still sends it. Better late than never; the deletion date in the body is what matters,
not the day it arrives.