# S112 — /m UI audit

**Read-only. Nothing was built.** Every item below waits for Josh's ruling.

> ## ⚠️ THIS AUDIT BROKE THE SWEEP BRANCH'S CI RUN. THE BRANCH'S CODE DID NOT.
>
> **What happened.** CI run `36203301700` on `feature/m-visual-sweep` @ `56f948d9` concluded
> **failure** at 00:39Z. The tally: **581 passed, 7 failed, 2 flaky, 10 skipped**.
>
> **Why it's my audit.** Every failure is an English-text assertion that received **Spanish**:
>
> - `"1 foto guardada."` against `/\d+ photos? saved\./`, 9 times
> - `"6 activos"` against `/^\d+ active$/`
> - `"En obra"`
> - `"Listo"`
> - `"Se necesita foto del daño…"`
> - `"Se subirá cuando vuelvas a tener señal"`
>
> CI's E2E signs in as `josh+crew@worthprop.com` (`e2e/auth.setup.ts:29`) against rebuild-test,
> the same identity and project this audit used. Its E2E job ran 00:02–00:37Z. This audit's
> Spanish passes flipped that identity's `profiles.language` to `es` between roughly 00:10 and
> 00:32Z: `audit.mjs`, `textdiff.mjs`, `chat-fab.mjs` and `offline-probe.mjs`. Every flip was
> restored, and both identities read `en` now, but only after the CI run had already read `es`.
>
> **What's owed.** Re-run the failed job on `36203301700`, now that the language is back to `en`.
> I did **not** trigger it: that's Josh's call, and "one branch's CI at a time" still applies.
> Until it's green, the sweep's CI result says nothing about the sweep.
>
> **The rule this breaks, and the fix for next time.** A test run that mutates a shared E2E
> identity is a write to CI's fixture. Any future language-matrix pass should use **dedicated
> audit identities**, not `josh+crew`/`josh+test50`, or run only while no CI is live against
> rebuild-test. This is the "thing inspected must be the thing judged" class in reverse: my probe
> changed the thing CI was judging.

- **Tree audited:** `feature/m-visual-sweep` @ `56f948d9` — the sweep plus tonight's photo merges.
- **Build:** a fresh `next build` of that HEAD, then `next start -p 3100`. The build log's own line
  reads `BUILD_EXIT_LINE=0`. I rebuilt because the existing `.next` predated HEAD.
- **Data:** rebuild-test (the ref is checked by every script).
- **Evidence:** `docs/design/screenshots/s112-audit/` holds the scripts, the raw results, a machine
  summary, and 17 evidence captures named by finding.

**Not re-reported.** These were already fixed by `feature/m-visual-sweep` (see
`m-visual-sweep-report.md`):

- NotificationList and PushEnrolment styling
- FAB clearance, which still holds (below)
- the fluid site-visit measurement row
- the /m 404 and catch-all
- the four English-only denied notices

Also not reported, because they're ruled: 320px (360 is the floor) and iOS `viewport-fit=cover`.

## Instrument and coverage

- **Route enumeration.** Run in `apps/web`: `find app/m -name 'page.tsx' | sort`. **Total: 49.** That's
  the sweep's 48 plus the new `app/m/[...missing]` catch-all. The full list is in
  `s112-audit/routes.txt`, diffed against the sweep's list (1 line differs: the catch-all).
- **Browser.** Playwright Chromium with `isMobile` + `hasTouch`, DPR 1, against a production build.
  It is **not** WebKit, and **not** a real phone.

**The matrix.** 49 routes × 3 viewports (360×800, 390×844, 430×932) × 2 roles × 2 languages =
**588 route records**. The roles are crew (`josh+crew`) and owner (`josh+test50`), in English and
Spanish.

| Record type | What it covered | Count |
| --- | --- | --- |
| Route | the matrix above | 588 |
| Interaction state | 7 states × 12 combos: ☰ sheet, chat switcher, chat in a project, photo select, photo select + delete confirm, viewer ⋮ menu, viewer scrolled | 84 |
| Empty project | owner, 360, en + es, every project-scoped list on `S97COREMAIN` (zero rows in every project table) | 34 |
| Loading | 5 taps × 2 roles × 2 languages, with the RSC payload held 3s | 20 |
| Text diff | every route plus the sheet, en vs es, both roles (English left in Spanish) | 49 × 2 × 2 |
| Offline | crew, 360, en + es | 2 |
| Chat vs FAB | crew, 3 widths × 2 languages | 6 |

**Result:** 0 navigation errors across all 848 records, and 120 page errors, all from one route (F16).

**What each check reads**, all from the rendered DOM:

- document/body/`<main>` scrollWidth vs viewport, plus every element past the viewport edge that
  isn't inside a horizontal scroller
- elements whose own text overflows an `overflow:hidden` box
- every interactive element's bounding box (hidden file inputs are measured through their label)
- font-size of every text input
- WCAG contrast of every text node against its composited background
- content under the FAB or tab bar after scrolling to the end
- controls with no background, border or padding

**Limits of this run:**

- **Redirects.** Five crew routes redirect to a denied notice (contact/sub/team edit, CO detail, CO
  new), so for crew those were audited as the screen crew actually lands on. `/m` redirects to
  `/m/timeclock` for both roles.
- **Roles and data.** Foreman, PM and admin weren't run. rebuild-test is fixture-heavy
  (`#1-msweep`). The container's browser timezone is UTC.
- **Not exercised:** the native camera, drawing on markup, recording audio, uploads.

**DB writes, all reversed and verified:**

- `profiles.language` was flipped to `es` for the two test identities during the Spanish passes.
  It was restored in `finally`, and every pass printed `original=en now=en`.
- One `site_visits` row (`S112AUDIT site visit`) was seeded so `/m/site-visits/[id]` had something
  to render. It's removed now (`site_visits now 0`).

## Labels

- **M = MEASURED:** a number read from the DOM.
- **I = IMPRESSION:** my judgement from a screenshot.
- **C = CODE-READ:** read from source, not reproduced on screen.

⚠️ One impression was **withdrawn** during the run. I read the Spanish logs chip as "Mios"
(missing accent) from a JPEG, but the DOM text is "Míos". Impressions come from compressed
captures, so weigh them accordingly.

## Findings — ranked by how often a crew member on a jobsite hits them

In the Role column, "all" means both roles audited. Sev is High, Med or Low.

| # | Route | Viewport | Role | Lang | File:line | What is wrong | Label | Sev | Fix I would make |
|---|---|---|---|---|---|---|---|---|---|
| F1 | every navigation (probed: tab Field, tab Projects, project row, photo tile, punch row) | 390 | all | en+es | no `app/m/**/loading.tsx` exists; `mobile-shell.tsx` `TabItem` :751 | **A tap gives no feedback until the next screen arrives.** With the RSC payload held 3s, **20 of 20 taps** showed the old screen, unchanged, with no pressed state or indicator at 800ms. They settled at 3.4–6.8s. On jobsite LTE that reads as a dead tap and invites a double tap. | M | High | Add `app/m/loading.tsx`, a skeleton inside the persistent shell, so navigation swaps instantly. Also add a shell-level pending bar. |
| F2 | **47 distinct fields on 12 routes** + the chat composer: search (`/m/projects`), log form, punch new/list new, safety new, check-in, site visit new/record, CO new, contact/sub/team edit | all 3 | all | en+es | e.g. `projects-list.tsx:58`, `log-form.tsx`, `chat-composer.tsx:433` | **Every text field is 15px; the chat composer is 13px.** iOS Safari zooms the page when an input under 16px takes focus. The viewport meta is `width=device-width, initial-scale=1` with no `maximum-scale`, so every field on /m will zoom on an iPhone and leave the crew member pinching back out. The size is measured; the zoom is documented iOS behaviour I couldn't reproduce in Chromium. | M | High | Set text inputs to 16px on /m. **Not** `maximum-scale=1`, because that also kills pinch-zoom, which the crew needs for photos and small print. |
| F3 | 52 of 56 routes and states | all 3 | all | en+es | `tailwind.config` token `m6m-muted #8792a8` | **The muted grey fails AA:** 3.13:1 on card white and 2.89:1 on the `#f4f6fa` surface (4.5 needed). It carries every inactive tab label (11px), captions, section labels (`CREW PRESENT`), status pills, day labels and empty states. It showed up 6,712 times across records. Every other token passes (below). | M | Med (High in sunlight) | ⚖️ **Ruling (palette).** The nearest same-hue shade that passes on both backgrounds is `#687081` (4.60 surface, 4.97 card). That's one token change, but it's a design decision. |
| F4 | `/m/timeclock` header, `/m/schedule`, `/m/p/…/schedule`, `/m/p/…/photos` day labels, viewer "Taken", `/m/offline` | all | all | **es** | `timeclock-screen.tsx:107`, `schedule/page.tsx:40`, `p/…/schedule/page.tsx:39`, `photos/page.tsx:51`, `viewer.tsx:269`, `offline/page.tsx:45` | **Dates and times stay English in Spanish:** `Sat, Sep 26`, `Mon, Aug 3`, `AUG 25`, `Aug 25, 2026, 9:06 PM`. Each is hard-coded `'en-US'`. The Timeclock one is on the screen crew opens first every day. | M | Med | One shared formatter in `lib/i18n` taking `Lang` (`es-US` / `en-US`), replacing the six call sites. |
| F5 | `/m/projects` card ("1 abiertos"), project hub ("1 míos · 1 abiertos"), photo select ("1 seleccionadas") | all | all | **es** | `field.ts:365`, `project.ts:280`, `photos.ts:288` | **Spanish uses the plural for n = 1.** `/m/projects` is crew's project list, so any project with exactly one open punch item shows it. There's no plural mechanism in `lib/i18n`. 44 keys already use a manual `…One`/`…Many` pair; these three don't. | M | Med | Give the three keys the same `One`/`Many` pair. Then do a catalog pass over the other ~49 count strings. I only confirmed three on screen. |
| F6 | chat overlay, inside a project | all 3 | all | en+es | `chat-body.tsx:167`, `chat-segments.tsx:55`, `chat-composer.tsx:458/485/510/433` | **Chat's controls are under 44px.** Back arrow **17×17**. Crew/Subs segments **56×31**. Mention **99×40**, Attach **84×40**, Send **83×38**. Composer text 13px (see F2). The @-mention hint's last line sits **3px under the FAB** at all widths and in both languages; the sweep inset the conversation *list*, not the thread. | M | Med | Give the back arrow a 44×44 hit box and the segments and composer buttons `min-h-[44px]` on the `compact` (/m) variant. The components are shared, so apply the same /m-side inset the sweep gave the list. |
| F7 | `/m/logs`, `/m/logs/[logId]`, `/m/p/…/punch/[itemId]` | all 3 | all | en+es | `components/i18n/user-text.tsx:138` | **"show original" / "ver original" is a 74×14 bare text button.** On `/m/logs` it sits *inside* the row link, so a near-miss opens the log instead. The sweep noted it as outside its pass. | M | Med | Pad it to a 44px-tall hit area with no visual change. On list rows, move it out of the link or drop it from the excerpt. |
| F8 | `/m/p/[projectId]` "Change orders" tile → `/m/p/[projectId]/changes` | all | **crew** (foreman too, by the same RLS) | en+es | `p/[projectId]/page.tsx:59`, `changes/page.tsx:21` | **Crew is told "No change orders." when the project has 2.** Since the S121 read floor, crew and foreman can't read COs, so the list comes back empty and renders the normal empty state. The page's own comment (`:21`, "has NO role floor") predates that floor and is stale. | M | Med | ⚖️ **Ruling.** Either hide the tile for foreman/crew, or show a role-worded notice ("Change orders are handled by the office") like the sweep's `co-read` notice. Either way, fix the stale comment. |
| F9 | `/m/settings`, `/m/p/…/overview`, `/m/p/…/contacts` | all | all | en **and** es | `settings/page.tsx:73,79`, `overview/page.tsx:141` | **Raw DB tokens render as text:** `crew_member crew` under the user's name, phase status `not_started`, and a contact role `client` beside the translated "Cliente". Wrong in English too. | M | Low-Med | Map each through a label key (the role labels already exist in `@framefocus/shared`). |
| F10 | `/m/p/…/photos` select mode; viewer Share | all | all | en+es | `photo-grid.tsx:521`; `lib/share-image.ts:111-121` | **A failed photo Share or Delete says nothing on the grid.** The note is `sr-only`, and has been since the M-8 build `5f8a43e7` with no rationale given. So "This browser cannot share images…" or "2 of 3 failed" never appears on screen. `shareFailureNote()` is also English-only, and the viewer shows it visibly, so a Spanish user gets English. | C (DOM class read) | Med | Show the note visibly (the viewer already does at `viewer.tsx:620`) and route `shareFailureNote` through `t`. |
| F11 | `/m/p/[projectId]` hub | 360, 390 | all | en+es | `mobile-ui.tsx:277` (`m-tile-badge`), `p/[projectId]/page.tsx` | **The Punch tile's badge truncates** ("1 míos · 1 a…", 12px hidden) and is amber-on-white at **2.15:1**. It repeats the hero stat above it. The project name also renders twice at the top, the app bar h1 and the hero h2, and both truncate at 360 (25px and 3px hidden). | M (truncation, contrast) · I (duplication) | Low | Show a count only on the tile; the hero already carries mine/open. Whether the duplicated title is intended is a design call. |
| F12 | `/m/p/…/photos/[fileId]/markup` | all 3 | all | en+es | `markup-canvas.tsx:465` | **Colour swatches are 34×34.** | M | Low-Med | 44px hit area around the 34px disc. |
| F13 | `/m/timeclock` | all | crew | en+es | `timeclock-screen.tsx` `ClockInForm` | **"Clock in" shows disabled with no instruction** until a segment type is chosen. It's the most-used crew control. | I | Low-Med | A one-line hint under the button while it's disabled ("Pick what you're doing"). |
| F14 | `/m/p/…/photos` grid, viewer filmstrip | all | all | en+es | `photo-grid.tsx:256` | **A photo whose file can't be signed stays on its grey loading placeholder forever.** When `thumbUrl` is null, no `<img>` is rendered, so the component's own error state never engages. On Lakeview, **4 of 5 tiles** are like this (the storage objects are gone: `Object not found`). The trigger is test debris, but the render path is real: an orphaned row or a failed upload looks like "still loading". | M | Low | Render the error state when the URL is null, just as `onError` does. |
| F15 | every screen (bell), 4 lists (chip group), project contacts | all | all | **es** | `notification-bell.tsx:45`; `mobile-ui.tsx:48` (`t = EN_T` default) omitted at `expenses/page.tsx:169`, `logs/page.tsx:93`, `photos/page.tsx:163`, `projects/page.tsx:142`; `ContactActions` without `t` at `p/…/contacts/page.tsx:74` | **Screen-reader labels stay English in Spanish:** "Notifications, 130 unread", "Filter" (the catalog has "Filtro"), "Call Karen Foster". This is the same class as the sweep's four notices. The `t = EN_T` default is what lets it recur. | M | Low (screen readers only) | Pass `t` at the 5 call sites and make `t` required on `FilterChips`, `ContactActions` and `DeniedNotice`, so the compiler catches the next one. |
| F16 | `/m/site-visits/[id]` | all | all | en+es | `components/site-visits/voice-notes.tsx:97` | **The page fails hydration on every load:** 12/12 visits, 9× React #418 + 1× #423. `supported = typeof window !== 'undefined' && …` is computed during render. The server prints "This browser cannot record audio", the client renders **Record**, and React throws away the server HTML and re-renders the whole page. Found by diffing the JS-off DOM against the hydrated DOM; that's the only differing node. | M | Low for crew, Med for estimators | Detect support in `useEffect` into state, and render neither branch until it's known. |
| F17 | `/m/account` | all 3 | all | en+es | `components/account/name-form.tsx:54,70`, `password-form.tsx` | **Account uses the desktop form styling:** grey-300 borders, `brand-500` buttons, **42px** inputs and **40px** Save buttons. It's the only /m screen that doesn't use m6m tokens. | M (sizes) · I (look) | Low | A `compact` variant on the shared forms, the same approach NotificationList took. |
| F18 | `/m/p/…/photos` select mode | **360** | owner/admin (roles with Delete) | **es** | `photo-grid.tsx:448-483` | **The selection bar overflows by 23px** and **Cancelar** is clipped off-screen, so `<main>` scrolls sideways. Crew has no Delete button and doesn't overflow. | M | Low for crew | Put the count on its own line, or let the bar wrap. |
| F19 | `/m/site-visits` list | all | all | all | `site-visits/page.tsx:57` | A server component calls `toLocaleDateString()` with no zone or locale. On Vercel that's the **UTC** day in server locale, so an evening visit shows as the next day. | C | Low | Company-timezone formatter (the one F4 needs). |
| F20 | `/m/p/…/changes/new` | all | owner | en | `project.ts:111` | Copy typo: "**a** agreed lump sum". | M | Low | "an agreed lump sum". |
| F21 | `/m/timeclock` with zero assigned projects | — | crew | — | `timeclock-screen.tsx` `ClockInForm` | No empty branch for a crew member with no assignments (for example, their first day). The Project heading would render over an empty list. Not exercised: none of crew's 3 projects is empty. | C | Low | "You're not on any projects yet — ask your foreman." |
| F22 | `/m/p/…/safety/new` | all | all | en+es | `incident-form.tsx` | The title and project repeat in the app bar and again in the red hero directly under it. | I | Low | Design call. The red hero may be deliberate for Safety. |
| F23 | `/m/projects` cards | all | all | en+es | `projects/page.tsx:66` | An unlabeled "—" bottom-left means "no end date", but nothing says so. | I | Low | "No end date", or drop it. |
| F24 | `/m/notifications` | 390, 430 | owner | en+es | `notification-list.tsx` (`notification-open`) | The row's open target measures **306×42**, 2px short. Crew had 0 notifications, so this is unmeasured for crew. | M | Low | `min-h-[44px]` on the compact row. |

### Rulings needed before building

- **F3:** change the `m6m-muted` palette token.
- **F8:** hide the Change orders tile for foreman/crew, or show a notice.
- **F2:** confirm the 16px approach over `maximum-scale`.
- **F1:** `loading.tsx` skeletons, a pending bar, or both.

Everything else has one obvious fix.

## Checked and CLEAN — the denominator

- **Horizontal scroll:** **0 of 588** route records overflow at page level (document, body and
  `<main>` all 0). Only **2 of 84** state records do, both F18.
  - **0** elements sit past the viewport edge outside an intentional scroller.
  - The only scroller is the photo filter chips (`m-chips`), in Spanish only, and it's deliberate.
- **Text clipping:** **0** unintended clips in 706 measured records. Deliberate `truncate` fired in
  six places, all long data (project and sub names, the app-bar subtitle, the F11 hub badge).
- **Hidden behind the FAB or tab bar:** **0** obscured elements inside `<main>`, across 672 route
  and state records.
  - The minimum end-of-scroll clearance is **42px** on every scrolling route, so the sweep's
    39px rule holds everywhere.
  - The one exception is outside `<main>`: the chat hint (F6).
- **Tab bar:** fits at 360, 390 and 430 in both languages. The rightmost child ends 6 or 14px
  inside the edge. Spanish "Proyectos" is 57px in a 56px slot at 360: 1px, with no visible effect.
- **Tap targets ≥44px:** tab bar items, the camera (66) and library (44) controls, back and ☰
  (44), sheet tiles, photo tiles, Select, Load more, selection bar buttons, the viewer's
  close/⋮/prev/next/zoom controls, filmstrip thumbs (52), viewer action buttons, and punch
  actions (52). The full list of everything under 44 is in F2, F6, F7, F12, F17 and F24; there
  are no others.
- **Contrast:** every token except `m6m-muted` passes AA.
  - blue on card: 6.48
  - danger on card: 5.52
  - muted-navy on navy/canvas: 6.80 / 7.11
  - navy on amber (FAB): 8.32
  - notice `#b45309` on `#fff5e6`: 4.65
  - The records that fall below AA and aren't F3/F11 are **disabled** controls, which WCAG 1.4.3
    exempts, plus chat's hint and empty text at 3.68. That last one is minor and is folded into F6.
- **Empty states:** **15 of 15** project-scoped lists render an empty state in English and Spanish
  on an empty project. The project list has one too (`projects-list.tsx:67`).
- **Raw-looking rows and controls:** the only bare buttons are "show original" (F7) and the
  notification row, which is deliberate per the sweep. **0** default-blue links. **49 of 49**
  routes render inside the shell for both roles, and the catch-all 404 renders in the shell.
- **Offline:** the strip fits at 360 (44px in English, wrapping to 55px in Spanish, no overflow).
  A tab tap with no network lands on the translated offline page with Retry.
- **Page errors:** none on 48 of 49 routes. All 120 are F16.
- **Newest photo surfaces:** apart from F10, F14 and F18, the photo grid, viewer, filmstrip, punch
  actions, and the tab bar's library input (a 44×44 label on the shared input) all measure clean.
  That covers overflow, obscuring, targets and clipping, at every width and in both languages.
- **Deliberate, not a defect:** on a punch item that requires a photo, "Mark complete" is enabled.
  `punch-actions.tsx:216` records that the service's refusal message is the explanation.

## Reproduce

Run from `docs/design/screenshots/s112-audit/`, against `next start -p 3100`:

1. `node setup.mjs up` prints the estimate id for `AUDIT_SV`.
2. `AUDIT_ROLE=crew|owner AUDIT_OUT=<dir> AUDIT_SV=<id> node audit.mjs`, one process per role.
   Language is flipped and restored inside it.
3. `node analyse.mjs <dir>` produces `results/summary.md`.
4. `textdiff.mjs` produces the English-in-Spanish data (`results/identical-en-es.txt`).
5. `chat-fab.mjs`, `offline-probe.mjs`, `hydration-diff.mjs` and `tile-probe.mjs` are the
   single-issue probes. `setlang.mjs` flips one identity's language.
6. `node setup.mjs down` removes the seeded site visit.

The full 915-capture set isn't committed (19 MB). The scripts regenerate it.
