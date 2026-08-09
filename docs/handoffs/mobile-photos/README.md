# Handoff: FrameFocus — Mobile Photos (3 screens)

## Overview
Photo documentation is the highest-volume thing the crew does in the field. These three screens cover
the full loop on a phone: **browse** what's on the job, **view** one photo with its provenance, and
**mark it up** to point at a problem.

| Id | Screen | Purpose |
|---|---|---|
| 6j | Project photos — gallery | Browse a job's photos by date, filter by source |
| 6k | Photo viewer | One photo + who/when/where it came from |
| 6l | Photo markup | Annotate a photo to flag an issue |

## About the Design Files
The bundled `.dc.html` is a **design reference created in HTML** — a prototype of intended look and
behavior, **not production code to copy**. Rebuild natively (or in your chosen mobile stack) using
FrameFocus's component conventions. `ios-frame.jsx` is a **presentation-only device bezel** — not part of
the design. `support.js` is the prototype's render runtime — ignore both.

> **No schema is asserted here.** Bind photos, source links, tags, captions, comments, and markup layers
> to the live models (M3 file storage + the 6B/6C/6D records photos attach to). Names/dates shown are
> sample data. Gradient rectangles are **photo placeholders** — not a design element.

## Fidelity
**High-fidelity.** Inherits the app token system: Barlow UI; IBM Plex Mono for counts, timestamps, IDs,
and micro-labels; navy `#14213d`, blue `#2f49d1`, amber `#f59e0b`, danger `#c0362c`. Viewer and markup run
on a **dark canvas** (`#0d1220`) so the photo carries the screen — use **dark status bar / home indicator**
on 6k and 6l.

---

## Global rules
**Canvas.** 402 × 874 logical px (iPhone 16 Pro). Content inset **18px** (**14px** on the markup screen,
which needs canvas area); **56–58px** top; bottom safe area per screen (tab bar on 6j, action rows on
6k/6l).

**Touch targets.** Tool tiles **62px**; action tiles/rows **56px**; tab-bar items **56px**; color swatches
**34px**; on-canvas nav circles **40–46px**. Nothing interactive under 44px except color swatches, which
are spaced 8px apart in a single row.

**Source badges** (on thumbnails, 9–10px Barlow 600, white on a translucent fill, 4px radius, 6px inset
from bottom-left): `Log`/`Daily log` = `rgba(20,33,61,.72)`; `Delivery` = same navy; `Punch` =
`rgba(180,83,9,.85)`; `Safety` = `rgba(192,54,44,.85)`. Untagged photos carry no badge. A photo's badge is
its provenance — never invent one.

---

## Screens

### 6j · Project photos — gallery
**Purpose:** find a photo fast; make it obvious which record each came from.
**Layout:** navy app bar with **back chevron**, "Photos" (20px/800), mono `Willow Ridge · 34 photos`, and a
38px search button on the right (`rgba(255,255,255,.13)`, 10px radius). Below it a horizontally scrolling
**filter chip row** (All / Daily logs / Deliveries / Punch — active = navy fill, 20px radius, 9px×16px
padding, `white-space:nowrap`). Body is grouped by day: a mono uppercase section label
(`TODAY · JUL 8 · 8`, letter-spacing .05em, `#8a919c`) above a **3-column grid**, `gap:7px`, square tiles
at **11px radius**, each with its source badge. Sections repeat newest-first. Bottom: the standard
**tab bar** with Projects active.
**Behavior:** tap a tile → 6k. Chips single-select and re-group in place. Long-press enters multi-select
for bulk share/delete. Infinite scroll by day; newest day first, labeled "Today" when it is today.

### 6k · Photo viewer
**Purpose:** see the photo and immediately know who took it, when, and which record it belongs to.
**Chrome:** dark `#0d1220`, dark status bar.
**Layout (top→bottom):** header row — 22px **close ✕**, centered filename (15px/700) with mono
`3 of 34` beneath, and a **⋮ overflow** on the right (markup, set as cover, move, report). A fixed
**330px-tall image stage** (full-bleed, no radius) with 40px translucent **prev/next circles** inset 14px.
A **filmstrip** of 52px thumbnails (`gap:7px`); the current one carries a `0 0 0 2px #f59e0b` ring, the
rest sit at 45% opacity. Then the detail block: **caption** (14px/1.5 `#cdd6e8`), **tag pills**
(`rgba(47,73,209,.22)` fill, `#9fb0f5` text, plus a dashed **+ Tag**), and a metadata list above a
`rgba(255,255,255,.08)` rule — **Taken** (mono timestamp), **By**, **Source** (the record it came from).
Bottom: a **4-up action row** of 56px tiles — Save · Share · Comment · **Delete** (delete uses
`rgba(192,54,44,.16)` fill with `#f0908a` icon/label).
**Behavior:** swipe left/right to page (the arrows are the discoverable equivalent), pinch to zoom, swipe
down to dismiss. Tapping **Source** navigates to the daily log / delivery / incident it belongs to.
Comment opens the thread; Delete confirms first and is role-gated.

### 6l · Photo markup
**Purpose:** circle the problem and send it — the field's fastest way to be specific.
**Chrome:** dark `#0d1220`, dark status bar. Inset drops to 14px so the canvas gets the room.
**Layout:** header row — **Cancel** (`#8fa0c4`) left, centered "Markup" + mono filename, **Save**
(`#f59e0b`, 700) right. A **flexible canvas** (14px side margins, 14px radius) holding the live
annotations: a red box, a curved arrow with a solid head, a yellow freehand stroke, a **text callout**
(`rgba(20,33,61,.86)` fill, `1.5px #f59e0b` border, 9px radius, max-width ~150px), and **numbered pins**
(34px red circles, white 2px ring, mono numerals) sequenced 1..n. Below: a **5-tool row** of 62px tiles —
**Draw** (active: `rgba(242,69,61,.18)` fill + `1.5px #f2453d` border + red icon/label) · Arrow · Box ·
Text · Pin. Under that, a **controls row**: five 34px color swatches (red `#f2453d` selected with a 2.5px
white ring, yellow `#ffd400`, green `#3ecf6a`, blue `#4f8ff7`, white) on the left, and a **stroke-width
slider** on the right (small dot → 56px track with a 16px white knob → large dot). Bottom: **Undo ·
Redo · Done** (Done = amber `#f59e0b`, navy label, `flex:1.2` so it reads as primary).
**Behavior:** one tool active at a time; the selected color and width apply to the next mark. Draw is
freehand; Arrow and Box are drag-to-place; Text drops a callout and opens the keyboard; Pin drops the next
number in sequence. Undo/Redo are per-mark (Redo dims when empty). **Markup is a non-destructive layer** —
save writes an annotated derivative and keeps the original; the viewer should indicate a photo has markup
and allow toggling back to the original. Cancel confirms if there are unsaved marks.

## Interactions summary
- Gallery → viewer → markup is the primary path; markup returns to the viewer showing the annotated version.
- Markup is also reachable from a punch item or incident, pre-linked to that record.
- Motion: 120–160ms ease on press; page transitions slide, dismissal fades. No decorative animation.

## Accessibility & field conditions
Body ≥14px; mono captions ≥11px and non-critical only. Text meets 4.5:1 on its background. Never encode
meaning in color alone — tool state carries a border and a label change, not just tint; source badges
carry words. Annotation colors are chosen for sunlight contrast against jobsite photos (saturated red and
yellow first). Assume gloves: no target under 44px, no gesture without a visible equivalent.

## Assets
No raster assets. All gradient blocks are photo placeholders. Icons are inline stroke SVG (2–2.2px);
replace with the codebase icon set. Fonts: Barlow + IBM Plex Mono.

## Files
- `FrameFocus Mobile Photos.dc.html` — the design reference (3 screens). Open in a browser.
- `ios-frame.jsx` — presentation-only device bezel. **Not part of the design.**
- `support.js` — prototype runtime. **Reference only; do not port.**

## Related
- **Mobile App Shell** handoff — app bar, tab bar with centered camera, offline state.
- **Mobile Field Capture** handoff — the capture screens photos originate from.
- Desktop equivalents (project photo gallery + lightbox) live in the main design doc as `6h` / `6i`.
