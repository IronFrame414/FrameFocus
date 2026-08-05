# Handoff: FrameFocus — Mobile Field Capture (5 screens)

## Overview
The five screens the crew actually uses in the field. Everything here is **capture** — recording what
happened while it is happening. Review, approval, and records management stay on desktop.

| Id | Screen | Sub-module |
|---|---|---|
| 7a | Clock in / out | 6A Time Tracking |
| 7b | Mid-shift segment switcher | 6A Time Tracking |
| 7c | Daily log entry | 6B Daily Logs |
| 7d | Delivery check-in | 6D Material Deliveries |
| 7e | Incident report | 6C Safety Incidents |

## About the Design Files
The bundled `.dc.html` is a **design reference created in HTML** — a prototype of intended look and
behavior, **not production code to copy**. Rebuild natively (or in your chosen mobile stack) using
FrameFocus's component conventions. `ios-frame.jsx` is a **presentation-only device bezel** — not part of
the design. `support.js` is the prototype's render runtime — ignore both.

> **No schema is asserted here.** Bind to the live Module 6 models Claude Code builds from the 6A–6D
> specs (`time_clock_sessions`, `time_segments`, `daily_logs`, `deliveries`/`delivery_items`,
> `safety_incidents`). Names, hours, and counts shown are sample data from the specs' acceptance traces.

## Fidelity
**High-fidelity.** Inherits the app token system: Barlow UI; **IBM Plex Mono for every number** — hours,
counts, timestamps, IDs, and uppercase micro-labels; navy `#14213d`, blue `#2f49d1`, amber `#f59e0b`,
danger `#c0362c`, success `#16a34a`.

---

## Global rules

**Canvas.** 402 × 874 logical px (iPhone 16 Pro). Content inset **20px** (18px on denser screens); **58px**
top; **24px** bottom. Every screen is a three-part flex column: fixed header → **scrollable body**
(`flex:1; overflow-y:auto`) → fixed footer holding the primary action. The footer never scrolls away.

**Touch targets.** Primary buttons **62–68px**; selectable rows and cards **58–66px**; type/option tiles
**58–64px**; stepper hit zones **46 × 54px**; toggles 44 × 26. Nothing interactive under 44px.

**Type scale.**
| Role | Font | Size / Weight |
|---|---|---|
| Screen title (in header) | Barlow | 20px / 800, letter-spacing −0.01em |
| Header sub-line | IBM Plex Mono | 11px / 500, `#8fa0c4` on navy |
| Section label | IBM Plex Mono | 11px / 600, uppercase, letter-spacing .05em, `#8a919c` |
| Row / option label | Barlow | 15–17px / 600–700 |
| Body text | Barlow | 15px / 400, line-height 1.5 |
| Hero timer | IBM Plex Mono | 62px / 600 |
| Inline number | IBM Plex Mono | 13–22px / 600–700 |
| Primary button | Barlow | 17–19px / 700–800 |

**Card idiom.** White, `1px #e6e9ef`, radius **14–15px**, padding 15–16px, mono section label on top.
Selected = `1.5px #2f49d1` (+ `#f5f7ff` fill where filled). Error/exception = `1.5px #c0362c` + `#fdf1f0`.
Required = a small `Required` pill in the section header, tinted to that screen's accent.

**Progressive disclosure.** Anything not essential to the primary action collapses into a **58px
disclosure row** (label left; value/count + chevron right) rather than another textarea. This is what keeps
these screens to one screenful of decisions.

**Consequence lines.** Where submitting notifies people, say so directly above the button in 12px
`#9aa1ac` — "Notifies Owner, Admin, PM". Never a surprise.

**Autosave.** Every capture screen keeps a local draft (7c shows the `Draft` pill pattern). Signal on site
is unreliable; nothing is discarded silently. Full offline sync is out of Module 6 v1 — at minimum, queue
and surface it.

---

## Screens

### 7a · Clock in / out
**Purpose:** the crew's first tap of the day. Answer "am I on the clock" and start in one action.
**Chrome:** full navy `#14213d` — **dark status bar / home indicator**.
**Layout:** hamburger + "Timeclock" + date + avatar. Centered status block: mono uppercase **"Not clocked
in"**, a **62px hero counter** at `0:00`, and a week line — "This week 32.5 h · **7.5 to OT**" so overtime
is visible before it is earned, never selected. Then **"Clock in to"**: selectable project cards (66px) —
the scheduled/nearest one preselected with an amber border and a green **"Here"** GPS chip; others plain.
Above the button, a `#8fa0c4` nudge for unfinished work ("Yesterday's log isn't submitted"). Footer:
**68px amber "Clock in"** — the largest target in the app. Then the standard tab bar (dark variant,
Timeclock active).
**On the clock** the same screen inverts: the counter runs live, the current segment card appears, and the
footer becomes **Break** + **Clock out** (`#c0362c`) with an amber **"Switch task or project"** above.
**Rules:** GPS is captured at clock events for verification and displayed as status — never a blocker.

### 7b · Mid-shift segment switcher
**Purpose:** end the current segment, start the next — the core of the segment model.
**Layout:** navy header with **✕**, title, and "Ends '<task>' at 12:14" (always name what is being closed).
Below it a **day timeline bar** — proportional 9px segments of what is already logged (blue = work, grey =
break, amber = travel/shop, translucent = remaining) with `08:00 / now 12:14 / 16:00` beneath. This is the
new element: the crew sees their day before changing it. Body: **"What's next"** 2×2 type tiles (64px, each
with its color bar); **Project & task** — a selected project card and a task disclosure row; and a
**"Mark '<task>' complete"** checkbox row. Footer: **"Start segment"**.
**Rules:** Break / Travel / Shop take **no project** — hide the Project and Task blocks when a non-work
type is selected (a break must never reach job cost). Segments are contiguous: starting one closes the
previous at the same timestamp, and the day must reconcile to the clocked session.

### 7c · Daily log entry
**Purpose:** the day's record in under a minute, at the tailgate.
**Layout:** navy header with back chevron and a **`Draft` pill**. Body top-down by importance:
**Work performed** (selected card treatment + `Required` pill — the only field that must be filled);
**Crew & hours** ("auto from clock") as read-only avatar+hours pills derived from 6A; **Photos** 4-up grid
with a dashed camera tile; then three **disclosure rows** — Materials & equipment (count badge), Subs on
site ("Add"), Tomorrow's tasks; then the amber **"Flag a hazard"** toggle card. Footer: **Save draft** +
**Submit log** (1 : 1.5 flex).
**Rules:** employee hours are read-only/derived; sub hours are manual. Turning the hazard toggle on reveals
notes and, on submit, offers **"File an incident report"** (→ 7e, pre-filled with project + date). More
than one log per project per day is allowed.

### 7d · Delivery check-in
**Purpose:** the driver is waiting. Count it, flag damage, photograph it.
**Layout:** navy header with **✕** and "PO-2041 · Jones Lumber · **truck 1**" — each truck is its own
delivery record. One card **per PO line**: name + "Ordered N" left, a live **usable pill** right (green when
clean, red when short). Inside, two **steppers** — Received and Damaged — `− value +` in a 54px field with
46px tap zones and mono numerals; the Damaged stepper turns red once non-zero and flips the whole card to
the error treatment. A damaged line shows a **"Photo required for damage"** strip with the current count.
Below: photo thumbnails + dashed camera tile, and a **"Note for the office"** disclosure row. Footer:
consequence line + **"Submit check-in"**.
**Rules:** **usable = received − damaged**; damage requires ≥1 photo before submit; supports orderless
check-in (no PO) and partial/split trucks; every check-in notifies Owner, Admin, PM — clean or flagged.

### 7e · Incident report
**Purpose:** capture an incident on site, immediately, with the right people notified.
**Chrome:** **red `#c0362c` header** — the only screen that gets it. The severity of the action is the
design.
**Layout:** ✕ + "Report incident" + project/timestamp. **Type** as three stacked 58px options, each with an
icon; the selected one fills red with a white check. **"Who was hurt"** with a `Required` pill — member rows
(avatar, name, role + clock state) with a red-bordered selected state, plus a dashed **"+ Someone not on the
team"** row for a typed outsider. **What happened** free-text card. Then disclosure rows: Treatment given
(shows the value), Witnesses (count badge), Photos. Footer: **"Emails Owner, Admin, PM & Foreman
immediately"** above a red **"File report"**.
**Rules:** an `injury` **must** name a party; parties and witnesses may be a member **or** a typed outsider;
filing emails four roles and files a PDF to the project's Safety folder. OSHA 300 recordkeeping is handled
outside the app in v1.

---

## Interactions summary
- Clock (7a) → switcher (7b) runs all day; daily log (7c) closes it out.
- Hazard on 7c escalates into 7e pre-filled. Damage on 7d routes to the office, not to safety.
- No approvals anywhere on mobile — approving timesheets is a desktop, role-gated action.
- Motion: 120–160ms ease on press. Steppers repeat on hold. No decorative animation.

## Accessibility & field conditions
Body ≥15px; mono captions ≥10px and non-critical only. All text ≥4.5:1 on its background. Never encode
meaning in color alone — the damaged line carries a border, a fill, a pill, **and** a text string; the
selected incident type carries a check mark as well as red. Assume bright sun and gloves: large flat fills,
generous targets, numeric steppers instead of free-text, no gesture without a visible equivalent.

## Assets
No raster assets. Gradient blocks are photo placeholders. Icons are inline stroke SVG (2–2.2px); replace
with the codebase icon set. Fonts: Barlow + IBM Plex Mono.

## Files
- `FrameFocus Mobile Field Capture.dc.html` — the design reference (5 screens). Open in a browser.
- `ios-frame.jsx` — presentation-only device bezel. **Not part of the design.**
- `support.js` — prototype runtime. **Reference only; do not port.**

## Related
- **Mobile App Shell** handoff — app bar, tab bar with centered camera, navigation, offline state.
- **Mobile Photos** handoff — gallery, viewer, markup.
- **Module 6 Field Operations** handoff — the desktop review/approval side of these same records.
