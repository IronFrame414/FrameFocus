# docs/claude/superseded.md

> Superseded direction, kept as a record so nobody reconstructs it by accident. Verbatim from CLAUDE.md (main `80e15bad`).
> **Nothing here was rewritten.** CLAUDE.md carries the operative statement and links here.


<!-- CLAUDE.md lines 556–569 -->

### ~~React Native (Mobile — Expo)~~ — **SUPERSEDED [S97, 2026-08-03]**

**Mobile is a PWA** (see the ruling under Technology Stack). Nothing below is in force; it is kept
as a record of the direction that was abandoned, so a future reader does not reconstruct it by
accident.

- ~~Expo Router for navigation~~
- ~~Expo SDK managed workflow (no bare workflow)~~
- ~~NativeWind (Tailwind for React Native) for styling consistency with web~~
- ~~Offline-first for field operations using Expo SQLite with sync queue~~ — **the requirement
  survives, the mechanism does not.** Offline field capture is now a web problem (service worker +
  a browser-side queue), not an Expo SQLite one. See TECH_DEBT #118 for the one seam that already
  exists in the web code.
