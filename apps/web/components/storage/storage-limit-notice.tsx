'use client';

import { useState } from 'react';
import Link from 'next/link';
import { emptyTrash } from '@/lib/services/files-client';
import { formatBytes, type StorageStatus } from '@/lib/billing/storage-cap';

// The limit screen [storage-archive-ai-spec §2, RULED]. ⚠️ NOT an error — a
// limit with four ways out, and it says all five ruled things: the numbers,
// the trash rule + who can permanently delete, Empty Trash right here
// (company-wide — the cap is company-wide, Q3), the archive, the upgrade.

export function StorageLimitNotice({
  status,
  canEmptyTrash,
  projectId,
  onFreedSpace,
}: {
  status: StorageStatus;
  /** Owner/Admin — the page tells the component; RLS enforces it underneath. */
  canEmptyTrash: boolean;
  /** When set, "Download a project archive" links to this project's files. */
  projectId?: string;
  onFreedSpace?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function runEmptyTrash() {
    setBusy(true);
    const r = await emptyTrash(); // company-wide: every project's trash
    setBusy(false);
    setResult(
      r.errors.length === 0
        ? `Deleted ${r.deleted} file${r.deleted === 1 ? '' : 's'} from trash.`
        : `Deleted ${r.deleted} of ${r.found}; ${r.errors.length} failed.`
    );
    if (r.deleted > 0) onFreedSpace?.();
  }

  return (
    <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-5 text-sm text-gray-800">
      <p className="font-semibold text-base">
        Storage limit reached — {formatBytes(status.usedBytes)} of{' '}
        {status.capBytes !== null ? formatBytes(status.capBytes) : 'your plan'} used
      </p>
      <p className="mt-2">
        New uploads are paused. <strong>Everything else keeps working</strong> — invoicing,
        scheduling, time tracking and your existing files are unaffected.
      </p>
      <p className="mt-2">
        Files in <strong>Trash still count</strong> until they are permanently deleted, and
        permanent delete is an <strong>Owner or Admin</strong> action. Four ways to free space:
      </p>
      <ul className="mt-2 list-disc pl-5 space-y-1">
        <li>
          <strong>Empty Trash</strong>
          {canEmptyTrash ? (
            <>
              {' — '}
              <button
                onClick={runEmptyTrash}
                disabled={busy}
                className="underline font-semibold text-amber-900 disabled:opacity-50"
              >
                {busy ? 'Deleting…' : 'empty it now (cannot be undone)'}
              </button>
              {result && <span className="ml-2 text-gray-600">{result}</span>}
            </>
          ) : (
            <> — ask an Owner or Admin; only they can permanently delete.</>
          )}
        </li>
        <li>
          <strong>Download a project archive</strong> and then delete the project —{' '}
          <Link
            href={projectId ? `/dashboard/projects/${projectId}/files` : '/dashboard/projects'}
            className="underline"
          >
            start from the project&apos;s files
          </Link>
          .
        </li>
        <li>Permanently delete individual files from each project&apos;s Trash.</li>
        <li>
          <Link href="/dashboard/billing/plans" className="underline">
            <strong>Upgrade your plan</strong>
          </Link>{' '}
          for more storage.
        </li>
      </ul>
    </div>
  );
}
