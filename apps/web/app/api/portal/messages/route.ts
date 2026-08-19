import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createClient } from '@/lib/supabase-server';
import { getPortalIdentity } from '@/lib/services/portal';
import { postClientMessage } from '@/lib/services/portal-writes';

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
 */
export const runtime = 'nodejs';

const MAX_PHOTOS = 6;
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

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

  const files = form.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_PHOTOS) {
    return NextResponse.json(
      { error: `Please send at most ${MAX_PHOTOS} photos at a time.` },
      { status: 400 }
    );
  }

  const fileIds: string[] = [];
  for (const file of files) {
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json(
        { error: `${file.name} is not a photo we can accept.` },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `${file.name} is too large.` }, { status: 400 });
    }

    // `{company_id}/{project_id}/{name}` — the convention every storage policy
    // in this repo parses with `storage.foldername()`. A random prefix on the
    // filename so two photos called IMG_0001.jpg do not overwrite each other.
    const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-80);
    const path = `${identity.companyId}/${projectId}/${randomUUID()}-${safeName}`;

    const { error: upErr } = await supabase.storage
      .from('project-files')
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) {
      console.error('portal photo upload failed', {
        route: 'POST /api/portal/messages',
        check: 'project_files_insert_client',
        projectId,
        message: upErr.message,
      });
      return NextResponse.json({ error: 'That photo could not be uploaded.' }, { status: 400 });
    }

    const { data: row, error: rowErr } = await supabase
      .from('files')
      .insert({
        project_id: projectId,
        category: 'photos',
        file_name: file.name,
        file_path: path,
        file_size: file.size,
        mime_type: file.type,
        // R11 — her photos are client-visible. Sent explicitly AND enforced by
        // the WITH CHECK, so a caller that forgot it is refused rather than
        // storing a photo she could not then see.
        client_visible: true,
      })
      .select('id')
      .single();

    if (rowErr || !row) {
      console.error('portal photo row failed', {
        route: 'POST /api/portal/messages',
        check: 'files_insert_client',
        projectId,
        message: rowErr?.message,
      });
      return NextResponse.json({ error: 'That photo could not be saved.' }, { status: 400 });
    }
    fileIds.push((row as { id: string }).id);
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
