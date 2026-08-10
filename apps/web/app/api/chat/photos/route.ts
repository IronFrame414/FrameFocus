import { NextRequest, NextResponse } from 'next/server';
import { chatSession } from '../_session';
import { getProjectPhotos } from '@/lib/services/photos';
import { resolveThread } from '@/lib/chat/threads';

/**
 * The composer's gallery picker — §5.4, A-C19.
 *
 * ---------------------------------------------------------------------------
 * IT IS `getProjectPhotos()`, NOT A QUERY OF ITS OWN
 * ---------------------------------------------------------------------------
 * That function already does exactly what A-C19 requires — `getFiles({
 * project_id, category: 'photos' })` — and already resolves `displayUrl` per
 * M6M D-31 (the derivative when a photo is annotated, the original otherwise).
 *
 * Writing chat's own `files` query here would be a second definition of "what a
 * project photo is", and it would show the UNMARKED original for an annotated
 * photo — #129's failure in a new place. §5.4 is explicit that the category
 * filter "is the only thing keeping contracts and receipts out of the picker;
 * the FK cannot do it".
 *
 * ⚠️ THE PICKER IS A CONVENIENCE, NOT THE ENFORCEMENT. `eligiblePhotoIds()` on
 * the send path is what actually stops a crafted request attaching a contract
 * PDF. A filter here alone would be a UI filter with nothing behind it.
 */
export async function GET(request: NextRequest) {
  const session = await chatSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get('project_id');
  if (!projectId) {
    return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
  }

  // Gated as the caller before any gallery read: resolveThread returns null when
  // RLS refuses the project, so a subcontractor cannot enumerate the photos of a
  // crew-only project by asking the picker instead of the thread.
  const kind = request.nextUrl.searchParams.get('kind');
  const thread = await resolveThread(session.supabase, projectId, kind === 'sub' ? 'sub' : 'crew');
  if (!thread) {
    console.error(`[chat] photo picker refused for user ${session.userId} on ${projectId}`);
    return NextResponse.json({ error: 'You do not have access to this project.' }, { status: 403 });
  }

  const photos = await getProjectPhotos(projectId);

  return NextResponse.json({
    photos: photos.map((p) => ({
      fileId: p.id,
      fileName: p.file_name,
      displayUrl: p.displayUrl,
      hasMarkup: p.hasMarkup,
    })),
  });
}
