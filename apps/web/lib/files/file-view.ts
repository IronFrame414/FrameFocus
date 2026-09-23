/**
 * S109 #161 — pure helpers for the file sheet (`components/files/file-sheet.tsx`).
 * No React, no DOM — so they are unit-testable in node, and so both surfaces
 * decide these things the same way (CLAUDE.md → PARITY: the rule lives below
 * the UI).
 */

export type FileViewKind = 'pdf' | 'image' | 'heic' | 'video' | 'audio' | 'none';

const EXT_KIND: Record<string, FileViewKind> = {
  pdf: 'pdf',
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  gif: 'image',
  webp: 'image',
  heic: 'heic',
  heif: 'heic',
  mp4: 'video',
  mov: 'video',
  webm: 'video',
  mp3: 'audio',
  m4a: 'audio',
  wav: 'audio',
  ogg: 'audio',
};

/**
 * What the sheet can show for a file. MIME first (what storage recorded), the
 * extension as the fallback (several callers only know the name).
 *
 * ⚠️ `'none'` is a real answer, not an error: `project-files` accepts any type
 * (no `allowed_mime_types`, no `accept` on the main upload), so a Word document
 * or a ZIP is a normal file. The sheet shows a no-preview panel with the same
 * actions — FILL-161.2, and the fallback `/m`'s S97 cut said did not exist.
 * ⚠️ HEIC is its own kind: `uploadFile` converts it, but the estimate and bid
 * routes store it raw, and only Safari displays it. The sheet TRIES an `<img>`
 * and falls back to the no-preview panel when it will not decode.
 */
export function fileViewKind(mimeType: string | null | undefined, fileName: string): FileViewKind {
  const mime = (mimeType ?? '').toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/heic' || mime === 'image/heif') return 'heic';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  return EXT_KIND[ext] ?? 'none';
}

/** Print is offered only where the browser can print the real bytes. */
export function canPrint(kind: FileViewKind): boolean {
  return kind === 'pdf' || kind === 'image';
}

/**
 * The same signed URL, served as an ATTACHMENT under `fileName`.
 *
 * Supabase signed URLs honour a `download` query parameter (CLAUDE.md →
 * Known Codespaces Gotchas). A signed URL already carries `?token=`, so this
 * appends with `&`. Idempotent: an existing `download` parameter is replaced.
 */
export function withDownload(url: string, fileName: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set('download', fileName);
    return u.toString();
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}download=${encodeURIComponent(fileName)}`;
  }
}

/**
 * iOS (including iPadOS reporting as Mac with touch). In an installed PWA,
 * printing a PDF from a hidden iframe is unreliable, so on iOS "Print" opens the
 * file in a new tab and the user prints from the share sheet (FILL-161.3).
 */
export function isIOS(ua: string, maxTouchPoints: number): boolean {
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && maxTouchPoints > 1;
}
