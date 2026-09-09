import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { buildSenderAddress, logEmail, sendEmail } from '@/lib/services/email-service';
import { SubBidRequestEmail } from '@/lib/email/templates/sub-bid-request-email';
import { publicOrigin, bidReplyUrlFor } from '@/lib/services/sub-bid-request-send';

// S107 Part B — SEND a bid request to a subcontractor. This did not exist:
// `createSubBidRequest` minted a row and a token and mailed nothing, so step 3
// of the nine-step path was missing entirely (FILL-B.1/B.2).
//
// ===========================================================================
// THE FLOOR IS THE SAME ONE AS THE FILES ROUTE, FOR THE SAME REASON
// ===========================================================================
// The session client reads the estimate FIRST (RLS: owner/admin any, PM own),
// and only then does the service-role client touch anything. Service role
// bypasses RLS, so the ordering IS the access control.
// `s107-estimate-files-route-order.test.ts` guards that route's ordering; this
// route is covered the same way by `s107-bid-request-send-order.test.ts`.
//
// Edit rights mirror the files POST: owner/admin on any draft, PM on their own.
// Sending a bid request commits the company's name to an outside party, so it
// is an edit-class action, not a view-class one.

export async function POST(
  _req: Request,
  { params }: { params: { id: string; requestId: string } }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 });

  // THE FLOOR — session read before any privileged client.
  const { data: est } = await supabase
    .from('estimates')
    .select('id, company_id, status, created_by, name')
    .eq('id', params.id)
    .single();
  if (!est) return NextResponse.json({ error: 'Estimate not found' }, { status: 404 });

  const isOwnerAdmin = profile.role === 'owner' || profile.role === 'admin';
  const canEdit = est.status === 'draft' && (isOwnerAdmin || est.created_by === user.id);
  if (!canEdit) {
    return NextResponse.json(
      { error: 'You cannot send bid requests on this estimate (edit rights required on a draft you own).' },
      { status: 403 }
    );
  }

  // ⚠️ THE ORIGIN IS CHECKED BEFORE ANYTHING IS SENT, NOT AFTER.
  // `bidReplyUrl()` (the client helper) reads `window.location.origin` and is
  // browser-only; a server sender that reused it would emit `/bid/<token>` — a
  // relative path, which in an email is a link to nowhere. Existing senders in
  // this repo do `process.env.NEXT_PUBLIC_APP_URL ?? ''` and would happily mail
  // that. Here it is a hard refusal: an email with a dead link cannot be
  // unsent, and the sub's only route into the system is that link.
  const origin = publicOrigin();
  if (!origin) {
    console.error('[POST bid-requests/send] NEXT_PUBLIC_APP_URL is not set — refusing to send', {
      check: 'publicOrigin() returned null; the emailed link would be relative and dead',
      estimateId: params.id,
    });
    return NextResponse.json(
      { error: 'This server is not configured with a public URL, so the bid link would not work. Nothing was sent.' },
      { status: 500 }
    );
  }

  const admin = getSupabaseAdmin() as SupabaseClient<Database>;

  const { data: reqRow } = await admin
    .from('estimate_sub_bid_requests')
    .select('id, token, expires_at, subcontractor_id, line_item_id, message, bids_due_date, status, estimate_id, company_id')
    .eq('id', params.requestId)
    .eq('estimate_id', params.id)
    .eq('is_deleted', false)
    .maybeSingle();
  if (!reqRow) return NextResponse.json({ error: 'Bid request not found' }, { status: 404 });

  if (['submitted', 'cancelled', 'declined'].includes(reqRow.status as string)) {
    return NextResponse.json(
      { error: `This request is ${reqRow.status} and cannot be sent again.` },
      { status: 409 }
    );
  }
  if (reqRow.expires_at && new Date(reqRow.expires_at as string) < new Date()) {
    return NextResponse.json(
      { error: 'This request has expired. Create a new one.' },
      { status: 410 }
    );
  }

  const [{ data: sub }, { data: company }, { data: line }] = await Promise.all([
    admin.from('subcontractors').select('company_name, email').eq('id', reqRow.subcontractor_id).single(),
    admin.from('companies').select('name, slug, logo_url, brand_color').eq('id', est.company_id).single(),
    admin.from('estimate_line_items').select('name').eq('id', reqRow.line_item_id).single(),
  ]);

  // ⚠️ A MISSING ADDRESS REFUSES LOUDLY. `subcontractors.email` is nullable and
  // most rebuild-test rows have none. Sending would otherwise fail deep inside
  // Resend with a message the estimator cannot act on.
  if (!sub?.email) {
    return NextResponse.json(
      { error: `${sub?.company_name ?? 'This subcontractor'} has no email address on file. Add one, then send.` },
      { status: 422 }
    );
  }
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 500 });

  const replyUrl = bidReplyUrlFor(origin, reqRow.token as string);
  const expiresOn = new Date(reqRow.expires_at as string).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const subject = `Bid request from ${company.name}${line?.name ? ` — ${line.name}` : ''}`;
  const sender = buildSenderAddress({ name: company.name, slug: company.slug });

  // ⚠️ sendEmail CAN THROW — getResend() throws when RESEND_API_KEY is unset,
  // and two prior sweeps (S150, S157) existed because bare calls let that throw
  // escape before the log was written. Folded into the same error variable, so a
  // throw and a returned error produce the SAME email_logs row.
  let messageId: string | null = null;
  let sendError: string | null = null;
  try {
    const result = await sendEmail({
      from: sender,
      to: sub.email,
      subject,
      replyToCompanyId: est.company_id,
      react: SubBidRequestEmail({
        companyName: company.name,
        logoUrl: company.logo_url ?? null,
        brandColor: company.brand_color ?? '#14213d',
        subcontractorName: sub.company_name ?? '',
        lineItemName: line?.name ?? '',
        projectLabel: est.name ?? null,
        message: (reqRow.message as string | null) ?? null,
        bidsDueDate: reqRow.bids_due_date
          ? new Date(reqRow.bids_due_date as string).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })
          : null,
        replyUrl,
        expiresOn,
      }),
    });
    messageId = result.messageId;
    sendError = result.error;
  } catch (e) {
    sendError = e instanceof Error ? e.message : String(e);
  }

  await logEmail(admin, {
    company_id: est.company_id,
    estimate_id: est.id,
    signing_session_id: null,
    resend_message_id: messageId,
    email_type: 'sub_bid_request',
    recipient_email: sub.email,
    sender_email: sender,
    subject,
    status: sendError ? 'failed' : 'sent',
    metadata: { bid_request_id: reqRow.id, line_item_id: reqRow.line_item_id },
  });

  if (sendError) {
    return NextResponse.json({ error: sendError }, { status: 502 });
  }

  // ⚠️ `sent_at` MEANS "SENT" FROM HERE ON. It is `DEFAULT now()` at INSERT, so
  // until this route existed it recorded "row created" and nothing ever updated
  // it (FILL-B.2). Stamping it here is what makes it true, and it is what a
  // re-send advances. The TOKEN IS NOT REGENERATED — ruled: a re-send reuses it,
  // so a link already in flight never dies mid-upload.
  await admin
    .from('estimate_sub_bid_requests')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', reqRow.id);

  return NextResponse.json({ sent: true, messageId, to: sub.email, replyUrl });
}
