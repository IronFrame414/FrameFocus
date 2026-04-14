# Session 26 — Module 3G (Markup Schema + Viewer)

**Date:** April 14, 2026
**Goal:** Start Module 3G — shared photo markup component (JSON-first hybrid, SVG overlay).
**Outcome:** 🟡 Partial. Schema + shared viewer + test page shipped and validated visually. Web editor deferred to next session.

---

## What shipped

- **`packages/shared/types/markup.ts`** — shape schema. Discriminated union keyed by `type`. Five shapes: arrow, circle (ellipse), rectangle, pen (polyline), text. `MarkupData` carries `version`, `imageWidth`, `imageHeight`, `shapes[]`. `createEmptyMarkup()` helper.
- **`packages/shared/components/MarkupViewer.tsx`** — pure SVG renderer. No state, no events, no DOM-specific APIs. Uses `<svg>` with a viewBox matching image natural dimensions so shapes render in image coordinates regardless of display size. Portable to React Native via `react-native-svg` when Module 6 needs it.
- **`packages/shared/tsconfig.json`** — added `"jsx": "react-jsx"` so the shared package can host React components (previously types/utils only).
- **`packages/shared/types/index.ts`** — re-exports `./markup`.
- **`apps/web/app/dashboard/markup-test/page.tsx`** — throwaway visual test page. One of each shape over a Picsum image. Validated viewer in browser. Logged as tech debt #50 for cleanup once editor ships.

## Commits

1. `feat(markup): Module 3G — shared markup schema + SVG viewer`
2. `feat(markup): Module 3G — JSX config, schema fix, viewer test page`
3. `docs(state): Session 26 closeout — Module 3G partial`

## Decisions

- **Hybrid JSON-first, not destructive image.** Markup stored as structured data in `files.markup_data` JSONB. Original photo untouched. Flattened-image export (for email sending) deferred — built when email sending lands or lazily on client download.
- **All 5 shapes supported.** Discriminated union makes adding more later (e.g., measurement line, callout) a 3-file change with no migration. `version` field at the top of `MarkupData` allows safe schema evolution.
- **SVG overlay, no library.** Browser standard (W3C since 1999), zero dependency, portable to React Native via `react-native-svg` with identical element names. Chosen over react-konva and tldraw for longevity — no dependency to maintain or fork.
- **Split viewer (shared) from editor (web).** Viewer is pure render, usable anywhere photos appear including future mobile. Editor is platform-specific input handling, built per-platform. Avoids a future refactor when Module 6 ships the mobile editor.
- **`strokeWidth` moved off `MarkupShapeBase`.** Only Arrow/Circle/Rectangle/Pen use it. Text is filled, not stroked — requiring `strokeWidth` on every shape was wrong. Caught during test-page type-check. Clean fix: make `strokeWidth` part of each stroked shape's interface, not the base.

## Validation

- `npx tsc --noEmit` clean after every step (run from `apps/web/`).
- Visual test at `/dashboard/markup-test` — all 5 shapes rendered correctly (red arrow, green circle, blue rectangle, purple freehand, black text label).

## Infrastructure side-trip

`.env.local` was missing at session start (expected per tech debt #35). Instead of recreating the file, set up **GitHub Codespaces secrets** — 11 env vars now auto-inject into every new Codespace session. Required a container rebuild (Cmd+Shift+P → "Codespaces: Rebuild Container") for secrets to take effect in the current session. Worth noting: Codespaces secrets show up as `process.env.*` at runtime. Next.js `NEXT_PUBLIC_*` vars appear to be picked up fine, but if a future build step complains, fall back to recreating `.env.local`.

Tech debt #35 is now effectively mitigated but not closed — leaving the entry in STATE.md in case the secrets approach hits an edge case later.

## Lessons / gotchas

- **`tsc` from the repo root prints help text with no input.** No root `tsconfig.json` exists — configs live per-package. Always `cd apps/web && npx tsc --noEmit` (or equivalent per package) to actually type-check.
- **VS Code Problems panel reports against the nearest `tsconfig.json`.** When the shared package had no JSX config, the panel showed 12 errors on `MarkupViewer.tsx` even though `apps/web`'s `tsc` was clean (because nothing in web had imported it yet). Terminal is still the source of truth, but "clean terminal + problem panel errors" can mean a real config gap in a sibling package, not just cache.
- **Vercel preview URLs are not the dev server.** Spent a few minutes on a 404 that turned out to be hitting an old Vercel branch preview instead of the Codespace-forwarded port 3000. Check the Ports tab in VS Code; the dev URL is `https://<codespace>-3000.app.github.dev`.
- **Codespaces secrets inject only into new sessions.** Setting them in GitHub does nothing for an already-running Codespace — a container rebuild is required. Quick check: `echo $NEXT_PUBLIC_SUPABASE_URL` after rebuild.

## Tech debt opened

- **#50** Delete `apps/web/app/dashboard/markup-test/page.tsx` once Module 3G editor is complete.
- **#51** Add `.claude/` to `.gitignore` — Claude Code local config showing up as untracked.

## Tech debt closed

None. Tech debt #35 (`.env.local` doesn't persist) is now mitigated via Codespaces secrets but left open pending real-world confirmation across several rebuilds.

## Remaining in Module 3G

- **Web markup editor** — tool palette (5 shape tools + color + stroke width), SVG mouse event handling, shape creation on pointer drag, save JSON to `files.markup_data` via existing files-client service. Entry point: click a photo row in the file list → opens editor.
- **Wiring** — add an "Open in Markup" action to the file row (photos only, MIME type check) that navigates to the editor route.

## Next session candidates

- **Module 3G editor** — finish 3G. Most forward progress.
- **Module 3H** — AI auto-tagging via GPT-4o vision (OpenAI key configured).
- **Module 3I** — `file_favorites` junction table. Small.
- **Module 3J** — trash UI for soft-deleted files.
- **Pre-Module 9 Decision Gate** — blocks Module 9.

Choose at session start.
