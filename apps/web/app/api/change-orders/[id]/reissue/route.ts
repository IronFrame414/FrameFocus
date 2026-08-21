import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// ============================================================================
// REISSUE — the path the immutability trigger has advertised since 2026-08-09
// ============================================================================
//
// `enforce_change_order_immutability()` raises *"A sent change order is
// immutable — void and reissue instead."* There was no reissue. A user
// following that instruction had to retype the whole change order, including
// every line and every row, from a document they could still see but not copy.
//
// A reissue is a fresh DRAFT carrying the voided CO's content forward, with
// `supersedes_change_order_id` pointing back at what it replaces — the
// `contract_documents.supersedes_document_id` shape (7I §10.4), not a new one.
//
// ⚠️ WHAT IS DELIBERATELY *NOT* CARRIED FORWARD:
//   * `co_number`   — a new document gets a new number, from the project's
//                     row-locked sequence. Reusing it would make two different
//                     agreements indistinguishable in every export and PDF.
//   * both signatures, `sent_at`, and the void record — the new CO has not been
//     signed, sent or withdrawn. Copying any of them would be a forgery in the
//     literal sense: a signature stamp on a document nobody signed.
//   * reminder state — the new draft has never been sent, so it is not overdue.
//
// ⚠️ THE COPY IS NOT ATOMIC AND CANNOT BE. PostgREST has no transaction, so
// this is parent → items → rows across three round trips. A failure part-way
// would otherwise strand a half-built draft next to the voided original, which
// is worse than no reissue at all. So every failure path rolls the new draft
// back — and that rollback is only possible because S168 made an unsigned
// change order deletable. The bug this session fixed is what makes this route
// safe to write.

type CoInsert = Database['public']['Tables']['change_orders']['Insert'];
type ItemInsert = Database['public']['Tables']['change_order_line_items']['Insert'];
type RowInsert = Database['public']['Tables']['change_order_line_rows']['Insert'];

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
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
      { error: 'Only Owner, Admin, or Project Manager can reissue change orders' },
      { status: 403 }
    );
  }

  // RLS-scoped read. Everything copied below comes back through the caller's
  // own client, so a reissue can never carry forward content the caller was
  // not permitted to see in the first place.
  const { data: source } = await supabase
    .from('change_orders')
    // ⚠️ ONE STRING LITERAL. supabase-js infers the row type from the literal
    // text of `select()`; splitting it with `+` collapses the result to
    // `GenericStringError` and every field read below becomes a type error.
    .select(
      'id, project_id, title, description, co_type, reason_category, schedule_impact_days, pricing_mode, tax_rate, subcontractor_markup_percent, material_markup_percent, labor_markup_percent, net_delta, requires_client_signature, status'
    )
    .eq('id', params.id)
    .eq('is_deleted', false)
    .maybeSingle();
  if (!source) return NextResponse.json({ error: 'Change order not found' }, { status: 404 });

  // Restated here only for the sentence. `enforce_change_order_supersedes_valid`
  // is the guarantee and refuses the INSERT regardless of what this says.
  if (source.status !== 'voided') {
    return NextResponse.json(
      {
        error:
          source.status === 'draft'
            ? 'This change order is still a draft — edit it instead of reissuing it.'
            : 'Only a voided change order can be reissued. Void it first, with a reason.',
      },
      { status: 409 }
    );
  }

  const { data: coNumber, error: numberError } = await supabase.rpc('next_co_number', {
    p_project_id: source.project_id,
  });
  if (numberError || !coNumber) {
    return NextResponse.json(
      { error: numberError?.message ?? 'Could not reserve a CO number' },
      { status: 500 }
    );
  }

  const payload: CoInsert = {
    project_id: source.project_id,
    co_number: coNumber,
    title: source.title,
    description: source.description,
    co_type: source.co_type,
    reason_category: source.reason_category,
    schedule_impact_days: source.schedule_impact_days,
    pricing_mode: source.pricing_mode,
    tax_rate: source.tax_rate,
    subcontractor_markup_percent: source.subcontractor_markup_percent,
    material_markup_percent: source.material_markup_percent,
    labor_markup_percent: source.labor_markup_percent,
    net_delta: source.net_delta,
    requires_client_signature: source.requires_client_signature,
    supersedes_change_order_id: source.id,
    // status/company_id/author_member_id/created_by all come from column
    // defaults — a reissue is a draft authored by whoever pressed the button.
  };

  const { data: created, error: createError } = await supabase
    .from('change_orders')
    .insert(payload)
    .select('id')
    .single();

  if (createError || !created) {
    console.error('[co/reissue] parent insert refused', {
      sourceId: source.id,
      role: profile.role,
      message: createError?.message,
    });
    // `change_orders_supersedes_once` is the expected collision: somebody has
    // already reissued this one. Name that rather than leaking the index.
    const duplicate = createError?.code === '23505';
    return NextResponse.json(
      {
        error: duplicate
          ? 'This change order has already been reissued.'
          : (createError?.message ?? 'Could not create the reissued change order'),
      },
      { status: duplicate ? 409 : 403 }
    );
  }

  const newId = created.id;

  // ── the children, and the rollback that makes a partial copy impossible ────
  const admin = getSupabaseAdmin() as SupabaseClient<Database>;
  const rollback = async (why: string, detail?: string) => {
    // Service role, not the caller's client: DELETE on change_orders is
    // Owner/Admin by policy and a PM may legitimately be standing here. This
    // removes a DRAFT that this request created moments ago and nothing else —
    // the BEFORE DELETE trigger still refuses anything signed, for every caller
    // including this one.
    await admin.from('change_orders').delete().eq('id', newId);
    console.error('[co/reissue] rolled back', { sourceId: source.id, newId, why, detail });
    return NextResponse.json({ error: why }, { status: 500 });
  };

  const { data: items, error: itemsError } = await supabase
    .from('change_order_line_items')
    .select('id, name, description, sort_order, total_price')
    .eq('change_order_id', source.id)
    .order('sort_order', { ascending: true });
  if (itemsError) {
    return rollback('Could not read the original change order’s lines.', itemsError.message);
  }

  for (const item of items ?? []) {
    const itemPayload: ItemInsert = {
      change_order_id: newId,
      name: item.name,
      description: item.description,
      sort_order: item.sort_order,
      total_price: item.total_price,
    };
    const { data: newItem, error: itemError } = await supabase
      .from('change_order_line_items')
      .insert(itemPayload)
      .select('id')
      .single();
    if (itemError || !newItem) {
      return rollback('Could not copy the change order’s lines.', itemError?.message);
    }

    const { data: rows, error: rowsError } = await supabase
      .from('change_order_line_rows')
      .select('*')
      .eq('line_item_id', item.id)
      .order('sort_order', { ascending: true });
    if (rowsError) {
      return rollback('Could not read the original change order’s detail rows.', rowsError.message);
    }
    if (!rows?.length) continue;

    const rowPayload: RowInsert[] = rows.map((r) => ({
      line_item_id: newItem.id,
      row_type: r.row_type,
      name: r.name,
      sort_order: r.sort_order,
      markup_percent: r.markup_percent,
      apply_tax: r.apply_tax,
      total: r.total,
      rate: r.rate,
      quantity: r.quantity,
      labor_unit: r.labor_unit,
      unit_of_measure: r.unit_of_measure,
      unit_cost: r.unit_cost,
      amount: r.amount,
      subcontractor_id: r.subcontractor_id,
    }));
    const { error: rowInsertError } = await supabase
      .from('change_order_line_rows')
      .insert(rowPayload);
    if (rowInsertError) {
      return rollback('Could not copy the change order’s detail rows.', rowInsertError.message);
    }
  }

  return NextResponse.json({ success: true, id: newId });
}
