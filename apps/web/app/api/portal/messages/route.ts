import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getPortalIdentity } from '@/lib/services/portal';
import { postClientMessage } from '@/lib/services/portal-writes';
import { MAX_PORTAL_PHOTOS, verifyOwnUnattachedPhotos } from '@/lib/services/portal-photo-upload';

/**
 * M9 R11 — the client posts a photo, a note, or a question.
 *
 * ⚠️ MULTIPART, AND THE UPLOAD HAPPENS AS HER. The file lands in
 * `project-files` and the `files` row is inserted through HER session, so
 * `files_insert_client` and `project_files_insert_client` are the gates. There
 * is no service-role client in this route at all: if she may not post to this
 * project, the storage write fails first and nothing is left behind.
 *
 * ⚠️ AND THE ORDER IS UPLOAD → ROW → MESSAGE, deliberately. The reverse would
 * post a message that references a file that may not exist — R11's "photo and
 * note stay tied together" broken at the first failure. This way a failed
 * upload costs an orphaned object and no message; the message is only written
 * once its photos are real.
 *
 * [S116 F-12, #2-s180u] THE PHOTOS NOW ARRIVE FIRST, one request each, through
 * `POST /api/portal/photos` and the shared upload queue; this route receives
 * their ids (`fileIds`) and verifies each is a photo SHE uploaded to THIS
 * project and not yet on any message (`verifyOwnUnattachedPhotos`) — the
 * guarantee the single request used to give by construction. The order is
 * unchanged: photos real → message → attach. _Superseded, quoted:_ this route
 * read `form.getAll('photos')` and uploaded each file inline, failing the
 * whole send at the first bad photo with no way to retry just that one.
 */
export const runtime = 'nodejs';

const ROUTE = 'POST /api/portal/messages';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const identity = await getPortalIdentity(supabase);
  if (!identity) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (identity.accessLevel !== 'full') {
    // A documents-only client's INSERT would be refused by RLS anyway. Saying
    // so here gives her the reason instead of a bare policy failure.
    return NextResponse.json(
      { error: 'Your portal access does not include messaging.' },
      { status: 403 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const projectId = String(form.get('projectId') ?? '').trim();
  const body = String(form.get('body') ?? '');
  if (!projectId) {
    return NextResponse.json({ error: 'A project is required.' }, { status: 400 });
  }

  if (form.getAll('photos').some((f) => f instanceof File && f.size > 0)) {
    // An old page still posting photos inline. Refused, not ignored: a photo
    // silently dropped from her message is the failure R11 exists to prevent.
    console.error('portal message refused', { route: ROUTE, check: 'inline photos (old page)' });
    return NextResponse.json(
      { error: 'Please reload the page and send your photos again.' },
      { status: 400 }
    );
  }
  const fileIds = form
    .getAll('fileIds')
    .map((v) => String(v).trim())
    .filter(Boolean);
  if (fileIds.length > MAX_PORTAL_PHOTOS) {
    return NextResponse.json(
      { error: `Please send at most ${MAX_PORTAL_PHOTOS} photos at a time.` },
      { status: 400 }
    );
  }
  if (fileIds.length > 0) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const verified = await verifyOwnUnattachedPhotos(supabase, {
      userId: user.id,
      projectId,
      fileIds,
    });
    if (!verified.ok) {
      console.error('portal message photos refused', {
        route: ROUTE,
        check: verified.check,
        projectId,
      });
      return NextResponse.json({ error: verified.error }, { status: 400 });
    }
  }

  const result = await postClientMessage(supabase, {
    projectId,
    profileId: identity.profileId,
    body,
    fileIds,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  // `error` may be present ON A SUCCESS — a posted message whose photo failed
  // to attach. The screen shows it; retrying would double-post.
  return NextResponse.json({ id: result.id, warning: result.error ?? null });
}
