import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { coDeclineSchema } from '@framefocus/shared/validation/co-signing';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { declineCoSignature } from '@/lib/services/co-signing-service';

// 5D §6 — public CO decline. Notes-only (no reason codes, unlike M4);
// the decline lives on the session and the CO stays `sent` so the
// contractor can void or re-send. No auth: the token is the credential.

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  let parsed;
  try {
    parsed = coDeclineSchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const admin = getSupabaseAdmin() as SupabaseClient<Database>;
  const forwardedFor = request.headers.get('x-forwarded-for');

  const result = await declineCoSignature(admin, params.token, {
    declineNotes: parsed.data.decline_notes?.trim() || null,
    signerIp: forwardedFor ? forwardedFor.split(',')[0].trim() : null,
    signerUserAgent: request.headers.get('user-agent'),
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ success: true });
}
