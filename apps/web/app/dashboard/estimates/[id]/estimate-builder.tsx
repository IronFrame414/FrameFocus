'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  EstimateWithChildren,
  approveAndSend,
  getEstimate,
  markAsSent,
  softDeleteEstimate,
  submitForReview,
  updateEstimate,
} from '@/lib/services/estimates-client';
import { fmtMoney } from '../labels';
import { StatusBadge } from '../estimates-list';
import { InlineText } from '../inline-edit';
import { CloneModal } from '../clone-modal';
import { DetailsTab } from './details-tab';
import { ConvertToProject } from './convert-to-project';
import { ItemsTab } from './items-tab';
import { BiddingTab } from './bidding-tab';
import { CoverTab, FilesTab, NotesTab, ScopeTab, TermsTab } from './text-tabs';

export type BuilderRole = 'owner' | 'admin' | 'project_manager';

export interface TabProps {
  data: EstimateWithChildren;
  role: BuilderRole;
  userId: string;
  canEdit: boolean;
  reload: () => Promise<void>;
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

const TABS: Array<{ key: TabKey; label: string; disabled?: boolean }> = [
  { key: 'details', label: 'Details' },
  { key: 'items', label: 'Items' },
  { key: 'terms', label: 'Terms' },
  { key: 'scope', label: 'Scope of Work' },
  { key: 'bidding', label: 'Bidding' },
  { key: 'files', label: 'Files', disabled: true },
  { key: 'cover', label: 'Cover Sheet' },
  { key: 'notes', label: 'Notes' },
];

interface EstimateBuilderProps {
  estimateId: string;
  role: BuilderRole;
  userId: string;
}

export function EstimateBuilder({ estimateId, role, userId }: EstimateBuilderProps) {
  const router = useRouter();
  const [data, setData] = useState<EstimateWithChildren | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('details');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);

  const reload = useCallback(async () => {
    const fresh = await getEstimate(estimateId);
    setData(fresh);
  }, [estimateId]);

  useEffect(() => {
    setLoading(true);
    reload().then(() => setLoading(false));
  }, [reload]);

  if (loading) {
    return <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Loading estimate…</p>;
  }

  if (!data || data.estimate.is_deleted) {
    return (
      <div>
        <p style={{ color: '#991b1b', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Estimate not found.
        </p>
        <Link href="/dashboard/estimates" style={{ color: '#2563eb', fontSize: '0.875rem' }}>
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

  function statusActionButton() {
    const buttonStyle: React.CSSProperties = {
      padding: '0.5rem 1rem',
      fontSize: '0.875rem',
      fontWeight: 600,
      color: '#fff',
      backgroundColor: actionBusy ? '#9ca3af' : '#2563eb',
      border: 'none',
      borderRadius: '0.375rem',
      cursor: actionBusy ? 'not-allowed' : 'pointer',
    };

    if (estimate.status === 'draft' && isManager) {
      return (
        <button
          type="button"
          disabled={actionBusy}
          style={buttonStyle}
          onClick={() => {
            if (
              window.confirm(
                'Mark this estimate as sent? It will be frozen — no further edits without a new version.'
              )
            ) {
              runAction(() => markAsSent(estimate.id));
            }
          }}
        >
          Mark as Sent
        </button>
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
        <button
          type="button"
          disabled={actionBusy}
          style={buttonStyle}
          onClick={() => {
            if (
              window.confirm('Approve and send this estimate? It will be frozen after sending.')
            ) {
              runAction(() => approveAndSend(estimate.id));
            }
          }}
        >
          Approve &amp; Send
        </button>
      );
    }
    return null;
  }

  async function handleDelete() {
    if (
      !window.confirm(
        `Delete estimate ${estimate.estimate_number} — "${estimate.name}"? It moves to trash.`
      )
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

  const tabProps: TabProps = { data, role, userId, canEdit, reload };

  return (
    <div style={{ display: 'flex', gap: '1.5rem', minHeight: '70vh' }}>
      {/* Sidebar */}
      <aside style={{ width: '180px', flexShrink: 0 }}>
        <Link
          href="/dashboard/estimates"
          style={{
            display: 'block',
            fontSize: '0.875rem',
            color: '#6b7280',
            textDecoration: 'none',
            marginBottom: '1rem',
          }}
        >
          ← Back
        </Link>
        <nav>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              disabled={tab.disabled}
              onClick={() => !tab.disabled && setActiveTab(tab.key)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '0.5rem 0.75rem',
                marginBottom: '0.125rem',
                fontSize: '0.875rem',
                fontWeight: activeTab === tab.key ? 600 : 400,
                color: tab.disabled ? '#9ca3af' : activeTab === tab.key ? '#1d4ed8' : '#374151',
                backgroundColor: activeTab === tab.key ? '#eff6ff' : 'transparent',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: tab.disabled ? 'not-allowed' : 'pointer',
              }}
            >
              {tab.label}
              {tab.disabled && (
                <span style={{ fontSize: '0.625rem', display: 'block', color: '#9ca3af' }}>
                  Coming soon
                </span>
              )}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main panel */}
      <div style={{ flex: 1, minWidth: 0, paddingBottom: '5rem' }}>
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
                color: '#6b7280',
              }}
            >
              <span style={{ fontWeight: 600 }}>{estimate.estimate_number}</span>
              <span>{estimate.version_number}</span>
              <StatusBadge status={estimate.status} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
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
              backgroundColor: '#fef2f2',
              color: '#991b1b',
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
              backgroundColor: '#fffbeb',
              color: '#92400e',
              fontSize: '0.8125rem',
            }}
          >
            This estimate is {estimate.status === 'review' ? 'in review' : estimate.status} and
            frozen — fields cannot be edited.
          </div>
        )}

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
          backgroundColor: '#111827',
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
        <span>
          Tax <strong>{fmtMoney(estimate.tax_total)}</strong>
        </span>
        <span>
          Discount <strong>−{fmtMoney(estimate.discount_total)}</strong>
        </span>
        <span>
          Grand Total <strong>{fmtMoney(estimate.grand_total)}</strong>
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
    </div>
  );
}
