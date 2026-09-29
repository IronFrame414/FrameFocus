'use client';

import { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { typedSignatureToDataUrl } from '@/lib/signature-image';
import { cardStyle, color } from '@/lib/theme';

/**
 * ⚠️ THE ONE SIGNATURE CAPTURE. [moved here S118 item 11, from
 * app/portal/[projectId]/portal-writes-ui.tsx, unchanged]
 *
 * The material sign-out (item 11) is the third signable instrument and the first
 * one outside the portal. CLAUDE.md PARITY: a helper under a surface claims that
 * surface owns it, so the capture moved to components/ rather than being copied
 * to /m. The portal file re-exports these names, so its callers are untouched.
 */

export function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        ...cardStyle,
        padding: '16px 18px',
        marginTop: '10px',
        backgroundColor: color.pageBg,
      }}
    >
      {children}
    </div>
  );
}

export const buttonStyle = (enabled: boolean): React.CSSProperties => ({
  fontSize: '13px',
  fontWeight: 700,
  padding: '8px 15px',
  borderRadius: '9px',
  border: 'none',
  cursor: enabled ? 'pointer' : 'not-allowed',
  backgroundColor: enabled ? color.primary : color.faintAlt,
  color: '#ffffff',
});

export const secondaryButtonStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  padding: '8px 14px',
  borderRadius: '9px',
  border: `1px solid ${color.inputBorder}`,
  backgroundColor: color.cardBg,
  color: color.bodyAlt,
  cursor: 'pointer',
};

// ───────────────────────────────────────────────────────────────────────────
/**
 * ⚠️ ONE SIGNATURE CAPTURE FOR THE WHOLE PORTAL. [extracted S175 stage 7]
 *
 * The header above says the capture is the same capture, and until stage 7 that
 * was true because there was exactly one of them. Stage 7 adds a SECOND signable
 * instrument — the selection (§6.2: the selection signature IS the binding
 * instrument; no change order is generated) — and the tempting move is to copy
 * `CoSignPanel` and swap the endpoint. That is CLAUDE.md's `#129` in its usual
 * disguise: two panels that agree today, drifting later into two different
 * attestations, two different images, or one that quietly stops trimming the
 * drawn canvas.
 *
 * So the panel is extracted and BOTH instruments render this one. What differs
 * between them is passed in and is exactly what should differ: the words being
 * attested to, the labels, and where the signature is posted. What must not
 * differ — draw-or-type, `react-signature-canvas`, `typedSignatureToDataUrl()`,
 * the trimmed-canvas PNG, the consent gate — is here, and is not a parameter.
 *
 * `onSubmit` returns an error STRING or null rather than throwing, so a refusal
 * from either route surfaces in the panel carrying the SERVER's own sentence.
 * The selection RPC's refusals are written to be read by a person.
 */
/**
 * [S118 item 11] The capture's OWN words, supplied by the caller. /m renders
 * this component and must translate it (the /m anti-rot guard); the client portal
 * renders it and must NEVER reach a translation (ruling 5). So the words are a
 * prop: the portal passes `PORTAL_SIGNATURE_LABELS` (English, portal-side), /m
 * passes t(). What the capture DOES is still not a parameter.
 */
export interface SignatureCaptureLabels {
  fullName: string;
  typeIt: string;
  drawIt: string;
  typePlaceholder: string;
  drawFirst: string;
  cancel: string;
}

export function SignatureCapture({
  title,
  defaultName,
  consentText,
  submitLabel,
  busyLabel,
  onSubmit,
  onCancel,
  testId,
  labels,
}: {
  title: string;
  defaultName: string;
  consentText: string;
  submitLabel: string;
  busyLabel: string;
  onSubmit: (payload: {
    signature_type: 'draw' | 'type';
    signature_data: string;
    signer_name: string;
  }) => Promise<string | null>;
  onCancel: () => void;
  testId?: string;
  labels: SignatureCaptureLabels;
}) {
  const [method, setMethod] = useState<'draw' | 'type'>('type');
  const [signerName, setSignerName] = useState(defaultName);
  const [typed, setTyped] = useState(defaultName);
  const [consent, setConsent] = useState(false);
  const [drawDirty, setDrawDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const padRef = useRef<SignatureCanvas | null>(null);

  const ready =
    signerName.trim().length > 0 &&
    consent &&
    (method === 'draw' ? drawDirty : typed.trim().length > 0);

  async function submit() {
    setError(null);
    let signatureData: string;
    if (method === 'draw') {
      const pad = padRef.current;
      if (!pad || pad.isEmpty()) {
        setError(labels.drawFirst);
        return;
      }
      signatureData = pad.getTrimmedCanvas().toDataURL('image/png');
    } else {
      signatureData = typedSignatureToDataUrl(typed.trim());
    }
    setBusy(true);
    try {
      const err = await onSubmit({
        signature_type: method,
        signature_data: signatureData,
        signer_name: signerName.trim(),
      });
      if (err) setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <p style={{ fontSize: '13.5px', fontWeight: 700, color: color.navy, margin: '0 0 10px' }}>
        {title}
      </p>

      <label style={{ display: 'block', fontSize: '12.5px', color: color.bodyAlt, marginBottom: '4px' }}>
        {labels.fullName}
      </label>
      <input
        value={signerName}
        onChange={(e) => setSignerName(e.target.value)}
        data-testid={testId ? `${testId}-name` : undefined}
        style={{
          width: '100%',
          padding: '8px 10px',
          fontSize: '16px', // [S118 item 11] ≥16px: /m renders this now (iOS focus zoom)
          borderRadius: '8px',
          border: `1px solid ${color.inputBorder}`,
          marginBottom: '12px',
        }}
      />

      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
        {(['type', 'draw'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMethod(m)}
            style={{
              fontSize: '12.5px',
              fontWeight: 600,
              padding: '6px 12px',
              borderRadius: '8px',
              border: `1px solid ${method === m ? color.primary : color.inputBorder}`,
              backgroundColor: method === m ? color.blueTint : color.cardBg,
              color: method === m ? color.primary : color.bodyAlt,
              cursor: 'pointer',
            }}
          >
            {m === 'type' ? labels.typeIt : labels.drawIt}
          </button>
        ))}
      </div>

      {method === 'draw' ? (
        <div style={{ border: `1px solid ${color.inputBorder}`, borderRadius: '8px', backgroundColor: '#fff' }}>
          <SignatureCanvas
            ref={(r) => {
              padRef.current = r;
            }}
            penColor="#111827"
            onEnd={() => setDrawDirty(true)}
            canvasProps={{ width: 560, height: 150, style: { width: '100%', height: '150px' } }}
          />
        </div>
      ) : (
        <>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={labels.typePlaceholder}
            data-testid={testId ? `${testId}-typed` : undefined}
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: '16px', // [S118 item 11] ≥16px (iOS focus zoom)
              borderRadius: '8px',
              border: `1px solid ${color.inputBorder}`,
            }}
          />
          {typed.trim() && (
            <div
              style={{
                marginTop: '8px',
                padding: '10px 12px',
                borderRadius: '8px',
                backgroundColor: '#fff',
                border: `1px solid ${color.inputBorder}`,
                fontFamily: '"Brush Script MT", "Segoe Script", cursive',
                fontSize: '28px',
                color: '#111827',
              }}
            >
              {typed.trim()}
            </div>
          )}
        </>
      )}

      <label
        style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'flex-start',
          margin: '12px 0',
          fontSize: '12.5px',
          color: color.bodyAlt,
          lineHeight: 1.5,
        }}
      >
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          data-testid={testId ? `${testId}-consent` : undefined}
        />
        {/* The words attested to are the caller's, because they differ per
            instrument and must match what the server stores. A change order
            attests to `CONSENT_TEXT`; a selection attests to §6.2's binding
            wording over the figures she is looking at. */}
        <span data-testid={testId ? `${testId}-consent-text` : undefined}>{consentText}</span>
      </label>

      {error && (
        <p
          data-testid={testId ? `${testId}-error` : undefined}
          style={{ fontSize: '12.5px', color: color.danger, margin: '0 0 10px' }}
        >
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          type="button"
          onClick={submit}
          disabled={!ready || busy}
          style={buttonStyle(ready && !busy)}
          data-testid={testId ? `${testId}-submit` : undefined}
        >
          {busy ? busyLabel : submitLabel}
        </button>
        <button type="button" onClick={onCancel} style={secondaryButtonStyle}>
          {labels.cancel}
        </button>
      </div>
    </Panel>
  );
}
