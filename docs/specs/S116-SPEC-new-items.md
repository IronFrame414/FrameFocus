# New items — 2026-09-29

To be folded into `docs/specs/S114-SPEC-close-open-items.md` in place, keeping its conventions.

---

## C-13. Edit a project's title

[Josh, 2026-09-29] There is no way to rename a project.

⚠️ **The name travels.** It appears on proposals and invoices, and because QuickBooks has no project
object, the project name is written into the **memo text** of everything that syncs. A rename after
documents have gone out leaves a sent PDF saying one name and the app saying another.

**FILL-C-13.1** — Every place `projects.name` is read, copied or embedded: documents, PDFs, emails,
QuickBooks memo strings, file paths, notification bodies. ⚠️ **Audit by what is CALLED, not by what
matches a filter.**
**FILL-C-13.2** — Whether the name is denormalised into any row at creation time (a copy that a rename
would not reach).
**FILL-C-13.3** — Who may rename. Narrower default: Owner/Admin.

**ASK-C-13** — Does a rename change history, or do already-sent documents keep the name they were sent
under? Recommendation: sent documents keep their name — a client holding a proposal for one job name
should not find it filed under another. Josh rules.

---

## C-14. Material sign-out form, on the Field tab

[Josh, 2026-09-29] Source: `WP_Material_Signout_Form` (Google Doc). Field-by-field below, read from the
document.

⚠️ **This is not a single-submit form. It is a two-stage record with an open state.** Material goes out
today and comes back later — or does not come back. A form that only captures the sign-out is paper
with extra steps; the reason to put it in the app is that the app can tell you what is still out and
what is overdue.

### The record, as the paper form defines it

**1 — Job information:** job address, project / job name, date.
**2 — Material description:** material type / name, colour / pattern, manufacturer / brand, model / SKU,
item #, quantity, dimensions / size; **condition at release** (undamaged | minor damage | pre-existing
damage); damage / condition notes.
**3 — Purpose and expected return:** work to be performed, **expected return date**, return location.
**4 — Receiving party / transporter:** company name, contact name, phone, driver / recipient name,
vehicle / unit #.
**5 — Sign-out authorisation:** released by (WP) + date/time + **WP signature** + title; received by +
date/time + **receiving party signature** + title / company.
**6 — Return / check-in, completed later:** date returned, time returned, **condition at return** (same
as released | damage occurred | **material not returned**), return notes, received back by (WP) +
date/time + **WP signature**.

Footer, which must appear above the receiving party's signature: *"By signing above, the receiving party
acknowledges responsibility for the listed material while in their possession and agrees to return it in
the same or better condition."*

### What the build must establish

**FILL-C-14.1** — ⚠️ **Signature capture already exists** for proposal signing (`signing_sessions` and
the signing page). Measure whether that component and its storage are reusable here, or whether this
needs its own. Do not build a second signature mechanism without saying why.
**FILL-C-14.2** — The record's states and who can move between them: open → returned, open → damaged on
return, open → **not returned**. An overdue state derived from `expected_return_date`.
**FILL-C-14.3** — Where it surfaces once open: the Field tab, and whether an overdue item appears
anywhere a person will actually see it. ⚠️ A record nobody is shown is a record nobody closes.
**FILL-C-14.4** — PDF output. This is a liability document; the signed version needs to be producible
and attached to the project like other documents.
**FILL-C-14.5** — Who may create one, who may sign as WP, who may close it out. Narrower default:
anyone who can open the Field tab creates and signs as WP; Owner/Admin/PM close.
**FILL-C-14.6** — PARITY: `/m` is where this gets used, on a phone, at a tailgate. Desktop needs at
least the list and the PDF.

**FILL-C-14.7 — Photos, at both stages.** [Josh, 2026-09-29]
⚠️ **Two distinct sets, not one pile.** Photos taken at **release** are the evidence behind "condition
at release"; photos taken at **check-in** are the evidence behind "condition at return". The entire
value of the record is being able to put them side by side when a sub says the damage was already there.
A single photo list destroys that.
- Release photos attach while the sign-out is being signed; return photos attach at check-in. Each set
  carries its own timestamp and the identity of who took it.
- ⚠️ **Multi-select and the shared upload queue.** This is a several-photos-at-once situation by nature —
  a pallet gets four angles. Use `runUploadBatch` with the `upload-batch-list` UI per `#2-s180u`, and
  count this as one of the surfaces needing its own proof. ⚠️ It must NOT become a ninth bespoke upload
  path; that is the exact shape `#2-s180u` exists to stop.
- ⚠️ **Category, never MIME (R7).** These need a category of their own so the project Photos grid does
  not fill with pallet shots — and so they remain findable from the record. State what happens to them
  on the Photos and Files surfaces before building.
- Both sets appear in the PDF (FILL-C-14.4), captioned with which stage they belong to.
- **ASK-C-14c** — should release photos be **required** before the receiving party can sign? A condition
  record with no photo is an argument you lose. Recommendation: at least one, warned but not blocked, so
  a dead phone battery never stops material leaving a yard.

**ASK-C-14a** — Is the receiving party always external (a sub, a driver), or can it be your own crew
taking material between jobs? That decides whether the receiver needs an account.
**ASK-C-14b** — Does an open sign-out block anything — a project closing, a crew member's day ending —
or is it purely a record?

---

## C-15. Bring the daily log up to the paper close-out form

[Josh, 2026-09-29] Source: `WP-Daily-CloseOut-Lookahead` (Google Doc). The app's daily log is missing
items the paper form carries.

⚠️ **Confirm the reading before building:** Josh said "update the daily to include the extra items that
are [on] this form", pointing at the close-out document. Taken as: the daily log should carry what the
paper form carries. **If he meant instead that material sign-outs should appear on the daily log, that
is a different item** — ask rather than guess.

The paper form's sections, to compare against what the app's daily log has today:

**A — Close-out checklist**, ten items: floors swept/vacuumed; debris hauled, no piles; cut station
broken down and clean; tools cleaned, staged, locked; cords coiled, walk paths clear; materials stacked
flat and covered; finished work protected; water and power off at source; windows and doors locked, site
secure; tomorrow's first task staged. Plus **photos sent** (each work area, staging/debris area, entry
path, 4–5 minimum) **with the time sent**.

**B — Completed today.**

**C — Next two days:** tomorrow (with date) and day after (with date).

**D — Needed on site, not here now** — the 48-hour rule, flagged two days out. A table: item / material,
qty, unit, needed by, vendor / source, **ordered (office)**. ⚠️ **This is the one with teeth.** It is a
request from the field to the office with an acknowledgement column, so it wants to reach whoever
orders, not just sit in a log.

**E — Blockers:** sub, inspection, or a decision from the office.

**Footer:** completed by; **office reviewed / actioned**.

**FILL-C-15.1** — What the app's daily log captures today, field by field, against the list above. State
what is missing and what exists under a different name.
**FILL-C-15.2** — Section D and the office-reviewed footer imply a second reader. Establish whether a
daily log is surfaced to anyone in the office today, or only stored.
**FILL-C-15.3** — PARITY `/m` and desktop. This is filled on a phone at the end of a day.

**ASK-C-15** — Does section D's "ordered (office)" tick need to be actionable — the office marks it
ordered and the field sees that — or is the daily log a record only? Recommendation: actionable, because
the 48-hour rule only works if the field knows the office saw it.