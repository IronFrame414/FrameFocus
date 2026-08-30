import { storageCapBytesFor } from '@/lib/billing/plan-catalog';

/**
 * The storage-cap arithmetic [storage-archive-ai-spec §2] — pure, one place.
 *
 * RULED: warn at 80% and 95%, block NEW user uploads at 100%. Nothing else
 * stops, nothing is deleted automatically. The three capped writers and the
 * Billing/limit-screen displays all read THIS; a second copy of "are we
 * over" is the parity divergence.
 *
 * `usedBytes` is `company_storage_used_bytes()` — the §1 sum, which INCLUDES
 * trashed files. An unknown plan tier gets NO cap (level 'ok', capBytes
 * null): failing open is deliberate, because blocking a customer's uploads
 * over an unrecognised tier string would take their business offline over a
 * bookkeeping gap — the exact thing the §2 ruling forbids.
 */

export type StorageLevel = 'ok' | 'warn80' | 'warn95' | 'blocked';

export interface StorageStatus {
  usedBytes: number;
  capBytes: number | null;
  /** 0–100+, rounded to one decimal; null when there is no cap. */
  usedPct: number | null;
  level: StorageLevel;
}

export function storageStatus(usedBytes: number, planTier: string | null): StorageStatus {
  const capBytes = planTier ? storageCapBytesFor(planTier) : null;
  if (capBytes === null || capBytes <= 0) {
    return { usedBytes, capBytes: null, usedPct: null, level: 'ok' };
  }
  const ratio = usedBytes / capBytes;
  const level: StorageLevel =
    ratio >= 1 ? 'blocked' : ratio >= 0.95 ? 'warn95' : ratio >= 0.8 ? 'warn80' : 'ok';
  return {
    usedBytes,
    capBytes,
    usedPct: Math.round(ratio * 1000) / 10,
    level,
  };
}

/** "12.4 GB" — one formatter for every surface that shows the number. */
export function formatBytes(bytes: number): string {
  const GB = 1024 * 1024 * 1024;
  const MB = 1024 * 1024;
  if (bytes >= GB) return `${(Math.round((bytes / GB) * 10) / 10).toLocaleString('en-US')} GB`;
  if (bytes >= MB) return `${Math.round(bytes / MB).toLocaleString('en-US')} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
