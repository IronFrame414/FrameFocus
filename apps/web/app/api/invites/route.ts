import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { sendInviteEmail } from '@/lib/services/invite-email';
import { brand } from '@/lib/brand';

// D2 + D3.1 [S135] — create an invitation AND send it.
//
// Creation moved server-side so the send can happen in the same act. It is NOT
// a weakening of the gate: the INSERT below runs through the CALLER's session
// client, so `invitations_insert_owner_admin` still decides. The explicit role
// check above it exists to return a 403 that names the reason rather than a
// bare RLS refusal — CLAUDE.md's rule that a permission failure never falls
// through to a "not found" path.

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, company_id, role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();

  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json(
      { error: 'Only an Owner or Admin can invite people.' },
      { status: 403 }
    );
  }

  let body: { email?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const email = (body.email ?? '').trim().toLowerCase();
  const role = (body.role ?? '').trim();
  if (!email || !role) {
    return NextResponse.json({ error: 'An email address and a role are required.' }, { status: 400 });
  }

  // Only an Owner may create another Admin (the Admin Role Principle).
  if (role === 'admin' && profile.role !== 'owner') {
    return NextResponse.json(
      { error: 'Only the Owner can invite someone as an Admin.' },
      { status: 403 }
    );
  }

  // ── D3.1 — refuse a link that could never be accepted ────────────────────
  // Josh invited an address that already had an account and a company of its
  // own; the invitation was unacceptable from the moment it was created and
  // nothing said so. Signup would fail for this address no matter what.
  const { data: taken, error: takenErr } = await supabase.rpc('email_has_account', {
    p_email: email,
  });
  if (takenErr) {
    return NextResponse.json({ error: takenErr.message }, { status: 500 });
  }
  if (taken === true) {
    return NextResponse.json(
      {
        error: `That email address already has an ${brand.name} account, so it cannot accept an invitation. Ask them to sign in with it, or invite a different address.`,
        code: 'email_in_use',
      },
      { status: 409 }
    );
  }

  const { data: invitation, error: insertError } = await supabase
    .from('invitations')
    .insert({
      company_id: profile.company_id,
      email,
      role,
      invited_by: user.id,
      created_by: user.id,
    })
    .select('id, email, role, token, expires_at')
    .single();

  if (insertError || !invitation) {
    console.error('invite insert failed', {
      route: 'POST /api/invites',
      check: 'invitations_insert_owner_admin',
      message: insertError?.message,
    });
    return NextResponse.json(
      { error: insertError?.message ?? 'Could not create the invitation.' },
      { status: 400 }
    );
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const result = await sendInviteEmail(supabase, invitation.id, origin);

  if (!result.emailed) {
    console.error('invite email failed', {
      route: 'POST /api/invites',
      invitation_id: invitation.id,
      message: result.error,
    });
  }

  // 200 either way: the invitation EXISTS and the link WORKS. `emailed` is what
  // the screen must reflect — see the form.
  return NextResponse.json({
    invitationId: invitation.id,
    email: invitation.email,
    role: invitation.role,
    link: result.link,
    emailed: result.emailed,
    emailError: result.error,
  });
}
