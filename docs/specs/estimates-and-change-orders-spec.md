# Estimates & change orders — the editor build

**Ruled by Josh 2026-10-03, 06:43–07:57 ET, from the live estimate editor.**

⚠️ **ITS OWN BUILD. NOT S127** — S127 is mid-flight on the photo share link and must not pick this up.

Five parts. **A, B and C are one surface and ship together. D and E are different surfaces and may
ship separately.**

⚠️ **Everything below is a claim about the repo until verified.** Each part opens with what must be
checked before anything is written.

---

# PART A — LINE-ITEM DESCRIPTIONS

## ⚠️ A-0 — VERIFY FIRST. This may be a rendering gap, not a new column.

**Does a description field already exist on estimate and change-order line items?**

⚠️ **This exact shape has bitten this project twice.** The clock location was captured for months with
nothing displaying it (S127 item 4c). `client_schedule` returned task status that no page ever
rendered (S123 Q-D1). ⚠️ **A function returning a field is not the page showing it, and a column
existing is not a feature.**

**Check the line-item tables for both estimates and change orders, the cost catalog, and whether
anything already writes or reads such a field.** State what you found before proposing a migration.

## A-1 — The field

**Every line gets one, whatever its source** — catalog picks and manually typed items alike.
⚠️ **Not manual-only.** A proposal where the catalog lines have no description and the typed one does
reads worse than none at all.

**Never required.**

⚠️ **When it is blank, nothing renders.** Not on the proposal, and ⚠️ **no empty box, placeholder or
reserved row in the estimate grid.** A line without a description must look exactly as it does today.

## ⚠️ A-2 — Client visibility is conditional on the PROPOSAL FORMAT

> **[Josh, 2026-10-03]** *"the description is only visible to clients when the format selected is
> 'summary with description', 'itemized with description', 'cost plus', 'time and material'"*

**The client sees line descriptions on exactly those four formats. On any other format they do not
reach the client at all.**

⚠️ **VERIFY THE REAL FORMAT VALUES.** Those are Josh's words for them, not necessarily the stored
enum. ⚠️ **Note that "cost plus" and "time and material" are also contract-type values on
`projects.project_type`** — establish which is which before writing a condition against either.

### ⚠️⚠️ THIS IS NOT A CONDITIONAL RENDER. THIS IS THE `#136` CLASS.

**A format check that only decides what to DRAW still ships every description in the payload, and the
client can read it.** The repo has shipped exactly this before.

- **The client read path returns a narrowed shape that CONTAINS NO DESCRIPTION on the other formats.**
- ⚠️ **Prove it by inspecting the PAYLOAD, not the screen** — a cookie-less fetch of the page's bytes,
  the same proof S127 item 4e used for the public share page.
- **A sabotage that removes the narrowing must go RED.**

## ⚠️ A-3 — The SECTION description does not change

> **[Josh, 2026-10-03]** *"section description does not change. leave it exactly as it is"*

The existing **"Description (shown on proposal)"** on a section (Pre-Construction, Rough Phase) keeps
its current behaviour on every format. ⚠️ **Do not fold it into A-2's format rule. Do not touch it.**

## A-4 — Open for the build to decide and state

- **Does a catalog item's own description prefill the line?** It would make "Save this to the cost
  catalog" more valuable — a description written once gets reused. **If built, it must be editable on
  the line without changing the catalog record.**
- **Is there a length cap?** "Detailed description" implies paragraphs. ⚠️ **Whatever is chosen, the
  PDF must handle it** — a description long enough to break the proposal layout is a defect, not an
  edge case.

---

# PART B — MARKUP AND THE MANUALLY SET TOTAL

## The defect

**Setting a line total by hand back-calculates the markup and renders it raw:**
`20.496666666666673%` on Drywall Repair and Trim ($600.00 cost → $722.98 total).

## ⚠️ B-0 — VERIFY FIRST

**Is that number STORED, or only displayed?** If it is stored at full float precision and anything
downstream recomputes money from it, rounding the display hides the problem while the real number
keeps driving totals.

⚠️ **`docs/specs/money-representation.md` governs. This lands inside that convention, not beside it.**

## ⚠️ B-1 — THE NUMBER TYPED BY HAND ALWAYS WINS

> **[Josh, 2026-10-03]** *"the number manually entered always wins on estimates and change orders."*

**Either direction:**

| what the user typed | what is authoritative | what is derived |
| --- | --- | --- |
| the **markup %** | the markup | the total |
| the **total** | the total | the markup |

⚠️ **The derived figure is DISPLAY ONLY, shown to 2 decimal places.**

⚠️⚠️ **NOTHING RECOMPUTES THE TYPED NUMBER FROM THE ROUNDED ONE.**
`600.00 × 20.496666666666673% = $722.98`, which is what Josh typed.
`600.00 × 20.50% = $723.00`, which is not.
**A rounding that moves a figure a person entered by hand is a money defect.**

## ⚠️ B-2 — A later cost change: the manual total HOLDS, and turns RED

> **[Josh, 2026-10-03]** *"leave manual total when the cost changes but change the text to red"*

Edit the cost on a line whose total was set by hand → **the total does not move**, and **the figure
renders in red**: the mark that this total is no longer cost × markup.

**This is the same precedent as S122 Build E's pinned invoice lines** — *a deliberate act is visibly
marked and always reversible.* **Use the same language the repo already uses for it.**

## B-3 — Open, and the spec must settle it

⚠️ **How is the red state cleared?** Retyping a markup presumably releases the line back to
calculated. **Whether there is also an explicit "back to calculated" control is a design call — decide
it and state it.** Red is the *marked* half of the precedent; the *reversible* half needs a path.

⚠️ **Colour alone must not be the only carrier of the meaning.** A label or title on hover costs
nothing and makes the state readable to someone who does not know what red means here.

---

# PART C — THE LINE DETAIL SHEET

## C-1 — Click a line, open its full detail

> **[Josh, 2026-10-03]** *"i should be able to click each line item to pop up the full detail on a
> sheet and edit it"*

**Any line item opens a sheet showing its full record, editable there.**

**Reading taken, flagged:** this **adds to** inline grid editing rather than replacing it. The grid
stays quick-editable for cost and markup; the sheet is where the full record — including Part A's
description — lives. ⚠️ **If that is wrong, it changes the build.**

## C-2 — "Add Line" on a category that already has lines shows them

> **[Josh, 2026-10-03]** *"when clicking 'add line' on a category that already has line items added,
> the existing line items should be listed in the sheet that opens"*

**The sheet opens with the category's existing lines listed, not empty.**

**Reading taken, flagged and NOT confirmed by Josh:** that list is **live, not decorative** — clicking
one of those existing lines opens its detail, the same mechanism as C-1. ⚠️ **State this reading
prominently in the report so Josh can correct it.**

## C-3 — Scope

**Estimates and change orders both.** ⚠️ **Verify whether they share a line-item component or have two
implementations.** *"Two paths, two rules, one dataset"* is how S122's 0-B-4 defect was created.

---

# PART D — RICH TEXT ON TERMS

## The defect

**The Terms tab stores plain text** — its placeholder says *"Section content (plain text)"* — so any
formatting pasted in is stripped.

> **[Josh, 2026-10-03]** *"this wipes formatting just like scope of work did. I want to have full
> formatting capabilities, bold, underline, bullet points, etc"*

## ⚠️ D-0 — VERIFY FIRST: was Scope of Work actually fixed?

**Josh's wording reads as past tense. That is a claim, not a fact.**

- **If a working rich-text editor and renderer already exist for Scope of Work**, this is reusing a
  proven mechanism on a second surface — small.
- **If Scope of Work still strips formatting**, it is two surfaces and one shared mechanism — larger.

**Establish which, and say so, before planning.**

## D-1 — The formatting set. RULED, and CLOSED.

> **[Josh, 2026-10-03]** *"everything listed on A plus indent. no need for anything else"*

**Exactly six:**

1. **bold**
2. *italic*
3. underline
4. bulleted list
5. numbered list
6. **indent**

⚠️ **NOTHING ELSE. DELIBERATELY EXCLUDED: tables, headings, links, fonts, type sizes, colours.**
Recorded so nobody "completes the set" later. **Fonts, sizes and colours would let a terms section
look unlike the document around it. Tables are the hardest thing to render faithfully in a PDF, and
Josh was asked directly and said no.**

## ⚠️⚠️ D-2 — PDF PARITY IS THE GATE ON THIS FEATURE, NOT AN AFTERTHOUGHT

**These are contract terms on a document a client signs.**

⚠️ **A bulleted exclusions list that renders as a wall of text on the executed PDF is worse than plain
text, because what was composed and what was signed no longer match.**

- **Every one of the six must render in the PDF, proven by generating one and reading it.**
- ⚠️ **If a format cannot render identically in both places, it does not ship.**
- **Indent and nested lists are where this usually breaks. Test them specifically.**

## ⚠️ D-3 — Sanitize on the server

**Rich text entered by a user and shown on a client-facing page is an injection surface.**

⚠️ **Sanitize server-side on the way OUT — not in the browser, and not only on the way in.** An
allowlist of exactly the six formats above and nothing else. **A sabotage inserting a script tag must
be proven neutralised in the rendered page's bytes.**

## D-4 — Decide and state

- **The storage format** (HTML, Markdown, or a structured document). ⚠️ **Whatever is chosen must be
  renderable by BOTH the web page and the PDF generator.** Pick for the PDF's constraints first; the
  browser is the easy half.
- ⚠️ **Existing plain-text terms must survive the change unharmed and keep rendering.** A migration
  that reformats live contract language is a stop.

---

# PART E — SUB BIDS: A MISSING LINE, AND BID PACKAGES

## ⚠️ E-1 — THE DEFECT: a SUB line is missing from the Sub Bids tab

**Observed 2026-10-03 on EST-115 (Smith – Kitchen Remodel), Draft, v1.**

**Three SUB lines exist:**

| line | section | amount |
| --- | --- | --- |
| Electric – Rough in | Rough Phase | $7,000.00 |
| **Plumbing – Rough in** | **Rough Phase** | **$850.00** |
| Electric – Finish | Finish Phase | $300.00 |

**The Sub Bids tab shows TWO cards**, and ⚠️ **they are titled by SECTION NAME — "Rough Phase" and
"Finish Phase" — not by line item name.**

⚠️ **The Rough Phase card reads `Current sub bid: $7,000.00`.** That is Electric – Rough in alone.
**Both Rough Phase sub lines come to $7,850.** So the card is showing ONE line's amount under a
SECTION's name.

### ⚠️ E-0 — VERIFY. The reading below is a hypothesis from two screenshots, not a finding.

**Hypothesis: the tab groups by SECTION and surfaces one line per section**, so Plumbing is collapsed
behind Electric rather than filtered out.

**Check what the Sub Bids reader actually groups and keys on, and what it does when one section holds
more than one SUB line.**

- **If it groups by section** → the fix is the query plus the card title. **Every SUB line gets its
  own entry, titled by the LINE, with its section shown as context.**
- **If Plumbing is excluded by something else** (a missing subcontractor, a filter, a null) → that is
  a different fix. ⚠️ **Find the real cause. Do not build the fix for the hypothesis.**

⚠️ **Whatever the cause: count the SUB lines and count the cards. They must match.** A test that
passes with one section holding two sub lines is the regression guard.

## E-2 — Bid packages: more than one line to one subcontractor

> **[Josh, 2026-10-03]** *"i should be able to combine more than 1 line to send a sub contractor… i
> have a line for electric under rough phase and finish phase"*

**Select two or more SUB lines — ⚠️ ACROSS SECTIONS — and send ONE bid request covering all of them.**

⚠️ **This collides with how awarding works today.** The tab states: *"Picking a winner updates that
line's subcontractor row with the winning amount."* **One line, one amount.** A package has many
lines and one reply, so **allocation is the whole design.**

## ⚠️ E-3 — How a bid comes back. RULED [Josh, 2026-10-03]: option A.

**The request asks for an amount PER LINE. The sub may answer per line, or give one lump number for
the package.**

**A per-line reply is used as given.**

**A lump reply is ALLOCATED PROPORTIONALLY to the lines' estimated amounts**, and:

- ⚠️ **The allocation is SHOWN, VISIBLY MARKED as allocated rather than quoted, and EDITABLE before
  you award.** **Same precedent as the manual total (B-2) and S122's pinned invoice lines: a derived
  or deliberate figure is visibly marked and always reversible.**
- ⚠️ **THE ALLOCATED AMOUNTS MUST SUM EXACTLY TO THE BID.** A proportional split produces fractional
  cents. **State where the remainder goes and make it deterministic** — `$7,100` across `$7,000` and
  `$300` does not divide evenly, and a package whose parts do not add up to the number the sub quoted
  is a money defect. **Prove the sum by test.**
- ⚠️ **A line with a zero or null estimated amount cannot take a proportional share.** Decide what
  happens — an equal split, an explicit zero, or a refusal to allocate — **and state it.** Do not
  divide by zero in a money path.

**Awarding writes EACH line its own amount**, so the per-line cost fidelity the rest of the estimate
depends on is never lost.

## ⚠️ E-4 — What the subcontractor may see. `#136` CLASS.

**The bid request goes out as a LINK to someone outside the company** — the `/bid` token precedent,
which S127 found stores **plain-text** tokens.

⚠️ **The package page must show the sub ONLY the scope they are bidding.**

**NEVER: the markup percentage · the marked-up total · any other subcontractor's bid or name · the
internal notes · the client's name or address · any other line on the estimate.**

⚠️ **Prove it by inspecting the PAYLOAD, not the screen.** A render gate still ships the data. **The
same cookie-less fetch proof S127 used on the public share page.**

## E-5 — Open for the build to decide and state

- **Can one line belong to two packages at once?** ⚠️ **If yes, two awards can write the same line.
  State which wins.** The simplest answer is one open package per line.
- **What happens to a sent package when a line in it is edited or deleted.** ⚠️ **A sub holding a
  link to a scope that has since changed is the trap here.**
- **The W-9 banner** — *"a subcontractor without a W-9 on file can bid, but cannot be paid"* — applies
  per package the same as per line. **Do not lose it.**
- **Whether the package carries Part A's line descriptions to the sub.** They are scope language, so
  probably yes — ⚠️ **but that is a deliberate decision about what leaves the company, not an
  inheritance. State it.**

---

# PART F — PROJECT COVER PICTURES

> **[Josh, 2026-10-03 17:13]** *"I want to add cover pictures for projects. The default is the first
> picture taken for the project but owner, admin, pe, pm, and foreman, can all select any image as the
> cover image."*

## F-1 — The default, and who can change it. RULED [Josh, 2026-10-03 17:18].

**Default: the FIRST PICTURE ADDED TO THE PROJECT BY ANY MEANS.**

⚠️ **Not the earliest shot — the first to arrive.** Whichever photo row was created first for that
project, however it got there: the camera, an upload, the offline queue, a desktop drag. **Say which
column decides it.**

⚠️ **THE DEFAULT IS STORED, NOT COMPUTED.** When the first picture is added to a project,
`cover_file_id` is **set** at that moment. ⚠️ **After that, the ONLY thing that changes it is a user
choosing a different one.** A photo uploaded later that turns out to be older does **not** take over.

**Who may choose a different cover: Owner, Admin, PE, PM, FOREMAN.**

⚠️ **THAT LIST IS NOT THE SHARE LIST AND NOT THE DELETE LIST. It includes the foreman, who cannot
share a photo with a client and cannot bulk-delete.** Recorded so nobody "aligns" the three matrices
later. A cover picture is an internal label; sharing is disclosure.

## ⚠️ F-2 — A CLIENT NEVER SEES A COVER PHOTO. RULED [Josh, 2026-10-03 17:18].

> *"block client from any cover photo. that does not mean the image cant be selected for client share,
> but they only see it in the normal process/location. they don't see an image as a cover photo."*

⚠️ **The cover is a STAFF-ONLY SURFACE, not a property of the photo.**

- **The same image may be `client_visible`, and the client sees it in the normal photo places** — the
  portal gallery, a daily log, wherever it already appears. **That is unaffected.**
- ⚠️ **The client never sees a cover slot anywhere, with any image in it.** Not on a project list, not
  on a project page, not in an email.

⚠️⚠️ **ENFORCE IT IN THE PAYLOAD, NOT THE RENDER.** The client read path returns a shape that **does
not contain `cover_file_id` or any cover image reference at all.**

- **Prove it by inspecting the PAYLOAD** — a client session fetching every portal surface that names a
  project, asserting the field is absent from the bytes. ⚠️ **A hidden component still ships the data;
  that is the `#136` class and this repo has shipped it twice.**
- **A sabotage that puts the field back into the client shape must go RED.**
- ⚠️ **Setting a cover must not change `client_visible`, and marking a photo client-visible must not
  make it a cover.** The two are independent. Assert both directions.

## ⚠️ F-3 — It MUST go through the thumbnail proxy

**A cover on every row means one image per project on the most-used screen in the app.**

- ⚠️ **Use P-3's thumbnail proxy route** (`lib/photos/thumb-proxy.ts`, merged at `182b069c`), with its
  stable versioned URL so the browser keeps them. **Never a signed URL, never the original's bytes.**
- ⚠️ **Every response stays `private`.** A `public` header lets a CDN serve one company's cover to
  another. **Proven by test, as P-3's own gate requires.**
- **The list read must not fetch a file row per project.** ⚠️ **A cover per row is the N+1 shape the
  S125 query findings exist to stop.** One read, bounded, or a column the list already selects.

## F-4 — Where it appears

| surface | placement |
| --- | --- |
| **Desktop, projects list** | on the **LEFT** of the row |
| **Desktop, inside a project** | **LEFT** of the project name and number, at the top; the name and number **shift right a little** |
| **Mobile (`/m`), projects list** | on the **RIGHT** of the row, and ⚠️ **the status pill moves to the BOTTOM CENTRE of the row** |
| **Mobile, inside a project** | ⚠️ **NOT SHOWN. Deliberate.** |

⚠️ **The mobile row is a layout change, not an addition** — the status pill moves. **Prove it at 402px
on a real device, not only in device mode.** That is the S121 precedent and the class of defect device
mode misses.

## F-5 — The states that are not "a photo exists"

⚠️ **Most projects in the screenshots have no photos at all.** Decide and state:

- **No photos** → what the row shows. ⚠️ **It must not be a broken image, a stretched placeholder or a
  row that changes height.** The rows must stay the same size whether or not a cover exists.
- **The cover photo is TRASHED** → ⚠️ **keep the pointer and show the empty state.** A soft delete is
  reversible, so restoring the photo brings the cover back on its own. **Do not auto-pick a
  replacement:** Josh ruled that only a user choosing a new one changes the cover. ⚠️ **This is a
  reading taken, not his words. State it prominently so he can correct it.**
- **The cover photo is PERMANENTLY deleted** (Empty Trash, or the 6-month purge) → `cover_file_id`
  goes NULL and the project shows the empty state until someone picks one. **The FK is `ON DELETE SET
  NULL`** — ⚠️ **never cascade; a dead cover must not take the project with it.**
- **A chosen cover is a HEIC or a format the proxy cannot serve** → state what happens.

## ⚠️ F-5a — Existing projects: backfill, or leave them blank?

**Josh's rule sets the cover when the first picture is added. Projects that already have photos never
had that moment.** Production has 8 active projects.

**Recommended: backfill `cover_file_id` to each project's earliest existing photo** in the same
migration — otherwise every project that exists today has no cover until someone picks one, which
contradicts "the first picture added is the cover."

⚠️ **State the expected row count BEFORE the backfill runs, and read it back after.** A backfill is a
write over live rows: it names how many projects it will touch, and it touches no project that already
has a non-null `cover_file_id`. **Projects with no photos stay NULL.**

## F-6 — What this needs

- **A nullable `projects.cover_file_id`**, `ON DELETE SET NULL`. ⚠️ **Not a URL and not a path** — a
  reference, so the proxy resolves it and trashing still works.
- ⚠️ **The write that SETS it on the first photo.** Every path that adds a photo to a project must set
  the cover when there isn't one — the camera, an upload, the offline queue, a desktop drag.
  ⚠️ **Enumerate them first.** *"Two paths, two rules, one dataset"* is how S122's 0-B-4 defect was
  made, and this repo has at least three upload paths (S127's 5a had to cover online, the desktop
  retry queue and the offline queue). **A photo added by a path that forgets leaves the project
  coverless forever**, because nothing recomputes it.
- ⚠️ **Setting it must be idempotent and must never overwrite a user's choice.** Write only when
  `cover_file_id IS NULL`. **Prove it: add a second photo and assert the cover did not move; set a
  cover by hand, add a third photo, assert it did not move.**
- **A total role map on setting the cover**, judged by the service role, writes returning no rows:
  Owner, Admin, PE, PM and foreman may set it; crew, client and sub are refused. **A sabotage per
  excluded role must go red.**
- ⚠️ **Setting a cover must not change `client_visible` on that file, in either direction.** They are
  different decisions by different role lists. **Assert it explicitly** — a test that the flag is
  untouched before and after.

---

# ORDER WITHIN THIS BUILD

1. **A-0, B-0, D-0, E-0 and F-2 — the five verifications.** Findings only. ⚠️ **Each may shrink or grow
   its part.**
2. **E-1, the missing sub line.** ⚠️ **It is a live defect on a money screen, and it is the smallest
   thing here. It lands even if nothing else does.**
3. **Part B.** Small, a live defect, no new UI.
4. **Part A**, with its payload proof.
5. **Part C** — the sheet. Largest UI change on this surface.
6. **E-2 to E-4 — bid packages.** ⚠️ **A new outward-facing payload, so it carries E-4's gate.**
7. **Part F — cover pictures.** ⚠️ **Gated on F-2's answer if a client can see the projects list.**
8. **Part D** — may ship separately, and its size is unknown until D-0.

---

# STOP RULES

1. ⚠️ **A line description reaching the client's PAYLOAD on a format that should not show it.**
2. ⚠️ **A rounded markup changing a total a person typed.**
3. ⚠️ **Any change to the section description's behaviour** (A-3).
4. ⚠️ **A formatting feature that renders differently in the PDF than on screen.**
5. ⚠️ **Rich text reaching a client-facing page unsanitized.**
6. ⚠️ **A migration that alters existing terms or scope-of-work text.**
7. ⚠️ **Allocated bid amounts that do not sum exactly to the quoted bid.**
8. ⚠️ **Markup, a marked-up total, another sub's bid, internal notes or the client's identity reaching
   the bid page's PAYLOAD.**
9. ⚠️ **A sub-line count that does not equal the Sub Bids card count.**
10. ⚠️ **A cover picture reaching a client's payload** (F-2), or served by anything but the `private`
    thumbnail proxy.
11. ⚠️ **Setting a cover changing `client_visible` on that file.**
12. A sabotage that does not go red.

---

# OPEN — for the build to decide and state, or for Josh

- **Catalog description prefill** (A-4).
- **A length cap on descriptions, and what the PDF does with a long one** (A-4).
- **How the red manual-total state is cleared** (B-3).
- **Whether the detail sheet replaces or supplements inline editing** (C-1) — reading taken.
- **Whether the add-line sheet's list of existing lines is interactive** (C-2) — reading taken,
  ⚠️ **never confirmed by Josh.**
- **The storage format for rich text** (D-4).
- **One line in two packages; an edited line in a sent package; whether descriptions go to the sub**
  (E-5).