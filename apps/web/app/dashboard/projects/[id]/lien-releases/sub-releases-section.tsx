'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  attachSignedSubRelease,
  markSubContractComplete,
  reopenSubContract,
} from '@/lib/services/lien-releases-client';
import { badgeStyle, cardStyle, color, font, microLabelStyle, secondaryButtonStyle } from '@/lib/theme';

// Redesign 6.4 — SUB-INBOUND lien releases: the UI over shipped schema.
// Everything below this component existed already: the 7F §12 schema
// (`lien_releases_subject_check` keyed on direction), the four pre-named sub
// templates per company (S145-S1), the generate route's sub_inbound arm (no
// stamping on this direction — the SUB is the lienor), completion marking
// (Owner/Admin at the database), and upload-back. This section is the first
// surface that mounts them.
//
// S145 rulings, NOT reopened here:
//   · signing is UPLOAD-BACK — no tokenised link, no new external surface;
//   · two triggers, and the TYPE differs by trigger: sub completion →
//     conditional; payment → unconditional;
//   · BOTH TRIGGERS ARE OPTIONAL. This section PROMPTS; it never blocks.

interface SubTemplate {
  id: string;
  name: string;
  type: string;
  is_final: boolean;
  hasPdf: boolean;
}

interface SubRelease {
  id: string;
  type: string;
  is_final: boolean;
  status: string;
  sub_contract_id: string | null;
  expense_id: string | null;
  created_at: string | null;
}

interface SubContractRow {
  id: string;
  subName: string;
  completed: boolean;
}

export function SubReleasesSection({
  projectId,
  releases,
  templates,
  subContracts,
}: {
  projectId: string;
  releases: SubRelease[];
  templates: SubTemplate[];
  subContracts: SubContractRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const conditionalTemplates = templates.filter((t) => t.type === 'conditional' && t.hasPdf);

  async function run(key: string, fn: () => Promise<{ success: boolean; error?: string }>) {
    setBusy(key);
    setError(null);
    const result = await fn();
    setBusy(null);
    if (!result.success) {
      setError(result.error ?? 'That did not work.');
      return;
    }
    router.refresh();
  }

  async function generateConditional(subContractId: string) {
    const template = conditionalTemplates[0];
    if (!template) {
      setError(
        'No conditional sub release form has a PDF uploaded yet — upload one in Settings → Documents first. A form with no PDF cannot be issued (the uploaded form IS the legal instrument).'
      );
      return;
    }
    setBusy(`gen-${subContractId}`);
    setError(null);
    const res = await fetch('/api/lien-releases/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId: template.id, subTrigger: 'completion', subContractId }),
    });
    setBusy(null);
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload.error ?? 'Could not generate the release.');
      return;
    }
    router.refresh();
  }

  async function handleUpload(releaseId: string, file: File | null) {
    if (!file) return;
    await run(`upload-${releaseId}`, () => attachSignedSubRelease(releaseId, file));
  }

  const releaseFor = (subContractId: string) =>
    releases.find((r) => r.sub_contract_id === subContractId);

  return (
    <div style={{ ...cardStyle, padding: '16px 18px', marginTop: '18px' }}>
      <p style={{ ...microLabelStyle, marginBottom: '4px' }}>Sub releases (inbound)</p>
      <p style={{ fontSize: '12px', color: color.faint, margin: '0 0 12px' }}>
        The sub is the lienor: send the form, the signed copy comes back and is uploaded. Both
        prompts below are optional — nothing here blocks a payment or a completion.
      </p>

      {error && (
        <p style={{ fontSize: '12.5px', color: color.danger, margin: '0 0 10px', fontWeight: 600 }}>
          {error}
        </p>
      )}

      {subContracts.length === 0 ? (
        <p style={{ fontSize: '13px', color: color.muted, margin: 0 }}>
          No subcontracts on this job yet.
        </p>
      ) : (
        subContracts.map((sc) => {
          const release = releaseFor(sc.id);
          return (
            <div
              key={sc.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap',
                padding: '10px 0',
                borderTop: `1px solid ${color.rowDivider}`,
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 600, color: color.navy, minWidth: '160px' }}>
                {sc.subName}
              </span>
              <span
                style={{
                  ...badgeStyle,
                  backgroundColor: sc.completed ? color.successBg : color.neutralBadgeBg,
                  color: sc.completed ? color.successOnBg : color.neutralBadgeText,
                }}
              >
                {sc.completed ? 'Complete' : 'In progress'}
              </span>
              {release && (
                <span style={{ ...badgeStyle, backgroundColor: color.blueTintAlt, color: color.primary }}>
                  {release.type} release · {release.status}
                </span>
              )}

              <span style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
                {!sc.completed ? (
                  <button
                    type="button"
                    disabled={busy === `complete-${sc.id}`}
                    style={secondaryButtonStyle}
                    onClick={() => run(`complete-${sc.id}`, () => markSubContractComplete(sc.id))}
                  >
                    Mark complete
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy === `reopen-${sc.id}`}
                    style={secondaryButtonStyle}
                    onClick={() => run(`reopen-${sc.id}`, () => reopenSubContract(sc.id))}
                  >
                    Reopen
                  </button>
                )}
                {/* Completion → CONDITIONAL (S145). A prompt, not a gate. */}
                {sc.completed && !release && (
                  <button
                    type="button"
                    disabled={busy === `gen-${sc.id}`}
                    style={secondaryButtonStyle}
                    onClick={() => generateConditional(sc.id)}
                  >
                    {busy === `gen-${sc.id}` ? 'Generating…' : 'Request conditional release'}
                  </button>
                )}
                {/* Upload-back — the ONLY signing path on this direction. */}
                {release && release.status !== 'signed' && (
                  <label style={{ ...secondaryButtonStyle, cursor: 'pointer' }}>
                    {busy === `upload-${release.id}` ? 'Uploading…' : 'Upload signed copy'}
                    <input
                      type="file"
                      accept="application/pdf"
                      style={{ display: 'none' }}
                      onChange={(e) => handleUpload(release.id, e.target.files?.[0] ?? null)}
                    />
                  </label>
                )}
              </span>
            </div>
          );
        })
      )}

      <p style={{ fontSize: '11px', color: color.faint, margin: '10px 0 0', fontFamily: font.sans }}>
        Payment-triggered unconditional releases are prompted from the Bills side when a sub
        payment is recorded; both directions land in this list.
      </p>
    </div>
  );
}
