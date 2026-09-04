'use client';
import { companyToday } from '@framefocus/shared/utils/dates';

import { useEffect, useRef, useState } from 'react';
import {
  createEstimateSubBid,
  setWinningBid,
  softDeleteEstimateSubBid,
  updateEstimateSubBid,
} from '@/lib/services/estimate-items-client';
import {
  SubcontractorOption,
  listSubcontractorOptions,
} from '@/lib/services/subcontractors-client';
import {
  getFileSignedUrlClient,
  uploadEstimateBidDocument,
} from '@/lib/services/files-client';
import { fmtMoney } from '../labels';
import { useConfirm } from '@/components/confirm/confirm-provider';
import type { TabProps } from './estimate-builder';

// 4D-rev Bidding tab — grouped by line item that carries a
// subcontractor row across the whole estimate. Winner selection is
// atomic via the set_winning_bid RPC (partial unique index enforces
// one winner per line; the winning bid upserts the line's single
// subcontractor row).
// 113c-spec §6 [S95]: (#113a) a durable award summary renders per line
// once a winner is picked — "{sub} won — {$bid}" — before any conversion;
// (#113b) the bid PDF attaches at entry (uploadEstimateBidDocument →
// bid_document_file_id) and can be viewed/replaced on the row
// (updateEstimateSubBid, previously dead code). The attached PDF rides to
// the draft sub-contract's signed_doc_file_id at conversion (spec §3).

export function BiddingTab({ data, canEdit, reload }: TabProps) {
  const { lineItems, subBids, rows } = data;
  const [subs, setSubs] = useState<SubcontractorOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const confirm = useConfirm();

  useEffect(() => {
    listSubcontractorOptions().then(setSubs);
  }, []);

  // A line is biddable once it carries a subcontractor row, or already
  // has bids recorded (set_winning_bid upserts the sub row on win).
  const subRowFor = (lineItemId: string) =>
    rows.find((r) => r.line_item_id === lineItemId && r.row_type === 'subcontractor');
  const biddableLines = lineItems.filter(
    (l) => subRowFor(l.id) != null || subBids.some((b) => b.line_item_id === l.id)
  );
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
    if (!(await confirm('Remove this sub bid?'))) return;
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
    borderBottom: '1px solid #f4f6fa',
  };

  return (
    <div style={{ maxWidth: '760px' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>Sub Bidding</h2>
      <p style={{ fontSize: '0.8125rem', color: '#7b8699', marginBottom: '1.5rem' }}>
        Track every bid received per line. Picking a winner updates that line&rsquo;s subcontractor
        row with the winning amount and subcontractor.
      </p>

      {error && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.375rem',
            marginBottom: '1rem',
            backgroundColor: '#fdf1f0',
            color: '#c0362c',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </div>
      )}

      {biddableLines.length === 0 ? (
        <div
          style={{
            padding: '3rem',
            textAlign: 'center',
            color: '#9aa4b8',
            border: '1px dashed #d5dae4',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
          }}
        >
          No lines with a subcontractor row yet. Add a Subcontractor row to a line in the Items tab
          to start collecting bids.
        </div>
      ) : (
        biddableLines.map((line) => {
          const bids = subBids.filter((b) => b.line_item_id === line.id);
          const subRow = subRowFor(line.id);
          const winner = bids.find((b) => b.is_winner);
          return (
            <div
              key={line.id}
              style={{
                border: '1px solid #e4e8ef',
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
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{line.name}</span>
                  {/* #113a — durable award summary, visible before conversion */}
                  {winner && (
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: '#1f8f4e',
                        backgroundColor: '#e6f0e9',
                        border: '1px solid #e6f0e9',
                        borderRadius: '9999px',
                        padding: '0.125rem 0.625rem',
                      }}
                    >
                      {subName(winner.subcontractor_id)} won — {fmtMoney(winner.bid_amount)}
                    </span>
                  )}
                </span>
                <span style={{ fontSize: '0.8125rem', color: '#7b8699' }}>
                  Current sub bid: <strong>{subRow ? fmtMoney(subRow.amount) : '—'}</strong>
                </span>
              </div>

              {bids.length === 0 ? (
                <p style={{ fontSize: '0.8125rem', color: '#9aa4b8', marginBottom: '0.75rem' }}>
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
                    <tr style={{ fontSize: '0.6875rem', color: '#7b8699', textAlign: 'left' }}>
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
                        style={{ backgroundColor: bid.is_winner ? '#e6f0e9' : undefined }}
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
                        <td style={cellStyle}>
                          {/* #113b — attach at entry, view/replace on the row */}
                          <BidDocCell
                            bid={bid}
                            estimateId={data.estimate.id}
                            canEdit={canEdit}
                            onChanged={reload}
                            onError={setError}
                          />
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
                                color: '#c0362c',
                                backgroundColor: '#f4f6fa',
                                border: '1px solid #d5dae4',
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
                      backgroundColor: '#f4f6fa',
                      border: '1px solid #d5dae4',
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

const docButtonStyle: React.CSSProperties = {
  padding: '0.125rem 0.5rem',
  fontSize: '0.75rem',
  color: '#3b4ae0',
  backgroundColor: 'transparent',
  border: '1px solid #d5dae4',
  borderRadius: '0.25rem',
  cursor: 'pointer',
};

/** #113b — the bid's Document cell: View (signed URL) when attached;
 *  Attach/Replace via updateEstimateSubBid (activated dead code). */
function BidDocCell({
  bid,
  estimateId,
  canEdit,
  onChanged,
  onError,
}: {
  bid: { id: string; bid_document_file_id: string | null };
  estimateId: string;
  canEdit: boolean;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleView() {
    if (!bid.bid_document_file_id) return;
    const url = await getFileSignedUrlClient(bid.bid_document_file_id);
    if (!url) {
      onError('Could not open the bid document.');
      return;
    }
    window.open(url, '_blank', 'noopener');
  }

  async function handleFile(file: File) {
    setBusy(true);
    const uploaded = await uploadEstimateBidDocument(file, estimateId);
    if (!uploaded.success || !uploaded.id) {
      setBusy(false);
      onError(uploaded.error ?? 'Upload failed.');
      return;
    }
    const res = await updateEstimateSubBid(bid.id, { bid_document_file_id: uploaded.id });
    setBusy(false);
    if (!res.success) {
      onError(res.error ?? 'Could not attach the document.');
      return;
    }
    await onChanged();
  }

  return (
    <span style={{ display: 'inline-flex', gap: '0.375rem', alignItems: 'center' }}>
      {bid.bid_document_file_id ? (
        <button type="button" onClick={handleView} style={docButtonStyle}>
          View
        </button>
      ) : (
        <span style={{ color: '#9aa4b8' }}>—</span>
      )}
      {canEdit && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            style={docButtonStyle}
          >
            {busy ? 'Uploading…' : bid.bid_document_file_id ? 'Replace' : 'Attach'}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void handleFile(f);
            }}
          />
        </>
      )}
    </span>
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
  // #116 [S103]: default the bid-received date to the company day, not the UTC
  // day (tomorrow after ~20:00 EDT). Company-tz default here (client component).
  const [receivedAt, setReceivedAt] = useState(() => companyToday('America/New_York'));
  const [notes, setNotes] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
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
    // #113b — the bid PDF attaches AT ENTRY: upload first, then the bid row
    // carries bid_document_file_id from birth.
    let docFileId: string | undefined;
    if (docFile) {
      const uploaded = await uploadEstimateBidDocument(docFile, estimateId);
      if (!uploaded.success || !uploaded.id) {
        setSubmitting(false);
        setError(uploaded.error ?? 'Bid document upload failed');
        return;
      }
      docFileId = uploaded.id;
    }
    const result = await createEstimateSubBid({
      estimate_id: estimateId,
      line_item_id: lineItemId,
      subcontractor_id: subcontractorId,
      bid_amount: parsedAmount,
      bid_document_file_id: docFileId,
      received_at: receivedAt ? new Date(receivedAt).toISOString() : undefined,
      notes: notes.trim() || undefined,
    });
    setSubmitting(false);

    if (result.success) onDone();
    else setError(result.error || 'Could not add the bid');
  }

  const inputStyle: React.CSSProperties = {
    padding: '0.375rem 0.5rem',
    border: '1px solid #d5dae4',
    borderRadius: '0.25rem',
    fontSize: '0.8125rem',
  };

  return (
    <div
      style={{
        border: '1px solid #dbe0fb',
        backgroundColor: '#f2f4ff',
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
        <label style={{ ...inputStyle, cursor: 'pointer', backgroundColor: '#fff' }}>
          {docFile ? docFile.name : 'Bid PDF (optional)'}
          <input
            type="file"
            accept="application/pdf,image/*"
            style={{ display: 'none' }}
            onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          style={{
            padding: '0.375rem 0.875rem',
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: '#fff',
            backgroundColor: submitting ? '#9aa4b8' : '#3b4ae0',
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
            backgroundColor: '#f4f6fa',
            border: '1px solid #d5dae4',
            borderRadius: '0.25rem',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
      {error && (
        <p style={{ color: '#c0362c', fontSize: '0.75rem', marginTop: '0.5rem' }}>{error}</p>
      )}
    </div>
  );
}
