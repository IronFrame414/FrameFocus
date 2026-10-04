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

# PART E — SUB BIDS

> **⚠️ [Josh, 2026-10-03 21:12]** *"sub bids, recording expenses to cost codes, project conversion
> should be a separate build with a new interview."*

⚠️ **E-2 THROUGH E-6 ARE DEFERRED to that separate build — see § SEPARATE BUILD at the end of this
file. They are kept here in full because the rulings behind them stand; they are simply not built
here.**

⚠️ **E-1 STAYS IN THIS BUILD.** ⚠️ **Reading taken, flagged:** it is a live defect on a money screen,
not a feature — a sub line that does not appear at all. **If Josh wants it to travel with the rest,
say so and it moves.**

---

## The missing line, and bid packages

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

## ⚠️ E-6 — A bid can only attach an UPLOADED PDF. It must also take what is already here.

> **[Josh, 2026-10-03]** *"'sub bids' only has the ability to add pdfs via upload. I should also be
> able to select anything from the files or photos that are tied to the estimate within the system."*

⚠️ **THIS APPLIES TO BOTH ESTIMATE FORMATS — line-item and division — and it is part of this build.**

**The "Bid PDF (optional)" control gains a second path: pick from the files and photos already
attached to this estimate.** Uploading stays.

- ⚠️ **It must be a REFERENCE to the existing file, not a copy.** A second copy drifts from the
  original and doubles storage.
- ⚠️ **Attaching a file to a bid does NOT make it client-visible**, and must not touch
  `client_visible` in either direction. Assert both.
- ⚠️ **A bid request goes to an outside party (E-4).** What the sub receives is the attached file and
  nothing else — **not the rest of the estimate's files.** Prove it on the payload.
- **A file deleted or trashed after it was attached** must not leave the bid pointing at nothing. Say
  what happens.
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

# PART G — "MORE ACTIONS" OPENS OFF-SCREEN

**Observed 2026-10-03 on the estimate Details page.** The **"More actions"** menu opens **downward**
and its contents fall below the visible area — "Clone this estimate" is partly readable and "Delete
estimate" is cut off by the sticky bottom totals bar.

⚠️ **NOT DIAGNOSED. Do not start from a theory.** Reproduce it first.

**Worth checking, none of them assertions:**

- **Does the menu flip upward when there is no room below?** Most menu primitives do this by default,
  which would mean either collision detection is off or the container's bounds are wrong.
- ⚠️ **Does the repo already have a menu that DOES flip correctly?** If so, **this instance is not
  using the shared one, and the fix is to use it — not to write a second behaviour.** *"Two paths, two
  rules, one dataset"* has already cost this project twice (0-B-4, and the `captureGps` formatter).
- **The sticky bottom totals bar** (Subtotal / Tax / Discount / Grand Total) is a candidate: an
  overflow or stacking context on it, or on the page container, can clip a menu that is positioned
  correctly.

⚠️ **CHECK WHETHER THIS IS ONE SCREEN OR MANY.** Any menu opened near the bottom of a page with a
sticky footer is a candidate. **Report the list before fixing one of them** — a single-page fix on a
shared component leaves the others broken and looks finished.

**Proof:** the menu's last item is reachable and clickable at the viewport sizes the repo already
tests, **with the sticky bar present**. ⚠️ **A test that opens the menu but never asserts the last item
is visible proves nothing** — it is the "page that never rendered" shape.

---

# PART H — DIVISION BUDGETING

**A toggle on the estimate's Details page. Ruled by Josh 2026-10-03 from his own live sheet,
"Leonado Beach Sails 2.xlsx" (the Best Western conversion).**

⚠️ **THIS IS THE LARGEST PART OF THIS FILE AND MAY DESERVE ITS OWN SESSION.** Read H-13 before
planning: the conversion-to-project half is explicitly NOT in this build.

## H-1 — The structure

**Division → Section (optional) → Line.** A division's lines may sit directly under it, or be grouped
into sections that total on their own.

⚠️ **"Section" is the CSI name for the level**, confirmed against MasterFormat and against the
competitor's estimate in Sheet2 of Josh's own workbook. **Do not call it a sub-division.**

**Buttons:** `+ Add division` at the top; `+ Line` and `+ Section` on each division; `+ Line` on each
section. ⚠️ **There is no top-level "Add line".**

**Default division set: the 16-division (MasterFormat 1995) list, which the user may add to or remove
from** [Josh]. ⚠️ **See H-12 — a started estimate does not follow later changes to that list.**

## ⚠️ H-2 — COST CODES. Verify the format before importing anything.

> **[Josh, 2026-10-03]** *"that should be imported with this build. This will allow us to enter a code
> with an expense and the system will be able to automatically put it in the right section/category."*

**The format, read off Sheet2 of Josh's workbook ("Itasca Estimate revised (compare)"): CSI
MasterFormat 1995 section numbers, FIVE digits, `DDSSS`** — two digits of division, three of section.
`02110` Site Clearing · `02510` Paving & Curbing · `04220` Concrete Unit Masonry · `01000` General
Conditions.

⚠️⚠️ **THE SHEET SHOWS THEM FOUR DIGITS WIDE BECAUSE EXCEL STORED THEM AS NUMBERS AND DROPPED THE
LEADING ZERO.** `01000` appears as `1000`.

- ⚠️ **Store the code as TEXT, zero-padded to 5.** Never as a number.
- ⚠️ **Read the division from the FIRST TWO CHARACTERS.** If `01000` is read as the number `1000`, the
  first two characters are `10` and General Conditions files itself under Division 10 Specialties,
  **silently and wrongly.** That is the whole feature failing quietly.
- **An importer must zero-pad on the way in** and refuse a code that is not 5 digits after padding.
- **Seed the standard MF95 section list** so a code entered on an expense resolves to a division and
  section without the user typing names.

## ⚠️ H-3 — Cost CODES, not cost types. RULED.

> **[Josh, 2026-10-03]** *"this should be codes not types. I want more detail that sub, labor,
> material, etc."*

⚠️ **Do not build a labor / material / subcontract / equipment enum.** The code carries the detail.

⚠️ **Stated consequence, for the record, not an argument to reopen:** without a type axis the system
cannot answer "how much of this job is labor" across divisions. Every line is coded by *what work*,
never by *what kind of money*. **If that question is ever asked, it is a new build.**

## H-4 — The line

**Fields: name · quantity · cost · description · internal notes · cost code · out-to-bid · alternate.**

- **Quantity defaults to 1; the amount is qty × cost.**
- ⚠️ **NO unit of measure** [Josh]. Do not add one.
- **Description and internal notes are separate fields.** ⚠️ **The description may reach the client
  under the formats in H-9. The internal note NEVER does, under any format.** That is Part A-2's rule
  and it is proven the same way — on the payload.

## H-5 — Opening and editing a line

> **[Josh, 2026-10-03]** *"add line should create the same sheet popup as the existing estimating
> platform."*

- **`+ Line` opens the SAME sheet the line-item estimator uses.** ⚠️ **The same component, not a
  second one that looks like it.** *"Two paths, two rules, one dataset"* is how 0-B-4 was made.
- **Hovering a line shows its description.** ⚠️ **Hover is not the only way to reach it** — it does
  not exist on touch. The sheet shows it too.
- **Double-click any figure on a line → edit that figure in place.**
- **Double-click anywhere on a line that is NOT a figure → the full line sheet, description included.**
- **Alternates and add-deducts are chosen in that sheet** [Josh], not in a separate screen.

## H-6 — Every line can go out to bid. ⚠️ DEFERRED to the separate build.

> **[Josh, 2026-10-03]** *"95% of the work in jobs of this size will be subcontracted. I should be able
> to send any line out to bid."*

**Not a type, a flag: any line, in any division or section, can be sent to bid.** It feeds the same Sub
Bids mechanism as Part E.

⚠️ **NOT BUILT HERE** — sub bids moved to the separate build [Josh, 21:12]. ⚠️ **But carry the flag's
column now if it costs nothing**, so lines written before that build can be marked later without a
migration over live rows.

## H-7 — Below the divisions: an editable block

> **[Josh, 2026-10-03]** *"the 'below the divisions' should be editable, including adding and removing
> items. Bond would be added for a project the size of the hotel/restaurant"*

**A company template seeds it (Sub Total, GC Fee, GL Insurance, Builders Risk, Total Construction).
Each estimate may then add, remove and reorder its own lines.**

**Line kinds: a flat amount · a percentage · contingency · allowance · bond.**

⚠️ **CONTINGENCY AND ALLOWANCE ARE PLACEMENT CASES, NOT VALUES.** Whether the GC fee is charged on the
contingency, and whether insurance is, changes the number materially and is defensible either way.
**Each is set by its base, the same as every other line, and the screen states it in words.**

## ⚠️ H-8 — How a line is charged: two modes, and the gross-up

**Mode 1 — a percentage of what the user picks.** The pick list is: **Sub Total (all divisions)**,
**each division individually**, and **any line above it in the block**. ⚠️ **Picking Sub Total clears
the individual divisions and vice versa**, or the divisions count twice.

**Mode 2 — a percentage of the FINAL TOTAL, with this charge inside it.** [Josh, 2026-10-03:
*"GL bills 2% of gross revenue. That means the money i use to pay the insurance is also charged 2%."*]

⚠️ **This is a gross-up and it is SOLVED, never multiplied:**

```
Total  =  Cost ÷ (1 − Σ rates of every mode-2 line)
line   =  Total × its own rate
```

- ⚠️ **Multiplying the cost by the rate is WRONG and leaves the company short.** On the mock's figures,
  $1,368,540 × 2% = $27,371, but the correct charge is $27,929 — a $559 gap that scales with the job.
- ⚠️ **Several mode-2 lines solve TOGETHER**, against the sum of their rates. **Bond is the second real
  instance** — a payment and performance bond is normally a percentage of the contract including the
  bond.
- ⚠️⚠️ **IF THE MODE-2 RATES SUM TO 100% OR MORE THERE IS NO SOLUTION. REFUSE AND SAY SO ON SCREEN.
  Never print a number.** A division by zero or a negative total in a money path is a stop.
- ⚠️ **A mode-1 line may NOT pick a mode-2 line as its base.** That is a true circle with no solution,
  unlike mode 2's self-reference, which has one. **Report it; never loop.** Same rule as the Critical
  Path cycle guard.
## ⚠️ H-8a — PLACEMENT IS LITERAL. Dragging a line changes what it is charged on.

> **[Josh, 2026-10-03 21:12]** *"allow user to drag the items up or down. the literal placement will
> determine if the % is charged."*

**The block is drag-ordered, and a line's position decides what feeds it.**

- ⚠️ **A line can only be fed by what sits ABOVE it.** Nothing below is ever available.
- **So moving contingency above the GC Fee makes the fee charge on it; moving it below does not.**
  That is the whole mechanism — no separate setting decides it.
- ⚠️ **Dragging a line must re-check every base in the block and SAY what it broke**, never silently
  zero a base that is now below its dependant. **Show the consequence before the drop lands**, the
  same way the holiday preview does.
- ⚠️ **Mode-2 lines (H-8, the gross-up) are not positional** — they are charged on the final total
  whatever their position, because the final total includes everything. **Draw them so that reads
  clearly**, or someone will drag one expecting its base to change.

### ⚠️ RULED [Josh, 2026-10-03 21:15]: position CONSTRAINS, it does not replace the picker — with "everything above it" as the DEFAULT.

**A new line in the block starts charged on EVERYTHING ABOVE IT.** Nothing to configure, and that is
what a drag changes.

**The checkboxes exist only to make an EXCEPTION** — to drop something above it out of its base.

⚠️ **EVERY ROW STATES ITS BASIS IN WORDS, ON THE ROW, ALWAYS.** Not in a panel, not on hover. **A
narrowed base must be readable without opening anything**, or the failure mode this design exists to
avoid — a forgotten tick quietly under-charging a fee — becomes invisible again.

**Why not position alone:** the order would then carry two jobs at once, how the document READS and
what charges WHAT. They conflict. Builders Risk belongs next to GL Insurance on the page because both
are insurance, but that placement would force GL to charge on it, and the only escape would be moving
Builders Risk somewhere it does not belong. **The reading order of a document a client signs must not
be dictated by the arithmetic.**

⚠️ **Individual DIVISION selection is unaffected** — that was ruled separately, and divisions are not
in the block.

## ⚠️ H-9 — Rounding: UP. RULED, with one consequence to settle.

> **[Josh, 2026-10-03]** *"round fractions up"*

⚠️ **`money-representation.md` governs; this lands inside it.**

⚠️ **If every line rounds up independently, the rounded parts can exceed a rounded whole.** **Reading
taken, flagged: the displayed total is the SUM OF THE ROUNDED LINES, so what is shown always adds up.**
**State it, and prove it by test on a figure that rounds in both directions.**

## H-10 — What the client sees

**Format-selectable, as the line-item estimator already is** [Josh, answer 7 = C].

⚠️ **Internal notes never reach the client on any format** (H-4). ⚠️ **Prove it on the payload, not the
screen** — same gate as Part A-2.

## H-11 — Percent of job

**A "% of job" figure on each division total.** Cheap, and it catches an outlier faster than reading
dollars.

## H-12 — The division template does not follow a started estimate

> **[Josh, 2026-10-03]** *"there is a default template but once an estimate is started, nothing outside
> of that impacts it."*

⚠️ **The estimate SNAPSHOTS its divisions and its bottom block at creation.** Later edits to the
company template change new estimates only. **Same shape as the holiday rules.** Otherwise removing a
division silently re-totals a proposal that has already been sent.

## H-13 — Excel import and export

**Both directions** [Josh]. ⚠️ **This feature competes with the spreadsheet, and the people Josh trades
numbers with send spreadsheets** — his own workbook carries a competitor's estimate on Sheet2 for
comparison. **An import must handle H-2's leading-zero trap.**

## H-14 — Who can see it

**Owner and Admin see every division budget. A Project Executive is selected per estimate**, the same
as the existing "Project Executive access" control [Josh].

⚠️ **A division budget is MONEY. The Financial Visibility Floor (`#136`) applies**: a role that may
not see it does not receive it in the payload. **Proven on the bytes.**

## H-15 — Lifecycle: unchanged

**Lock on send. Void and reissue. A reissue creates a new estimate version number.** ⚠️ **Exactly as
already built for line-item estimates** [Josh] — **reuse that mechanism, do not write a second one.**

## ⚠️ H-16 — NOT IN THIS BUILD: the conversion to a project budget. See § SEPARATE BUILD.

> **[Josh, 2026-10-03]** *"it is also the budget that we work against. when converted to project. I
> should be able to breakdown the lines with more sub-lines and expense against them."*

⚠️ **This is job costing: budget lines become cost codes, actual costs accrue against them, and it
touches `project_financials`, expenses, invoicing and the QuickBooks push. It is larger than Critical
Path was.**

**The division ESTIMATE ships without it. The conversion half is its own module with its own spec.**
⚠️ **Do not half-build it as a tail of this one.** H-2's code format is the hinge it will turn on, so
get that right here.

## Open — for the build to decide and state, or for Josh

- **Whether empty divisions print on the proposal.** His sheet carries several (DIV 4, 13, 14 empty).
  **Recommend: shown in the editor, hidden on the proposal.**
- **Escalation and material sales tax** — both are further placement cases. Not ruled.
- **Whether a section's code is entered by hand or picked from the seeded MF95 list.**

---

# ⚠️ SEPARATE BUILD — NOT THIS ONE. IT NEEDS ITS OWN INTERVIEW FIRST.

> **[Josh, 2026-10-03 21:12]** *"sub bids, recording expenses to cost codes, project conversion should
> be a separate build with a new interview."*

⚠️ **NOTHING BELOW IS BUILT IN THIS SESSION. Do not start any of it, and do not half-build a piece of
it as a tail.** The three are one subject: money leaving the estimate and becoming actual cost.

**1 — SUB BIDS.** Part E's E-2 to E-6, kept in this file in full: bid packages across divisions, the
per-line / lump allocation ruled at option A, the sub-facing payload gate, and E-6's attaching of
files already in the system. ⚠️ **E-1, the missing sub-bid line, is a DEFECT and stays in this
build.** Plus H-6's out-to-bid flag on a division line.

**2 — RECORDING EXPENSES TO COST CODES.** An expense carries a cost code (H-2's 5-digit text) and the
system files it into the right division and section by itself.

> **⚠️ [Josh, 2026-10-03 21:12]** *"add checkbox to expenses that are entered to indicate if it in
> house labor"*

⚠️ **A single boolean on the EXPENSE: in-house labor, yes or no.** That is the one distinction wanted
— **NOT a labor/material/sub/equipment enum, which was ruled against at H-3.** Recorded here now so it
is not lost between builds.

**3 — PROJECT CONVERSION.** H-16: the division budget becomes the budget the job is run against, lines
break into sub-lines, and actual costs accrue against them. ⚠️ **Job costing. It touches
`project_financials`, expenses, invoicing and the QuickBooks push, and it is larger than Critical Path
was.**

⚠️ **The hinge is H-2's cost code format.** Get the zero-padded text right in THIS build and that one
has something to attach to; get it wrong and every code written in between is wrong.

---

# ORDER WITHIN THIS BUILD

1. **A-0, B-0, D-0, E-0 and F-2 — the five verifications.** Findings only. ⚠️ **Each may shrink or grow
   its part.**
2. **E-1, the missing sub line.** ⚠️ **It is a live defect on a money screen, and it is the smallest
   thing here. It lands even if nothing else does.**
3. **Part B.** Small, a live defect, no new UI.
4. **Part A**, with its payload proof.
5. **Part C** — the sheet. Largest UI change on this surface.
6. ~~**E-2 to E-6 — bid packages.**~~ ⚠️ **MOVED to the separate build. Only E-1, the missing line, is
   built here.**
7. **Part F — cover pictures.** ⚠️ **Gated on F-2's answer if a client can see the projects list.**
8. **Part D** — may ship separately, and its size is unknown until D-0.
9. **Part G** — the clipped menu. Small, and it may be several screens rather than one.
10. ⚠️ **Part H — division budgeting. THE LARGEST ITEM HERE, and it may deserve its own session.**
    Its conversion-to-project half (H-16) is explicitly NOT in this build.

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
12. ⚠️ **A cost code stored as a number rather than zero-padded text** (H-2).
13. ⚠️ **A gross-up multiplied instead of solved, or a total printed when the mode-2 rates reach
    100%** (H-8).
14. ⚠️ **A mode-1 line taking a mode-2 line as its base** (H-8).
15. ⚠️ **An internal note reaching a client payload** (H-4, H-10).
16. ⚠️ **A division budget reaching a role that may not see it** (H-14).
17. A sabotage that does not go red.

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