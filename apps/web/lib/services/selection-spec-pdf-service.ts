import 'server-only';
import { renderToBuffer } from '@react-pdf/renderer';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import type { Database } from '@framefocus/shared/types/database';
import {
  getSelectionSpecSheetData,
  type SelectionSpecSheetData,
} from '@/lib/selections/spec-sheet-data';
import { SelectionSpecSheetDocument } from '@/lib/selections/spec-sheet-template';

// ============================================================================
// Allowances & Selections — STAGE 6: the specifications sheet's PDF pipeline.
// Spec: docs/specs/allowances-selections-spec.md §7.3, §9.4. [S175 item 4]
// ============================================================================
//
// The eighth `*-pdf-service.ts`, on the shipped shape: `generate*` returns
// `{ buffer, data }` for preview and streaming; `store*` uploads to
// `project-files`, inserts the `files` row, then hard-removes the stale
// artifact so there is exactly ONE current sheet per project.
//
// Reads go through the CALLER'S RLS client, so a caller who cannot see the
// project generates nothing. The admin client does the storage write, the
// `files` insert and the stale cleanup — mirroring invoice-pdf-service and
// daily-log-pdf-service, because the `files` DELETE policy is Owner/Admin-only
// and a PM regenerating the sheet could not purge the stale blob under RLS.
//
// ===========================================================================
// ⚠️ Q4.1 — REGENERATION REPLACES THE FILED ARTIFACT. IT DOES NOT VERSION IT.
// ===========================================================================
//
// ⚠️ AND THAT DELIBERATELY DIFFERS FROM THE ESTIMATE-FREEZE DOCTRINE THIS
// SESSION SHIPPED THREE ITEMS AGO. Without this paragraph the two rules read
// as contradictory and a later reader will "fix" one of them.
//
//   A SENT ESTIMATE IS FROZEN (20261031000000) because it is an AGREEMENT the
//   client holds. Its figures cannot move under her signature, so the document
//   is immutable and a change means a VOID AND REISSUE with a new record.
//
//   A SPECIFICATIONS SHEET IS A SNAPSHOT OF A MOVING LIST. The selections it
//   lists keep being approved — that is the normal life of the project, not a
//   revision of anything. Nothing on this sheet is agreed BY the sheet: each
//   selection was already signed individually, and those signed stamps ARE
//   frozen, on `selections`. So there is nothing here to freeze that is not
//   already frozen somewhere it belongs.
//
//   THE `email_logs` TRAIL IS WHAT RECORDS WHICH VERSION WENT OUT WHEN. That
//   is why stage 6 has its own `email_type` (`selection_specifications`,
//   20261036000000) rather than sharing `selection_released`: with the artifact
//   replaced, that table is the only place the question can be answered.
//
// Versioning every generation was considered and REFUSED: with no retention
// rule, project files would accumulate one PDF per press of the button, and
// nothing bounds that. Every shipped PDF service replaces for the same reason
// (`invoice-pdf-service`, `daily-log-pdf-service`).
//
// ===========================================================================
// ⚠️ Q4.2 — THE FILED PDF IS `client_visible`.
// ===========================================================================
// She was emailed the sheet. The same document being invisible in her own
// portal is precisely the inconsistency M9's doctrine warns about.
//
// The flag is set on INSERT, through the ADMIN client. Under RLS,
// `files_insert_non_client` admits `client_visible = true` from Owner/Admin
// only — so a PM generating the sheet could not set it — and the BEFORE UPDATE
// trigger `enforce_files_column_scope` early-returns when `auth.uid()` IS NULL
// so it does not touch service-role writes. This is the same admin write every
// PDF service already performs, carrying one more column; it is NOT a widening
// of who may flip `client_visible` on an arbitrary file.
//
// ===========================================================================
// ⚠️ THE REPLACE KEY IS `(project_id, category = 'selections')`.
// ===========================================================================
// There is no `files.selection_id` to key on, and there deliberately is not:
// the sheet is a PROJECT artifact covering N selections and a scalar FK cannot
// name N — the same reason `email_logs` got no selection FK at 20261029000000.
// Which makes the CATEGORY load-bearing: a row reaching it by any other route
// would be hard-removed by the next generation. Nothing offers that route (the
// upload picker does not list it), and 20261036000000 says not to add it
// without changing this key first.
// ============================================================================

type Db = SupabaseClient<Database>;

const BUCKET = 'project-files';
const CATEGORY = 'selections';

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'project'
  );
}

export function specSheetFileName(projectName: string): string {
  return `specifications-${slug(projectName)}.pdf`;
}

/** Render only — no storage. Used for preview/stream and by the send path. */
export async function generateSelectionSpecPdf(
  rls: Db,
  admin: Db,
  projectId: string
): Promise<{ buffer: Buffer; data: SelectionSpecSheetData } | null> {
  const data = await getSelectionSpecSheetData(rls, admin, projectId);
  if (!data) return null;
  const buffer = await renderToBuffer(SelectionSpecSheetDocument({ data }));
  return { buffer, data };
}

/**
 * Render the project's specifications sheet and file it, REPLACING the
 * previous one. Returns the new `files.id` and the buffer, so the caller can
 * attach the same bytes to the email without rendering twice.
 */
export async function storeSelectionSpecPdf(
  rls: Db,
  admin: Db,
  projectId: string
): Promise<{
  fileId: string | null;
  buffer: Buffer | null;
  data: SelectionSpecSheetData | null;
  error: string | null;
}> {
  const rendered = await generateSelectionSpecPdf(rls, admin, projectId);
  if (!rendered) {
    return { fileId: null, buffer: null, data: null, error: 'Project not found' };
  }
  const { buffer, data } = rendered;

  // ⚠️ REFUSED BEFORE ANYTHING IS WRITTEN. Q4.3 makes the sheet approved-only,
  // so a project with nothing approved renders a document that lists nothing —
  // and filing THAT would put an empty `client_visible` PDF in the client's
  // portal under the company's name. `generate*` still renders the empty case,
  // because a preview of an early project should show what the sheet will be;
  // what must never happen is that it gets FILED. The check is here rather
  // than in the route so every caller inherits it.
  if (data.selectionCount === 0) {
    return {
      fileId: null,
      buffer,
      data,
      error:
        'Nothing has been approved on this project yet, so there is nothing to specify. ' +
        'The sheet lists approved selections only.',
    };
  }

  const { data: project } = await rls
    .from('projects')
    .select('company_id')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) {
    return { fileId: null, buffer, data, error: 'Project not found' };
  }

  const fileName = specSheetFileName(data.project.name);
  const storagePath = `${project.company_id}/${projectId}/${randomUUID()}-${fileName}`;

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: false });
  if (uploadError) {
    return { fileId: null, buffer, data, error: `Upload failed: ${uploadError.message}` };
  }

  // The stale artifact is read BEFORE the insert so the new row cannot be
  // caught by its own cleanup — the invoice service's ordering, verbatim.
  const { data: previous } = await admin
    .from('files')
    .select('id, file_path')
    .eq('project_id', projectId)
    .eq('category', CATEGORY);

  const { data: fileRow, error: insertError } = await admin
    .from('files')
    .insert({
      company_id: project.company_id,
      project_id: projectId,
      category: CATEGORY,
      file_name: fileName,
      file_path: storagePath,
      file_size: buffer.byteLength,
      mime_type: 'application/pdf',
      // Q4.2 — see the header. Set here rather than defaulted: the column is
      // NOT NULL DEFAULT false precisely so nothing becomes client-visible by
      // omission, and this is a deliberate exception stated at the call site.
      client_visible: true,
    })
    .select('id')
    .single();
  if (insertError) {
    await admin.storage.from(BUCKET).remove([storagePath]);
    return { fileId: null, buffer, data, error: `File insert failed: ${insertError.message}` };
  }

  for (const old of previous ?? []) {
    await admin.storage.from(BUCKET).remove([old.file_path]);
    await admin.from('files').delete().eq('id', old.id);
  }

  return { fileId: fileRow.id, buffer, data, error: null };
}
