import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  getTemplateBoxes,
  resolveReleaseValues,
} from '@/lib/services/lien-releases';
import { renderRelease } from '@/lib/services/lien-release-pdf-service';
import { isLegalValueKey, type ReleaseType } from '@/lib/services/lien-releases-shared';

// 7F §7 — the generate flow, server side.
//
//   trigger -> template selected -> values resolved -> REVIEW AND EDIT ->
//   sign (or leave blank on the notary path) -> render -> store -> deliver
//
// This route runs the last four. The review step happens in the browser and
// arrives here as `values`, because §7 step 4 rules that EVERY auto-filled
// value is editable before anything renders: the instrument is signed and
// cannot be retracted, so the user gets the last look.
//
// Roles: OWNER/ADMIN ONLY (§8.2), narrower than the invoice routes beside it.
// A release waives legal rights and voiding does not retrieve it, so whatever
// generates one must be authorised to bind the company.
//
// Auth failures return 401/403 with their own message. A 404 means auth passed
// and the invoice genuinely is not visible (CLAUDE.md — never name a cause
// that has not been verified).

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, company_id, role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile) {
    console.error(`[lien-releases/generate] no profile for user ${user.id}`);
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  if (!['owner', 'admin'].includes(profile.role)) {
    console.error(
      `[lien-releases/generate] role ${profile.role} may not generate a lien release`
    );
    return NextResponse.json(
      { error: 'Only an Owner or Admin can generate a lien release' },
      { status: 403 }
    );
  }

  const body = (await request.json()) as {
    invoiceId?: string;
    templateId?: string;
    type?: ReleaseType;
    values?: Record<string, string>;
    notaryRequired?: boolean;
  };

  const { invoiceId, templateId, type, notaryRequired = false } = body;
  if (!invoiceId || !templateId || (type !== 'conditional' && type !== 'unconditional')) {
    return NextResponse.json(
      { error: 'invoiceId, templateId and a valid type are required' },
      { status: 400 }
    );
  }

  const resolved = await resolveReleaseValues(invoiceId, type);
  if (!resolved) {
    console.error(`[lien-releases/generate] invoice ${invoiceId} not visible to ${profile.id}`);
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  // §6.3 BUILD GUARD — REFUSE rather than render a blank required field. The
  // property address is legally required on the form, and it is what covers a
  // missing legal description; a release rendered without it looks finished
  // and is not.
  if (resolved.blockers.length > 0) {
    return NextResponse.json(
      { error: resolved.blockers.join(' '), blockers: resolved.blockers },
      { status: 422 }
    );
  }

  // The user's edits win over the resolved defaults (§7 step 4) — but only for
  // keys the catalog knows or a custom box declared. An unknown key is
  // DISCARDED rather than stamped: the same validate-against-a-known-set rule
  // the AI layer uses, and for the same reason — an arbitrary key/value pair
  // reaching a legal instrument is a content-injection path.
  const boxes = await getTemplateBoxes(templateId);
  const customLabels = new Set(
    boxes.filter((b) => b.kind === 'custom' && b.custom_label).map((b) => b.custom_label as string)
  );
  const values = { ...resolved.values };
  for (const [key, value] of Object.entries(body.values ?? {})) {
    if (isLegalValueKey(key) || customLabels.has(key)) values[key] = value;
  }

  // Template PDF + signature bytes, read with the service role because storage
  // paths are company-scoped and this route has already established the caller
  // is an Owner/Admin of that company.
  const admin = getSupabaseAdmin();

  const { data: template } = await supabase
    .from('lien_release_templates')
    .select('id, pdf_file_id, type, is_final')
    .eq('id', templateId)
    .single();
  if (!template?.pdf_file_id) {
    return NextResponse.json(
      {
        error:
          'This template has no form attached. Upload the release form your company uses in Company Settings before generating.',
      },
      { status: 422 }
    );
  }

  const { data: pdfFile } = await admin
    .from('files')
    .select('file_path')
    .eq('id', template.pdf_file_id)
    .single();
  if (!pdfFile?.file_path) {
    return NextResponse.json({ error: 'The template form is missing.' }, { status: 422 });
  }

  const { data: pdfBlob, error: pdfErr } = await admin.storage
    .from('project-files')
    .download(pdfFile.file_path);
  if (pdfErr || !pdfBlob) {
    console.error(`[lien-releases/generate] could not read template form: ${pdfErr?.message}`);
    return NextResponse.json({ error: 'Could not read the template form.' }, { status: 500 });
  }

  // §9 — the signature already exists and is already consumed in production
  // by the CO send route. 7F reuses it; nothing new is captured.
  let signatureImage: Buffer | null = null;
  if (!notaryRequired) {
    const { data: company } = await supabase
      .from('companies')
      .select('contractor_signature_path')
      .maybeSingle();
    if (company?.contractor_signature_path) {
      const { data: sigBlob } = await admin.storage
        .from('project-files')
        .download(company.contractor_signature_path);
      if (sigBlob) signatureImage = Buffer.from(await sigBlob.arrayBuffer());
    }
  }

  const rendered = await renderRelease({
    templatePdf: Buffer.from(await pdfBlob.arrayBuffer()),
    boxes: boxes.map((b) => ({
      page: b.page,
      x: Number(b.x),
      y: Number(b.y),
      width: Number(b.width),
      height: Number(b.height),
      kind: b.kind,
      value_key: b.value_key,
      custom_label: b.custom_label,
    })),
    values,
    signatureImage,
    notaryRequired,
  });

  // Store the rendered PDF against the company (no project on the file row —
  // the release links to its invoice, which carries the project).
  const storagePath = `${profile.company_id}/lien-releases/${invoiceId}-${type}-${Date.now()}.pdf`;
  const { error: uploadErr } = await admin.storage
    .from('project-files')
    .upload(storagePath, rendered.pdf, { contentType: 'application/pdf', upsert: true });
  if (uploadErr) {
    console.error(`[lien-releases/generate] storage upload failed: ${uploadErr.message}`);
    return NextResponse.json({ error: 'Could not store the release.' }, { status: 500 });
  }

  const { data: fileRow, error: fileErr } = await admin
    .from('files')
    .insert({
      company_id: profile.company_id,
      project_id: null,
      category: 'lien_releases',
      file_name: `lien-release-${type}-${invoiceId}.pdf`,
      file_path: storagePath,
      file_size: rendered.pdf.length,
      mime_type: 'application/pdf',
      created_by: user.id,
      updated_by: user.id,
    })
    .select('id')
    .single();
  if (fileErr || !fileRow) {
    console.error(`[lien-releases/generate] file row insert failed: ${fileErr?.message}`);
    return NextResponse.json({ error: 'Could not store the release.' }, { status: 500 });
  }

  // §7 step 7 — the SNAPSHOT of what was stamped. The release must survive its
  // sources changing: a client renaming, an address being corrected, a rate
  // being superseded. Re-deriving a signed instrument would silently restate
  // what was waived.
  const { data: release, error: releaseErr } = await supabase
    .from('lien_releases')
    .insert({
      template_id: templateId,
      direction: 'client_outbound',
      invoice_id: invoiceId,
      type,
      is_final: template.is_final,
      status: notaryRequired ? 'draft' : 'signed',
      notary_required: notaryRequired,
      generated_pdf_file_id: fileRow.id,
      filled_values: values,
      amount: resolved.amount,
    })
    .select('id')
    .single();

  if (releaseErr) {
    console.error(`[lien-releases/generate] insert failed: ${releaseErr.message}`);
    // The bytes landed but the record did not — remove the orphan rather than
    // leave a rendered legal document nothing references.
    await admin.storage.from('project-files').remove([storagePath]);
    await admin.from('files').delete().eq('id', fileRow.id);
    const duplicate = /one_per_invoice_type|duplicate key/i.test(releaseErr.message);
    return NextResponse.json(
      {
        error: duplicate
          ? 'A release of this type already exists for this invoice. Void it before issuing another.'
          : 'Could not record the release.',
      },
      { status: duplicate ? 409 : 500 }
    );
  }

  return NextResponse.json({
    id: release.id,
    fileId: fileRow.id,
    amount: resolved.amount,
    // Surfaced so the review screen can say which boxes had to shrink and
    // which still do not fit (§3.1, §7 step 4).
    shrunkBoxes: rendered.shrunkBoxes,
    overflowedBoxes: rendered.overflowedBoxes,
    amountClamped: resolved.amountClamped,
  });
}
