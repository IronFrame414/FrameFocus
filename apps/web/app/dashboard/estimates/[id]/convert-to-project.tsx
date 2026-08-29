'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { convertEstimateToProject } from '@/lib/services/projects-client';
import {
  listFlatLinesMissingCost,
  setLineOverrideCost,
} from '@/lib/services/estimate-items-client';
import { fmtMoney } from '../labels';
import { useConfirm } from '@/components/confirm/confirm-provider';

type PreflightLine = { id: string; name: string; total_price_override: number | null };

interface ConvertToProjectProps {
  estimateId: string;
  estimateNumber: string;
  status: string;
  projectId: string | null;
  /** banner = post-signature prompt; button = compact header action */
  variant: 'banner' | 'button';
}

/**
 * 5A §8 / §5.13 #4 — "Convert to Project": role-gated Owner/Admin/PM (the DB
 * RPC enforces it), available regardless of status. Signature only triggers
 * the prompt (banner variant on accepted estimates); it never gates conversion.
 */
export function ConvertToProject({
  estimateId,
  estimateNumber,
  status,
  projectId,
  variant,
}: ConvertToProjectProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // S-6 pre-flight (money representation §7.1): flat-priced lines missing a
  // cost basis, listed with inline inputs. Non-null = the modal is open.
  const [preflight, setPreflight] = useState<PreflightLine[] | null>(null);
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const confirm = useConfirm();

  if (projectId || status === 'converted') {
    if (variant === 'banner') {
      return (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.375rem',
            marginBottom: '1rem',
            backgroundColor: '#f2f4ff',
            color: '#3b4ae0',
            fontSize: '0.875rem',
          }}
        >
          This estimate has been converted.{' '}
          {projectId && (
            <>
              <Link href={`/dashboard/projects/${projectId}`} style={{ fontWeight: 600 }}>
                View the project →
              </Link>{' '}
              {/* 18a — the convert success path offers PO drafting; the
                  Deliveries tab hosts the modal (skipping = not going). */}
              <Link
                href={`/dashboard/field-ops/${projectId}/deliveries`}
                style={{ fontWeight: 600 }}
              >
                · Draft POs from the estimate →
              </Link>
            </>
          )}
        </div>
      );
    }
    return null;
  }

  async function runConversion() {
    const result = await convertEstimateToProject(estimateId);
    if (result.success && result.projectId) {
      router.push(`/dashboard/projects/${result.projectId}`);
      router.refresh();
    } else {
      setError(result.error || 'Conversion failed');
      setBusy(false);
    }
  }

  async function handleConvert() {
    setBusy(true);
    setError(null);

    // S-6 pre-flight: any flat-priced line without a cost basis must get one
    // before conversion — required fill-in, not a silent zero and not a
    // dead end (OQ-10).
    const missing = await listFlatLinesMissingCost(estimateId);
    if (missing.length > 0) {
      setCosts({});
      setPreflightError(null);
      setPreflight(missing);
      setBusy(false);
      return;
    }

    if (
      !(await confirm(
        `Convert ${estimateNumber} to a project? All estimate data carries over and the estimate is marked converted.`
      ))
    ) {
      setBusy(false);
      return;
    }
    await runConversion();
  }

  const parsedCosts = (preflight ?? []).map((line) => {
    const raw = (costs[line.id] ?? '').trim();
    const num = raw === '' ? NaN : Number(raw);
    return { line, value: Number.isFinite(num) && num >= 0 ? num : null };
  });
  const allCostsFilled = parsedCosts.length > 0 && parsedCosts.every((c) => c.value != null);

  async function handlePreflightConvert() {
    if (!allCostsFilled) return;
    setBusy(true);
    setPreflightError(null);
    // Writes go through set_line_override_cost (§5.5) — a plain line UPDATE
    // is RLS-blocked outside draft, and conversion usually runs on an
    // accepted estimate.
    for (const { line, value } of parsedCosts) {
      const result = await setLineOverrideCost(line.id, value as number);
      if (!result.success) {
        setPreflightError(`${line.name}: ${result.error || 'save failed'}`);
        setBusy(false);
        return;
      }
    }
    setPreflight(null);
    await runConversion();
  }

  // S-6 pre-flight modal: required cost fill-in for flat-priced lines.
  const preflightModal = preflight && (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(17, 24, 39, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '0.5rem',
          padding: '1.25rem',
          width: '480px',
          maxWidth: '92vw',
          maxHeight: '80vh',
          overflowY: 'auto',
        }}
      >
        <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.25rem' }}>
          Enter costs to convert
        </h2>
        <p style={{ fontSize: '0.8125rem', color: '#7b8699', margin: '0 0 1rem' }}>
          These flat-priced lines have a price but no cost. The project budget is built from
          cost — enter what each line costs you (not what the client pays) to continue.
        </p>

        {preflight.map((line) => (
          <div
            key={line.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.375rem 0',
              fontSize: '0.875rem',
            }}
          >
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {line.name}
              <span style={{ color: '#7b8699', marginLeft: '0.5rem' }}>
                priced {fmtMoney(line.total_price_override)}
              </span>
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Cost $"
              value={costs[line.id] ?? ''}
              onChange={(e) => setCosts((c) => ({ ...c, [line.id]: e.target.value }))}
              style={{
                width: '110px',
                padding: '0.25rem 0.5rem',
                border: '1px solid #d5dae4',
                borderRadius: '0.25rem',
                fontSize: '0.875rem',
                textAlign: 'right',
                flexShrink: 0,
              }}
            />
          </div>
        ))}

        {preflightError && (
          <div style={{ color: '#c0362c', fontSize: '0.8125rem', margin: '0.5rem 0' }}>
            {preflightError}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.5rem',
            marginTop: '1rem',
          }}
        >
          <button
            type="button"
            disabled={busy}
            onClick={() => setPreflight(null)}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              backgroundColor: '#f4f6fa',
              border: '1px solid #d5dae4',
              borderRadius: '0.375rem',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !allCostsFilled}
            onClick={handlePreflightConvert}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#fff',
              backgroundColor: busy || !allCostsFilled ? '#9aa4b8' : '#1f8f4e',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: busy || !allCostsFilled ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? 'Converting…' : `Save costs & convert ${estimateNumber}`}
          </button>
        </div>
      </div>
    </div>
  );

  const button = (
    <button
      type="button"
      disabled={busy}
      onClick={handleConvert}
      style={{
        padding: '0.5rem 1rem',
        fontSize: '0.875rem',
        fontWeight: 600,
        color: '#fff',
        backgroundColor: busy ? '#9aa4b8' : '#1f8f4e',
        border: 'none',
        borderRadius: '0.375rem',
        cursor: busy ? 'not-allowed' : 'pointer',
      }}
    >
      {busy ? 'Converting…' : 'Convert to Project'}
    </button>
  );

  if (variant === 'button') {
    return (
      <span>
        {button}
        {preflightModal}
        {error && (
          <span style={{ display: 'block', color: '#c0362c', fontSize: '0.75rem', marginTop: '0.25rem' }}>
            {error}
          </span>
        )}
      </span>
    );
  }

  // Banner: the post-signature conversion prompt
  if (status !== 'accepted') return null;

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.75rem 1rem',
        borderRadius: '0.375rem',
        marginBottom: '1rem',
        backgroundColor: '#e6f0e9',
        border: '1px solid #e6f0e9',
        fontSize: '0.875rem',
        color: '#1f8f4e',
        gap: '1rem',
      }}
    >
      <span>
        <strong>This estimate is signed.</strong> Convert it to a project to carry everything
        over — or revise and resend if the client requested changes.
      </span>
      <span style={{ flexShrink: 0 }}>{button}</span>
      {preflightModal}
      {error && <span style={{ color: '#c0362c' }}>{error}</span>}
    </div>
  );
}
