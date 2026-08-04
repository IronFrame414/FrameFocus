// ============================================================
// Brand — the single source of truth for the PRODUCT's identity.
// ============================================================
//
// Required by M6M §7.1: "Read from the single shared brand source — one module
// both the manifest and any on-screen product name import. Never a literal in
// the manifest."
//
// WHAT BELONGS HERE
//   Facts about the PRODUCT: its name, its home-screen name, the colours the OS
//   uses to identify it. One place, so a future rename is an edit here rather
//   than a sweep across every screen, email and document.
//
// WHAT DOES NOT BELONG HERE
//   Anything about the TENANT. Company name, company logo (companies.logo_url),
//   company brand_color — those are per-contractor data and are read from the
//   database. Client-facing proposals, invoices and change orders are
//   deliberately white-label: they carry the contractor's identity, never this
//   one. Do not "helpfully" add a product footer to them.
//
// ---------------------------------------------------------------------------
// WHY THE COLOURS ARE LITERALS AND NOT IMPORTS FROM ./theme
// ---------------------------------------------------------------------------
// They look like duplicates of theme.ts's `navy`. They are not, and importing
// would be the specific mistake M6M §7.3 exists to prevent:
//
//   - theme.ts `navy` is a UI TOKEN. It colours the app bar and primary text
//     INSIDE the running app. That is a design-system decision (M6M §2).
//   - themeColor / backgroundColor are OS-LEVEL PRODUCT CHROME. They tint the
//     splash screen, the task-switcher card and the status bar — surfaces the
//     user sees BEFORE and AROUND the app, where the product is being
//     identified rather than operated. That is a brand decision.
//
// They carry the same hex TODAY because Josh ruled [S98] that the manifest
// reuses the existing navy token rather than the new icon indigo. That is a
// coincidence of two decisions landing on one value — not one shared constant.
// Aliasing them would mean a future brand-chrome change silently drags the
// in-app UI with it, or the in-app palette blocks the chrome from moving.
// Keep them separate. If they diverge later, nothing breaks.
//
// ---------------------------------------------------------------------------
// THE ICON INDIGO (#3F47CF) IS DELIBERATELY ABSENT
// ---------------------------------------------------------------------------
// Ruled [Josh, S98]: indigo appears ONLY in the phone/PWA app-icon artwork. It
// does not enter the web UI, buttons, backgrounds, or these manifest values.
// It is recorded here so nobody "fixes" the apparent inconsistency between the
// icon and the splash by propagating it. Do not add it to theme.ts either.

export const brand = {
  /** Full product name. Manifest `name`, page titles, on-screen product name. */
  name: 'EZ Contractor Binder',

  /**
   * Manifest `short_name` — what appears under the icon on a phone home
   * screen, and the short form anywhere the full name will not fit (nav
   * wordmark, email from-name context). Ruled [Josh, S98].
   *
   * Kept short on purpose: iOS and Android truncate the home-screen label at
   * roughly 12 characters, and a truncated product name is the most visible
   * possible branding regression (M6M §7.1).
   */
  shortName: 'EZ Binder',

  /**
   * Manifest `theme_color` — status bar and task-switcher card tint.
   * Navy, matching the app bar (M6M §3.1) so the status bar reads as part of
   * the chrome rather than sitting on top of it.
   */
  themeColor: '#14213d',

  /**
   * Manifest `background_color` — the splash screen shown while the app boots.
   *
   * ASSUMPTION, flagged for confirmation. Josh's S98 ruling said the manifest
   * uses "the existing navy/amber tokens". Navy is the only one of the two that
   * works as a full-screen field — amber would be a full-screen orange flash.
   * The tradeoff to be aware of: the app's own page background is #f4f6f9
   * (M6M §2 `surface`), so a navy splash means a dark-to-light transition on
   * every cold start. If that flash reads badly on a real handset, this value
   * — and only this value — becomes #f4f6f9. theme_color stays navy either way.
   */
  backgroundColor: '#14213d',

  /**
   * The amber the LOGO ARTWORK uses — the "Binder" wordmark and the binder tab
   * in every logo-full-*.svg variant (dark / light / ice — the amber is one of
   * the parts they all share; only the kicker fill differs between them).
   *
   * THIS IS NOT theme.ts's `amber`, AND THE DIFFERENCE IS VISIBLE.
   *   logo artwork      #EDA122   <- this constant
   *   theme.ts / accent-500  #f59e0b
   * Two different oranges. Anything that must optically MATCH the wordmark on
   * screen — the landing tagline sitting directly beneath it — has to use this
   * one; `text-accent-500` would sit next to the logo and read as a near-miss
   * rather than a match. Anything that is merely "the UI's amber" (buttons,
   * badges, avatars, event accents) keeps using the Tailwind token.
   *
   * Consumed via style={{}} rather than a Tailwind class on purpose: Tailwind
   * cannot JIT-scan an interpolated arbitrary value like text-[${...}], and
   * hard-coding text-[#EDA122] would re-paste the hex — the exact thing
   * lib/theme.ts exists to stop.
   */
  logoAmber: '#EDA122',
} as const;
