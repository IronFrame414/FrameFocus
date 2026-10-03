import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { shareLogPhotoWithClient } from '@/lib/daily-logs/client-photo-share';

// S127 item 5a (fixed after merge) — link a photo to a daily log AND make it
// client-facing. The rules are in lib/daily-logs/client-photo-share.ts; this
// route only authenticates and reports.

const schema = z.object({ fileId: z.string().uuid(), logId: z.string().uuid() });

export async function POST(request: NextRequest) {
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
  if (!parsed.success) {
    return NextResponse.json({ error: 'A photo id and a log id are required.' }, { status: 400 });
  }

  const result = await shareLogPhotoWithClient({
    caller: supabase,
    admin: getSupabaseAdmin(),
    userId: user.id,
    fileId: parsed.data.fileId,
    logId: parsed.data.logId,
  });
  if (!result.ok) {
    console.error(
      `[daily-logs/client-photo] ${result.status} for user=${user.id} file=${parsed.data.fileId} log=${parsed.data.logId}: ${result.cause}`
    );
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
