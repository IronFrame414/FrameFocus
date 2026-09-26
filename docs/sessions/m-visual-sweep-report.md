# /m visual sweep — report

**Branch:** `feature/m-visual-sweep` (cut from main `0557e13d`). **Not merged.** Nothing touched
production; every capture and probe ran against rebuild-test on a local production build.
**Evidence:** `docs/design/screenshots/m-sweep/` — `before/` (Phase 1, `79063f77`), `after/`,
`after-320/`, the scripts that reproduce each, and `notfound-probe-after.json`.

## ⚠️ What Josh reported was not what the sweep found

**The report was "most lists/rows look bad". That was not what the sweep found.** 17 screens use
the shared row from `app/m/mobile-ui.tsx`, and they are consistent at both widths and for both
roles. The impression had two real causes:

1. **One screen was genuinely unstyled, and always had been.** Notifications — its list and its
   push control — had no classes at all, on desktop as well as on /m, from `7b07ddce`
   (2026-08-09) onward. It was not a regression from any recent work. Title and body ran
   together, and every control rendered as bare text.
2. **rebuild-test's data is test output.** It holds 585 people on `/m/team` (579 of them with no
   profile), and the owner's notifications are 62 `E2E Assigned …` rows plus repeats, behind a
   100-row cap. A styled list full of fixtures still looks broken. Filed as `#1-msweep`, not
   cleaned here (decision 7).

The problems that were real were layout, not row styling: the camera FAB covered the end of every
screen, one entry row overflowed at 360, and a crew member could land on a bare 404.

## Before → after (390 and 360, crew and owner, 196 captures each, 0 errors)

| Measure | Before | After |
| --- | --- | --- |
| Gap between the last content and the FAB, end of scroll (screens that scroll) | 3px on most | **42px** (+39) |
| Chat conversation list, last row vs FAB | under it | **25px clear** |
| Horizontal overflow at 360 | 2 (site-visit "W ft", 30px) | **0** |
| Measurement row at 320 | n/a | **fits** — Area 120, L 76, W 76 |
| Bare 404 outside the /m shell | crew on a CO link | **0 of 72 probes** |
| Bare text buttons | 556 | 156 (see below) |

⚠️ **The sweep's `structuralClearance` field did not move, and it cannot.** It sums space
*inside* `<main>`'s descendants, and the fix is `<main>`'s own padding. Read `clearance` instead:
it measures the real gap after scrolling to the end. Computed style on `m-content`: 39px padding
and 39px scroll-padding.

**What the remaining 156 bare buttons are.** On notifications, each row's title and body form one
borderless tap target, which is deliberate. The rest were already there before this branch and are
outside this pass: "show original" on translated text, and Cancel/Save on the markup screen.

## Josh's decisions, as built

1. **Notifications — the shared components are styled, so both surfaces change**
   (`notification-list.tsx`, `push-enrolment.tsx`).
   - Each row is a card-and-divider row with an unread dot and a bold title.
   - Timestamps are mono.
   - Star, Mark read and Dismiss are real buttons. On /m (`compact`) every target is at least
     44px.
   - Nothing a tap writes changed.
   - The earlier session's uncommitted work was sound and was finished rather than redone, with
     one fix. It gave `PushEnrolment` its own card and heading, which would have doubled the
     desktop page's `<h2>` and put a card inside Settings' titled card. Desktop now drops its
     duplicate heading, and Settings passes `framed={false}`.
   - This closes **#151**. #151 required a test pinning A-N26 before any restyle, so
     `test/push-enrolment-view.test.tsx` now asserts that the iOS, denied and unsupported branches
     render no control. I checked it with a mutant: adding a button to the iOS branch turns the
     test red.
2. **FAB clearance — one rule in the shell.** `--m-fab-inset` = 15px overhang + 24px gap = 39px.
   `<main>` uses it as both `padding-bottom` and `scroll-padding-bottom`. The chat overlay applies
   the same inset to its list from the /m side, because `ChatBody` is shared with the desktop
   panel, which has no camera. The photo viewer and markup screens have no FAB and are unchanged.
3. **The text box Josh reported** (site-visit "What is there now") is covered by decision 2 and was
   not chased in Chromium. **Josh re-tests it on his phone.**
4. **iOS safe area — deferred, not turned on.** The measurement and Josh's reasons are recorded on
   the existing entry, **#3-audit**, rather than in a duplicate.
   `env(safe-area-inset-bottom)` resolves to 0 today, so the tab bar's safe-area padding is a flat
   14px on every device.
5. **Measurement row is fluid.** Area is `minmax(0,1fr)`; L and W are fixed at 4.75rem. The L/W
   placeholders are set in Barlow so the Spanish "Largo ft" fits. It fits at 320. The component is
   shared, so desktop gets the same row.
6. **A crew member opening a CO link** now lands on the change-orders list with a notice
   (`?denied=co-read`). The notice is a **new** one, worded by role: the existing `co` copy says
   "not available to subcontractors", which would read to a foreman as a broken app. This is the
   same reasoning `co-write` already records. Owner and admin can see every CO, so for them alone a
   missing CO is still a not-found.
   - **Other routes: yes, they fell through too.** All 18 /m pages that call `notFound()` reached
     the root 404, outside the shell, as did any /m URL with no route.
   - Fixed with `app/m/not-found.tsx` plus an `app/m/[...missing]` catch-all. Both still return
     HTTP 404.
   - The probe covers every parameterised route with the id missing, as crew and as owner: 0 of 72
     fall through. A control URL outside /m does register as bare, so the probe can fire.
   - Also fixed: four lists rendered the denied notice in English only, because they didn't pass
     `t`.
7. **Test-data clutter — filed as `#1-msweep`**, with the measured counts.

**Found along the way and filed, not fixed: `#2-msweep`.** At 320 the tab bar overflows, and
"Field" runs 34px off-screen. Its geometry is ruled, and no ruling names 320 as a supported width.
The first thing owed is a decision on whether 320 is supported at all.

## Checks (each exit status read from its own printed line)

- `next build` — `BUILD_EXIT_LINE=0`, run after the last code change.
- Unit suite — 117 files, 1638 tests passed, exit 0. The i18n anti-rot guard scans 139 files and
  `PENDING` is still empty. New strings: `shell.push.heading`, `shell.denied.coRead`,
  `shell.notFound.{title,body,home}`, in English and Spanish.
- Playwright `m-details`, `m-writes` and `m-shell` against the production build: 130 passed,
  2 skipped (subcontractor-identity cases, unrelated), exit 0.
  - Per the S157 rule, two tests asserted the old bare 404 for crew and foreman on M-31. Both were
    inverted to the redirect, with the old assertion quoted.
  - The `/m/dashboard` 404 test now also asserts that the page renders inside the shell.
- Prettier: every new file passes. **13 of the files this branch edits already failed Prettier on
  main** (`0557e13d`). Each was checked against its main version, with a control: files that are
  clean on main return 0. I left them alone rather than reformat lines this branch doesn't
  otherwise touch.

## Owed to Josh

- Re-test the site-visit textarea against the camera on a real iPhone (decision 3).
- Rule on whether 320 is a supported width (`#2-msweep`).
- Merge when satisfied. Provisional ids `#1-msweep` and `#2-msweep` convert to real numbers from
  main's authority at merge.
