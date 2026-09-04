'use client';
import { companyToday } from '@framefocus/shared/utils/dates';

import { useEffect, useRef, useState } from 'react';
import {
  createEstimateSubBid,
  setWinningBid,
  softDeleteEstimateSubBid,
  updateEstimateSubBid,
  listAwardBases,
  type AwardBasis,
} from '@/lib/services/estimate-items-client';
import {
  SubcontractorOption,
  listSubcontractorOptions,
} from '@/lib/services/subcontractors-client';
import {
  getFileSignedUrlClient,
  uploadEstimateBidDocument,
} from '@/lib/services/files-client';
import {
  createSubBidRequest,
  listSubBidRequests,
  bidReplyUrl,
  type SubBidRequestRow,
  type SubBidReplyMode,
} from '@/lib/services/sub-bid-requests-client';
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

export function BiddingTab({ data, canEdit, reload, companyTimeZone }: TabProps) {
  const { lineItems, subBids, rows } = data;
  const [subs, setSubs] = useState<SubcontractorOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [requests, setRequests] = useState<SubBidRequestRow[]>([]);
  const [requestingFor, setRequestingFor] = useState<string | null>(null);
  const confirm = useConfirm();

  useEffect(() => {
    listSubcontractorOptions().then(setSubs);
  }, []);

  // 19c — tokenised requests already sent, for the status chips.
  useEffect(() => {
    listSubBidRequests(data.estimate.id).then(setRequests);
  }, [data.estimate.id]);

  // 19d (§1.5) — the FROZEN award basis per winning bid. What set_winning_bid
  // locked onto the winning line row (the subcontract's basis), so 19d can show
  // it distinctly from the still-editable estimate_sub_bids row.
  const [awardBases, setAwardBases] = useState<AwardBasis[]>([]);
  useEffect(() => {
    const winnerIds = subBids.filter((b) => b.is_winner).map((b) => b.id);
    listAwardBases(winnerIds).then(setAwardBases);
  }, [subBids]);
  const awardBasisFor = (subBidId: string): AwardBasis | undefined =>
    awardBases.find((a) => a.sub_bid_id === subBidId);

  // 19d — the lowest bid on a line, for the "vs low" delta. Coverage-adjust is
  // deferred (spec §2 19d "coverage-adjusted low banner"); raw delta here.
  const lowBidFor = (lineId: string): number | null => {
    const amts = subBids.filter((b) => b.line_item_id === lineId).map((b) => Number(b.bid_amount));
    return amts.length ? Math.min(...amts) : null;
  };
  const winRecordFor = (subId: string | null): { won: number; total: number } => {
    // Derived LIVE from is_winner history on this estimate's visible bids (no
    // stored counter exists — confirmed). A company-wide record would need a
    // dedicated query; scoped to loaded bids here.
    const mine = subBids.filter((b) => b.subcontractor_id === subId);
    return { won: mine.filter((b) => b.is_winner).length, total: mine.length };
  };

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
      <p style={{ fontSize: '0.8125rem', color: '#7b8699', marginBottom: '0.5rem' }}>
        Track every bid received per line. Picking a winner updates that line&rsquo;s subcontractor
        row with the winning amount and subcontractor. Send a request by link and the sub&rsquo;s
        reply lands here with no retyping.
      </p>
      {/* 19c — the payment gate, surfaced up front. */}
      <p style={{ fontSize: '0.75rem', color: '#b45309', backgroundColor: '#fff5e6', padding: '0.4rem 0.7rem', borderRadius: '0.375rem', marginBottom: '1.25rem' }}>
        A subcontractor without a W-9 on file can bid, but cannot be paid — collect it before you
        award. Insurance and W-9 status live on the sub&rsquo;s compliance record.
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
                <div style={{ overflowX: 'auto', marginBottom: '0.75rem' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    minWidth: '860px',
                  }}
                >
                  <thead>
                    <tr style={{ fontSize: '0.6875rem', color: '#7b8699', textAlign: 'left' }}>
                      <th style={cellStyle}>Winner</th>
                      <th style={cellStyle}>Subcontractor</th>
                      <th style={{ ...cellStyle, textAlign: 'right' }}>Bid</th>
                      <th style={{ ...cellStyle, textAlign: 'right' }}>Labor</th>
                      <th style={{ ...cellStyle, textAlign: 'right' }}>Material</th>
                      <th style={{ ...cellStyle, textAlign: 'right' }}>Coverage</th>
                      <th style={{ ...cellStyle, textAlign: 'right' }}>vs Low</th>
                      <th style={cellStyle}>Holds</th>
                      <th style={cellStyle}>Received</th>
                      <th style={cellStyle}>Document</th>
                      <th style={cellStyle}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {bids.map((bid) => {
                      const low = lowBidFor(line.id);
                      const vsLow = low != null ? Number(bid.bid_amount) - low : null;
                      const mono: React.CSSProperties = { fontFamily: 'var(--font-mono, monospace)' };
                      return (
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
                        <td style={{ ...cellStyle, ...mono, textAlign: 'right', fontWeight: 600 }}>
                          {fmtMoney(bid.bid_amount)}
                        </td>
                        <td style={{ ...cellStyle, ...mono, textAlign: 'right' }}>
                          {bid.labor_amount != null ? fmtMoney(bid.labor_amount) : '—'}
                        </td>
                        <td style={{ ...cellStyle, ...mono, textAlign: 'right' }}>
                          {bid.material_amount != null ? fmtMoney(bid.material_amount) : '—'}
                        </td>
                        <td style={{ ...cellStyle, ...mono, textAlign: 'right' }}>
                          {bid.scope_coverage_percent != null ? `${bid.scope_coverage_percent}%` : '—'}
                        </td>
                        <td style={{ ...cellStyle, ...mono, textAlign: 'right', color: vsLow && vsLow > 0 ? '#c0362c' : '#1f8f4e' }}>
                          {vsLow == null ? '—' : vsLow === 0 ? 'low' : `+${fmtMoney(vsLow)}`}
                        </td>
                        <td style={{ ...cellStyle, ...mono }}>
                          {bid.bid_holds_until ?? '—'}
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
                      );
                    })}
                  </tbody>
                </table>
                </div>
              )}

              {/* 19d — the sub's exclusions and notes, rendered VERBATIM. No
                  auto-flagging against your own scope (spec §3.8). */}
              {bids.some((b) => b.exclusions || b.notes) && (
                <div style={{ marginBottom: '0.75rem' }}>
                  {bids
                    .filter((b) => b.exclusions || b.notes)
                    .map((b) => (
                      <div key={b.id} style={{ fontSize: '0.75rem', color: '#5b6472', marginBottom: '0.25rem' }}>
                        <strong>{subName(b.subcontractor_id)}</strong>
                        {b.exclusions ? <> · excludes: <span style={{ whiteSpace: 'pre-wrap' }}>{b.exclusions}</span></> : null}
                        {b.notes ? <> · {b.notes}</> : null}
                      </div>
                    ))}
                </div>
              )}

              {/* 19d — coverage-adjusted low. The cheapest bid is not always the
                  comparable one: a bid covering 80% of scope is cheaper because it
                  does less. Lead with the cheapest, then name the like-for-like low.
                  ⚠️ Coverage comes FROM THE SUB — never computed. */}
              {bids.length >= 2 &&
                (() => {
                  const rawLow = lowBidFor(line.id);
                  if (rawLow == null) return null;
                  const adj = bids
                    .filter((b) => b.scope_coverage_percent != null && Number(b.scope_coverage_percent) > 0)
                    .map((b) => ({ b, adj: Number(b.bid_amount) / (Number(b.scope_coverage_percent) / 100) }));
                  const likeLow = adj.length ? adj.reduce((m, x) => (x.adj < m.adj ? x : m)) : null;
                  return (
                    <div style={{ fontSize: '0.75rem', background: '#f2f4ff', border: '1px solid #dbe0fb', borderRadius: '0.375rem', padding: '0.5rem 0.7rem', marginBottom: '0.75rem' }}>
                      Cheapest bid <strong>{fmtMoney(rawLow)}</strong>.
                      {likeLow ? (
                        <>
                          {' '}Adjusted to full scope coverage, the like-for-like low is{' '}
                          <strong>{subName(likeLow.b.subcontractor_id)}</strong> at{' '}
                          <strong>~{fmtMoney(likeLow.adj)}</strong> — the cheaper number may just be doing less.
                        </>
                      ) : (
                        <> Add each bid&rsquo;s scope coverage to compare like-for-like.</>
                      )}
                    </div>
                  );
                })()}

              {/* 19d — the selected bid in detail (exclusions verbatim). */}
              {winner && (
                <div style={{ border: '1px solid #e6f0e9', background: '#f6fbf8', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '0.75rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#0f1729', marginBottom: '0.4rem' }}>
                    Selected bid — {subName(winner.subcontractor_id)}
                  </div>
                  <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.78rem', color: '#5b6472', fontFamily: 'var(--font-mono, monospace)' }}>
                    <span>Bid {fmtMoney(winner.bid_amount)}</span>
                    {winner.labor_amount != null && <span>Labor {fmtMoney(winner.labor_amount)}</span>}
                    {winner.material_amount != null && <span>Material {fmtMoney(winner.material_amount)}</span>}
                    {winner.scope_coverage_percent != null && <span>Coverage {winner.scope_coverage_percent}%</span>}
                    {winner.bid_holds_until && <span>Holds until {winner.bid_holds_until}</span>}
                  </div>
                  {winner.exclusions && (
                    <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: '#5b6472' }}>
                      Exclusions (verbatim): <span style={{ whiteSpace: 'pre-wrap' }}>{winner.exclusions}</span>
                    </div>
                  )}
                  {/* §1.5 — the FROZEN award basis (estimate_award_bases). What
                      set_winning_bid locked onto the line row; the subcontract
                      draws from THIS, not the editable bid above. */}
                  {(() => {
                    const basis = awardBasisFor(winner.id);
                    if (!basis) return null;
                    const drifted =
                      Number(basis.labor_amount ?? 0) !== Number(winner.labor_amount ?? 0) ||
                      Number(basis.material_amount ?? 0) !== Number(winner.material_amount ?? 0) ||
                      Number(basis.scope_coverage_percent ?? 0) !==
                        Number(winner.scope_coverage_percent ?? 0);
                    return (
                      <div style={{ marginTop: '0.5rem', paddingTop: '0.4rem', borderTop: '1px dashed #cfe3d6' }}>
                        <div style={{ fontSize: '0.72rem', color: '#5b6472', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.25rem' }}>
                          Contract basis — frozen at award
                        </div>
                        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.78rem', color: '#5b6472', fontFamily: 'var(--font-mono, monospace)' }}>
                          {basis.labor_amount != null && <span>Labor {fmtMoney(basis.labor_amount)}</span>}
                          {basis.material_amount != null && <span>Material {fmtMoney(basis.material_amount)}</span>}
                          {basis.scope_coverage_percent != null && <span>Coverage {basis.scope_coverage_percent}%</span>}
                          {basis.awarded_at && <span>Awarded {new Date(basis.awarded_at).toLocaleDateString()}</span>}
                        </div>
                        {drifted && (
                          <div style={{ marginTop: '0.25rem', fontSize: '0.72rem', color: '#b45309' }}>
                            The bid above has been edited since award — the contract basis stays as
                            frozen here.
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* 19c — tokenised request status chips for this line. */}
              {requests.filter((r) => r.line_item_id === line.id).length > 0 && (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  {requests
                    .filter((r) => r.line_item_id === line.id)
                    .map((r) => (
                      <span
                        key={r.id}
                        title={bidReplyUrl(r.token)}
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          borderRadius: '9999px',
                          padding: '0.125rem 0.625rem',
                          border: '1px solid #dbe0fb',
                          color: r.status === 'submitted' ? '#1f8f4e' : '#3b4ae0',
                          backgroundColor: r.status === 'submitted' ? '#e6f0e9' : '#f2f4ff',
                        }}
                      >
                        {subName(r.subcontractor_id)} · {r.status}
                      </span>
                    ))}
                </div>
              )}

              {canEdit &&
                (addingFor === line.id ? (
                  <AddBidForm
                    lineItemId={line.id}
                    estimateId={data.estimate.id}
                    subs={subs}
                    companyTimeZone={companyTimeZone}
                    onDone={async (err) => {
                      setAddingFor(null);
                      if (err) setError(err);
                      else await reload();
                    }}
                  />
                ) : requestingFor === line.id ? (
                  <RequestByLinkForm
                    lineItemId={line.id}
                    estimateId={data.estimate.id}
                    subs={subs}
                    winRecordFor={winRecordFor}
                    onDone={async (err) => {
                      setRequestingFor(null);
                      if (err) setError(err);
                      else setRequests(await listSubBidRequests(data.estimate.id));
                    }}
                  />
                ) : (
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
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
                    <button
                      type="button"
                      onClick={() => setRequestingFor(line.id)}
                      style={{
                        padding: '0.375rem 0.75rem',
                        fontSize: '0.8125rem',
                        color: '#3b4ae0',
                        backgroundColor: '#f2f4ff',
                        border: '1px solid #dbe0fb',
                        borderRadius: '0.375rem',
                        cursor: 'pointer',
                      }}
                    >
                      Request by link
                    </button>
                  </div>
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

/** 19c — send a tokenised bid request to a sub; the reply lands via /bid/[token]. */
function RequestByLinkForm({
  lineItemId,
  estimateId,
  subs,
  winRecordFor,
  onDone,
}: {
  lineItemId: string;
  estimateId: string;
  subs: SubcontractorOption[];
  winRecordFor: (subId: string | null) => { won: number; total: number };
  onDone: (error?: string) => void;
}) {
  const [trade, setTrade] = useState('');
  const [subId, setSubId] = useState('');
  const [scope, setScope] = useState('');
  const [allowance, setAllowance] = useState('');
  const [message, setMessage] = useState('');
  const [replyMode, setReplyMode] = useState<SubBidReplyMode>('link');
  const [bidsDue, setBidsDue] = useState('');
  const [workStarts, setWorkStarts] = useState('');
  const [siteVisit, setSiteVisit] = useState('');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [emailed, setEmailed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const rec = winRecordFor(subId);

  // Trade filter (§1.6): the distinct trades present, and the subs narrowed to
  // the chosen one. A sub whose trade is cleared drops off the filtered list, so
  // clear the selection if it no longer qualifies.
  const trades = Array.from(new Set(subs.map((s) => s.trade_type).filter(Boolean))).sort() as string[];
  const filteredSubs = trade ? subs.filter((s) => s.trade_type === trade) : subs;

  async function send() {
    if (!subId) {
      setErr('Pick a subcontractor.');
      return;
    }
    const allowanceNum = allowance.trim() === '' ? null : Number(allowance);
    if (allowanceNum != null && (Number.isNaN(allowanceNum) || allowanceNum < 0)) {
      setErr('Allowance must be a non-negative number.');
      return;
    }
    setBusy(true);
    setErr(null);
    const result = await createSubBidRequest({
      estimateId,
      lineItemId,
      subcontractorId: subId,
      scopeText: scope.trim() || null,
      message: message.trim() || null,
      allowanceAmount: allowanceNum,
      replyMode,
      bidsDueDate: bidsDue || null,
      workStartsDate: workStarts || null,
      siteVisitDate: siteVisit || null,
    });
    setBusy(false);
    if (!result.success || !result.token) {
      setErr(result.error ?? 'Could not create the request.');
      return;
    }
    if (replyMode === 'email') setEmailed(true);
    else setLink(bidReplyUrl(result.token));
  }

  const inputStyle: React.CSSProperties = {
    padding: '0.375rem 0.5rem',
    border: '1px solid #d5dae4',
    borderRadius: '0.25rem',
    fontSize: '0.8125rem',
  };

  if (emailed) {
    return (
      <div style={{ border: '1px solid #dbe0fb', backgroundColor: '#f2f4ff', borderRadius: '0.375rem', padding: '0.75rem' }}>
        <p style={{ fontSize: '0.8125rem', color: '#1f2a44', margin: '0 0 0.5rem' }}>
          Request recorded. This sub replies by email — when their bid arrives, enter it with
          “Add bid” on this line.
        </p>
        <button type="button" onClick={() => onDone()} style={{ padding: '0.375rem 0.875rem', fontSize: '0.8125rem', backgroundColor: '#3b4ae0', color: '#fff', border: 'none', borderRadius: '0.25rem', cursor: 'pointer' }}>
          Done
        </button>
      </div>
    );
  }

  if (link) {
    return (
      <div style={{ border: '1px solid #dbe0fb', backgroundColor: '#f2f4ff', borderRadius: '0.375rem', padding: '0.75rem' }}>
        <p style={{ fontSize: '0.8125rem', color: '#1f2a44', margin: '0 0 0.5rem' }}>
          Request created. Send this link to the sub — their reply lands here automatically:
        </p>
        <input readOnly value={link} onFocus={(e) => e.target.select()} style={{ ...inputStyle, width: '100%', fontFamily: 'var(--font-mono, monospace)' }} />
        <button type="button" onClick={() => onDone()} style={{ marginTop: '0.5rem', padding: '0.375rem 0.875rem', fontSize: '0.8125rem', backgroundColor: '#3b4ae0', color: '#fff', border: 'none', borderRadius: '0.25rem', cursor: 'pointer' }}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div style={{ border: '1px solid #dbe0fb', backgroundColor: '#f2f4ff', borderRadius: '0.375rem', padding: '0.75rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {trades.length > 0 && (
          <select
            value={trade}
            onChange={(e) => {
              setTrade(e.target.value);
              // drop a selected sub that no longer matches the filter
              if (e.target.value && subId) {
                const s = subs.find((x) => x.id === subId);
                if (!s || s.trade_type !== e.target.value) setSubId('');
              }
            }}
            style={inputStyle}
          >
            <option value="">All trades</option>
            {trades.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
        <select value={subId} onChange={(e) => setSubId(e.target.value)} style={inputStyle}>
          <option value="">Subcontractor…</option>
          {filteredSubs.map((s) => (
            <option key={s.id} value={s.id}>{s.company_name}</option>
          ))}
        </select>
        {subId && (
          <span style={{ fontSize: '0.72rem', color: '#5b6472' }}>
            won {rec.won} of {rec.total} bids here
          </span>
        )}
        <input value={scope} onChange={(e) => setScope(e.target.value)} placeholder="Scope (free text)" style={{ ...inputStyle, flex: 1, minWidth: '160px' }} />
        <label style={{ fontSize: '0.72rem', color: '#5b6472' }}>
          Allowance{' '}
          <input inputMode="decimal" value={allowance} onChange={(e) => setAllowance(e.target.value)} placeholder="$" style={{ ...inputStyle, width: '90px' }} />
        </label>
        <label style={{ fontSize: '0.72rem', color: '#5b6472' }}>
          Bids due{' '}
          <input type="date" value={bidsDue} onChange={(e) => setBidsDue(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ fontSize: '0.72rem', color: '#5b6472' }}>
          Work starts{' '}
          <input type="date" value={workStarts} onChange={(e) => setWorkStarts(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ fontSize: '0.72rem', color: '#5b6472' }}>
          Site visit{' '}
          <input type="date" value={siteVisit} onChange={(e) => setSiteVisit(e.target.value)} style={inputStyle} />
        </label>
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Message to the sub (optional)"
        rows={2}
        style={{ ...inputStyle, width: '100%', marginTop: '0.5rem', resize: 'vertical', fontFamily: 'inherit' }}
      />
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.72rem', color: '#5b6472' }}>How they reply:</span>
        {(['link', 'email'] as const).map((m) => (
          <label key={m} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', color: '#5b6472' }}>
            <input type="radio" name={`reply-${lineItemId}`} checked={replyMode === m} onChange={() => setReplyMode(m)} />
            {m === 'link' ? 'A link they fill in' : 'They email me back'}
          </label>
        ))}
        <div style={{ flex: 1 }} />
        <button type="button" onClick={send} disabled={busy} style={{ padding: '0.375rem 0.875rem', fontSize: '0.8125rem', fontWeight: 600, color: '#fff', backgroundColor: busy ? '#9aa4b8' : '#3b4ae0', border: 'none', borderRadius: '0.25rem', cursor: busy ? 'not-allowed' : 'pointer' }}>
          {busy ? 'Creating…' : replyMode === 'link' ? 'Create link' : 'Record request'}
        </button>
        <button type="button" onClick={() => onDone()} style={{ padding: '0.375rem 0.875rem', fontSize: '0.8125rem', backgroundColor: '#f4f6fa', border: '1px solid #d5dae4', borderRadius: '0.25rem', cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
      {err && <p style={{ color: '#c0362c', fontSize: '0.75rem', marginTop: '0.5rem' }}>{err}</p>}
    </div>
  );
}

interface AddBidFormProps {
  lineItemId: string;
  estimateId: string;
  subs: SubcontractorOption[];
  /** #116 [S103] — company calendar timezone, threaded from the estimate page. */
  companyTimeZone: string;
  onDone: (error?: string) => void;
}

function AddBidForm({ lineItemId, estimateId, subs, companyTimeZone, onDone }: AddBidFormProps) {
  const [subcontractorId, setSubcontractorId] = useState('');
  const [amount, setAmount] = useState('');
  // #116 [S103]: default the bid-received date to the company calendar day, not
  // the UTC day (tomorrow after ~20:00 EDT). Real per-company timezone threaded
  // from the estimate page (America/New_York fallback; never UTC).
  const [receivedAt, setReceivedAt] = useState(() => companyToday(companyTimeZone));
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
