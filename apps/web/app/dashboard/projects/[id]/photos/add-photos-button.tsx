'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { uploadFile } from '@/lib/services/files-client';
import { primaryButtonStyle, color, font } from '@/lib/theme';

// S111 Part Two, RULED Q16 — "an 'Add photos' button that opens the library on
// both Photos pages". Before S111 the desktop gallery had NO upload control; its
// empty state said photos "land here from uploads…" and offered none.
//
// Library, not camera: no `capture` attribute, `multiple`. The write is the
// shared `uploadFile()` with category 'photos' — the same function, category and
// HEIC → JPEG step as every other photo upload, so nothing here decides what a
// photo is. /m's button is a label on the tab bar's own library input (same
// pipeline as the tab bar), because /m has a capture pipeline and desktop does not.
//
// The AI auto-tag call mirrors desktop Files upload (upload-form.tsx) — the
// route itself bails when the add-on is off. /m's capture pipeline does not
// auto-tag; that difference predates S111 and is not widened here.
export function AddPhotosButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    setBusy(true);
    setMessage(null);
    let failed = 0;
    for (const file of files) {
      const r = await uploadFile(file, { project_id: projectId, category: 'photos' });
      if (!r.success) {
        if (r.storageLimited) {
          setMessage(r.error ?? 'Storage limit reached.');
          break;
        }
        failed += 1;
        continue;
      }
      if (r.id) {
        fetch('/api/files/auto-tag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId: r.id }),
        }).catch(() => {});
      }
    }
    if (failed > 0) setMessage(`${failed} of ${files.length} photos could not be uploaded.`);
    setBusy(false);
    router.refresh();
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      {message && (
        <span
          role="alert"
          data-testid="photos-add-error"
          style={{ fontFamily: font.sans, fontSize: '13px', color: color.danger }}
        >
          {message}
        </span>
      )}
      <button
        type="button"
        data-testid="photos-add"
        disabled={busy}
        onClick={() => input.current?.click()}
        style={{ ...primaryButtonStyle, opacity: busy ? 0.6 : 1 }}
      >
        {busy ? 'Uploading…' : 'Add photos'}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        data-testid="photos-add-input"
        style={{ display: 'none' }}
        onChange={onPick}
      />
    </div>
  );
}
