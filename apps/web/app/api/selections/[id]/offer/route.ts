import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { offerSelection } from '@/lib/services/selection-lifecycle-service';
import { sendSelectionsReleasedEmail } from '@/lib/services/selection-email';

// S171 stage 4 — offer. Gated by the CALLER'S RLS UPDATE on `selections`
// inside the service (a zero-row update is a refusal, mutation-result.ts); the
// route adds only "is someone signed in".
//
// [S174 #1] It mails the client, through the SAME function the batch route
// calls — one mechanism, two callers (Josh: *"Do NOT build a second mailer."*).
// A single offer is a release of one: the mail says "a selection", the portal
// link is the same, and `email_logs` records it identically. Two send paths
// that "do the same thing" is the #129 divergence, written as agreement.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const result = await offerSelection(supabase, params.id);
  if (!result.success) {
    console.error('[selections/offer] refused', params.id, result.error);
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  const { data: sel } = await supabase
    .from('selections')
    .select('project_id')
    .eq('id', params.id)
    .maybeSingle();
  if (!sel) return NextResponse.json({ ...result, emailed: false, emailError: null });

  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const sent = await sendSelectionsReleasedEmail(supabase, {
    projectId: sel.project_id,
    selectionIds: [params.id],
    origin,
  });
  if (!sent.emailed) {
    console.error('[selections/offer] email not delivered', params.id, sent.error);
  }
  // The selection IS awaiting approval and the session IS open, so a broken
  // email is a warning, never a rollback.
  return NextResponse.json({ ...result, emailed: sent.emailed, emailError: sent.error });
}
