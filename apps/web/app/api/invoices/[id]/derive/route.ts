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

interface DeriveSelectionBody {
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
  /** §6.2 [S97] — percentage of each ticked cost's REMAINING amount. */
  billPercent?: number;
}

/** §2 [S97] — `selections` is the shape. The bare single-instrument fields are
 *  still accepted so a browser tab left open across the deploy gets its invoice
 *  derived instead of a confusing 400. */
type DeriveBody = DeriveSelectionBody & { selections?: DeriveSelectionBody[] };

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
  const rawSelections: DeriveSelectionBody[] =
    body.selections && Array.isArray(body.selections) ? body.selections : [body];
  if (rawSelections.length === 0) {
    return NextResponse.json({ error: 'Nothing was selected to bill.' }, { status: 400 });
  }
  for (const s of rawSelections) {
    if (!s.instrument || !s.contractType) {
      return NextResponse.json(
        { error: 'Every selection needs an instrument and a contract type.' },
        { status: 400 }
      );
    }
    // §6.2 — the percentage decides how much money is claimed, so it is
    // validated here rather than trusted from the browser. The CEILING is
    // enforced independently by the DB trigger; this only rejects nonsense.
    if (
      s.billPercent !== undefined &&
      (typeof s.billPercent !== 'number' ||
        !Number.isFinite(s.billPercent) ||
        s.billPercent <= 0 ||
        s.billPercent > 100)
    ) {
      return NextResponse.json(
        { error: 'A billing percentage must be greater than 0 and at most 100.' },
        { status: 400 }
      );
    }
  }
  // §2 — one entry PER INSTRUMENT. A repeated instrument would derive twice
  // against the same rates and double-claim its costs, so it is rejected rather
  // than silently merged.
  const keys = rawSelections.map((s) =>
    s.instrument?.change_order_id ? `co:${s.instrument.change_order_id}` : `est:${s.instrument?.estimate_id}`
  );
  if (new Set(keys).size !== keys.length) {
    return NextResponse.json(
      { error: 'The same instrument appears twice in this request.' },
      { status: 400 }
    );
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
    selections: rawSelections.map((s) => ({
      instrument: s.instrument as InstrumentRef,
      contractType: s.contractType as ContractType,
      selectedCosts: s.selectedCosts ?? [],
      selectedHours: s.selectedHours ?? [],
      billPercent: s.billPercent,
    })),
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
