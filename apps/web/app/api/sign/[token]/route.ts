import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getActiveSessionByToken } from '@/lib/services/signing-service';
import { getProposalData } from '@/lib/proposal/proposal-data';

// Spec 2 (4F F1) — public, no auth: the token IS the credential.
// Returns the proposal payload for the signing page renderer; 404
// when the token is invalid, expired, or already used.

export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const admin = getSupabaseAdmin() as SupabaseClient<Database>;

  const session = await getActiveSessionByToken(admin, params.token);
  if (!session) {
    return NextResponse.json(
      { error: 'This link has expired or is no longer valid.' },
      { status: 404 }
    );
  }

  const proposal = await getProposalData(admin, session.estimate_id);
  if (!proposal || proposal.estimate.status !== 'sent') {
    return NextResponse.json(
      { error: 'This proposal is no longer awaiting signature.' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    proposal,
    recipientName: session.recipient_name,
    expiresAt: session.expires_at,
  });
}
