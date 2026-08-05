# Handoff: FrameFocus — Mobile App Shell (4 screens)

## Overview
The **mobile shell**: how a crew member gets around FrameFocus on a phone, and what they see when the
network drops. Four screens:

| Id | Screen | Purpose |
|---|---|---|
| 6b | Navigation menu (hamburger, open) | Full destination list as tappable tiles |
| 6f | Projects list | Pick a job; the mobile home |
| 6g | Project — sections | Inside a job: jump to any of its 9 sections |
| 6e | Offline / failure state | No connection; work continues, changes queue |

These are shell/navigation screens. The **field-capture** screens (clock, segment switch, daily log,
delivery check-in, incident report) ship in the separate *Mobile Field Capture* handoff.

## About the Design Files
The bundled `.dc.html` is a **design reference created in HTML** — a prototype of intended look and
behavior, **not production code to copy**. Rebuild natively (or in your chosen mobile stack) using
FrameFocus's component conventions. `ios-frame.jsx` is a **presentation-only device bezel** — not part
of the design. `support.js` is the prototype's render runtime — ignore both.

> **No schema is asserted here.** Bind counts, badges, project data, and the sync queue to the live
> models. Names/numbers shown are sample data.

## Fidelity
**High-fidelity.** Inherits the desktop token system (Barlow UI; IBM Plex Mono for all numbers, IDs,
and micro-labels; navy `#14213d`, blue `#2f49d1`, amber `#f59e0b`, danger `#c0362c`), retuned for touch.

---

## Global rules

**Canvas.** 402 × 874 logical px (iPhone 16 Pro). Content inset **18–20px** left/right; **58px** top
(below status bar); the tab bar occupies the bottom safe area.

**Touch targets.** Nav tiles **min-height 76px**; list rows and menu items **min-height 58px**; tab-bar
items **min-height 56px**; primary buttons **min-height 60px**. Nothing interactive under 44px.

### App bar (navy `#14213d`)
Every shell screen shares it: a **44px hamburger** (three 18×2px white bars in an
`rgba(255,255,255,.13)` 11px-radius square) on the left; title block center-left (wordmark or screen
title, 18–21px/800, with an `IBM Plex Mono` 11px sub-line for project/company context); a **38px amber
avatar** right. On a project screen the hamburger is replaced by a **back chevron**.

### Bottom tab bar — locked on every mobile screen
`background:#fff` (dark variant `#101a2f` on dark screens), `border-top 1px #e6e9ef`
(`rgba(255,255,255,.1)` dark), `padding:10px 14px 14px`, items `display:flex` with `justify-content:
space-between`.
- Five slots: **Projects · Timeclock · [camera] · Logs · Field**.
- Each side item: 23px stroke icon over an 11px Barlow label; active = `#2f49d1` at 700, inactive =
  `#8a919c` (`#8fa0c4` on dark).
- **Center camera action:** 66px amber `#f59e0b` circle, `margin-top:-26px` so it breaks the bar's top
  edge, **4px border in the bar's own background color**, shadow `0 8px 20px rgba(245,158,11,.4)`, 30px
  navy camera glyph. It is a global capture action — opens the camera and files the photo to the current
  project (or asks which project when there's no context).
- The active tab reflects the current screen; the bar never scrolls away.

**Because the bar owns Projects, Timeclock, Logs, and Field**, those destinations are **deliberately
absent** from the hamburger menu — no duplicated navigation.

---

## Screens

### 6b · Navigation menu (open)
**Purpose:** reach everything the tab bar doesn't cover.
**Layout:** app bar (hamburger in pressed/active state); the sheet drops over a `rgba(20,33,61,.5)`
scrim; content inset 18px with a mono "GO TO" label. Destinations are a **2-column grid of 76px tiles**
— same tile idiom as the project sections screen (6g): icon top-left in `#2f49d1`, bold 15px label
bottom-left, optional count/status badge top-right. Current location = `1.5px #2f49d1` border with the
label in blue.
**Tiles:** Dashboard (current) · Schedule · Expenses · Subs & Vendors · Team (count) · Contacts ·
Settings. Below the grid, a full-width **Sign out** row (58px, `#c0362c` text, `#f0d4d1` border).
**Behavior:** tapping the scrim or the hamburger closes it; the tab bar stays visible and functional
beneath the sheet.

### 6f · Projects list
**Purpose:** the mobile home — pick a job.
**Layout:** app bar ("Projects" + "4 active · 1 estimating"); a **48px search field**; a horizontally
scrolling filter chip row (All / Active / Mine / On hold — active chip = navy fill, 20px radius); then
**project cards** (15px radius, 15–16px padding, `gap:11px`): name 17px/700, mono `PRJ-###· client`
sub-line, status pill top-right, a 7px progress bar, and a footer row pairing mono progress text with a
right-aligned callout (`4 punch`, `4 open`, `—`). The project you're currently clocked into gets the
`1.5px #2f49d1` border and an **"On site"** pill.
**Behavior:** tap a card → 6g. Search filters live; chips are single-select.

### 6g · Project — sections
**Purpose:** the in-project hub; get to any section in one tap.
**Layout:** navy header with **back chevron**, project name (21px/800), mono `PRJ-### · client`, status
pill, and a **3-stat strip** divided by 1px rules — Progress / Days left / Punch (mono 19px; Punch in
amber when non-zero). Body: an **"Up next"** card (blue dot with a 4px `#e7ebf9` halo, milestone name,
amber scheduling note), then a mono "SECTIONS" label and a **2-column grid of 76px tiles**: Overview ·
Schedule · Change Orders · Punch List · Deliveries · Files · Photos · Contacts · Team. Badges carry
attention counts (Change Orders `6` amber, Punch List `4` amber, Deliveries `1` red, Photos `34` and
Team `3` in plain mono). Bottom: full-width amber **"Log the day"** (60px), then the tab bar.
**Note:** this tab set intentionally excludes finance sections (Budget, Invoices, Payments, Contracts) —
those are office/desktop surfaces.

### 6e · Offline / failure state
**Purpose:** never lose field work when signal drops.
**Layout:** app bar; an amber **status strip** (`#fdf6ec` bg, `#f3e2c4` border) — dot + "Offline · last
synced 4:12 PM" + a queued-count pill; then a centered block: 72px white icon tile with a struck-through
wifi glyph (`#c0362c` slash), **"No connection"** (23px/800), reassuring body copy ("Keep working —
everything you enter is saved on this phone and syncs when you're back in signal."), a mono
`last try 4:19 PM`; a **"Waiting to sync"** card listing queued items with `Queued` badges; then two
stacked 60px buttons — primary **"Try again"** and secondary **"Keep working offline"** — and the tab bar.
**Behavior:** the app stays usable offline; capture screens keep writing locally and appear in this queue.
Auto-retry with backoff; the strip persists on every screen while offline. Full offline sync is out of
Module 6 v1 — at minimum, never silently discard a queued item.

## Interactions & Behavior summary
- Hamburger opens/closes the menu sheet over a scrim; back chevron replaces it inside a project.
- Tab bar is persistent and reflects the active section; the camera is a global capture action.
- Offline strip + queue are app-wide, not per-screen.
- Motion: 120–160ms ease on press; the menu sheet slides down from the app bar. No decorative animation.

## Accessibility & field conditions
Labels ≥11px mono for captions only; body ≥15px. All text ≥4.5:1 on its background. Never encode meaning
in color alone — status pills carry text, the offline state carries an icon, a strip, and copy. Assume
gloves and bright sun: large flat fills, generous targets, no low-contrast grey on white for actions.

## Assets
No raster assets. Icons are inline stroke SVG (2px); replace with the codebase icon set. Fonts: Barlow +
IBM Plex Mono.

## Files
- `FrameFocus Mobile Shell.dc.html` — the design reference (4 screens). Open in a browser.
- `ios-frame.jsx` — presentation-only device bezel. **Not part of the design.**
- `support.js` — prototype runtime. **Reference only; do not port.**

## Related
- **Mobile Field Capture** handoff — clock, segment switch, daily log, delivery check-in, incident report.
- **Shell + core screens** handoff — the desktop token table this inherits.
