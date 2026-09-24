import { describe, expect, it } from 'vitest';
import { addedAfterSend, sitePhotos } from '@/lib/site-visits/photos';

// [S110 Section A, RULED Josh Q4 → A] The site-visit record shows site-visit
// CAPTURES (files.site_visit_capture), grouped before/after the send at the
// visit's frozen_at.
//
// ⚠️ INVERTED IN PLACE, NOT DELETED (CLAUDE.md S157). This file was
// "visitEraPhotos — the cutoff is promotion" [Josh, 2026-09-23, ruling 4]:
// _"keeps photos up to and including the promotion instant; drops later ones
// and non-images"_ and _"after promotion an undated image is excluded rather
// than guessed"_. Ruling 2 (the lock is at SEND, not promotion) removed the
// premise, and the marker replaced the time cutoff: a later photo taken
// THROUGH THE RECORD is shown (in "added after"), and a Files-tab upload is
// not shown however early it was.

const SENT = '2026-09-23T15:00:00.000Z';
const img = (id: string, created_at: string | null, capture = true) => ({
  id,
  mime_type: 'image/jpeg',
  created_at,
  site_visit_capture: capture,
});

describe('sitePhotos — captures only, split at the send', () => {
  const files = [
    img('on-site', '2026-09-23T13:00:00.000Z'),
    img('at-send', SENT),
    img('added-after-send', '2026-09-23T15:00:01.000Z'),
    img('files-tab-upload', '2026-09-23T12:00:00.000Z', false),
    { id: 'voice', mime_type: 'audio/webm', created_at: '2026-09-23T13:00:00.000Z', site_visit_capture: true },
  ];

  it('keeps every captured IMAGE; drops a Files-tab upload and non-images', () => {
    expect(sitePhotos(files, SENT).map((f) => f.id)).toEqual(['on-site', 'at-send', 'added-after-send']);
  });

  it('groups at the send, inclusive: at-send is BEFORE, one second later is AFTER', () => {
    const byId = Object.fromEntries(sitePhotos(files, SENT).map((f) => [f.id, f.phase]));
    expect(byId).toEqual({ 'on-site': 'before', 'at-send': 'before', 'added-after-send': 'after' });
  });

  it('not yet sent → every capture is "before" (non-vacuous: the later one is still shown)', () => {
    expect(sitePhotos(files, null).map((f) => f.phase)).toEqual(['before', 'before', 'before']);
  });

  it('an undated capture is shown, as "before" — never dropped', () => {
    expect(sitePhotos([img('undated', null)], SENT)).toEqual([{ ...img('undated', null), phase: 'before' }]);
  });

  it('addedAfterSend(): strictly after frozen_at; false with no send or no date', () => {
    expect(addedAfterSend('2026-09-23T15:00:01.000Z', SENT)).toBe(true);
    expect(addedAfterSend(SENT, SENT)).toBe(false);
    expect(addedAfterSend('2026-09-23T15:00:01.000Z', null)).toBe(false);
    expect(addedAfterSend(null, SENT)).toBe(false);
  });
});
