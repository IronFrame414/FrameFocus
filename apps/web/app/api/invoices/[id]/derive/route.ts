import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { deriveInvoiceLines } from '@/lib/services/invoice-derivation-server';
import type { ContractType, InstrumentRef } from '@/lib/services/invoices-shared';

// Module 7D1 §6/§7 — derive an invoice's lines, server side (RULING B, S97).
//
// RULING A floors instrument_rates reads at Owner/Admin. Derivation needs those
// rates and a PM must keep full invoicing (7D §12a), so the pricing moved here:
// the rate rows are read with the SERVICE ROLE inside
// invoice-derivation-server.ts and never travel back to the caller. The
// response carries a success flag and nothing else — no rows, no rate value.
//
// THE PRIVILEGE IS NOT PROTECTED BY RLS. Exactly the trap the S97 isolation
// proof caught on record_client_payment: a privileged path is protected only by
// the checks it makes itself. So this route does all three before reaching the
// privileged code:
//
//   1. authenticated                      → 401
//   2. role is Owner / Admin / PM (§12a)  → 403
//   3. the invoice is visible to THIS caller through the RLS client, which
//      applies company scoping AND can_view_project AND the role floor in
//      invoices_select_visible                             → 404
//
// (3) is the load-bearing one: it is a real RLS-scoped read, not a hand-rolled
// company comparison, so a cross-tenant or unassigned id 404s here rather than
// being priced.

interface DeriveBody {
  instrument?: InstrumentRef;
  contractType?: ContractType;
  selectedCosts?: Array<{
    allocationId: string;
    description: string;
    category: 'material' | 'subcontractor' | 'other';
    amount: number;
    expenseDate: string;
  }>;
  selectedHours?: Array<{
    segmentId: string;
    memberId: string;
    workDate: string;
    rawHours: number;
    taskId?: string | null;
  }>;
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
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
  if (!profile || !['owner', 'admin', 'project_manager'].includes(profile.role)) {
    return NextResponse.json(
      { error: 'Only an Owner, Admin or Project Manager can derive an invoice.' },
      { status: 403 }
    );
  }

  let body: DeriveBody;
  try {
    body = (await request.json()) as DeriveBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.instrument || !body.contractType) {
    return NextResponse.json({ error: 'An instrument and contract type are required.' }, { status: 400 });
  }

  // RLS-scoped: company + can_view_project + the invoices role floor all apply.
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, status')
    .eq('id', params.id)
    .eq('is_deleted', false)
    .maybeSingle();
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

  if (invoice.status !== 'draft' && invoice.status !== 'pending_approval') {
    return NextResponse.json(
      { error: `An invoice with status ${invoice.status} cannot be re-derived.` },
      { status: 409 }
    );
  }

  const admin = getSupabaseAdmin() as SupabaseClient;
  const result = await deriveInvoiceLines(admin, {
    invoiceId: params.id,
    instrument: body.instrument,
    contractType: body.contractType,
    selectedCosts: body.selectedCosts ?? [],
    selectedHours: body.selectedHours ?? [],
  });

  if (!result.success) {
    // The message may be a MissingRateError, which names a RATE TYPE and a date
    // but never a rate VALUE — safe to return, and the user needs it to know
    // what to fix.
    console.error('INVOICE DERIVE FAILED', { invoiceId: params.id, error: result.error });
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({ success: true });
}
