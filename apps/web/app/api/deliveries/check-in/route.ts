import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { deliveryCheckInSchema } from '@framefocus/shared/validation/deliveries';
import { regenerateDeliveryPdf } from '@/lib/services/delivery-pdf-service';
import type { Database } from '@framefocus/shared/types/database';
import {
  buildSenderAddress,
  getManagerRecipients,
  logEmail,
  sendEmail,
} from '@/lib/services/email-service';
import { NotificationEmail } from '@/lib/email/templates/notification-email';

// 6D §7 — delivery check-in. Inserts run under the CALLER's RLS (any member
// on a visible project may check in — §3 amendment). The DB trigger chain
// derives has_exceptions and PO auto-close before we read the row back.
// Notification: one template, one code path, EVERY check-in — subject states
// clean vs flagged. Recipients: Owner + Admin + project-assigned PMs (Phase 3
// Q4). Send failure logs and reports but NEVER rolls back the insert.

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let parsed;
  try {
    parsed = deliveryCheckInSchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }
  const input = parsed.data;

  // RLS-scoped project fetch — cross-tenant / non-visible ids 404 here.
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, company_id')
    .eq('id', input.project_id)
    .eq('is_deleted', false)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  // Vendor comes from the PO when one is attached (§6: copied, not typed).
  let vendorName = input.vendor_name;
  if (input.purchase_order_id) {
    const { data: po } = await supabase
      .from('purchase_orders')
      .select('id, vendor_name')
      .eq('id', input.purchase_order_id)
      .eq('project_id', input.project_id)
      .eq('is_deleted', false)
      .maybeSingle();
    if (!po) return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });
    vendorName = po.vendor_name;
  }

  // Verify photo ids BEFORE inserting anything: they must be this project's
  // live files rows. The zod refine already requires ids on damaged lines;
  // this closes the fabricated-uuid hole so "damage requires a photo" holds
  // against the API, not just the form. Delivery-level (whole-truck) ids are
  // verified in the same pass — always optional, bound below.
  const allPhotoIds = [
    ...input.items.flatMap((i) => i.photo_file_ids ?? []),
    ...(input.photo_file_ids ?? []),
  ];
  let verifiedTagsById = new Map<string, string[]>();
  if (allPhotoIds.length > 0) {
    const { data: photoRows, error: photoError } = await supabase
      .from('files')
      .select('id, tags')
      .in('id', allPhotoIds)
      .eq('project_id', input.project_id)
      .eq('is_deleted', false);
    if (photoError) {
      console.error(`[deliveries/check-in] photo verification failed: ${photoError.message}`);
      return NextResponse.json({ error: 'Check-in failed' }, { status: 500 });
    }
    verifiedTagsById = new Map((photoRows ?? []).map((r) => [r.id, r.tags ?? []]));
    for (const item of input.items) {
      if (item.qty_damaged > 0) {
        const verified = (item.photo_file_ids ?? []).filter((id) => verifiedTagsById.has(id));
        if (verified.length === 0) {
          return NextResponse.json(
            { error: `"${item.description}": a damage photo is required on this line` },
            { status: 400 }
          );
        }
      }
    }
  }

  const { data: delivery, error: insertError } = await supabase
    .from('deliveries')
    .insert({
      project_id: input.project_id,
      purchase_order_id: input.purchase_order_id ?? null,
      vendor_name: vendorName,
      delivery_date: input.delivery_date,
      notes: input.notes?.trim() ? input.notes.trim() : null,
    })
    .select('id')
    .single();
  if (insertError) {
    console.error(`[deliveries/check-in] delivery insert failed: ${insertError.message}`);
    return NextResponse.json({ error: 'Check-in failed' }, { status: 500 });
  }

  // .select('id') — INSERT ... RETURNING preserves VALUES order, so row i of
  // the result is input.items[i]; the photo linking below relies on that.
  const { data: insertedItems, error: itemsError } = await supabase
    .from('delivery_items')
    .insert(
      input.items.map((i) => ({
        delivery_id: delivery.id,
        po_item_id: i.po_item_id ?? null,
        description: i.description,
        qty_received: i.qty_received,
        qty_damaged: i.qty_damaged,
        issue_note: i.issue_note?.trim() ? i.issue_note.trim() : null,
      }))
    )
    .select('id');
  if (itemsError || !insertedItems || insertedItems.length !== input.items.length) {
    console.error(
      `[deliveries/check-in] items insert failed: ${itemsError?.message ?? 'row count mismatch'}`
    );
    return NextResponse.json({ error: 'Check-in failed on line items' }, { status: 500 });
  }

  // ── Per-line photo binding (S90). Photos were uploaded ahead of submit,
  // project-pooled (category 'photos'); bind each verified id to its line
  // via files.delivery_item_id and tag damage-line photos "damage". Caller
  // RLS (files_update_non_client) scopes the company. Binding failure never
  // rolls back the check-in — the photos remain ordinary project photos.
  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i];
    for (const photoId of item.photo_file_ids ?? []) {
      const tags = verifiedTagsById.get(photoId);
      if (!tags) continue; // not this project's file — skip
      const nextTags =
        item.qty_damaged > 0 && !tags.includes('damage') ? [...tags, 'damage'] : tags;
      // delivery_item_id (migration 20260723000000) is not in database.ts
      // until the next type regen — swap to a plain typed update then.
      const link = {
        delivery_item_id: insertedItems[i].id,
        tags: nextTags,
      } as unknown as Database['public']['Tables']['files']['Update'];
      const { error: linkError } = await supabase.from('files').update(link).eq('id', photoId);
      if (linkError) {
        console.error(`[deliveries/check-in] photo ${photoId} link failed: ${linkError.message}`);
      }
    }
  }

  // General whole-delivery photos bind via files.delivery_id (migration
  // 20260723020000) — never tagged 'damage'.
  for (const photoId of input.photo_file_ids ?? []) {
    if (!verifiedTagsById.has(photoId)) continue; // not this project's file — skip
    // delivery_id is not in database.ts until the next type regen.
    const link = {
      delivery_id: delivery.id,
    } as unknown as Database['public']['Tables']['files']['Update'];
    const { error: linkError } = await supabase.from('files').update(link).eq('id', photoId);
    if (linkError) {
      console.error(
        `[deliveries/check-in] delivery photo ${photoId} link failed: ${linkError.message}`
      );
    }
  }

  // ── Delivery record PDF — EVERY check-in, clean or exception (S90).
  // Best-effort: generation failure never rolls back the check-in; the PDF
  // is regenerable from the delivery detail view.
  let pdfError: string | null = null;
  try {
    const pdf = await regenerateDeliveryPdf(supabase, getSupabaseAdmin(), delivery.id);
    pdfError = pdf.error;
  } catch (err) {
    pdfError = err instanceof Error ? err.message : 'PDF generation failed';
  }
  if (pdfError) {
    console.error(`[deliveries/check-in] PDF failed for ${delivery.id}: ${pdfError}`);
  }

  // Read back trigger-derived state + receiver for the email.
  const { data: derived } = await supabase
    .from('deliveries')
    .select('has_exceptions, receiver:company_members(display_name)')
    .eq('id', delivery.id)
    .maybeSingle();
  const hasExceptions = derived?.has_exceptions ?? false;
  const receiverName =
    (derived as { receiver: { display_name: string } | null } | null)?.receiver?.display_name ??
    'a crew member';

  // ── Notification (best-effort from here down — §7). ──
  const emailErrors: string[] = [];
  try {
    const admin = getSupabaseAdmin();
    const { data: company } = await supabase
      .from('companies')
      .select('name, slug, brand_color')
      .eq('id', project.company_id)
      .single();

    if (company) {
      // Owner + Admin (service-role read, same helper as CO notifications).
      const managers = await getManagerRecipients(admin, project.company_id);

      // Project-assigned PMs only (Phase 3 Q4) — an unassigned PM cannot
      // open the link under can_view_project.
      const { data: assignments } = await admin
        .from('project_assignments')
        .select('member:company_members(profile:profiles(email, first_name, role, is_deleted))')
        .eq('project_id', project.id)
        .eq('is_deleted', false);
      const pms = (assignments ?? [])
        .map(
          (a) =>
            (a as unknown as {
              member: {
                profile: { email: string; first_name: string; role: string; is_deleted: boolean } | null;
              } | null;
            }).member?.profile
        )
        .filter(
          (p): p is { email: string; first_name: string; role: string; is_deleted: boolean } =>
            p != null && !p.is_deleted && p.role === 'project_manager'
        );

      const recipients = new Map<string, string>();
      for (const r of [...managers, ...pms]) recipients.set(r.email, r.first_name);

      const sender = buildSenderAddress(company);
      const subject = `[${hasExceptions ? 'EXCEPTIONS' : 'Clean'}] Delivery — ${vendorName} · ${project.name}`;
      const itemLines = input.items.map((i) => {
        const issue = i.issue_note?.trim() ? ` — "${i.issue_note.trim()}"` : '';
        const damaged = i.qty_damaged > 0 ? ` (${i.qty_damaged} damaged)` : '';
        return `• ${i.description}: ${i.qty_received} received${damaged}${issue}`;
      });
      const message = [
        `${vendorName} delivery on ${input.delivery_date}, checked in by ${receiverName} at ${project.name}.`,
        hasExceptions ? 'This delivery has EXCEPTIONS.' : 'No exceptions — clean delivery.',
        '',
        ...itemLines,
      ].join('\n');
      const url = `${request.nextUrl.origin}/dashboard/field-ops/${project.id}/deliveries/${
        input.purchase_order_id ?? `d/${delivery.id}`
      }`;

      for (const [email] of recipients) {
        let messageId: string | null = null;
        let sendError: string | null = null;
        try {
          const sent = await sendEmail({
            from: sender,
            to: email,
            subject,
            react: NotificationEmail({
              brandColor: company.brand_color || '#1a56db',
              heading: subject,
              message,
              estimateUrl: url,
              ctaLabel: 'Open Delivery',
            }),
          });
          messageId = sent.messageId;
          sendError = sent.error;
        } catch (err) {
          sendError = err instanceof Error ? err.message : 'Email send failed';
        }
        if (sendError) emailErrors.push(`${email}: ${sendError}`);
        await logEmail(admin, {
          company_id: project.company_id,
          estimate_id: null,
          signing_session_id: null,
          resend_message_id: messageId,
          email_type: 'material_delivery',
          recipient_email: email,
          sender_email: sender,
          subject,
          status: sendError ? 'failed' : 'sent',
          metadata: { delivery_id: delivery.id, project_id: project.id },
        });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'notification failed';
    console.error(`[deliveries/check-in] notification block failed: ${msg}`);
    emailErrors.push(msg);
  }

  return NextResponse.json({
    deliveryId: delivery.id,
    hasExceptions,
    emailErrors: emailErrors.length > 0 ? emailErrors : undefined,
  });
}
