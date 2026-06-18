'use client';

import { useEffect, useState } from 'react';
import {
  createEstimateSubBid,
  setWinningBid,
  softDeleteEstimateSubBid,
} from '@/lib/services/estimate-items-client';
import {
  SubcontractorOption,
  listSubcontractorOptions,
} from '@/lib/services/subcontractors-client';
import { fmtMoney } from '../labels';
import type { TabProps } from './estimate-builder';

// 4D Bidding tab — grouped by lump-sum line item across the whole
// estimate. Winner selection is atomic via the set_winning_bid RPC
// (partial unique index enforces one winner per line; bid_amount +
// subcontractor copy onto the line item). bid_document_file_id is
// read-only until 4L ships the attachments UI (build decision Q1-b).

export function BiddingTab({ data, canEdit, reload }: TabProps) {
  const { lineItems, subBids } = data;
  const [subs, setSubs] = useState<SubcontractorOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [addingFor, setAddingFor] = useState<string | null>(null);

  useEffect(() => {
    listSubcontractorOptions().then(setSubs);
  }, []);

  const lumpSumLines = lineItems.filter((l) => l.line_type === 'lump_sum');
  const subName = (id: string | null) =>
    subs.find((s) => s.id === id)?.company_name ?? 'Unknown sub';

  async function handleSetWinner(lineItemId: string, subBidId: string) {
    setError(null);
    const result = await setWinningBid(lineItemId, subBidId);
    if (!result.success) {
      setError(result.error || 'Could not set the winning bid');
      return;
    }
    await reload();
  }

  async function handleDeleteBid(subBidId: string) {
    if (!window.confirm('Remove this sub bid?')) return;
    setError(null);
    const result = await softDeleteEstimateSubBid(subBidId);
    if (!result.success) {
      setError(result.error || 'Could not remove the bid');
      return;
    }
    await reload();
  }

  const cellStyle: React.CSSProperties = {
    padding: '0.5rem 0.625rem',
    fontSize: '0.8125rem',
    borderBottom: '1px solid #f3f4f6',
  };

  return (
    <div style={{ maxWidth: '760px' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>Sub Bidding</h2>
      <p style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '1.5rem' }}>
        Track every bid received per lump-sum line. Picking a winner copies its amount and
        subcontractor onto the line item.
      </p>

      {error && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.375rem',
            marginBottom: '1rem',
            backgroundColor: '#fef2f2',
            color: '#991b1b',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </div>
      )}

      {lumpSumLines.length === 0 ? (
        <div
          style={{
            padding: '3rem',
            textAlign: 'center',
            color: '#9ca3af',
            border: '1px dashed #d1d5db',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
          }}
        >
          No lump-sum line items yet. Add one in the Items tab to start collecting bids.
        </div>
      ) : (
        lumpSumLines.map((line) => {
          const bids = subBids.filter((b) => b.line_item_id === line.id);
          return (
            <div
              key={line.id}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: '0.5rem',
                padding: '1rem',
                marginBottom: '1rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.75rem',
                }}
              >
                <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{line.name}</span>
                <span style={{ fontSize: '0.8125rem', color: '#6b7280' }}>
                  Current sub bid: <strong>{fmtMoney(line.sub_bid_amount)}</strong>
                </span>
              </div>

              {bids.length === 0 ? (
                <p style={{ fontSize: '0.8125rem', color: '#9ca3af', marginBottom: '0.75rem' }}>
                  No bids recorded for this line yet.
                </p>
              ) : (
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    marginBottom: '0.75rem',
                  }}
                >
                  <thead>
                    <tr style={{ fontSize: '0.6875rem', color: '#6b7280', textAlign: 'left' }}>
                      <th style={cellStyle}>Winner</th>
                      <th style={cellStyle}>Subcontractor</th>
                      <th style={{ ...cellStyle, textAlign: 'right' }}>Bid</th>
                      <th style={cellStyle}>Received</th>
                      <th style={cellStyle}>Document</th>
                      <th style={cellStyle}>Notes</th>
                      <th style={cellStyle}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {bids.map((bid) => (
                      <tr
                        key={bid.id}
                        style={{ backgroundColor: bid.is_winner ? '#f0fdf4' : undefined }}
                      >
                        <td style={{ ...cellStyle, textAlign: 'center' }}>
                          <input
                            type="radio"
                            name={`winner-${line.id}`}
                            checked={!!bid.is_winner}
                            disabled={!canEdit}
                            onChange={() => handleSetWinner(line.id, bid.id)}
                          />
                        </td>
                        <td style={cellStyle}>{subName(bid.subcontractor_id)}</td>
                        <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 600 }}>
                          {fmtMoney(bid.bid_amount)}
                        </td>
                        <td style={cellStyle}>
                          {bid.received_at
                            ? new Date(bid.received_at).toLocaleDateString()
                            : '—'}
                        </td>
                        <td style={{ ...cellStyle, color: '#9ca3af' }}>
                          {/* Read-only until 4L attachments UI ships */}
                          {bid.bid_document_file_id ? 'Attached' : '—'}
                        </td>
                        <td style={cellStyle}>{bid.notes || '—'}</td>
                        <td style={cellStyle}>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => handleDeleteBid(bid.id)}
                              style={{
                                padding: '0.125rem 0.5rem',
                                fontSize: '0.75rem',
                                color: '#991b1b',
                                backgroundColor: '#f3f4f6',
                                border: '1px solid #d1d5db',
                                borderRadius: '0.25rem',
                                cursor: 'pointer',
                              }}
                            >
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {canEdit &&
                (addingFor === line.id ? (
                  <AddBidForm
                    lineItemId={line.id}
                    estimateId={data.estimate.id}
                    subs={subs}
                    onDone={async (err) => {
                      setAddingFor(null);
                      if (err) setError(err);
                      else await reload();
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingFor(line.id)}
                    style={{
                      padding: '0.375rem 0.75rem',
                      fontSize: '0.8125rem',
                      backgroundColor: '#f3f4f6',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                    }}
                  >
                    + Add Sub Bid
                  </button>
                ))}
            </div>
          );
        })
      )}
    </div>
  );
}

interface AddBidFormProps {
  lineItemId: string;
  estimateId: string;
  subs: SubcontractorOption[];
  onDone: (error?: string) => void;
}

function AddBidForm({ lineItemId, estimateId, subs, onDone }: AddBidFormProps) {
  const [subcontractorId, setSubcontractorId] = useState('');
  const [amount, setAmount] = useState('');
  const [receivedAt, setReceivedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const parsedAmount = Number(amount);
    if (!subcontractorId) {
      setError('Pick a subcontractor');
      return;
    }
    if (amount.trim() === '' || Number.isNaN(parsedAmount) || parsedAmount < 0) {
      setError('Enter a valid bid amount');
      return;
    }

    setSubmitting(true);
    const result = await createEstimateSubBid({
      estimate_id: estimateId,
      line_item_id: lineItemId,
      subcontractor_id: subcontractorId,
      bid_amount: parsedAmount,
      received_at: receivedAt ? new Date(receivedAt).toISOString() : undefined,
      notes: notes.trim() || undefined,
    });
    setSubmitting(false);

    if (result.success) onDone();
    else setError(result.error || 'Could not add the bid');
  }

  const inputStyle: React.CSSProperties = {
    padding: '0.375rem 0.5rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.25rem',
    fontSize: '0.8125rem',
  };

  return (
    <div
      style={{
        border: '1px solid #dbeafe',
        backgroundColor: '#eff6ff',
        borderRadius: '0.375rem',
        padding: '0.75rem',
      }}
    >
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={subcontractorId}
          onChange={(e) => setSubcontractorId(e.target.value)}
          style={inputStyle}
        >
          <option value="">Subcontractor…</option>
          {subs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.company_name}
            </option>
          ))}
        </select>
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Bid amount"
          style={{ ...inputStyle, width: '110px' }}
        />
        <input
          type="date"
          value={receivedAt}
          onChange={(e) => setReceivedAt(e.target.value)}
          style={inputStyle}
        />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          style={{ ...inputStyle, flex: 1, minWidth: '140px' }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          style={{
            padding: '0.375rem 0.875rem',
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: '#fff',
            backgroundColor: submitting ? '#9ca3af' : '#2563eb',
            border: 'none',
            borderRadius: '0.25rem',
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Saving…' : 'Save Bid'}
        </button>
        <button
          type="button"
          onClick={() => onDone()}
          style={{
            padding: '0.375rem 0.875rem',
            fontSize: '0.8125rem',
            backgroundColor: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '0.25rem',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
      {error && (
        <p style={{ color: '#991b1b', fontSize: '0.75rem', marginTop: '0.5rem' }}>{error}</p>
      )}
    </div>
  );
}
