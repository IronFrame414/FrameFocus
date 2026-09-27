'use client';

import type { UploadItem, UploadStatus } from '@/lib/uploads/upload-batch';
import { summarizeBatch } from '@/lib/uploads/upload-batch';
import { color, font, secondaryButtonStyle } from '@/lib/theme';

// S112 queue 2b — per-file progress for a multi-file upload, and the one
// "retry the failed ones" control. Rendered by every control that uses
// lib/uploads/upload-batch.ts, so a failed file reads the same everywhere.

const LABEL: Record<UploadStatus, string> = {
  queued: 'Waiting',
  uploading: 'Uploading…',
  done: 'Uploaded',
  failed: 'Failed',
  skipped: 'Not attempted',
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
  if (items.length === 0) return null;
  const { done, failed, skipped, message } = summarizeBatch(items);
  const retryable = failed.length + skipped.length;

  return (
    <div data-testid={testId} style={{ fontFamily: font.sans, fontSize: '13px' }}>
      <p data-testid={`${testId}-count`} style={{ margin: '0 0 6px', color: color.muted }}>
        {done} of {items.length} uploaded
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
              {LABEL[it.status]}
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
          Retry {retryable === 1 ? 'the failed file' : `the ${retryable} failed files`}
        </button>
      )}
    </div>
  );
}
