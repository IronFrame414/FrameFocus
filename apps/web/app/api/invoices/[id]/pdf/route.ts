import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { generateInvoicePDF, storeInvoicePdf } from '@/lib/services/invoice-pdf-service';

// 7D §13 — the invoice PDF, print/download path. Mechanics mirror
// /api/deliveries/[id]/pdf; the difference is that this GET STREAMS the bytes
// so the browser can print or save directly, as well as persisting the artifact.
//
// SENT/paid/voided → render, store against the project (files.invoice_id,
//   category 'invoices'), and stream. Re-requesting replaces the stored copy so
//   there is one current PDF per invoice.
// DRAFT/pending    → render a WATERMARKED preview and stream it WITHOUT
//   storing (§13 preview; a watermarked draft in the Files list next to real
//   invoices is the confusion the watermark exists to prevent).
//
// ?download=1 forces a save dialog; otherwise it renders inline for printing.
//
// Roles per §12: Owner/Admin/PM, the same set the invoices RLS policies allow.
// Auth failures return 401/403 with their own message; a 404 means auth passed
// and the invoice genuinely is not visible or does not exist (CLAUDE.md).
// NOTHING here emails anything or mints a pay link — RESEND and 7G.

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
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
  if (!profile) {
    console.error(`[invoices/pdf] no profile for user ${user.id}`);
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  if (!['owner', 'admin', 'project_manager'].includes(profile.role)) {
    console.error(
      `[invoices/pdf] role ${profile.role} may not read client billing for invoice ${params.id}`
    );
    return NextResponse.json(
      { error: 'Only Owner, Admin or Project Manager can open an invoice' },
      { status: 403 }
    );
  }

  // RLS-scoped fetch — cross-tenant, unassigned-project and unknown ids 404.
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, status, invoice_number, is_deleted')
    .eq('id', params.id)
    .maybeSingle();
  if (!invoice || invoice.is_deleted) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  const isDraft = invoice.status === 'draft' || invoice.status === 'pending_approval';

  let buffer: Buffer | null = null;
  if (isDraft) {
    const rendered = await generateInvoicePDF(supabase, params.id);
    if (!rendered) {
      console.error(`[invoices/pdf] render returned no data for invoice ${params.id}`);
      return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 });
    }
    buffer = rendered.buffer;
  } else {
    const stored = await storeInvoicePdf(supabase, getSupabaseAdmin(), params.id);
    if (stored.error || !stored.buffer) {
      console.error(
        `[invoices/pdf] generation failed for invoice ${params.id}: ${stored.error ?? 'no buffer'}`
      );
      return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 });
    }
    buffer = stored.buffer;
  }

  const stem = invoice.invoice_number ?? `draft-${params.id.slice(0, 8)}`;
  const fileName = `invoice-${stem}${isDraft ? '-DRAFT' : ''}.pdf`;
  const disposition = request.nextUrl.searchParams.get('download') === '1' ? 'attachment' : 'inline';

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${fileName}"`,
      // A draft preview must never be cached and served as if it were the bill.
      'Cache-Control': 'no-store',
    },
  });
}
