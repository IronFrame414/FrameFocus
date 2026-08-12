'use client';
import { useCallback, useEffect, useState } from 'react';
import { EXPORT_CATEGORIES } from '@/lib/trial/export-categories';
import { CopyPendingLegalReview } from '@/components/trial/copy-pending-legal-review';

export interface ExportStatus {
  id: string;
  state: string;
  bytes_written: number;
  expires_at: string | null;
  last_error: string | null;
  parts: Array<{ name: string; url: string }>;
}

const POLL_MS = 10_000;

/**
 * S138 — the export screen (Part 3.3).
 *
 * ⚠️ THIS SCREEN DOES NOT DRIVE THE JOB, and saying so is the point of the
 * status copy. A cron advances the export every 5 minutes; a large one takes
 * hours and ~58 invocations. So the screen POLLS, and it tells the customer in
 * plain terms that they can close the tab — otherwise the honest answer
 * ("nothing is happening in this browser") reads as a hang.
 */
export function ExportClient({ initialJob }: { initialJob: ExportStatus | null }) {
  const [selected, setSelected] = useState<string[]>(EXPORT_CATEGORIES.map((c) => c.key));
  const [format, setFormat] = useState<'zip' | 'zip_csv'>('zip');
  const [job, setJob] = useState<ExportStatus | null>(initialJob);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (id: string) => {
    const res = await fetch(`/api/trial/export/${id}`);
    if (res.ok) setJob(await res.json());
  }, []);

  useEffect(() => {
    if (!job || job.state === 'complete' || job.state === 'failed' || job.state === 'expired') {
      return;
    }
    const t = setInterval(() => void refresh(job.id), POLL_MS);
    return () => clearInterval(t);
  }, [job, refresh]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/trial/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: selected, format }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not start the export');
      await refresh(body.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the export');
    } finally {
      setBusy(false);
    }
  }

  const running = job && (job.state === 'pending' || job.state === 'running');

  return (
    <div>
      <CopyPendingLegalReview topic="what the export contains, how long the link lasts, and what happens to the data afterwards" />

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-gray-900">What to include</h2>
        <ul className="mt-2 space-y-2">
          {EXPORT_CATEGORIES.map((c) => (
            <li key={c.key} className="flex items-start gap-2">
              <input
                id={`cat-${c.key}`}
                type="checkbox"
                className="mt-1"
                checked={selected.includes(c.key)}
                onChange={(e) =>
                  setSelected((s) =>
                    e.target.checked ? [...s, c.key] : s.filter((k) => k !== c.key)
                  )
                }
              />
              <label htmlFor={`cat-${c.key}`} className="text-sm text-gray-800">
                {c.label}
              </label>
            </li>
          ))}
        </ul>

        {!selected.includes('files') && (
          <p className="mt-3 rounded border border-gray-300 bg-gray-50 p-3 text-sm text-gray-700">
            Files and photos are not selected. Records that reference a file will keep the file
            name, but the file itself will not be in the export.
          </p>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-gray-900">Format</h2>
        <div className="mt-2 flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={format === 'zip'}
              onChange={() => setFormat('zip')}
            />
            Zip (JSON)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={format === 'zip_csv'}
              onChange={() => setFormat('zip_csv')}
            />
            Zip (CSV bundle — opens in a spreadsheet)
          </label>
        </div>
      </section>

      <button
        type="button"
        onClick={start}
        disabled={busy || selected.length === 0 || !!running}
        data-testid="start-export"
        className="mt-6 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {busy ? 'Starting…' : 'Prepare export'}
      </button>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {job && (
        <section className="mt-8 rounded-md border border-gray-200 p-4" data-testid="export-status">
          <h2 className="text-sm font-semibold text-gray-900">Latest export</h2>
          <p className="mt-1 text-sm text-gray-700">
            Status: <span className="font-medium">{job.state}</span> —{' '}
            {(job.bytes_written / 1048576).toFixed(1)} MB written so far
          </p>

          {running && (
            <p className="mt-2 text-sm text-gray-600">
              This runs in the background and can take a while for a large account. You can close
              this page and come back — it will keep going without you.
            </p>
          )}

          {job.state === 'failed' && (
            <p className="mt-2 text-sm text-red-700">{job.last_error ?? 'The export failed.'}</p>
          )}

          {job.state === 'expired' && (
            <p className="mt-2 text-sm text-gray-600">
              This export&apos;s download links have expired. Prepare a new one.
            </p>
          )}

          {job.state === 'complete' && (
            <div className="mt-3">
              {job.parts.length > 1 && (
                <p className="mb-2 text-sm text-gray-600">
                  The export is split into {job.parts.length} parts. Download all of them — each is
                  a valid zip, and together they are the whole export.
                </p>
              )}
              <ul className="space-y-1">
                {job.parts.map((p) => (
                  <li key={p.name}>
                    <a className="text-sm text-blue-700 underline" href={p.url}>
                      {p.name}
                    </a>
                  </li>
                ))}
              </ul>
              {job.expires_at && (
                <p className="mt-2 text-xs text-gray-500">
                  Links expire {new Date(job.expires_at).toLocaleString()}.
                </p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
