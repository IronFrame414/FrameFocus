# Session 27 — Module 3G Complete (Markup Editor)

**Date:** April 14, 2026
**Goal:** Finish Module 3G — web markup editor on top of the schema + viewer shipped in Session 26.
**Outcome:** ✅ Complete. Editor shipped, validated end-to-end with persistence (draw → save → refresh → shapes still there).

---

## What shipped

- **`apps/web/app/dashboard/projects/[id]/files/[fileId]/markup/page.tsx`** — server component. Fetches the file row via `getFile`, signs a 1-hour URL via `getSignedUrl`, MIME-gates to `image/*` (with a graceful "not an image" message for non-images), passes `initialMarkup` (or null) to the client editor.
- **`apps/web/app/dashboard/projects/[id]/files/[fileId]/markup/markup-editor.tsx`** — client component. ~550 lines. Toolbar (5 shape tools + select + 6 colors + 4 stroke widths + undo + delete-selected + save). SVG canvas with pointer event handling, image-coordinate transforms, in-progress drafting state, click-to-select with translucent yellow halo, keyboard Delete/Backspace, dirty/saved button states, error display. Saves to `files.markup_data` JSONB via existing `updateFile()` service.
- **`file-row-actions.tsx`** — added image-gated Markup link (Next `<Link>`, MIME starts with `image/`). New required props `mimeType` and `projectId`.
- **`projects/[id]/files/page.tsx`** — passes `mimeType={f.mime_type}` and `projectId={projectId}` to FileRowActions.

## Commits

1. `feat(markup): Module 3G — markup editor + file row entry point`

(Session closeout commit pending.)

## Decisions

- **Add + Undo + Delete-selected for v1.** No move-shape, no resize, no edit-existing-text. Selection model is single-shape (click to select, click empty SVG to deselect). Keeps the editor scope honest while still being useful.
- **`window.prompt()` for text input** — chose simplicity for v1 over a polished inline text editor. Logged as tech debt #52 with a clear scope (multi-line, position at click, per-shape font size, click-to-edit existing text).
- **Center-fixed ellipse drawing.** Click sets center, drag distance defines radius. Bounding-box semantics would be more familiar but cost code. Acceptable for v1; can swap later if it feels wrong.
- **Plain inline styles** — matches Module 3F. Same tech debt entry (#49) covers both. shadcn/ui migration is its own future session that converts the whole module at once. Two half-migrated styling systems would be worse than one consistent unmigrated one.
- **All employees can edit markup, clients read-only.** Database RLS already enforces this (`files` non-client read/write policy) — no extra check needed in the editor or page.
- **JSON-first markup, no flattened image export this session.** Logged as tech debt #53 — needed when markup leaves the app (email attachments, client downloads, daily-log PDFs). Wasn't tracked anywhere before this session; only mentioned in context26.md.

## Validation

- Drew arrow, circle, rectangle, pen squiggle, text label across colors and stroke widths — all rendered correctly.
- Undo removed last shape.
- Select tool + click on shape → yellow halo → Delete selected → shape gone.
- Save changed button to "Saved" with no error.
- Page refresh → shapes still present (round-trip through DB JSONB confirmed).

## Bugs caught and fixed inline

1. **`onLoad` race on cached image.** Hidden `<img>` used to measure natural dimensions had `complete: true` by the time React attached `onLoad` — handler never fired, editor stuck on "Loading image...". Fixed with a ref callback that reads `naturalWidth` directly when `img.complete && naturalWidth > 0`. Pattern worth remembering for any other image-dimension-measuring component.
2. **SVG collapsed to 0×0.** Wrapper used `display: inline-block` and SVG inside used `maxWidth: 100%` — they sized themselves to each other and both collapsed. Fixed by changing wrapper to `display: block`. Image, viewBox, and href were all correct — only the rendered size was wrong, which made it look like the image hadn't loaded.

Both were diagnosed via DevTools console snippets reading `getBoundingClientRect()` and `naturalWidth` directly. Worth doing first when "the page renders but nothing shows."

## Lessons / gotchas

- **React `onLoad` doesn't fire for already-complete images.** If image data is cached (or just very fast over a fast connection), the `load` event fires before the React handler is attached. Always pair `onLoad` with a `ref` that checks `img.complete` for image-dimension flows.
- **`display: inline-block` + child `maxWidth: 100%` = mutual collapse.** Parent sizes to fit child, child sizes to fit parent, both end up at 0. `display: block` on the wrapper breaks the cycle.
- **No Module 5 means no sidebar nav to projects.** Tested by typing a fake UUID into the URL: `/dashboard/projects/<random-uuid>/files`. Worked because there's no FK enforcement on `files.project_id` yet (deferred to Module 5 per STATE.md). Each developer testing Module 3 needs to remember this until Module 5 ships.
- **Clarifying questions caught a scope decision before coding.** Asked about edit access, styling, and text input approach upfront instead of guessing — saved a refactor.

## Tech debt opened

- **#52** Polished markup text editor (replace `window.prompt()`).
- **#53** Flattened markup image export (PNG/JPEG export of markup overlay for emails, downloads, PDFs).
- Note: tech debt #49 expanded to include Module 3G files (markup-editor.tsx, markup/page.tsx).

## Tech debt closed

None this session. (Tech debt #50 — delete the markup-test page — is now arguably closeable since the real editor exercises the same SVG rendering paths, but holding off in case any third-party reviewer wants the standalone visual test.)

## Remaining in Module 3

- **3H** — AI auto-tagging via GPT-4o vision (OpenAI key already configured per STATE.md).
- **3I** — `file_favorites` junction table + UI (small).
- **3J** — Trash UI for soft-deleted files (view, restore, owner/admin permanent delete). Tech debt #48.

## Next session candidates

- **3I (file_favorites)** — smallest remaining 3 piece. Good warm-up.
- **3J (trash UI)** — closes out the soft-delete pattern that's been in service files for sessions.
- **3H (AI auto-tagging)** — most novel work, first AI feature in the platform. Bigger but exciting.
- **Pre-Module 9 Decision Gate** — blocks Module 9. Worth tackling sooner than later so Module 9 design isn't waiting on it.

Choose at session start.
