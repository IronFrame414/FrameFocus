import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { inviteClientToPortal } from '@/lib/services/client-portal';
import { sendInviteEmail } from '@/lib/services/invite-email';

/**
 * M9 R1/R3 — invite a client to the portal, and SEND it.
 *
 * ===========================================================================
 * ⚠️ THE SEND IS THE POINT, NOT AN EXTRA
 * ===========================================================================
 * `inviteClientToPortal()` has existed since stage 2 and **nothing called it**.
 * A route that only created the row would repeat D2's defect exactly — the one
 * `invite-email.ts` was written to fix, where Josh invited two employees, an
 * invitation row was inserted for each, no email was sent, and the screen gave
 * him no reason to think anything was wrong.
 *
 * ⚠️ AND IT REUSES `sendInviteEmail()` RATHER THAN WRITING A CLIENT VERSION.
 * That function's own header says why: *"ONE MECHANISM, TWO CALLERS … A second
 * 'does the same thing' send path is the divergence CLAUDE.md's PARITY rule
 * describes."* This is the third caller, not a second mechanism. The invitation
 * row carries `role = 'client'`, and everything downstream — the link, the
 * expiry, the branding, the `email_logs` row — is the same code the staff
 * invite runs.
 *
 * ===========================================================================
 * THE ROLE CHECK IS BELT-AND-BRACES AND IS STILL WORTH HAVING
 * ===========================================================================
 * `invitations_insert_owner_admin` is the real gate, and `inviteClientToPortal`
 * writes through the CALLER's client so it applies. The explicit check exists
 * so a PM gets a 403 that names the reason rather than a bare RLS refusal —
 * CLAUDE.md: a permission failure never falls through to a "not found" path.
 */
export async function POST(request: NextRequest) {
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
    .maybeSingle();

  const role = (profile as { role: string } | null)?.role;
  if (!profile || !['owner', 'admin'].includes(role ?? '')) {
    return NextResponse.json(
      { error: 'Only an Owner or Admin can invite a client to the portal.' },
      { status: 403 }
    );
  }

  let body: { contactId?: string; projectId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const contactId = (body.contactId ?? '').trim();
  const projectId = (body.projectId ?? '').trim();
  if (!contactId || !projectId) {
    return NextResponse.json(
      { error: 'A contact and a project are both required.' },
      { status: 400 }
    );
  }

  const result = await inviteClientToPortal(supabase, {
    contactId,
    projectId,
    invitedBy: user.id,
  });

  if (!result.success || !result.invitationId) {
    // Every refusal this service returns is a SENTENCE, not a code — the
    // missing-email one in particular has to reach the screen intact, because
    // it names the remedy ("add an email address for X"). Passing it through
    // rather than replacing it is deliberate.
    console.error('portal invite refused', {
      route: 'POST /api/portal/invite',
      contactId,
      projectId,
      message: result.error,
    });
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const sent = await sendInviteEmail(supabase, result.invitationId, origin);

  if (!sent.emailed) {
    console.error('portal invite email failed', {
      route: 'POST /api/portal/invite',
      invitation_id: result.invitationId,
      message: sent.error,
    });
  }

  // 200 either way, for the same reason the staff route does it: the invitation
  // EXISTS and the link WORKS. `emailed` is what the screen must reflect.
  return NextResponse.json({
    invitationId: result.invitationId,
    link: sent.link,
    emailed: sent.emailed,
    emailError: sent.error,
  });
}
