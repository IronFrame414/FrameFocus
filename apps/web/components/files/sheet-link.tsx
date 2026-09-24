'use client';

import type { MouseEvent, ReactNode, CSSProperties } from 'react';
import { useFileSheet, type ResolvedFile } from '@/components/files/file-sheet';
import { getFileViewClient } from '@/lib/services/files-client';

/**
 * S110 E3 (#161, the remaining sites) — a link that opens its file in the SHEET.
 *
 * For a server-rendered page that already holds a signed URL. The `<a href>`
 * stays, so a modified click (⌘/Ctrl/middle) still opens a new tab exactly as
 * before; a plain click opens the sheet over the page instead (the chat-photo
 * pattern, S109).
 *
 * `fileId` (from a server page — a function cannot cross that boundary) or
 * `resolveUrl` (from a client component), when given, RE-SIGNS on open on the
 * caller's session (the sheet's expiry rule — a page left open past the TTL
 * still opens), falling back to `href`. Without either the sheet reuses `href`,
 * which is what the client portal does by ruling [S110 Q10]: "the portal reuses
 * the URL it already signed" — no new route, and no new bytes, reach a client.
 */
export function SheetLink({
  href,
  fileName,
  mimeType,
  fileId,
  resolveUrl,
  children,
  className,
  style,
  title,
  testId,
}: {
  href: string;
  fileName: string;
  mimeType?: string | null;
  fileId?: string;
  resolveUrl?: () => Promise<ResolvedFile>;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  title?: string;
  testId?: string;
}) {
  const openFile = useFileSheet();
  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    openFile({
      fileName,
      mimeType,
      resolveUrl: async () => {
        if (resolveUrl) return (await resolveUrl()) ?? href;
        if (fileId) return (await getFileViewClient(fileId)) ?? href;
        return href;
      },
    });
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={onClick}
      className={className}
      style={style}
      title={title}
      data-testid={testId}
    >
      {children}
    </a>
  );
}
