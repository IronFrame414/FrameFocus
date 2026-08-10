import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { chatSession } from '../_session';
import { markThreadRead } from '@/lib/chat/messages';

/**
 * Mark a thread read — §7.2, §4.4.
 *
 * Opening a thread already marks it read inside `POST /api/chat/threads`. This
 * exists for the OTHER case: the thread is open on screen and the poll brings
 * in something new. Without it the badge would light for a message the user is
 * currently looking at, which trains people to ignore the badge — the failure
 * A-N44 guards against at the other end of the range.
 *
 * ⚠️ NO TIMESTAMP IN THE BODY, EVER. `markThreadRead` calls the
 * `chat_mark_read` RPC, which sets `last_read_at = now()` on the DATABASE
 * clock. Accepting a client timestamp here would reintroduce the exact defect
 * migration 20260908000000 exists to fix — and it would look like a harmless
 * parameter.
 */

const schema = z.object({ thread_id: z.string().uuid() });

export async function POST(request: NextRequest) {
  const session = await chatSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let parsed;
  try {
    parsed = schema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  // `chat_mark_read` is SECURITY INVOKER and `chat_reads` RLS scopes the write
  // to the caller's own row, so a thread id the caller cannot reach writes
  // nothing rather than needing a membership check here.
  await markThreadRead(session.supabase, parsed.data.thread_id);

  return NextResponse.json({ ok: true });
}
