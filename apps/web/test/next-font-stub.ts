// Vitest stub for `next/font/google`.
//
// next/font is a BUILD-TIME transform: the real module is rewritten by the
// Next compiler into a generated font loader, so calling it in a plain Node
// process throws "Barlow is not a function". Any test that imports
// app/layout.tsx — even one that only reads its `metadata` export — pulls the
// font calls in at module scope and dies before a single assertion runs.
//
// The stub returns the same shape layout.tsx consumes (`.variable`, used in a
// className). Nothing under test asserts on fonts; ui-01 §S2 owns those and
// they are a visual concern a DOM-less test could not check anyway.
//
// Mirrors the existing server-only-stub.ts aliasing in vitest.config.ts. Add a
// family here if layout.tsx ever loads another one.

type StubFont = { variable: string; className: string; style: { fontFamily: string } };

const stub = (name: string) => (): StubFont => ({
  variable: `--font-${name}`,
  className: `${name}-stub`,
  style: { fontFamily: name },
});

export const Barlow = stub('barlow');
export const IBM_Plex_Mono = stub('plex-mono');
