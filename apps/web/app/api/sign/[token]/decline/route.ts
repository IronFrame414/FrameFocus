import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { declineSchema } from '@framefocus/shared/validation/signing';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { declineEstimate } from '@/lib/services/signing-service';

// Spec 2 (4F F8) — public decline with reason code. Estimate moves
// to `declined` (4C columns: decline_reason_code /
// decline_reason_notes); Owner/Admin get a heads-up email.

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  let parsed;
  try {
    parsed = declineSchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const admin = getSupabaseAdmin() as SupabaseClient<Database>;
  const forwardedFor = request.headers.get('x-forwarded-for');

  const result = await declineEstimate(admin, params.token, {
    declineReason: parsed.data.decline_reason,
    declineNotes: parsed.data.decline_notes?.trim() || null,
    signerIp: forwardedFor ? forwardedFor.split(',')[0].trim() : null,
    signerUserAgent: request.headers.get('user-agent'),
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ success: true });
}
