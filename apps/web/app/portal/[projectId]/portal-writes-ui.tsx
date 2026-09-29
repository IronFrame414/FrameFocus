'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CONSENT_TEXT } from '@/lib/proposal/proposal-defaults';
import { color, font } from '@/lib/theme';
import {
  Panel,
  SignatureCapture as BaseSignatureCapture,
  buttonStyle,
  secondaryButtonStyle,
  type SignatureCaptureLabels,
} from '@/components/signature/signature-capture';
import type { UploadOutcome } from '@/lib/uploads/upload-batch';
import { doneIds, hasUnfinished, useUploadBatches } from '@/lib/uploads/use-upload-batches';
import { UploadBatchList } from '@/components/uploads/upload-batch-list';

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
 *
 * [S118 item 11] The capture now lives in components/signature/ (a third
 * caller, the material sign-out, is not in the portal). Re-exported below so
 * the portal callers import from here unchanged.
 */

export { Panel, buttonStyle, secondaryButtonStyle };

// The portal is English only (ruling 5): the capture's own words, as they read
// before the move, byte for byte.
const PORTAL_SIGNATURE_LABELS: SignatureCaptureLabels = {
  fullName: 'Your full name',
  typeIt: 'Type it',
  drawIt: 'Draw it',
  typePlaceholder: 'Type your name',
  drawFirst: 'Please draw your signature first.',
  cancel: 'Cancel',
};

export function SignatureCapture(
  props: Omit<React.ComponentProps<typeof BaseSignatureCapture>, 'labels'>
) {
  return <BaseSignatureCapture {...props} labels={PORTAL_SIGNATURE_LABELS} />;
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
 *
 * [S116 F-12, #2-s180u] The photos now go through the shared upload queue
 * (`runUploadBatch`: ≤3 in flight, each photo named, Retry for just the ones
 * that failed) via `POST /api/portal/photos`, and the message posts ONLY once
 * they have all landed — or when she chooses to send without the missing ones.
 * The unit holds in the data: the message is written after its photos are real,
 * and carries exactly the ones that landed. _Superseded, quoted:_ `for (const f
 * of files) form.append('photos', f);` — one request, failing the whole send at
 * the first bad photo, with no retry.
 */
const MAX_COMPOSER_PHOTOS = 6;

export function ClientComposer({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const batches = useUploadBatches();
  const hasBatch = batches.items('photos').length > 0;

  const ready = body.trim().length > 0 || files.length > 0;

  async function uploadOne(file: File): Promise<UploadOutcome> {
    const form = new FormData();
    form.set('projectId', projectId);
    form.set('photo', file);
    const res = await fetch('/api/portal/photos', { method: 'POST', body: form });
    const payload = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!res.ok || !payload.id) {
      return { success: false, error: payload.error ?? `Upload failed (${res.status})` };
    }
    return { success: true, id: payload.id };
  }

  async function send(sendWithoutMissing = false) {
    setError(null);
    setWarning(null);
    if (files.length > MAX_COMPOSER_PHOTOS) {
      setError(`Please send at most ${MAX_COMPOSER_PHOTOS} photos at a time.`);
      return;
    }
    setBusy(true);
    try {
      let rows = batches.items('photos');
      if (!sendWithoutMissing && files.length > 0) {
        rows = hasBatch
          ? await batches.retry('photos')
          : await batches.start('photos', files, uploadOne);
        // Nothing is posted while a photo is missing: the list names it, with
        // Retry, and "Send without" if she would rather not wait.
        if (hasUnfinished(rows)) return;
      }

      const form = new FormData();
      form.set('projectId', projectId);
      form.set('body', body);
      for (const id of doneIds(rows)) form.append('fileIds', id);

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
      batches.clear('photos');
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
          // While a batch is pending the set is fixed: its Retry re-sends only
          // the missing ones, and a newly picked photo would not be among them.
          disabled={hasBatch}
          data-testid="portal-composer-input"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          style={{ fontSize: '12.5px', color: color.bodyAlt }}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!ready || busy}
          style={buttonStyle(ready && !busy)}
          data-testid="portal-composer-send"
        >
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
      <div style={{ marginTop: '8px' }}>
        <UploadBatchList
          items={batches.items('photos')}
          busy={batches.busy('photos')}
          onRetry={() => void send()}
          testId="portal-composer-batch"
        />
        {hasBatch && !busy && hasUnfinished(batches.items('photos')) && (
          <button
            type="button"
            onClick={() => void send(true)}
            data-testid="portal-composer-send-without"
            style={{ ...buttonStyle(true), marginTop: '6px' }}
          >
            Send without the missing photos
          </button>
        )}
      </div>
      {files.length > 0 && (
        <p style={{ fontSize: '12px', color: color.muted, margin: '8px 0 0' }}>
          {files.length} photo{files.length === 1 ? '' : 's'} will be sent with this message.
        </p>
      )}
      {error && <p style={{ fontSize: '12.5px', color: color.danger, margin: '8px 0 0' }}>{error}</p>}
      {warning && (
        <p style={{ fontSize: '12.5px', color: color.warning, margin: '8px 0 0' }}>{warning}</p>
      )}
    </Panel>
  );
}
