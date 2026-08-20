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
 */

function Panel({ children }: { children: React.ReactNode }) {
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

const buttonStyle = (enabled: boolean): React.CSSProperties => ({
  fontSize: '13px',
  fontWeight: 700,
  padding: '8px 15px',
  borderRadius: '9px',
  border: 'none',
  cursor: enabled ? 'pointer' : 'not-allowed',
  backgroundColor: enabled ? color.primary : color.faintAlt,
  color: '#ffffff',
});

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

  async function sign() {
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
      const res = await fetch('/api/portal/sign-co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          changeOrderId,
          signature_type: method,
          signature_data: signatureData,
          signer_name: signerName.trim(),
          consent_given: true,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? 'That signature could not be recorded.');
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={buttonStyle(true)}>
        Review and sign
      </button>
    );
  }

  return (
    <Panel>
      <p style={{ fontSize: '13.5px', fontWeight: 700, color: color.navy, margin: '0 0 10px' }}>
        Sign {title}
      </p>

      <label style={{ display: 'block', fontSize: '12.5px', color: color.bodyAlt, marginBottom: '4px' }}>
        Your full name
      </label>
      <input
        value={signerName}
        onChange={(e) => setSignerName(e.target.value)}
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
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        {/* The SAME words the emailed signing page attests to. The channel
            sentence is appended server-side, so the record says which surface
            produced the signature without this checkbox having to. */}
        <span>{CONSENT_TEXT}</span>
      </label>

      {error && <p style={{ fontSize: '12.5px', color: color.danger, margin: '0 0 10px' }}>{error}</p>}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="button" onClick={sign} disabled={!ready || busy} style={buttonStyle(ready && !busy)}>
          {busy ? 'Signing…' : 'Sign change order'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{
            fontSize: '13px',
            fontWeight: 600,
            padding: '8px 14px',
            borderRadius: '9px',
            border: `1px solid ${color.inputBorder}`,
            backgroundColor: color.cardBg,
            color: color.bodyAlt,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </Panel>
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
