// ESLint configuration.
//
// ⚠️ WAS `.eslintrc.json` UNTIL S163. It became a JS file for one reason: the
// two overrides below need to say WHY, and JSON cannot carry a comment. A
// suppression without a reason is the thing that turns into "16 pre-existing
// warnings" nobody reads for six sessions.
//
// The 16 warnings this replaces were reported as "pre-existing, 0 introduced"
// in five consecutive verification runs and never actually read. When they were
// read, they were three groups: five FALSE POSITIVES, eight DELIBERATE choices,
// and three real `exhaustive-deps` findings — one of which could show a user
// another project's chat history. **The three were fixed in code, not
// suppressed.** Only the first two groups are below.
module.exports = {
  extends: 'next/core-web-vitals',
  overrides: [
    {
      // ────────────────────────────────────────────────────────────────────
      // GROUP 2 — FALSE POSITIVES. These three files render through
      // `@react-pdf/renderer`, whose `<Image>` component has NO `alt` prop at
      // all. The rule matches the tag NAME and assumes HTML. Adding `alt`
      // would put an unknown prop on a PDF primitive — a change that looks
      // like an accessibility fix and is not one.
      //
      // Scoped to the three PDF templates by name, so a real `<img>` anywhere
      // else is still caught.
      // ────────────────────────────────────────────────────────────────────
      files: [
        'lib/change-orders/co-template.tsx',
        'lib/invoices/invoice-template.tsx',
        'lib/proposal/proposal-template.tsx',
      ],
      rules: { 'jsx-a11y/alt-text': 'off' },
    },
    {
      // ────────────────────────────────────────────────────────────────────
      // GROUP 1 — DELIBERATE `<img>`, not an oversight. Two distinct cases:
      //
      //   (a) The PRODUCT LOGOS are local SVGs. `next/image` cannot optimise an
      //       SVG without `images.dangerouslyAllowSVG: true`, a flag that lets
      //       script-bearing SVG through the optimiser. That is a poor trade
      //       for a logo that is already a few KB and already the right size.
      //       `dashboard-shell.tsx` explains at length why the lockup must stay
      //       one SVG file rather than be rebuilt as markup — same asset.
      //
      //   (b) `settings-form.tsx` renders the TENANT's logo and the contractor's
      //       SIGNATURE from Supabase Storage. Those would need `remotePatterns`
      //       for the storage host, and they are user-uploaded images of
      //       arbitrary dimensions displayed inside a fixed box via
      //       `object-fit: contain` — which is exactly what `<img>` is for.
      //
      // Scoped file by file rather than by directory, so a NEW `<img>` in a NEW
      // file still warns and gets its own decision.
      // ────────────────────────────────────────────────────────────────────
      files: [
        'app/page.tsx',
        'app/sign-in/sign-in-form.tsx',
        'app/sign-up/page.tsx',
        'app/forgot-password/page.tsx',
        'app/reset-password/page.tsx',
        'app/dashboard/dashboard-shell.tsx',
        'app/dashboard/settings/settings-form.tsx',
      ],
      rules: { '@next/next/no-img-element': 'off' },
    },
  ],
};
