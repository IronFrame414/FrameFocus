'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { convertEstimateToProject } from '@/lib/services/projects-client';

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

  if (projectId || status === 'converted') {
    if (variant === 'banner') {
      return (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.375rem',
            marginBottom: '1rem',
            backgroundColor: '#eff6ff',
            color: '#1e40af',
            fontSize: '0.875rem',
          }}
        >
          This estimate has been converted.{' '}
          {projectId && (
            <Link href={`/dashboard/projects/${projectId}`} style={{ fontWeight: 600 }}>
              View the project →
            </Link>
          )}
        </div>
      );
    }
    return null;
  }

  async function handleConvert() {
    if (
      !window.confirm(
        `Convert ${estimateNumber} to a project? All estimate data carries over and the estimate is marked converted.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    const result = await convertEstimateToProject(estimateId);
    if (result.success && result.projectId) {
      router.push(`/dashboard/projects/${result.projectId}`);
      router.refresh();
    } else {
      setError(result.error || 'Conversion failed');
      setBusy(false);
    }
  }

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
        backgroundColor: busy ? '#9ca3af' : '#16a34a',
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
        {error && (
          <span style={{ display: 'block', color: '#991b1b', fontSize: '0.75rem', marginTop: '0.25rem' }}>
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
        backgroundColor: '#f0fdf4',
        border: '1px solid #bbf7d0',
        fontSize: '0.875rem',
        color: '#166534',
        gap: '1rem',
      }}
    >
      <span>
        <strong>This estimate is signed.</strong> Convert it to a project to carry everything
        over — or revise and resend if the client requested changes.
      </span>
      <span style={{ flexShrink: 0 }}>{button}</span>
      {error && <span style={{ color: '#991b1b' }}>{error}</span>}
    </div>
  );
}
