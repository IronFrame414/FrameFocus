import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getPortalIdentity } from '@/lib/services/portal';
import { uploadPortalPhoto } from '@/lib/services/portal-photo-upload';

/**
 * M9 R11 — ONE photo from the client's composer. [S116 F-12, #2-s180u]
 *
 * The composer runs its photos through the shared upload queue
 * (`lib/uploads/upload-batch.ts`): one request per photo, ≤3 in flight, each
 * failure named and retried alone. The message itself is posted afterwards by
 * `POST /api/portal/messages` with the landed ids, so a message is still only
 * written once its photos are real (R11: "photo and note stay tied together").
 *
 * AS HER, like the messages route: her session, her RLS, no service role.
 */
export const runtime = 'nodejs';

const ROUTE = 'POST /api/portal/photos';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const identity = await getPortalIdentity(supabase);
  if (!identity) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (identity.accessLevel !== 'full') {
    console.error('portal photo refused', { route: ROUTE, check: 'accessLevel full' });
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
  if (!projectId) {
    return NextResponse.json({ error: 'A project is required.' }, { status: 400 });
  }
  const file = form.get('photo');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'No photo was sent.' }, { status: 400 });
  }

  const r = await uploadPortalPhoto(supabase, {
    companyId: identity.companyId,
    projectId,
    file,
    route: ROUTE,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ id: r.id });
}
