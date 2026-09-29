'use client';

import type { UploadItem, UploadStatus } from '@/lib/uploads/upload-batch';
import { summarizeBatch } from '@/lib/uploads/upload-batch';
import { color, font, secondaryButtonStyle } from '@/lib/theme';
import { useT } from '@/components/i18n/language-provider';
import type { MsgKey } from '@/lib/i18n/messages';

// S112 queue 2b — per-file progress for a multi-file upload, and the one
// "retry the failed ones" control. Rendered by every control that uses
// lib/uploads/upload-batch.ts, so a failed file reads the same everywhere.
//
// [S116 F-12] System text goes through t(): /m now renders this list (the site
// visit record), and the /m anti-rot guard allows no hard-coded string. The
// English is byte-identical to the literals it replaces, and to
// summarizeBatch()'s message. _Superseded, quoted:_ `const LABEL:
// Record<UploadStatus, string> = { queued: 'Waiting', uploading: 'Uploading…',
// done: 'Uploaded', failed: 'Failed', skipped: 'Not attempted' };`

const STATUS_KEY: Record<UploadStatus, MsgKey> = {
  queued: 'photos.batch.queued',
  uploading: 'photos.batch.uploading',
  done: 'photos.batch.done',
  failed: 'photos.batch.failed',
  skipped: 'photos.batch.skipped',
};

const TONE: Record<UploadStatus, string> = {
  queued: color.muted,
  uploading: color.primary,
  done: color.success,
  failed: color.danger,
  skipped: color.danger,
};

export function UploadBatchList({
  items,
  busy,
  onRetry,
  testId = 'upload-batch',
}: {
  items: UploadItem[];
  busy: boolean;
  onRetry: () => void;
  testId?: string;
}) {
  const t = useT();
  if (items.length === 0) return null;
  const { done, failed, skipped } = summarizeBatch(items);
  const retryable = failed.length + skipped.length;
  const names = (rows: UploadItem[]) => rows.map((r) => r.file.name).join(', ');
  const parts: string[] = [];
  if (failed.length)
    parts.push(
      t('photos.batch.failedList', { n: failed.length, total: items.length, names: names(failed) })
    );
  if (skipped.length)
    parts.push(
      t('photos.batch.skippedList', {
        n: skipped.length,
        reason: skipped[0].error ?? 'stopped',
        names: names(skipped),
      })
    );
  const message = parts.length ? parts.join(' ') : null;

  return (
    <div data-testid={testId} style={{ fontFamily: font.sans, fontSize: '13px' }}>
      <p data-testid={`${testId}-count`} style={{ margin: '0 0 6px', color: color.muted }}>
        {t('photos.batch.count', { done, total: items.length })}
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items.map((it) => (
          <li
            key={it.key}
            data-testid={`${testId}-row`}
            data-status={it.status}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '3px 0',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {it.file.name}
            </span>
            <span style={{ color: TONE[it.status], whiteSpace: 'nowrap' }} title={it.error}>
              {t(STATUS_KEY[it.status])}
            </span>
          </li>
        ))}
      </ul>
      {!busy && message && (
        <p
          role="alert"
          data-testid={`${testId}-error`}
          style={{ margin: '8px 0 6px', color: color.danger }}
        >
          {message}
        </p>
      )}
      {!busy && retryable > 0 && (
        <button
          type="button"
          data-testid={`${testId}-retry`}
          onClick={onRetry}
          style={secondaryButtonStyle}
        >
          {retryable === 1
            ? t('photos.batch.retryOne')
            : t('photos.batch.retryMany', { n: retryable })}
        </button>
      )}
    </div>
  );
}
