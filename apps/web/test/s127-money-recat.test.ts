/**
 * S127 R-9 [RULED Josh, 2026-10-03, ASK-R9 -> A] — THE UI HALF.
 *
 * The database half (a PM or PE may not move a file OUT of contracts,
 * change_orders or invoices) is test/s127-money-recat.live.ts. This file
 * proves the condition attached to the ruling: no surface OFFERS a PM or PE
 * that move. No surface recategorises an existing file at all, and the one
 * client writer, `updateFile`, no longer accepts `category`. That is checked
 * by the type-checker (`npm run type-check` covers test files): the
 * `@ts-expect-error` below FAILS the build if `category` comes back.
 */
import { describe, expect, it } from 'vitest';
import type { updateFile } from '@/lib/services/files-client';

type FileUpdates = Parameters<typeof updateFile>[1];

describe('R-9 — no client surface can recategorise an existing file', () => {
  it('updateFile does not accept `category` (compile-time; R-4: draw no control the DB refuses)', () => {
    // @ts-expect-error — `category` was removed from updateFile on purpose (R-9).
    const recategorise: FileUpdates = { category: 'photos' };
    // CONTROL: a field it does accept compiles without the directive.
    const rename: FileUpdates = { file_name: 'x.png' };
    expect(Object.keys(recategorise)).toEqual(['category']);
    expect(Object.keys(rename)).toEqual(['file_name']);
  });
});
