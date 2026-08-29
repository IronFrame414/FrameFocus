'use client';

// PO module R6 — "your assigned lines": the signed-in member's issued PO
// lines on this project, with the flag-missing control (R7 — the flag rides
// the route so the notification fires). ONE component for both deliveries
// surfaces (desktop tab and /m M-15) — the parity rule. Renders NO currency:
// /m's D-9/A-35 money cut is the stricter surface and the list needs none.

import { useEffect, useState } from 'react';
import {
  flagPoItemMissing,
  listMyAssignedLines,
  type MyAssignedLine,
} from '@/lib/services/po-lines-client';

export function MyPoLines({ projectId }: { projectId: string }) {
  const [lines, setLines] = useState<MyAssignedLine[] | null>(null);
  const [flaggingId, setFlaggingId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    void listMyAssignedLines(projectId).then((rows) => {
      if (active) setLines(rows);
    });
    return () => {
      active = false;
    };
  }, [projectId]);

  // Nothing assigned → no section at all; the list is an affordance, not
  // a fixture.
  if (lines === null || lines.length === 0) return null;

  async function submitFlag(itemId: string) {
    setBusy(true);
    setError(null);
    const res = await flagPoItemMissing(itemId, note);
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'Could not flag the line.');
      return;
    }
    setFlaggedIds((prev) => new Set(prev).add(itemId));
    setFlaggingId(null);
    setNote('');
  }

  return (
    <section data-testid="my-po-lines" className="mb-6">
      <div className="mb-2 text-[13px] font-bold uppercase text-[#14213d]">
        Your assigned lines{' '}
        <span className="text-[11px] font-medium normal-case text-[#9aa1ac]">
          · pick these up; flag anything you can&rsquo;t get
        </span>
      </div>
      <ul className="rounded-[13px] border border-[#e6e9ef] bg-white px-4">
        {lines.map((line) => (
          <li
            key={line.itemId}
            data-testid="my-po-line"
            className="border-b border-[#f1f3f7] py-3 last:border-b-0"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-[#14213d]">
                  {line.description}
                </p>
                <p className="font-mono text-[11px] text-[#9aa1ac]">
                  {line.poNumber ?? 'PO'}
                  {line.vendorName ? ` · ${line.vendorName}` : ''}
                </p>
              </div>
              {flaggedIds.has(line.itemId) ? (
                <span className="text-[12px] font-semibold text-[#b45309]">
                  Flagged — the office is told
                </span>
              ) : flaggingId !== line.itemId ? (
                <button
                  className="text-[13px] font-semibold text-[#c0362c]"
                  disabled={busy}
                  onClick={() => {
                    setFlaggingId(line.itemId);
                    setNote('');
                    setError(null);
                  }}
                >
                  Can&rsquo;t get it…
                </button>
              ) : null}
            </div>
            {flaggingId === line.itemId && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Why? (backordered, out of stock…)"
                  className="min-w-0 flex-1 rounded-[8px] border border-[#e0e4ea] px-3 py-2 text-[13px]"
                />
                <button
                  className="rounded-[8px] bg-[#c0362c] px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
                  disabled={busy}
                  onClick={() => void submitFlag(line.itemId)}
                >
                  Flag
                </button>
                <button
                  className="text-[13px] font-semibold text-[#6b7280]"
                  disabled={busy}
                  onClick={() => setFlaggingId(null)}
                >
                  Cancel
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-[12px] font-semibold text-[#c0362c]">{error}</p>}
    </section>
  );
}
