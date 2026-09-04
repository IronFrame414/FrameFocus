'use client';

// Estimates redesign — the ONE proposal-format control (§3.4, Q4). Wires the
// orphan proposal-format.ts mapper. The detail-level control and the format
// picker are the SAME setting (§2 9d) — this component is that one control,
// reused by 9d, 19b and 19a so the taxonomy never forks into "5 detail levels"
// vs "8 formats" again.
//
// ⚠️ Open book prints cost (and thus the fee on top of it); the other six never
// do — "Itemized" prints a CLIENT PRICE per line, which is not the same thing.
// showsCost comes from the mapper, the single cost-disclosure source of truth.

import {
  PROPOSAL_FORMAT_ORDER,
  resolveProposalFormat,
  proposalFormatContractWarning,
  type CanonicalProposalFormat,
  type ProposalTier,
} from '@framefocus/shared/utils/proposal-format';
import { color } from '@/lib/theme';

const TIER_LABEL: Record<ProposalTier, string> = {
  lump_sum: 'Lump sum — no cost shown',
  detailed: 'Detailed — lines print, cost does not',
  open_book: 'Open book — your cost is visible',
};
const TIERS: ProposalTier[] = ['lump_sum', 'detailed', 'open_book'];

export function ProposalFormatPicker({
  value,
  contractType,
  canEdit,
  onSelect,
}: {
  value: string | null;
  contractType: string | null;
  canEdit: boolean;
  onSelect: (code: CanonicalProposalFormat) => void;
}) {
  const current = resolveProposalFormat(value);
  const warning = proposalFormatContractWarning(value, contractType);

  const pill = (active: boolean, showsCost: boolean): React.CSSProperties => ({
    padding: '5px 11px',
    fontSize: '0.78rem',
    fontWeight: active ? 700 : 600,
    borderRadius: '999px',
    cursor: canEdit ? 'pointer' : 'default',
    border: `1px solid ${active ? color.primary : showsCost ? '#f6d9a8' : color.cardBorder}`,
    color: active ? '#fff' : showsCost ? '#b45309' : color.body,
    background: active ? color.primary : showsCost ? '#fff5e6' : '#fff',
  });

  return (
    <div>
      {TIERS.map((tier) => (
        <div key={tier} style={{ marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '0.68rem', color: color.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.35rem' }}>
            {TIER_LABEL[tier]}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {PROPOSAL_FORMAT_ORDER.filter((c) => resolveProposalFormat(c).tier === tier).map((code) => {
              const info = resolveProposalFormat(code);
              const active = current.code === code;
              return (
                <button
                  key={code}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => canEdit && onSelect(code)}
                  style={pill(active, info.showsCost)}
                >
                  {info.label}
                  {info.showsCost ? ' · shows cost' : ''}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {current.legacy && (
        <p style={{ fontSize: '0.72rem', color: color.muted, margin: '0.25rem 0 0' }}>
          Stored in a legacy format, shown as “{current.label}”. Choosing one above updates it — the
          23 already-sent estimates on legacy codes are never touched.
        </p>
      )}
      {warning && (
        <p style={{ fontSize: '0.75rem', color: '#b45309', background: '#fff5e6', border: '1px solid #f6d9a8', borderRadius: '8px', padding: '0.5rem 0.7rem', margin: '0.5rem 0 0' }}>
          {warning}
        </p>
      )}
    </div>
  );
}
