import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { deliveryEditSchema } from '@framefocus/shared/validation/deliveries';
import { regenerateDeliveryPdf } from '@/lib/services/delivery-pdf-service';
import type { Database } from '@framefocus/shared/types/database';

// 6D — delivery edit (S90; closes spec §9 #4). Replaces the client-direct
// updateDelivery/setDeliveryItems path so the damage-photo rule is enforced
// server-side on edits exactly as at check-in: zod blocks the obvious miss,
// then this route re-derives the truth (existing line-bound photos from
// files.delivery_item_id + verified new ids) BEFORE any write. All writes
// run under the CALLER's RLS (receiver or Owner/Admin per
// deliveries_update_authorized); the DB trigger chain recomputes
// has_exceptions and PO state on every item write. The record PDF
// regenerates inline, best-effort.

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
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
    console.error(`[deliveries/edit] no profile for user ${user.id}`);
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // RLS-scoped fetch — cross-tenant and non-visible ids 404 here.
  const { data: delivery } = await supabase
    .from('deliveries')
    .select('id, project_id, purchase_order_id, received_by, is_deleted')
    .eq('id', params.id)
    .maybeSingle();
  if (!delivery || delivery.is_deleted) {
    return NextResponse.json({ error: 'Delivery not found' }, { status: 404 });
  }

  const isAdminRole = ['owner', 'admin'].includes(profile.role);
  if (!isAdminRole) {
    const { data: myMember } = await supabase
      .from('company_members')
      .select('id')
      .eq('profile_id', profile.id)
      .eq('is_deleted', false)
      .maybeSingle();
    if (!myMember || myMember.id !== delivery.received_by) {
      console.error(
        `[deliveries/edit] member ${myMember?.id ?? 'none'} is not receiver of delivery ${params.id} and role ${profile.role} is not owner/admin`
      );
      return NextResponse.json(
        { error: 'Only the receiver or an Owner/Admin can edit this delivery' },
        { status: 403 }
      );
    }
  }

  let parsed;
  try {
    parsed = deliveryEditSchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }
  const input = parsed.data;

  // Kept item ids must belong to THIS delivery — a foreign id would let the
  // payload update another delivery's lines and borrow their photos for the
  // damage check.
  const { data: currentItems, error: currentError } = await supabase
    .from('delivery_items')
    .select('id')
    .eq('delivery_id', delivery.id)
    .eq('is_deleted', false);
  if (currentError) {
    console.error(`[deliveries/edit] current items read failed: ${currentError.message}`);
    return NextResponse.json({ error: 'Save failed' }, { status: 500 });
  }
  const currentIds = new Set((currentItems ?? []).map((r) => r.id));
  for (const item of input.items) {
    if (item.id && !currentIds.has(item.id)) {
      return NextResponse.json({ error: 'Line does not belong to this delivery' }, { status: 400 });
    }
  }

  // Verify NEW photo ids: this project's live files rows only.
  const allNewPhotoIds = [
    ...input.items.flatMap((i) => i.photo_file_ids ?? []),
    ...(input.photo_file_ids ?? []),
  ];
  let verifiedTagsById = new Map<string, string[]>();
  if (allNewPhotoIds.length > 0) {
    const { data: photoRows, error: photoError } = await supabase
      .from('files')
      .select('id, tags')
      .in('id', allNewPhotoIds)
      .eq('project_id', delivery.project_id)
      .eq('is_deleted', false);
    if (photoError) {
      console.error(`[deliveries/edit] photo verification failed: ${photoError.message}`);
      return NextResponse.json({ error: 'Save failed' }, { status: 500 });
    }
    verifiedTagsById = new Map((photoRows ?? []).map((r) => [r.id, r.tags ?? []]));
  }

  // Authoritative damage check BEFORE any write: existing line-bound photos
  // (DB truth, not the form-reported count) + verified new ids.
  const keptIds = input.items.filter((i) => i.id).map((i) => i.id as string);
  const existingCountByItem = new Map<string, number>();
  if (keptIds.length > 0) {
    const { data: existingPhotos } = await supabase
      .from('files')
      .select('id, delivery_item_id')
      // delivery_item_id is not in database.ts until the next type regen.
      .filter('delivery_item_id', 'in', `(${keptIds.join(',')})`)
      .like('mime_type', 'image/%')
      .eq('is_deleted', false);
    for (const row of (existingPhotos ?? []) as unknown as { delivery_item_id: string }[]) {
      existingCountByItem.set(
        row.delivery_item_id,
        (existingCountByItem.get(row.delivery_item_id) ?? 0) + 1
      );
    }
  }
  for (const item of input.items) {
    if (item.qty_damaged > 0) {
      const existing = item.id ? (existingCountByItem.get(item.id) ?? 0) : 0;
      const fresh = (item.photo_file_ids ?? []).filter((id) => verifiedTagsById.has(id)).length;
      if (existing + fresh === 0) {
        return NextResponse.json(
          { error: `"${item.description}": a damage photo is required on this line` },
          { status: 400 }
        );
      }
    }
  }

  // ── Writes. Vendor is PO-owned on PO-linked deliveries (§6) — ignored here.
  // Triggers own updated_at / updated_by; has_exceptions and PO state are
  // DB-derived on item writes.
  const { error: updateError } = await supabase
    .from('deliveries')
    .update({
      delivery_date: input.delivery_date,
      notes: input.notes?.trim() ? input.notes.trim() : null,
      ...(delivery.purchase_order_id === null && input.vendor_name?.trim()
        ? { vendor_name: input.vendor_name.trim() }
        : {}),
    })
    .eq('id', delivery.id);
  if (updateError) {
    console.error(`[deliveries/edit] delivery update failed: ${updateError.message}`);
    return NextResponse.json({ error: 'Save failed' }, { status: 500 });
  }

  // Reconcile lines: update rows with ids, insert new, hard-delete missing
  // (server-side port of the former setDeliveryItems).
  const keptSet = new Set(keptIds);
  const removeIds = [...currentIds].filter((id) => !keptSet.has(id));
  if (removeIds.length > 0) {
    const { error } = await supabase.from('delivery_items').delete().in('id', removeIds);
    if (error) {
      console.error(`[deliveries/edit] line delete failed: ${error.message}`);
      return NextResponse.json({ error: 'Line update failed' }, { status: 500 });
    }
  }
  // itemIdByIndex maps each input line to its delivery_items.id for photo
  // binding below.
  const itemIdByIndex: string[] = [];
  for (const item of input.items) {
    const row = {
      po_item_id: item.po_item_id ?? null,
      description: item.description,
      qty_received: item.qty_received,
      qty_damaged: item.qty_damaged,
      issue_note: item.issue_note?.trim() ? item.issue_note.trim() : null,
    };
    if (item.id) {
      const { error } = await supabase.from('delivery_items').update(row).eq('id', item.id);
      if (error) {
        console.error(`[deliveries/edit] line update failed: ${error.message}`);
        return NextResponse.json({ error: 'Line update failed' }, { status: 500 });
      }
      itemIdByIndex.push(item.id);
    } else {
      const { data: inserted, error } = await supabase
        .from('delivery_items')
        .insert({ ...row, delivery_id: delivery.id })
        .select('id')
        .single();
      if (error || !inserted) {
        console.error(`[deliveries/edit] line insert failed: ${error?.message ?? 'no id'}`);
        return NextResponse.json({ error: 'Line update failed' }, { status: 500 });
      }
      itemIdByIndex.push(inserted.id);
    }
  }

  // ── Photo binding (best-effort from here down — the save has landed).
  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i];
    for (const photoId of item.photo_file_ids ?? []) {
      const tags = verifiedTagsById.get(photoId);
      if (!tags) continue; // not this project's file — skip
      const nextTags =
        item.qty_damaged > 0 && !tags.includes('damage') ? [...tags, 'damage'] : tags;
      const link = {
        delivery_item_id: itemIdByIndex[i],
        tags: nextTags,
      } as unknown as Database['public']['Tables']['files']['Update'];
      const { error: linkError } = await supabase.from('files').update(link).eq('id', photoId);
      if (linkError) {
        console.error(`[deliveries/edit] photo ${photoId} link failed: ${linkError.message}`);
      }
    }
  }
  for (const photoId of input.photo_file_ids ?? []) {
    if (!verifiedTagsById.has(photoId)) continue;
    const link = {
      delivery_id: delivery.id,
    } as unknown as Database['public']['Tables']['files']['Update'];
    const { error: linkError } = await supabase.from('files').update(link).eq('id', photoId);
    if (linkError) {
      console.error(`[deliveries/edit] delivery photo ${photoId} link failed: ${linkError.message}`);
    }
  }

  // Record PDF regenerates on every edit — best-effort, regenerable from the
  // detail view.
  let pdfError: string | null = null;
  try {
    const pdf = await regenerateDeliveryPdf(supabase, getSupabaseAdmin(), delivery.id);
    pdfError = pdf.error;
  } catch (err) {
    pdfError = err instanceof Error ? err.message : 'PDF generation failed';
  }
  if (pdfError) {
    console.error(`[deliveries/edit] PDF failed for ${delivery.id}: ${pdfError}`);
  }

  return NextResponse.json({ success: true });
}
