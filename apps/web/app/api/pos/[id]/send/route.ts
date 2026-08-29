import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { loadPoPdfData } from '@/lib/po/po-pdf-data';
import { PoDocument } from '@/lib/po/po-template';
import { PoEmail } from '@/lib/email/templates/po-email';
import { buildSenderAddress, logEmail, sendEmail } from '@/lib/services/email-service';

// PO module R-L4 — email the issued PO to its vendor, PDF attached. The UI
// disables the offer without an addressable vendor; this route REFUSES the
// same states with their real reasons (never offered-then-failed, and never a
// silent fallback address — R4: no guessed strings). Sender identity is the
// CONTRACTOR's (brandColor + logo as data); Reply-To resolves to the company
// via replyToCompanyId. Logged to email_logs on success AND failure
// (email_type 'purchase_order', metadata.po_id).

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile || !['owner', 'admin', 'project_manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Only Owner/Admin/PM may send a PO.' }, { status: 403 });
  }

  const { data, companyId, vendorEmail, error } = await loadPoPdfData(params.id);
  if (!data || !companyId) {
    console.error(`[pos/send] ${params.id}: ${error}`);
    return NextResponse.json({ error: error ?? 'Not found' }, { status: 404 });
  }

  const { data: poRow } = await supabase
    .from('purchase_orders')
    .select('status')
    .eq('id', params.id)
    .single();
  if (poRow?.status !== 'issued') {
    return NextResponse.json(
      { error: 'Only an issued PO can be emailed — issue its lines first.' },
      { status: 400 }
    );
  }
  if (!vendorEmail) {
    return NextResponse.json(
      { error: 'No vendor on file with an email address — assign a vendor to email this PO.' },
      { status: 400 }
    );
  }

  const { data: company } = await supabase
    .from('companies')
    .select('name, slug, logo_url, brand_color')
    .eq('id', companyId)
    .single();
  if (!company) return NextResponse.json({ error: 'Company not found.' }, { status: 404 });

  const buffer = await renderToBuffer(PoDocument({ data }));
  const sender = buildSenderAddress(company);
  const subject = `Purchase order ${data.poNumber} — ${company.name}`;

  const { messageId, error: sendError } = await sendEmail({
    from: sender,
    to: vendorEmail,
    subject,
    react: PoEmail({
      companyName: company.name,
      logoUrl: company.logo_url,
      brandColor: company.brand_color ?? '#1a2437',
      poNumber: data.poNumber,
      projectName: data.projectName,
      needBy: data.needBy,
      totalLabel: data.totalLabel,
    }),
    attachments: [
      { filename: `${data.poNumber.replace(/[^\w-]+/g, '_')}.pdf`, content: buffer },
    ],
    replyToCompanyId: companyId,
  });

  const admin = getSupabaseAdmin();
  await logEmail(admin as never, {
    company_id: companyId,
    estimate_id: null,
    signing_session_id: null,
    resend_message_id: messageId,
    email_type: 'purchase_order',
    recipient_email: vendorEmail,
    sender_email: sender,
    subject,
    status: sendError ? 'failed' : 'sent',
    metadata: { po_id: params.id },
  });

  if (sendError) {
    console.error(`[pos/send] ${params.id}: ${sendError}`);
    return NextResponse.json({ error: `Send failed: ${sendError}` }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
