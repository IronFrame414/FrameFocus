// The DOM id of the tab bar's photo-library input (mobile-shell.tsx).
//
// [S111 Part Two, RULED Q16] M-8's "Add photos" button is a <label htmlFor> on
// THIS input rather than an input of its own, so the gallery and the tab bar
// share one pipeline: project from the URL, native burst, offline queue. A
// plain module, not the shell, because the gallery page is a server component
// and a constant exported from a 'use client' file reaches it as a reference,
// not a string.
export const M_LIBRARY_INPUT_ID = 'm-photo-library-input';
