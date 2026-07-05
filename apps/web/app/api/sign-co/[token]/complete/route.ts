import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { completeSignatureSchema } from '@framefocus/shared/validation/signing';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { completeCoSignature } from '@/lib/services/co-signing-service';

// 5D §6 — public CO signature completion (D-4: the client signature is
// what makes the CO binding). Records the signature + ESIGN audit trail
// and moves the CO to `signed`. No auth: the token is the credential.
// Reuses the M4 completeSignatureSchema — the capture is identical.

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  let parsed;
  try {
    parsed = completeSignatureSchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const admin = getSupabaseAdmin() as SupabaseClient<Database>;
  const forwardedFor = request.headers.get('x-forwarded-for');

  const result = await completeCoSignature(admin, params.token, {
    signatureType: parsed.data.signature_type,
    signatureData: parsed.data.signature_data,
    signerName: parsed.data.signer_name,
    signerIp: forwardedFor ? forwardedFor.split(',')[0].trim() : null,
    signerUserAgent: request.headers.get('user-agent'),
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ success: true });
}
