import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { DISCARDED, applied } from '@/lib/services/mutation-result';

// ============================================================================
// DELETE — UNSIGNED CHANGE ORDERS ONLY [Josh, S168]
// ============================================================================
//
// Closes the half of `#1-s167fx` that void alone cannot: a change order sent in
// error was permanent. Not void-able into invisibility — *permanent*, number
// consumed, row in every export.
//
// ⚠️ THE BOUNDARY, AND WHY IT IS NOT NEGOTIABLE. Josh ruled option (a) of three
// and rejected the other two — deleting signed COs, and deleting artifacts:
//
//   **a change order is a legal document, and being able to prove you never
//   sent one is a claim the system must not be able to make falsely.**
//
// So: unsigned → gone. Signed → void only, with a reason, artifact retained.
//
// ⚠️ AND THIS ROUTE IS NOT THE GATE. Two database guards are, and they do
// different jobs (`20261023000000` §5):
//
//   `change_orders_delete_unsigned` (RLS)  — WHO. Owner/Admin, in-tenant.
//   `enforce_change_order_delete_boundary` — WHAT. A signed CO is undeletable
//                                            by ANY caller, service role and
//                                            migrations included. That one has
//                                            no escape hatch on purpose.
//
// Everything below turns those refusals into sentences. Delete the file and the
// rule still holds.
//
// ----------------------------------------------------------------------------
// WHY A HARD DELETE, AGAINST CLAUDE.md's "SOFT DELETES ONLY"
// ----------------------------------------------------------------------------
// The trash-bin pattern exists so a user can undo a mistake without losing
// data. Here the mistake IS the data: `is_deleted = true` leaves the row, its
// `co_number` consumed against `change_orders_company_co_number_key`, and its
// content readable by anyone querying past the service layer. That does not
// deliver what was ruled. `files` already carries the same exception — CLAUDE.md
// notes its "permanent-delete path for owner/admin" — and this is that shape.
//
// ----------------------------------------------------------------------------
// THE TWO FOREIGN KEYS THAT STILL REFUSE, AND THAT IS THE POINT
// ----------------------------------------------------------------------------
// `invoice_lines.source_change_order_id` and
// `project_budget_items.source_change_order_id` kept `NO ACTION` in the
// migration. A change order that has been BILLED or BUDGETED is load-bearing
// somewhere else, and the FK refusing is the guard. Postgres reports that as
// `23503`, which is useless to a human, so it is translated below.

const FK_VIOLATION = '23503';

export async function DELETE(
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
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json(
      {
        error:
          'Only Owner or Admin can delete a change order. Void it instead — that keeps the record.',
      },
      { status: 403 }
    );
  }

  // RLS-scoped fetch — cross-tenant ids 404 here.
  const { data: co } = await supabase
    .from('change_orders')
    .select('id, status, signed_at, co_number')
    .eq('id', params.id)
    .maybeSingle();
  if (!co) return NextResponse.json({ error: 'Change order not found' }, { status: 404 });

  if (co.signed_at !== null || co.status === 'signed') {
    return NextResponse.json(
      {
        error:
          `${co.co_number} has been signed and cannot be deleted. ` +
          'Void it instead — the signed copy is kept on file.',
      },
      { status: 409 }
    );
  }

  // ⚠️ `.select('id')` + `applied()` — mutation-result.ts. Its own docstring
  // exempts a DELETE "whose empty result is legitimate"; this is not one. Zero
  // rows here means the policy refused, and reporting that as success is
  // exactly the failure #1-s146 recorded on a different legal document.
  const { data: deleted, error } = await supabase
    .from('change_orders')
    .delete()
    .eq('id', co.id)
    .select('id');

  if (error) {
    console.error('[co/delete] refused', {
      changeOrderId: co.id,
      status: co.status,
      role: profile.role,
      code: error.code,
      message: error.message,
    });
    if (error.code === FK_VIOLATION) {
      return NextResponse.json(
        {
          error:
            `${co.co_number} has already been billed or budgeted against, so it cannot be ` +
            'deleted. Void it instead.',
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (!applied(deleted)) {
    console.error('[co/delete] affected zero rows', {
      changeOrderId: co.id,
      status: co.status,
      role: profile.role,
    });
    return NextResponse.json({ error: DISCARDED }, { status: 403 });
  }

  return NextResponse.json({ success: true });
}
