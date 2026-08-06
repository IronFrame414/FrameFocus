import { notFound } from 'next/navigation';
import { getPhoto } from '@/lib/services/photos';
import { MeasureThenEdit } from './measure-then-edit';

// M6M §4.10 — M-10 · Photo markup.
//
// Chromeless like M-9 (mobile-shell.tsx's isDarkCanvasScreen): §4.10 supplies
// its own header (Cancel · "Markup" · Save) and its own bottom row (Undo ·
// Redo · Done), and §3.2 says the tab bar is REPLACED by that row (A-1b).
//
// ---------------------------------------------------------------------------
// THE CANVAS IS ALWAYS FED THE **ORIGINAL** — never the derivative.
// ---------------------------------------------------------------------------
// A-23c: "re-editing regenerates the derivative IN FULL FROM THE ORIGINAL
// BYTES, not from the previous derivative." Feeding the last derivative back in
// would (a) re-encode a JPEG that has already been encoded once per save, so
// the photo visibly degrades after a few edits, and (b) BAKE THE OLD MARKS INTO
// THE BACKGROUND, so deleting a mark in the editor would leave it on screen.
// The second turns a cosmetic problem into a wrong picture.
//
// ---------------------------------------------------------------------------
// A-24d — MARKUP OPENED FROM A PUNCH ITEM OR AN INCIDENT RETURNS TO IT.
// ---------------------------------------------------------------------------
// `?from=` carries the originating record. §4.10's "markup is also reachable
// from a punch item or incident, pre-linked to that record" is what this
// serves: the link that opened the editor is the link it returns through, so a
// foreman who came from a punch item lands back on that item rather than in a
// photo gallery they never opened.

const RETURN_ROUTES: Record<string, (projectId: string) => string> = {
  punch: (p) => `/m/p/${p}/punch`,
  safety: (p) => `/m/p/${p}/safety`,
};

export default async function PhotoMarkupPage({
  params,
  searchParams,
}: {
  params: { projectId: string; fileId: string };
  searchParams: { from?: string };
}) {
  const photo = await getPhoto(params.fileId, params.projectId);
  if (!photo || !photo.originalUrl) notFound();

  // The image's natural dimensions. `markup_data` carries them once a photo has
  // been annotated (§4.7a.1 — "the natural dimensions travel with the markup"),
  // which is what lets a consumer build the viewBox without first downloading
  // the full-resolution original to measure it.
  //
  // A photo with NO markup has never had them written, and the server does not
  // decode images — so the client measures on load. That is the only branch,
  // not a fallback for a bug.
  const dims =
    photo.markup && photo.markup.imageWidth > 0 && photo.markup.imageHeight > 0
      ? { w: photo.markup.imageWidth, h: photo.markup.imageHeight }
      : null;

  const from = searchParams.from;
  const returnHref =
    from && RETURN_ROUTES[from]
      ? RETURN_ROUTES[from](params.projectId)
      : `/m/p/${params.projectId}/photos/${params.fileId}`;

  return (
    <MeasureThenEdit
      fileId={photo.id}
      filePath={photo.file_path}
      fileName={photo.file_name}
      originalUrl={photo.originalUrl}
      initialShapes={photo.markup?.shapes ?? []}
      dims={dims}
      returnHref={returnHref}
    />
  );
}
