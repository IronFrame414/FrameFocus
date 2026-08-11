import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { sendInviteEmail } from '@/lib/services/invite-email';

// D4 [S135] — resend a pending invitation.
//
// Before this there was no way to resend an invite or to see its link again:
// the only control on a pending invitation was Cancel. So a link that was lost
// — or, as here, never delivered because no invite email existed — left cancel
// and re-invite as the only path.
//
// ⚠️ THE TOKEN IS REUSED AND THE EXPIRY IS RESET [Josh, S135 Q6].
// Reissuing would invalidate any copy already circulating, which is the exact
// situation a resend is usually trying to rescue (a link pasted into a text
// message that the person has not opened yet). Cancel already exists for the
// case where a link must be killed, and it is the honest control for it.
//
// Resetting `expires_at` is not optional: a resend that hands back an expired
// link solves nothing, and an expired link is now a hard refusal at signup
// (D1), so it would fail loudly rather than silently — still useless.

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();

  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json(
      { error: 'Only an Owner or Admin can resend an invitation.' },
      { status: 403 }
    );
  }

  // Read first, through the caller's client, so a refusal is a 404 that means
  // "not yours" only after auth has already passed.
  const { data: existing } = await supabase
    .from('invitations')
    .select('id, status')
    .eq('id', params.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 });
  }
  if ((existing as { status: string }).status !== 'pending') {
    return NextResponse.json(
      {
        error: `This invitation is ${(existing as { status: string }).status} and cannot be resent. Send a new one instead.`,
      },
      { status: 409 }
    );
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error: updateError } = await supabase
    .from('invitations')
    .update({ expires_at: expiresAt })
    .eq('id', params.id);

  if (updateError) {
    console.error('invite resend: expiry reset failed', {
      route: 'POST /api/invites/[id]/resend',
      invitation_id: params.id,
      message: updateError.message,
    });
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(_request.url).origin;
  const result = await sendInviteEmail(supabase, params.id, origin);

  if (!result.emailed) {
    console.error('invite resend: email failed', {
      route: 'POST /api/invites/[id]/resend',
      invitation_id: params.id,
      message: result.error,
    });
  }

  return NextResponse.json({
    link: result.link,
    expiresAt,
    emailed: result.emailed,
    emailError: result.error,
  });
}
