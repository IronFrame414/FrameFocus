# S108 — SPEC A (skeleton) — Site Visit

**Status: INCOMPLETE. This is a scaffold, not a spec.**

**RULED** = settled by Josh. Do not re-litigate.
**FILL-n** = a hole CC measures and fills in place.
**ASK-n** = goes to Josh in Phase 2 and becomes a ruling.

⚠️ **A FILL you cannot fill must say why, in one line. Never delete a marker.**
⚠️ **If a measurement contradicts a RULED line, STOP and report. Do not reconcile it.**
⚠️ **Any figure, formula, column name or "the X used for Y" here is Josh's approximation of the
mechanism. Measure the real one, correct this file, and list the correction in FILL-A13.**

⚠️ **This is the largest and riskiest part of S108. It builds LAST.** Do not start it until
Specs B, C and D are built, green, and pushed.

---

## What it is

A record of an initial site visit, before an estimate is priced: who, where, what it looks like,
what the work is, what blocks a number. Recorded on a phone, on site.

---

## RULED [Josh, 2026-09-21]

### Shape

- ⚠️ **A site visit IS an estimate, in a status before `draft`.** Not a new record type and no
  conversion step — the visit becomes the estimate.
- ⚠️ **The estimate number is assigned when the visit moves to `draft`, NOT at creation.** Abandoned
  visits must leave no gaps in the client-visible number sequence.
- **Recorded on MOBILE, on site** — a new `/m/` screen.

### Who

- ⚠️ **Any INTERNAL role creates a site visit: owner, admin, project manager, foreman, crew
  member.** Not subcontractor. Not client.
- ⚠️ **After the visit becomes a `draft`, the person who recorded it keeps READ access to the photos
  and notes they captured, and NO access to money** — enforced in the database, not by hiding it
  on screen.

### What it captures

- **Contact and address**, new or existing.
- **Photos**, with AI tagging (the company's existing `ai_tagging_enabled` path).
- ⚠️ **Existing conditions and proposed scope as SEPARATE notes.** "Tile is cracked, subfloor may be
  soft" is a condition; "demo tile, level, install LVP" is scope. Conflating them loses the
  condition detail that later justifies a change order.
- **Measurements.**
- ⚠️ **Voice notes — audio AND transcript are both kept; the transcript is editable.**
  Transcription will mishear jobsite audio (saws, wind, trade terms like "LVP"); the audio is what a
  misheard measurement is checked against.
- **Blockers** — what prevents pricing it yet (access, a permit question, a load-bearing wall).

---

## ⚠️ The Financial Visibility Floor — the real risk in this spec

Foremen and crew have never touched an estimate row. Today only owner/admin/PM may insert one
(`estimates_insert_manager`), and only owner/admin (any) and PM (own) may select one.

⚠️ **RLS is row-level. A role that can SELECT an estimate row receives EVERY column of it** —
totals, margins, the company default markups/margins copied onto it at creation. `#136`'s class: a
gate controlling only rendering still ships the data in the payload. **A renderer omitting a column
is not a floor.**

So "crew can create a site visit" and "crew never sees money" cannot both be met by adding crew to
the existing estimate policies. This spec must say exactly how they are met, and prove it on the
wire.

---

## What CC measures

**FILL-A0** — `main`'s tip, the branch, whether the tree is clean.

**FILL-A1** — The `estimates` table: every column; which carry money (totals, margins, markups,
default rates copied from `companies`, tax, discount, `projected_value`); which are populated at
INSERT rather than later.

**FILL-A2** — `estimates.status`: its type (enum / CHECK / text), every value, and **every reader
that branches on it** — list screen, metrics strip, Before You Send, send, sign, convert, reminders,
expiry, the deletion sweep, email, QuickBooks. ⚠️ **A new status is read by code that has never seen
it. Name every reader and what it would do with the new value.**

**FILL-A3** — `estimate_number`: nullability, uniqueness, how it is assigned
(`estimate_number_prefix` / `estimate_number_sequence`), and what assigning it at promotion instead
of insert requires.

**FILL-A4** — Every RLS policy on `estimates`, `estimate_categories`, `estimate_line_items`,
`estimate_line_rows`, and `files` as it applies to estimate files. State exactly what a foreman and
a crew member can do on each today.

**FILL-A5** — ⚠️ **How a crew member INSERTs a site visit without being able to SELECT money.**
`INSERT … RETURNING` needs SELECT. Candidates: a SECURITY DEFINER RPC that creates the row and
returns only safe columns; a column-safe view; notes/photos kept off the estimate row. If the only
safe answer contradicts the RULED shape (a site visit IS an estimate), **STOP and say so.**
Measure, then propose — **do not pick.**

**FILL-A6** — ⚠️ **Where the notes live.** Scope today lives on estimate columns (`scope_summary`,
`scope_sections`). If site-visit notes live on the estimate row, the recorder's post-draft read of
"their notes" means reading a row that carries money. State where conditions, scope, measurements,
blockers and transcripts must live for that read to be money-free.

**FILL-A7** — The S106 estimate-files route (`/api/estimates/[id]/files`). Its floor is a session
read of the estimate, and POST requires edit rights on a `draft`. A crew member passes neither, so
they could not upload photos to their own visit or read them after promotion. State what changes and
whether the route stays the only access control. ⚠️ **The route-floor test (built S107) must still
fail if the admin client moves above the session read.**

**FILL-A8** — What mobile already provides to REUSE: burst capture and the IndexedDB held-shot
store, the `capture` inputs, the offline queue and its weak-signal fix, `ContactAddressPicker` and
inline contact create (`#147`/`#148`), the clock→job project source. ⚠️ **A site visit has no
project.** Capture today is project-scoped and a field INSERT without a `project_id` is refused by
RLS (§7a). State how a site-visit photo avoids that without weakening §7a.

**FILL-A9** — Voice: which OpenAI transcription model, file-size limits, cost per minute, where
audio is stored (bucket, path convention — Supabase Storage rejects angle brackets in keys), and
what happens on weak signal — can audio be recorded offline and transcribed when signal returns.

**FILL-A10** — Contact and address creation by a crew member. `contacts_insert_authorized` matches
`estimates_insert_manager`. Does a crew member need contact INSERT, and ⚠️ **does granting it let
them read other contacts?**

**FILL-A11** — Where site visits appear on desktop. ⚠️ **They must not inflate pipeline totals, the
metrics strip, the "unpriced" warnings, or any aggregate.** List every aggregate that would count
them today.

**FILL-A12** — Every migration this spec requires, with purpose. Rebuild-test only. ⚠️ **Count the
rows each new constraint will govern on PRODUCTION before proposing it** — give Josh the query.
`20261540000000` aborted on production against two rows nobody counted, and `20261610000000`'s
CHECK would have made every tenant undeletable. Both were constraints written against rows nobody
counted.

**FILL-A13** — Every figure, formula or column name this spec names, and whether measurement
confirmed or corrected it.

---

## ASK — Phase 2

**ASK-A1** — On FILL-A5: the mechanism for a money-free crew INSERT.

**ASK-A2** — On FILL-A6: where notes live.

**ASK-A3** — Who can PROMOTE a site visit to `draft`? Promotion assigns the number and creates the
first money-bearing state. Likely owner/admin/PM only — confirm.

**ASK-A4** — When a foreman or crew member records a visit, is the office notified? Via the existing
`notify()` path?

**ASK-A5** — Measurements: free text, or structured (area name, length × width, computed square
feet)? Structured would feed the square-foot labor unit in Spec B.

**ASK-A6** — Blockers: free text, or a list that can be checked off as resolved?

**ASK-A7** — Can a site visit be abandoned without becoming an estimate? If so: what state, who can
do it, and where does it appear afterward.

**ASK-A8** — Can the recorder edit their visit after submitting it, before promotion?

---

## AUDIT — before Spec A builds

1. Every FILL filled or one line saying why not. State counts found and filled.
2. Every ASK has a recorded ruling and the alternative it beat.
3. No measurement contradicts a RULED line.
4. ⚠️ **FILL-A5 and FILL-A6 are answered and ruled.** Without them the Floor is not met and nothing
   in this spec builds.
5. ⚠️ **Every reader in FILL-A2 handles the new status** — named, not assumed.
6. ⚠️ **A live test proves a crew member who recorded a visit receives NO money column — on the
   wire, before AND after promotion.** State the row count. A test that passes on zero rows is a
   failure.
7. Every migration named, with its production row count. Josh applies them.
8. Anything still unknown that the build needs.
