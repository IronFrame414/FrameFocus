import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// S110 H, ruling 3 — WHERE user-entered text is shown in the READER's language.
// [RULED Josh: "User-entered text is translated for the READER, wherever it is
// displayed — /m AND /dashboard … a /m-only translation of user content would
// deliver none of the value."] Pins each wired surface so a refactor cannot
// quietly drop it. SiteVisitRecord joined after Section A rewrote it.

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const SURFACES: Array<[string, RegExp]> = [
  // shared by /m and /dashboard — someone else's message, never your own
  ['../components/chat/chat-thread.tsx', /\{mine \? m\.body : <UserText text=\{m\.body\} \/>\}/],
  // /m
  ['../app/m/logs/[logId]/page.tsx', /<UserText text=\{log\.work_performed\} \/>/],
  ['../app/m/logs/log-rows.tsx', /<UserText text=\{excerpt\(r\.work_performed, t\)\} \/>/],
  ['../app/m/p/[projectId]/punch/[itemId]/page.tsx', /<UserText text=\{item\.title\} \/>/],
  // /dashboard — Josh reads the crew's Spanish in English
  ['../app/dashboard/field-ops/[projectId]/daily-logs/[logId]/page.tsx', /<UserText text=\{log\.work_performed\} \/>/],
  // [S110 H after A] the site-visit record — one component, /m and both desktop
  // mounts: the notes, the measurement areas and the voice transcripts.
  ['../components/site-visits/site-visit-record.tsx', /<UserText text=\{note\.body\} \/>/],
  ['../components/site-visits/voice-notes.tsx', /<UserText text=\{/],
];

describe('S110 H — user-entered text is shown in the reader\'s language', () => {
  it.each(SURFACES)('%s', (file, pattern) => {
    const src = read(file);
    expect(src).toMatch(/import \{ UserText \} from '@\/components\/i18n\/user-text'/);
    expect(src).toMatch(pattern);
  });

  it('UserText never shows anything but the original unless a translation exists (FILL-H.8)', () => {
    const src = read('../components/i18n/user-text.tsx');
    // the only added element is gated on a real translation
    expect(src).toMatch(/\{translated \? \(/);
    expect(src).toMatch(/const shown = translated && !showOriginal \? translated : source;/);
  });
});
