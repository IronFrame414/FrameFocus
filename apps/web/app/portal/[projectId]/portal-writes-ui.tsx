'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import SignatureCanvas from 'react-signature-canvas';
import { CONSENT_TEXT } from '@/lib/proposal/proposal-defaults';
import { typedSignatureToDataUrl } from '@/lib/signature-image';
import { cardStyle, color, font } from '@/lib/theme';

/**
 * M9 stage 5 — the client's two write surfaces, rendered.
 *
 * ⚠️ THE CAPTURE IS THE SAME CAPTURE. Draw-or-type, the same
 * `react-signature-canvas`, the same `typedSignatureToDataUrl()` (extracted
 * from the two tokenised pages in this commit rather than copied a third time),
 * and the same `CONSENT_TEXT`. §7.1's warning is about the WRITE path, and it
 * applies just as hard to what is captured before it: a portal signature that
 * produced a different image, or attested to different words, would be a second
 * implementation wearing the first one's name.
 *
 * [S175 stage 7] AND IT IS NOW ENFORCED RATHER THAN OBSERVED. The capture was
 * extracted into `SignatureCapture` below when the selection became the second
 * signable instrument; `portal-selections-ui.tsx` renders that same component.
 * The sentence above was true because there was one panel — it is now true
 * because there is one panel and two callers.
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
export function SignatureCapture({
  title,
  defaultName,
  consentText,
  submitLabel,
  busyLabel,
  onSubmit,
  onCancel,
  testId,
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
        setError('Please draw your signature first.');
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
        Your full name
      </label>
      <input
        value={signerName}
        onChange={(e) => setSignerName(e.target.value)}
        data-testid={testId ? `${testId}-name` : undefined}
        style={{
          width: '100%',
          padding: '8px 10px',
          fontSize: '14px',
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
            {m === 'type' ? 'Type it' : 'Draw it'}
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
            placeholder="Type your name"
            data-testid={testId ? `${testId}-typed` : undefined}
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: '14px',
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
          Cancel
        </button>
      </div>
    </Panel>
  );
}

// ───────────────────────────────────────────────────────────────────────────
export function CoSignPanel({
  changeOrderId,
  title,
  defaultName,
}: {
  changeOrderId: string;
  title: string;
  defaultName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={buttonStyle(true)}>
        Review and sign
      </button>
    );
  }

  return (
    <SignatureCapture
      title={`Sign ${title}`}
      defaultName={defaultName}
      /* The SAME words the emailed signing page attests to. The channel
         sentence is appended server-side, so the record says which surface
         produced the signature without this checkbox having to. */
      consentText={CONSENT_TEXT}
      submitLabel="Sign change order"
      busyLabel="Signing…"
      onCancel={() => setOpen(false)}
      onSubmit={async (payload) => {
        const res = await fetch('/api/portal/sign-co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ changeOrderId, ...payload, consent_given: true }),
        });
        const body = await res.json();
        if (!res.ok) return body.error ?? 'That signature could not be recorded.';
        setOpen(false);
        router.refresh();
        return null;
      }}
    />
  );
}

// ───────────────────────────────────────────────────────────────────────────
/**
 * R11 — the composer. **One send, one message, N photos.**
 *
 * The photos and the note go in ONE request for the reason §7.2 gives: *"photo
 * and note stay tied together — one unit, not two records."* A composer that
 * uploaded photos as they were picked and posted the note separately would
 * satisfy the sentence in the UI and break it in the data.
 */
export function ClientComposer({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const ready = body.trim().length > 0 || files.length > 0;

  async function send() {
    setError(null);
    setWarning(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.set('projectId', projectId);
      form.set('body', body);
      for (const f of files) form.append('photos', f);

      const res = await fetch('/api/portal/messages', { method: 'POST', body: form });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? 'Your message could not be sent.');
        return;
      }
      // A warning on a SUCCESS means the message posted and a photo did not
      // attach. Clearing the form is correct — re-sending would double-post.
      if (payload.warning) setWarning(payload.warning);
      setBody('');
      setFiles([]);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Ask a question, or say something about a photo…"
        rows={3}
        style={{
          width: '100%',
          padding: '9px 11px',
          fontSize: '14px',
          fontFamily: font.sans,
          borderRadius: '8px',
          border: `1px solid ${color.inputBorder}`,
          resize: 'vertical',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          style={{ fontSize: '12.5px', color: color.bodyAlt }}
        />
        <button type="button" onClick={send} disabled={!ready || busy} style={buttonStyle(ready && !busy)}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
      {files.length > 0 && (
        <p style={{ fontSize: '12px', color: color.muted, margin: '8px 0 0' }}>
          {files.length} photo{files.length === 1 ? '' : 's'} will be sent with this message.
        </p>
      )}
      {error && <p style={{ fontSize: '12.5px', color: color.danger, margin: '8px 0 0' }}>{error}</p>}
      {warning && (
        <p style={{ fontSize: '12.5px', color: color.warningDeep, margin: '8px 0 0' }}>{warning}</p>
      )}
    </Panel>
  );
}
