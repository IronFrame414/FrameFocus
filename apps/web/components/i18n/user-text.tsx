'use client';

import { useEffect, useState } from 'react';
import { useReaderLang, useT } from '@/components/i18n/language-provider';
import type { Lang } from '@/lib/i18n/lang';

/**
 * S110 H [RULED Josh, ruling 3, Q13] — TEXT SOMEONE TYPED, SHOWN IN THE READER'S
 * LANGUAGE, on /m AND /dashboard.
 *
 *   · translated → the translation, and a quiet "Translated from Spanish ·
 *     show original" line (Q13: the original is one tap away);
 *   · already in the reader's language → the original, no chrome;
 *   · pending or failed → THE ORIGINAL, never a blank (FILL-H.8), and nothing
 *     added to it (the state is on `data-usertext-state` and a tooltip).
 *
 * Requests are BATCHED: every UserText on a screen that mounts in the same tick
 * goes out in one POST, and results are remembered for the session.
 *
 * ⚠️ RULING 5: never rendered in anything client-facing
 * (test/s110-client-facing-english.test.ts).
 */

type Result = { sourceLang: string | null; translated: string | null; failed?: boolean };

const memo = new Map<string, Result>();
const inflight = new Map<string, Promise<Result>>();
let queue: Array<{ text: string; target: Lang; resolve: (r: Result) => void }> = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  const pending = queue;
  queue = [];
  for (const target of ['en', 'es'] as const) {
    const group = pending.filter((p) => p.target === target);
    for (let i = 0; i < group.length; i += 50) {
      const chunk = group.slice(i, i + 50);
      fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: chunk.map((c) => c.text), target }),
      })
        .then(async (res) => {
          const body = res.ok ? ((await res.json()) as { results?: Result[] }) : {};
          chunk.forEach((c, j) =>
            c.resolve(body.results?.[j] ?? { sourceLang: null, translated: null, failed: true })
          );
        })
        .catch(() =>
          chunk.forEach((c) => c.resolve({ sourceLang: null, translated: null, failed: true }))
        );
    }
  }
}

function request(text: string, target: Lang): Promise<Result> {
  const key = `${target}\u0000${text}`;
  const hit = memo.get(key);
  if (hit) return Promise.resolve(hit);
  const running = inflight.get(key);
  if (running) return running;
  const p = new Promise<Result>((resolve) => {
    queue.push({ text, target, resolve });
    if (!timer) timer = setTimeout(flush, 30);
  }).then((r) => {
    inflight.delete(key);
    if (!r.failed) memo.set(key, r);
    return r;
  });
  inflight.set(key, p);
  return p;
}

export function UserText({
  text,
  className,
  testId,
}: {
  text: string | null | undefined;
  className?: string;
  testId?: string;
}) {
  const reader = useReaderLang();
  const t = useT();
  const [result, setResult] = useState<Result | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  // "translating…" only if it is SLOW — most reads are cache hits, and a note
  // flashing under every line of English would be noise for an English reader.
  const [slow, setSlow] = useState(false);
  const source = (text ?? '').trim() ? (text as string) : null;

  useEffect(() => {
    setResult(null);
    setSlow(false);
    if (!source) return;
    let live = true;
    const slowTimer = setTimeout(() => live && setSlow(true), 800);
    void request(source, reader).then((r) => live && setResult(r));
    return () => {
      live = false;
      clearTimeout(slowTimer);
    };
  }, [source, reader]);

  if (!source) return null;
  const translated = result?.translated ?? null;
  const shown = translated && !showOriginal ? translated : source;
  const from =
    result?.sourceLang === 'es' ? t('lang.es') : result?.sourceLang === 'en' ? t('lang.en') : null;

  // Pending or failed → the ORIGINAL, with no added line at all (Q13, FILL-H.8).
  // A visible "translating…" / "unavailable" note under every line of text was
  // noise for a reader already in the right language, and it changed the text
  // of every element a test or a screen reader reads. The state is still
  // exposed: `data-usertext-state`, and a tooltip when it failed.
  const state =
    result === null ? 'pending' : result.failed ? 'failed' : translated ? 'translated' : 'original';
  return (
    <span
      className={className}
      data-testid={testId}
      data-usertext-state={state}
      data-translated={translated && !showOriginal ? 'true' : 'false'}
      title={
        state === 'failed' || (state === 'pending' && slow)
          ? t(state === 'failed' ? 'usertext.unavailable' : 'usertext.translating')
          : undefined
      }
    >
      <span style={{ whiteSpace: 'pre-wrap' }}>{shown}</span>
      {translated ? (
        <span style={{ display: 'block', fontSize: '11px', color: '#8792a8' }}>
          {from ? t('usertext.translatedFrom', { lang: from }) : null}
          {from ? ' · ' : null}
          <button
            type="button"
            data-testid="usertext-toggle"
            // [S112 audit F7] Stop here. On /m/logs this sits INSIDE a row
            // <Link>, and Next's Link navigates on any click that bubbles up
            // un-prevented — so tapping "show original" opened the log instead.
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowOriginal((v) => !v);
            }}
            // …and a 44px-tall target (M6M §2) around the unchanged 11px text;
            // the negative margin keeps the line where it was. Was 74x14.
            style={{
              background: 'none',
              border: 'none',
              padding: '15px 0',
              margin: '-15px 0',
              color: '#2f49d1',
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            {showOriginal ? t('usertext.showTranslation') : t('usertext.showOriginal')}
          </button>
        </span>
      ) : null}
    </span>
  );
}
