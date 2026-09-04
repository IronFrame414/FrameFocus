'use client';

// PO module 18b — the line table with cost, lifecycle and assignment
// (po-module-spec.md §6). What each piece obeys:
//   · §1  — every figure is COST; sell never appears on a PO.
//   · R-L1 — legacy tolerance: lines without unit_cost render em-dashes, no
//     footing row renders, and the typed header total stands. Never zeros,
//     never an error.
//   · R-Q5 — per-line issue: tick draft lines, one Issue action; the RPC
//     numbers the PO (R-L3), foots the total and syncs the commitment.
//   · R-L4 — after issue: Email to vendor (disabled WITH THE REASON when no
//     addressable vendor — never offered-then-failed) and Download PDF.
//   · R6.2 — assignment per line, staff only (the INSERT policy enforces).
//   · "Against the estimate" renders ONLY when budgeted figures arrived —
//     project_budget_amounts is Owner/Admin at the DB, so a PM's props carry
//     none and the panel simply isn't there (less, not nothing).

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  assignMemberToPoItem,
  issuePoLines,
  markPoLinesPurchased,
  unassignPoItemAssignment,
} from '@/lib/services/po-lines-client';

export interface PanelLine {
  id: string;
  description: string;
  qty: number;
  unit: string | null;
  unitCost: number | null;
  lineStatus: 'draft' | 'issued' | 'purchased' | 'flagged';
  flagNote: string | null;
  costCode: string | null;
  assignments: { id: string; memberId: string; name: string }[];
}

export interface StaffOption {
  memberId: string;
  name: string;
}

const fmt = (v: number) =>
  `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_STYLE: Record<PanelLine['lineStatus'], { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'bg-[#eef1f6] text-[#7b8699]' },
  issued: { label: 'Issued', cls: 'bg-[#e8ecfb] text-blue' },
  purchased: { label: 'Purchased', cls: 'bg-[#e6f0e9] text-[#1f8f4e]' },
  flagged: { label: 'Flagged missing', cls: 'bg-[#fdece0] text-[#b45309]' },
};

export function PoLinesPanel({
  poId,
  poStatus,
  lines,
  staff,
  budgetedByCode,
  canIssue,
  canReview,
  canAssign,
  vendorEmailState,
}: {
  poId: string;
  poStatus: 'draft' | 'issued' | 'closed' | 'voided';
  lines: PanelLine[];
  staff: StaffOption[];
  /** cost_code → budgeted cost. EMPTY for a reader the amounts floor filters
   *  (PM/foreman/crew) — the comparison panel then does not render. */
  budgetedByCode: Record<string, number>;
  canIssue: boolean; // O/A/PM
  canReview: boolean; // O/A
  canAssign: boolean; // O/A/PM
  vendorEmailState: 'ok' | 'no-vendor' | 'no-email';
}) {
  const router = useRouter();
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assigningLine, setAssigningLine] = useState<string | null>(null);

  // A closed OR voided PO is terminal — no issue/review/assign controls. A
  // voided PO is frozen at the DB, so offering a control that can't succeed is
  // the anti-pattern this project rules against by name.
  const readOnly = poStatus === 'closed' || poStatus === 'voided';
  const lineBearing = lines.some((l) => l.unitCost != null);
  const draftLines = lines.filter((l) => l.lineStatus === 'draft');
  const openForReview = lines.filter((l) => l.lineStatus === 'issued' || l.lineStatus === 'flagged');

  // Ordered so purchased lines sink to the bottom and leave the open PO (R6.5).
  const ordered = useMemo(() => {
    const rank: Record<PanelLine['lineStatus'], number> = { draft: 0, issued: 1, flagged: 2, purchased: 3 };
    return [...lines].sort((a, b) => rank[a.lineStatus] - rank[b.lineStatus]);
  }, [lines]);

  const groups = useMemo(() => {
    const map = new Map<string, PanelLine[]>();
    for (const line of ordered) {
      const key = line.costCode ?? '';
      const list = map.get(key) ?? [];
      list.push(line);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [ordered]);

  const footed = lines.reduce(
    (sum, l) => (l.unitCost != null ? sum + Math.round(l.qty * l.unitCost * 100) / 100 : sum),
    0
  );

  const orderedByCode = useMemo(() => {
    const map: Record<string, number> = {};
    for (const l of lines) {
      if (l.unitCost == null || l.lineStatus === 'draft') continue;
      const key = l.costCode ?? 'No category';
      map[key] = Math.round(((map[key] ?? 0) + l.qty * l.unitCost) * 100) / 100;
    }
    return map;
  }, [lines]);

  async function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const result = await fn();
    setBusy(false);
    if (!result.success) {
      setError(result.error ?? 'Action failed.');
      return;
    }
    setTicked(new Set());
    router.refresh();
  }

  const toggle = (id: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const tickedDrafts = [...ticked].filter((id) => draftLines.some((l) => l.id === id));
  const tickedOpen = [...ticked].filter((id) => openForReview.some((l) => l.id === id));

  return (
    <div className="mb-4 rounded-[13px] border border-[#e4e8ef] bg-white p-[16px]" data-testid="po-lines-panel">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[13px] font-bold uppercase text-navy">
          Lines{' '}
          <span className="text-[11px] font-medium normal-case tracking-normal text-[#9aa4b8]">
            — cost only; the client price never appears on a PO
          </span>
        </div>
        {!readOnly && (
          <div className="flex gap-2">
            {canIssue && tickedDrafts.length > 0 && (
              <button
                type="button"
                data-testid="po-issue-lines"
                disabled={busy}
                onClick={() => void run(() => issuePoLines(poId, tickedDrafts))}
                className="rounded-[8px] bg-blue px-[13px] py-[7px] text-[12.5px] font-bold text-white disabled:opacity-50"
              >
                Issue {tickedDrafts.length} line{tickedDrafts.length === 1 ? '' : 's'}
              </button>
            )}
            {canReview && tickedOpen.length > 0 && (
              <button
                type="button"
                data-testid="po-mark-purchased"
                disabled={busy}
                onClick={() => void run(() => markPoLinesPurchased(poId, tickedOpen))}
                className="rounded-[8px] border border-[#1f8f4e] px-[13px] py-[7px] text-[12.5px] font-bold text-[#1f8f4e] disabled:opacity-50"
              >
                Mark purchased
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="mb-2 rounded-[8px] bg-[#fdf1f0] px-3 py-2 text-[12.5px] text-[#c0362c]">{error}</p>
      )}

      {lines.length === 0 ? (
        <p className="text-[13px] text-[#9aa4b8]">No line items on this PO.</p>
      ) : (
        <div>
          {groups.map(([code, groupLines]) => (
            <div key={code || 'nocode'}>
              {code ? (
                <div className="flex items-center justify-between bg-[#eef1f6] px-3 py-[6px] font-mono text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#3f4a60]">
                  <span>{code}</span>
                  {lineBearing && (
                    <span>
                      subtotal{' '}
                      {fmt(
                        groupLines.reduce(
                          (s, l) => (l.unitCost != null ? s + Math.round(l.qty * l.unitCost * 100) / 100 : s),
                          0
                        )
                      )}
                    </span>
                  )}
                </div>
              ) : null}
              {groupLines.map((line) => (
                <div
                  key={line.id}
                  className={`flex items-center gap-3 border-b border-[#f4f6fa] px-2 py-[7px] ${line.lineStatus === 'purchased' ? 'opacity-60' : ''}`}
                >
                  {!readOnly &&
                  ((canIssue && line.lineStatus === 'draft') ||
                    (canReview && (line.lineStatus === 'issued' || line.lineStatus === 'flagged'))) ? (
                    <input
                      type="checkbox"
                      aria-label={`Select ${line.description}`}
                      checked={ticked.has(line.id)}
                      onChange={() => toggle(line.id)}
                    />
                  ) : (
                    <span className="w-[13px]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-navy">{line.description}</div>
                    {line.flagNote && (
                      <div className="text-[11.5px] text-[#b45309]">&ldquo;{line.flagNote}&rdquo;</div>
                    )}
                    {line.assignments.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-[2px]">
                        {line.assignments.map((a) => (
                          <span
                            key={a.id}
                            className="rounded-full bg-[#f2f4ff] px-2 py-[1px] text-[10.5px] font-semibold text-blue"
                          >
                            {a.name}
                            {canAssign && !readOnly && (
                              <button
                                type="button"
                                aria-label={`Unassign ${a.name}`}
                                className="ml-1 text-[#9aa4b8]"
                                onClick={() => void run(() => unassignPoItemAssignment(a.id))}
                              >
                                ✕
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="w-[64px] text-right font-mono text-[12.5px] text-[#3f4a60]">
                    {line.qty} {line.unit ?? ''}
                  </span>
                  <span className="w-[76px] text-right font-mono text-[12.5px] text-[#3f4a60]">
                    {line.unitCost != null ? fmt(line.unitCost) : '—'}
                  </span>
                  <span className="w-[86px] text-right font-mono text-[12.5px] font-semibold text-navy">
                    {line.unitCost != null ? fmt(Math.round(line.qty * line.unitCost * 100) / 100) : '—'}
                  </span>
                  <span
                    className={`w-[118px] rounded-full px-2 py-[3px] text-center text-[11px] font-semibold ${STATUS_STYLE[line.lineStatus].cls}`}
                  >
                    {STATUS_STYLE[line.lineStatus].label}
                  </span>
                  {canAssign && !readOnly && line.lineStatus !== 'purchased' && (
                    <div className="w-[130px]">
                      {assigningLine === line.id ? (
                        <select
                          autoFocus
                          aria-label={`Assign to ${line.description}`}
                          className="w-full rounded-[7px] border border-[#d5dae4] px-2 py-[4px] text-[12px]"
                          defaultValue=""
                          onChange={(e) => {
                            const memberId = e.target.value;
                            setAssigningLine(null);
                            if (memberId) void run(() => assignMemberToPoItem(line.id, memberId));
                          }}
                          onBlur={() => setAssigningLine(null)}
                        >
                          <option value="">Assign…</option>
                          {staff
                            .filter((s) => !line.assignments.some((a) => a.memberId === s.memberId))
                            .map((s) => (
                              <option key={s.memberId} value={s.memberId}>
                                {s.name}
                              </option>
                            ))}
                        </select>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAssigningLine(line.id)}
                          className="text-[12px] font-semibold text-blue hover:underline"
                        >
                          + Assign
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}

          {/* R-L1: the footing row renders ONLY when lines carry cost. */}
          {lineBearing && (
            <div className="flex justify-between bg-[#fbfcfe] px-3 py-[8px] text-[13px] font-bold text-navy">
              <span>PO total (foots against the lines above)</span>
              <span className="font-mono">{fmt(footed)}</span>
            </div>
          )}
        </div>
      )}

      {/* R-L4 — after issue, both offers. Disabled states carry their reason. */}
      {poStatus === 'issued' && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#f4f6fa] pt-3">
          <a
            href={`/api/pos/${poId}/pdf`}
            className="rounded-[8px] border border-[#d5dae4] px-[13px] py-[7px] text-[12.5px] font-bold text-[#3f4a60]"
          >
            Download PDF
          </a>
          {canIssue &&
            (vendorEmailState === 'ok' ? (
              <button
                type="button"
                data-testid="po-email-vendor"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const res = await fetch(`/api/pos/${poId}/send`, { method: 'POST' });
                    if (res.ok) return { success: true };
                    const payload = (await res.json().catch(() => ({}))) as { error?: string };
                    return { success: false, error: payload.error ?? 'Send failed.' };
                  })
                }
                className="rounded-[8px] bg-blue px-[13px] py-[7px] text-[12.5px] font-bold text-white disabled:opacity-50"
              >
                Email to vendor
              </button>
            ) : (
              <span
                className="rounded-[8px] bg-[#eef1f6] px-[13px] py-[7px] text-[12.5px] font-semibold text-[#7b8699]"
                title={
                  vendorEmailState === 'no-vendor'
                    ? 'No vendor on file — assign a vendor to email this PO.'
                    : 'The vendor has no email address on file.'
                }
              >
                Email unavailable —{' '}
                {vendorEmailState === 'no-vendor' ? 'no vendor on file' : 'vendor has no email'}
              </span>
            ))}
        </div>
      )}

      {/* Against the estimate — renders only with budgeted figures (O/A). */}
      {Object.keys(budgetedByCode).length > 0 && Object.keys(orderedByCode).length > 0 && (
        <div className="mt-3 border-t border-[#f4f6fa] pt-3" data-testid="po-against-estimate">
          <div className="mb-1 text-[12px] font-bold uppercase text-navy">
            Against the estimate{' '}
            <span className="text-[10.5px] font-medium normal-case text-[#9aa4b8]">
              — ordered cost vs budgeted cost, never sell
            </span>
          </div>
          {Object.entries(orderedByCode).map(([code, orderedCost]) => {
            const budgeted = budgetedByCode[code];
            if (budgeted == null) return null;
            const over = orderedCost > budgeted;
            const pct = budgeted > 0 ? Math.min((orderedCost / budgeted) * 100, 100) : 100;
            return (
              <div key={code} className="mb-[6px]">
                <div className="flex justify-between text-[11.5px]">
                  <span className="font-mono text-[#3f4a60]">{code}</span>
                  <span className={`font-mono font-semibold ${over ? 'text-[#c0362c]' : 'text-[#3f4a60]'}`}>
                    {fmt(orderedCost)} of {fmt(budgeted)}
                    {over ? ' — over before issue' : ''}
                  </span>
                </div>
                <div className="h-[6px] rounded-[20px] bg-[#eef1f6]">
                  <div
                    className={`h-[6px] rounded-[20px] ${over ? 'bg-[#c0362c]' : 'bg-blue'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
