'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  EstimateWithChildren,
  approveAndSend,
  getEstimate,
  getEstimateVersion,
  markAsSent,
  softDeleteEstimate,
  voidEstimate,
  reissueEstimate,
  submitForReview,
  updateEstimate,
} from '@/lib/services/estimates-client';
import { getContactEmail } from '@/lib/services/contacts-client';
import { getProposalEmailDefaults } from '@/lib/services/company-client';
import {
  DEFAULT_PROPOSAL_BODY,
  DEFAULT_PROPOSAL_SUBJECT,
} from '@/lib/proposal/proposal-defaults';
import { fmtMoney } from '../labels';
import { StatusBadge } from '../estimates-list';
import { InlineText } from '../inline-edit';
import { CloneModal } from '../clone-modal';
import { SendProposalModal } from '../send-proposal-modal';
import { DetailsTab } from './details-tab';
import { ConvertToProject } from './convert-to-project';
import { ItemsTab } from './items-tab';
import { BiddingTab } from './bidding-tab';
import { CoverTab, FilesTab, NotesTab, ScopeTab, TermsTab } from './text-tabs';
import { ReviewSendSheet } from './review-send-sheet';
import { useConfirm } from '@/components/confirm/confirm-provider';
import { color } from '@/lib/theme';

export type BuilderRole = 'owner' | 'admin' | 'project_manager';

export interface TabProps {
  data: EstimateWithChildren;
  role: BuilderRole;
  userId: string;
  canEdit: boolean;
  reload: () => Promise<void>;
  /** #116 [S103] — the company calendar timezone, from the server page. Tabs
   *  derive date defaults with companyToday(companyTimeZone); never UTC. */
  companyTimeZone: string;
  /** 19b/R10 [S103] — the estimator's display name, resolved SERVER-SIDE from
   *  estimates.created_by (getUploaderNames imports next/headers and cannot run
   *  in a client tab). Read-only; null when unresolved. */
  estimatorName: string | null;
}

type TabKey =
  | 'details'
  | 'items'
  | 'terms'
  | 'scope'
  | 'bidding'
  | 'files'
  | 'cover'
  | 'notes';

// Estimates redesign — the handoff tab set: Line Items, Sub Bids, Proposal
// (renames of Items/Bidding/Cover Sheet); Files stays disabled ("Soon").
const TABS: Array<{ key: TabKey; label: string; disabled?: boolean }> = [
  { key: 'details', label: 'Details' },
  { key: 'items', label: 'Line Items' },
  { key: 'terms', label: 'Terms' },
  { key: 'scope', label: 'Scope of Work' },
  { key: 'bidding', label: 'Sub Bids' },
  { key: 'files', label: 'Files', disabled: true },
  { key: 'cover', label: 'Proposal' },
  { key: 'notes', label: 'Notes' },
];

interface EstimateBuilderProps {
  estimateId: string;
  role: BuilderRole;
  userId: string;
  companyTimeZone: string;
  estimatorName: string | null;
}

export function EstimateBuilder({
  estimateId,
  role,
  userId,
  companyTimeZone,
  estimatorName,
}: EstimateBuilderProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [data, setData] = useState<EstimateWithChildren | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('details');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  // [S175 #2] The void REASON is required in every case, so voiding is a PANEL
  // and never a window.confirm(). Same decision S168 made for change orders,
  // and for the same reason: a reason is a RECORD — it is frozen the moment it
  // is written (`enforce_estimate_immutability`) and read back for the life of
  // the document. A confirm() cannot carry one.
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [busyVoid, setBusyVoid] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [sendPrefill, setSendPrefill] = useState<{
    email: string | null;
    subject: string;
    body: string;
  } | null>(null);

  // Version is DERIVED from the supersede chain, never the stored 'v1.1'
  // default (§1.2). Fetched once per estimate; it changes only on void+reissue,
  // which navigates to a new estimate id.
  const [derivedVersion, setDerivedVersion] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const fresh = await getEstimate(estimateId);
    setData(fresh);
  }, [estimateId]);

  useEffect(() => {
    setLoading(true);
    reload().then(() => setLoading(false));
  }, [reload]);

  useEffect(() => {
    getEstimateVersion(estimateId).then(setDerivedVersion);
  }, [estimateId]);

  if (loading) {
    return <p style={{ color: '#9aa4b8', fontSize: '0.875rem' }}>Loading estimate…</p>;
  }

  if (!data || data.estimate.is_deleted) {
    return (
      <div>
        <p style={{ color: '#c0362c', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Estimate not found.
        </p>
        <Link href="/dashboard/estimates" style={{ color: '#3b4ae0', fontSize: '0.875rem' }}>
          ← Back to estimates
        </Link>
      </div>
    );
  }

  const { estimate } = data;
  const canEdit = estimate.status === 'draft';
  const isManager = role === 'owner' || role === 'admin';

  async function runAction(fn: () => Promise<{ success: boolean; error?: string }>) {
    setActionBusy(true);
    setActionError(null);
    const result = await fn();
    setActionBusy(false);
    if (!result.success) {
      setActionError(result.error || 'Action failed');
    } else {
      await reload();
    }
  }

  // S173 Job 1: open the same SendProposalModal / api/proposals/send the
  // preview page uses (parity: one mechanism, two entry points). The route
  // accepts draft AND review — on review it stamps reviewed_by/reviewed_at.
  // draft (from the Review & Send Email tab) seeds the send instead of a
  // re-fetch, so what the user edited in that tab is what actually sends.
  async function openSendModal(draft?: { subject: string; body: string }) {
    setActionBusy(true);
    setActionError(null);
    const [email, defaults] = await Promise.all([
      estimate.contact_id ? getContactEmail(estimate.contact_id) : Promise.resolve(null),
      draft ? Promise.resolve(null) : getProposalEmailDefaults(),
    ]);
    setSendPrefill({
      email,
      subject: draft ? draft.subject : defaults?.subject || DEFAULT_PROPOSAL_SUBJECT,
      body: draft ? draft.body : defaults?.body || DEFAULT_PROPOSAL_BODY,
    });
    setActionBusy(false);
    setSendOpen(true);
  }

  function statusActionButton() {
    const buttonStyle: React.CSSProperties = {
      padding: '0.5rem 1rem',
      fontSize: '0.875rem',
      fontWeight: 600,
      color: '#fff',
      backgroundColor: actionBusy ? '#9aa4b8' : '#3b4ae0',
      border: 'none',
      borderRadius: '0.375rem',
      cursor: actionBusy ? 'not-allowed' : 'pointer',
    };
    const secondaryStyle: React.CSSProperties = {
      ...buttonStyle,
      color: '#3f4a60',
      backgroundColor: '#f4f6fa',
      border: '1px solid #d5dae4',
    };

    if (estimate.status === 'draft' && isManager) {
      // [S103] The header "Send to Client" was removed — the send path is
      // Review & Send → Send to client (est-review-send above). "Mark as Sent"
      // stays: it is the distinct freeze-without-emailing action (placement open).
      return (
        <>
          <button
            type="button"
            data-testid="est-mark-sent"
            disabled={actionBusy}
            style={secondaryStyle}
            title="Freeze the estimate without emailing it — use when you deliver the PDF yourself."
            onClick={async () => {
              if (
                await confirm(
                  'Mark this estimate as sent WITHOUT emailing it? Use this when you deliver the PDF yourself. It will be frozen — no further edits without a new version.'
                )
              ) {
                runAction(() => markAsSent(estimate.id));
              }
            }}
          >
            Mark as Sent
          </button>
        </>
      );
    }
    if (estimate.status === 'draft' && role === 'project_manager') {
      return (
        <button
          type="button"
          disabled={actionBusy}
          style={buttonStyle}
          onClick={() => runAction(() => submitForReview(estimate.id))}
        >
          Submit for Review
        </button>
      );
    }
    if (estimate.status === 'review' && isManager) {
      return (
        <>
          <button
            type="button"
            data-testid="est-approve-send"
            disabled={actionBusy}
            style={buttonStyle}
            onClick={() => openSendModal()}
          >
            Approve &amp; Send
          </button>
          <button
            type="button"
            data-testid="est-approve-mark-sent"
            disabled={actionBusy}
            style={secondaryStyle}
            title="Approve and freeze without emailing — use when you deliver the PDF yourself."
            onClick={async () => {
              if (
                await confirm(
                  'Approve this estimate and mark it sent WITHOUT emailing it? It will be frozen after this.'
                )
              ) {
                runAction(() => approveAndSend(estimate.id));
              }
            }}
          >
            Approve &amp; Mark as Sent
          </button>
        </>
      );
    }
    return null;
  }

  async function handleDelete() {
    if (
      !(await confirm(
        `Delete estimate ${estimate.estimate_number} — "${estimate.name}"? It moves to trash.`
      ))
    ) {
      return;
    }
    const result = await softDeleteEstimate(estimate.id);
    if (result.success) {
      router.push('/dashboard/estimates');
    } else {
      setActionError(result.error || 'Delete failed');
    }
  }

  async function handleVoid() {
    setBusyVoid(true);
    setActionError(null);
    const result = await voidEstimate(estimate.id, voidReason);
    setBusyVoid(false);
    if (result.success) {
      setVoidOpen(false);
      setVoidReason('');
      await reload();
    } else {
      // The refusal sentence comes from the database — the converted-estimate
      // message names the project — so it is shown verbatim rather than
      // replaced with a generic one.
      setActionError(result.error || 'Void failed');
    }
  }

  async function handleReissue() {
    setBusyVoid(true);
    setActionError(null);
    const result = await reissueEstimate(estimate.id);
    setBusyVoid(false);
    if (result.success && result.id) {
      router.push(`/dashboard/estimates/${result.id}`);
    } else {
      setActionError(result.error || 'Reissue failed');
    }
  }

  const tabProps: TabProps = { data, role, userId, canEdit, reload, companyTimeZone, estimatorName };

  // Step 9 (§8.10.1) — left rail → top tabs, the mockup's one structural
  // change that survives contact with reality. The SET is the shipped eight
  // (the mockup's seven is wrong: no Review & Send tab exists — send lives in
  // the Details right rail, preview is its own route; Cover Sheet and the
  // disabled Files tab are real). Tab state stays a client useState — making
  // tabs deep-linkable is a change, not a restyle, and is on the ask list.
  return (
    <div style={{ minHeight: '70vh' }}>
      {/* Main panel */}
      <div style={{ minWidth: 0, paddingBottom: '5rem' }}>
        <Link
          href="/dashboard/estimates"
          style={{
            display: 'inline-block',
            fontSize: '0.875rem',
            color: '#7b8699',
            textDecoration: 'none',
            marginBottom: '0.75rem',
          }}
        >
          ← All estimates
        </Link>

        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '1.5rem',
            gap: '1rem',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>
              <InlineText
                value={estimate.name}
                disabled={!canEdit}
                onSave={async (name) => {
                  if (!name.trim()) return { success: false, error: 'Name is required' };
                  const r = await updateEstimate(estimate.id, { name: name.trim() });
                  if (r.success) await reload();
                  return r;
                }}
              />
            </h1>
            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                alignItems: 'center',
                fontSize: '0.875rem',
                color: '#7b8699',
              }}
            >
              <span style={{ fontWeight: 600 }}>{estimate.estimate_number}</span>
              {derivedVersion && <span>{derivedVersion}</span>}
              <StatusBadge status={estimate.status} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
            {(estimate.status === 'draft' || estimate.status === 'review') && (
              <button
                type="button"
                data-testid="est-review-send"
                onClick={() => setReviewOpen(true)}
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: '#3f4a60',
                  backgroundColor: '#f4f6fa',
                  border: '1px solid #d5dae4',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                }}
              >
                Review &amp; Send
              </button>
            )}
            {statusActionButton()}
            {estimate.status !== 'accepted' && (
              <ConvertToProject
                estimateId={estimate.id}
                estimateNumber={estimate.estimate_number}
                status={estimate.status}
                projectId={estimate.project_id}
                variant="button"
              />
            )}
          </div>
        </div>

        {/* Post-signature conversion prompt (5A §8; also shows the converted link) */}
        <ConvertToProject
          estimateId={estimate.id}
          estimateNumber={estimate.estimate_number}
          status={estimate.status}
          projectId={estimate.project_id}
          variant="banner"
        />

        {actionError && (
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
            {actionError}
          </div>
        )}

        {!canEdit && estimate.status !== 'draft' && (
          <div
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              marginBottom: '1rem',
              backgroundColor: '#fff5e6',
              color: '#b45309',
              fontSize: '0.8125rem',
            }}
          >
            This estimate is {estimate.status === 'review' ? 'in review' : estimate.status} and
            frozen — fields cannot be edited.
          </div>
        )}

        {/* ── [S175 #2] VOID AND REISSUE ─────────────────────────────────────
            A sent estimate can no longer be un-sent or silently edited, so
            withdrawing it IS the remedy and it has to be reachable. Owner,
            Admin or the authoring PM; the database decides and this only
            offers. A CONVERTED estimate is refused there, with the project
            named — deliberately not hidden here, so the reason is stated
            rather than the button simply being absent. */}
        {isManager && estimate.status !== 'draft' && estimate.status !== 'review' && (
          <div style={{ marginTop: '0.75rem' }}>
            {estimate.status === 'voided' ? (
              <div
                data-testid="est-void-record"
                style={{
                  padding: '0.75rem',
                  border: '1px solid #efd3d0',
                  backgroundColor: '#fdf1f0',
                  borderRadius: '0.375rem',
                  fontSize: '0.8125rem',
                  color: '#c0362c',
                }}
              >
                <strong>Voided.</strong> {estimate.void_reason}
                <div style={{ marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    data-testid="est-reissue"
                    disabled={busyVoid}
                    onClick={handleReissue}
                    style={{
                      padding: '0.45rem 0.875rem',
                      borderRadius: '0.375rem',
                      border: '1px solid #0f1729',
                      backgroundColor: '#0f1729',
                      color: '#fff',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Reissue as a new draft
                  </button>
                </div>
              </div>
            ) : voidOpen ? (
              <div
                data-testid="est-void-panel"
                style={{
                  padding: '0.75rem',
                  border: '1px solid #efd3d0',
                  backgroundColor: '#fdf1f0',
                  borderRadius: '0.375rem',
                }}
              >
                <p style={{ fontSize: '0.8125rem', color: '#c0362c', margin: '0 0 0.5rem' }}>
                  Withdraw {estimate.estimate_number}? The client keeps the copy they were sent —
                  this records that it no longer stands. <strong>The reason is kept permanently
                  and cannot be edited afterwards.</strong>
                </p>
                <textarea
                  data-testid="est-void-reason"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  rows={2}
                  placeholder="Why is this being withdrawn?"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d5dae4',
                    borderRadius: '0.375rem',
                    fontSize: '0.8125rem',
                  }}
                />
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    data-testid="est-void-confirm"
                    disabled={busyVoid || !voidReason.trim()}
                    onClick={handleVoid}
                    style={{
                      padding: '0.45rem 0.875rem',
                      borderRadius: '0.375rem',
                      border: '1px solid #c0362c',
                      backgroundColor: '#c0362c',
                      color: '#fff',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      cursor: voidReason.trim() ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Void this estimate
                  </button>
                  <button
                    type="button"
                    data-testid="est-void-cancel"
                    disabled={busyVoid}
                    onClick={() => {
                      setVoidOpen(false);
                      setVoidReason('');
                    }}
                    style={{
                      padding: '0.45rem 0.875rem',
                      borderRadius: '0.375rem',
                      border: '1px solid #d5dae4',
                      backgroundColor: '#fff',
                      fontSize: '0.8125rem',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                data-testid="est-void"
                onClick={() => setVoidOpen(true)}
                style={{
                  padding: '0.45rem 0.875rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #c0362c',
                  backgroundColor: '#fff',
                  color: '#c0362c',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Void this estimate
              </button>
            )}
          </div>
        )}

        {/* Top tab row (single bottom-border style — raised segments are
            project-detail only, per the README's tab hierarchy) */}
        <div
          role="tablist"
          style={{
            display: 'flex',
            gap: '0.25rem',
            borderBottom: `1px solid ${color.cardBorder}`,
            margin: '1.25rem 0 1.5rem',
            flexWrap: 'wrap',
          }}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                data-testid={`est-tab-${tab.key}`}
                disabled={tab.disabled}
                onClick={() => !tab.disabled && setActiveTab(tab.key)}
                style={{
                  padding: '10px 14px',
                  fontSize: '13.5px',
                  fontWeight: isActive ? 700 : 600,
                  color: tab.disabled
                    ? color.faintAlt
                    : isActive
                      ? color.primary
                      : color.mutedAlt,
                  background: 'none',
                  border: 'none',
                  borderRadius: 0,
                  boxShadow: isActive ? `inset 0 -2.5px 0 ${color.primary}` : 'none',
                  cursor: tab.disabled ? 'not-allowed' : 'pointer',
                }}
              >
                {tab.label}
                {tab.disabled && (
                  <span style={{ fontSize: '0.625rem', marginLeft: '0.375rem', color: color.faintAlt }}>
                    Soon
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Active tab */}
        {activeTab === 'details' && (
          <DetailsTab
            {...tabProps}
            onDelete={isManager ? handleDelete : undefined}
            onClone={() => setCloneOpen(true)}
            statusAction={statusActionButton()}
          />
        )}
        {activeTab === 'items' && <ItemsTab {...tabProps} />}
        {activeTab === 'terms' && <TermsTab {...tabProps} />}
        {activeTab === 'scope' && <ScopeTab {...tabProps} />}
        {activeTab === 'bidding' && <BiddingTab {...tabProps} />}
        {activeTab === 'files' && <FilesTab />}
        {activeTab === 'cover' && <CoverTab {...tabProps} />}
        {activeTab === 'notes' && <NotesTab {...tabProps} />}
      </div>

      {/* Sticky totals footer */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: color.navy,
          color: '#fff',
          padding: '0.75rem 2rem',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '2.5rem',
          fontSize: '0.875rem',
          zIndex: 40,
        }}
      >
        <span>
          Subtotal <strong>{fmtMoney(estimate.subtotal)}</strong>
        </span>
        {/* Terms swaps Tax for Deposit due (handoff §; deposit_percent × grand_total). */}
        {activeTab === 'terms' && estimate.deposit_percent != null ? (
          <span>
            Deposit due{' '}
            <strong>{fmtMoney((Number(estimate.deposit_percent) / 100) * Number(estimate.grand_total ?? 0))}</strong>
          </span>
        ) : (
          <span>
            Tax <strong>{fmtMoney(estimate.tax_total)}</strong>
          </span>
        )}
        <span>
          Discount <strong>−{fmtMoney(estimate.discount_total)}</strong>
        </span>
        <span>
          Grand Total{' '}
          <strong style={{ color: color.amber }}>{fmtMoney(estimate.grand_total)}</strong>
        </span>
      </div>

      {cloneOpen && (
        <CloneModal
          sourceId={estimate.id}
          sourceName={estimate.name}
          sourceNumber={estimate.estimate_number}
          onClose={() => setCloneOpen(false)}
        />
      )}

      {sendOpen && sendPrefill && (
        <SendProposalModal
          estimateId={estimate.id}
          mode="send"
          recipientEmail={sendPrefill.email}
          defaultSubject={sendPrefill.subject}
          defaultBody={sendPrefill.body}
          onClose={() => setSendOpen(false)}
          onSent={async () => {
            setSendOpen(false);
            await reload();
          }}
        />
      )}

      {reviewOpen && (
        <ReviewSendSheet
          data={data}
          canEdit={canEdit}
          reload={reload}
          onClose={() => setReviewOpen(false)}
          onSend={(draft) => {
            setReviewOpen(false);
            openSendModal(draft);
          }}
        />
      )}
    </div>
  );
}
