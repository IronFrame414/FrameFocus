import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase-server';

// S127 item 4e — REVOKE (one click, for good) or EXTEND (+90 days, at most a
// year out) a share link. Through the caller's client: RLS is Owner/Admin and
// `enforce_photo_share_links_scope` allows exactly these two changes.

const schema = z.object({ action: z.enum(['revoke', 'extend']) });
const EXTEND_DAYS = 90;

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let parsed;
  try {
    parsed = schema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });

  const { data: link } = await supabase
    .from('photo_share_links')
    .select('id, expires_at, revoked_at')
    .eq('id', params.id)
    .maybeSingle();
  if (!link) {
    console.error(
      `[photo-share-links] ${parsed.data.action} refused: link ${params.id} not visible to user=${user.id}`
    );
    return NextResponse.json({ error: 'That link is not yours to change.' }, { status: 403 });
  }

  const patch =
    parsed.data.action === 'revoke'
      ? { revoked_at: new Date().toISOString() }
      : {
          expires_at: new Date(
            Math.max(Date.now(), new Date(link.expires_at as string).getTime()) +
              EXTEND_DAYS * 86_400_000
          ).toISOString(),
        };
  const { data, error } = await supabase
    .from('photo_share_links')
    .update(patch)
    .eq('id', params.id)
    .select('id, expires_at, revoked_at');
  if (error || (data ?? []).length === 0) {
    console.error(
      `[photo-share-links] ${parsed.data.action} failed for ${params.id}: ${error?.message ?? '0 rows'}`
    );
    return NextResponse.json(
      { error: error?.message ?? 'The link was not changed.' },
      { status: 400 }
    );
  }
  return NextResponse.json(data![0]);
}
