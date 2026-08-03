# `apps/mobile` — PARKED [S97, 2026-08-03]

**This package is superseded and should not be built on.** It is retained, not deleted, pending
Josh's call.

## The ruling

**Mobile is a PWA — the existing Next.js web app installed to the home screen. Not React Native.**

Recorded in [`CLAUDE.md`](../../CLAUDE.md) → Technology Stack → *"MOBILE IS A PWA, NOT REACT
NATIVE"*. Josh's reasons, as given:

1. He does not want to deal with the **app store** at this time.
2. **iOS requires a home-screen install for Web Push anyway** (Safari 16.4+), so the PWA path is
   also the precondition for notifications on iPhone — see [`GATED.md`](../../GATED.md).

## What is actually here

Two files and a manifest. Nothing was ever built.

```
apps/mobile/
├── package.json      Expo ~52 · expo-router ~4 · react-native 0.76 · @framefocus/shared
├── tsconfig.json
└── app/
    ├── _layout.tsx
    └── index.tsx
```

No screens, no navigation, no Supabase wiring, no EAS configuration. TECH_DEBT #30 has always
described it as a placeholder.

## Why it is parked rather than deleted

Deleting it is a small but non-zero change with more edges than it first appears, and it is **Josh's
call, not a tidy-up**. What deletion would involve:

- `rm -rf apps/mobile` — the package itself.
- **Turborepo / npm workspaces:** the root `package.json` workspace glob picks this up. Removing the
  directory is enough for a glob; an explicit workspace entry would need editing too. Verify with a
  clean `npm install` and `npm run type-check` — `@framefocus/mobile` currently contributes one of
  the **5 tasks** every `turbo type-check` run reports, so that count changes and any doc quoting it
  should be checked.
- **`.devcontainer/devcontainer.json`** forwards port **8081** for Expo. Harmless if left, stale if
  kept.
- **`CLAUDE.md`** references Expo in four further places beyond the ones already amended: the
  Development Environment port-forwarding note, the "Expo EAS: Cloud builds triggered from
  Codespaces terminal" line, and the monorepo tree comment (already updated to PARKED).
- **`packages/shared`** is described as "shared across web + mobile". Its contents are pure
  TypeScript and are consumed by the web app, so nothing breaks — but the wording becomes wrong.
- **TECH_DEBT #30** would close rather than merely being superseded.

None of that is difficult. It is listed so that when Josh does decide, the change is one pass rather
than a week of stale references.

## If you are here because a spec said "the mobile app"

It means **the web app on a phone**. Anything previously deferred to this package now belongs to the
PWA work: the responsive shell (TECH_DEBT #101), the offline queue (TECH_DEBT #118), and the
manifest / icons / service worker that Web Push depends on (GATED.md).
