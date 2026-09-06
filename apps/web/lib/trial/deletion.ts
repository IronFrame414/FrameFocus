import 'server-only';
import { createElement } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { isPostponed } from '@/lib/trial/lifecycle';
import { sendEmail, SENDING_DOMAIN } from '@/lib/services/email-service';
import { NotificationEmail } from '@/lib/email/templates/notification-email';
import { brand } from '@/lib/brand';

/**
 * S137 — the deletion job.
 *
 * ==========================================================================
 * ✅ THIS IS SCHEDULED — the Q8 chain closed [Josh, 2026-08-30].
 * ==========================================================================
 * 15:00 daily via `apps/web/vercel.json`, after the retention warnings
 * (14:30). _Superseded banner, quoted not rewritten:_ "THIS IS BUILT AND
 * DELIBERATELY NOT SCHEDULED. TL-24 … is UNANSWERED and with legal review.
 * … The absence of that entry is not an oversight." TL-24's hold was
 * released (terms written and reviewed), the ruled Q8 chain closed
 * (deliverability verified → warnings live → dry run reviewed clean), and
 * Josh added the line. See `app/api/cron/trial-deletion/route.ts` for the
 * full record.
 *
 * ==========================================================================
 * WHY RESUMABLE, AND WHY IT STOPS RATHER THAN RETRIES
 * ==========================================================================
 * Deletion spans every company-scoped table plus the storage buckets and
 * **cannot be one transaction** — storage cannot join a database transaction.
 * So each table commits independently and records itself in
 * `deletion_jobs.tables_done`, and a job that dies is RESUMED rather than
 * restarted.
 *
 * On repeated failure it moves to `stopped` and alarms. **A half-deleted
 * company needs a human, not another attempt**: a retry loop against a
 * persistent error keeps deleting a company nobody has looked at yet.
 *
 * ==========================================================================
 * WHY ROWS FIRST, THEN STORAGE
 * ==========================================================================
 * Both orderings are wrong in different ways. Orphaned storage objects are
 * invisible and recoverable; rows pointing at missing files are visible and
 * broken. If the job dies mid-way, rows-first leaves whatever remains
 * rendering coherently for whoever investigates.
 */

export interface DeletionOutcome {
  processed: number;
  completed: number;
  stopped: number;
  postponed: number;
  /**
   * Companies whose tenant data was destroyed but whose `companies` row could
   * not be removed, because tables on the SURVIVES list hold RESTRICT foreign
   * keys to it. [S138] — see the block at the end of `runTrialDeletion()` and
   * TECH_DEBT #3-trial. Counted separately so this can never again be reported
   * as a clean completion.
   */
  companyRowsRemaining: number;
}

/** After this many failed attempts the job stops and alarms. */
export const MAX_ATTEMPTS = 3;

/**
 * Tables the job NEVER touches, and why. Anything not listed here and carrying
 * `company_id` is deleted.
 *
 * ⚠️ ERRING TOWARD RETENTION IS DELIBERATE. Keeping too much is recoverable;
 * deleting too much is not, and TL-24 has not returned.
 */
export const SURVIVES: Record<string, string> = {
  // The three-trial count resets if these go, and the mechanism is defeated.
  trial_emails: 'the trial count must outlive the company',
  // A record of mail sent to THIRD PARTIES, who are not this tenant.
  email_logs: 'record of mail sent to third parties',
  // Our spend, not their data. Handled specially: company_id is NULLED so the
  // financial trail survives without the tenant linkage [Josh, S137 Q1].
  ai_tag_logs: 'our AI spend — company_id nulled instead',
  // Platform staff are not tenant data.
  platform_admins: 'not tenant data',
  // The job's own bookkeeping. Cleared at the end, not mid-walk.
  deletion_jobs: 'the job writing this',
  trial_lifecycle: 'holds deleted_at — written last',
  trial_warning_acknowledgements: 'evidence the warning was acknowledged',
  export_jobs: 'the export audit — who took what, and when',
  // The Q3 archive itself — the reason deleting the originals below is
  // permitted at all. Platform table, no company FK; see 20261055.
  archived_documents: 'the archive of executed instruments — outlives the tenant by design',
};

/**
 * THE SIGNED-DOCUMENT MECHANISM — RULED [Josh, Phase 3 on
 * deletion-sweep-analysis.md Q3]: **archive, not detach.**
 *
 * Executed instruments — signed client contracts, change orders and
 * subcontractor contracts (with `client_contract_amounts` riding its 1:1
 * parent), executed 7I contract documents, and signed/notarized lien
 * releases — are COPIED into `archived_documents` (20261055: platform table,
 * no company FK, denormalized company name, PDFs re-homed into the
 * `archives` bucket outside every company prefix) BEFORE the walk. Then the
 * originals are deleted with everything else. Unsigned drafts and blank
 * templates get no copy and go with everything else.
 *
 * "Signed" per table is the status enum's executed states, OR'd with the
 * signed-evidence column so an instrument VOIDED AFTER SIGNING still
 * archives — a voided executed contract is a record of something that
 * happened, which is the entire species this archive preserves.
 */
export const ARCHIVE_SOURCES: Array<{
  table: 'client_contracts' | 'change_orders' | 'subcontractor_contracts' | 'contract_documents' | 'lien_releases';
  isSigned: (row: Record<string, unknown>) => boolean;
  /** Columns holding `files.id` references whose PDFs are re-homed. */
  fileColumns: string[];
}> = [
  {
    table: 'client_contracts',
    isSigned: (r) => r.status === 'signed' || r.signed_proposal_file_id != null,
    fileColumns: ['signed_proposal_file_id'],
  },
  {
    table: 'change_orders',
    // COs carry no file column — the signed record is the row plus its line
    // items, which are embedded into the archived document.
    isSigned: (r) => r.status === 'signed' || r.signed_at != null,
    fileColumns: [],
  },
  {
    table: 'subcontractor_contracts',
    isSigned: (r) => r.status === 'signed' || r.signed_doc_file_id != null,
    fileColumns: ['signed_doc_file_id'],
  },
  {
    table: 'contract_documents',
    isSigned: (r) =>
      r.status === 'signed' || r.status === 'notarized' || r.executed_pdf_file_id != null,
    fileColumns: ['generated_pdf_file_id', 'executed_pdf_file_id'],
  },
  {
    table: 'lien_releases',
    isSigned: (r) =>
      r.status === 'signed' || r.status === 'notarized' || r.notarized_pdf_file_id != null,
    fileColumns: ['generated_pdf_file_id', 'notarized_pdf_file_id'],
  },
];

/**
 * Copy every executed instrument out of the company-scoped set. Runs BEFORE
 * the walk; any failure holds the whole company's job open, because deleting
 * an original whose copy did not land is the one unrecoverable ordering.
 *
 * Idempotent by construction: rows already in `archived_documents` are
 * skipped (so a resume after a partial archive re-copies only the remainder),
 * and the insert is ON CONFLICT DO NOTHING on (source_table, source_id).
 */
export async function archiveSignedDocuments(
  admin: SupabaseClient<Database>,
  companyId: string
): Promise<{ archived: number; failures: string[] }> {
  const failures: string[] = [];
  let archived = 0;

  // Untyped for the dynamic loop — same reasoning as deleteTableChunked.
  const db = admin as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (c: string, v: string) => Promise<{
          data: Array<Record<string, unknown>> | null;
          error: { message: string } | null;
        }>;
      };
    };
  };

  const { data: company, error: coErr } = await admin
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .maybeSingle();
  if (coErr || !company) {
    return { archived, failures: [`company name: ${coErr?.message ?? 'row missing'}`] };
  }
  const companyName = (company as { name: string }).name;

  const { data: already } = await admin
    .from('archived_documents')
    .select('source_table, source_id')
    .eq('company_id', companyId);
  const done = new Set(
    ((already ?? []) as Array<{ source_table: string; source_id: string }>).map(
      (a) => `${a.source_table}:${a.source_id}`
    )
  );

  // Project names, resolved lazily and cached — the archive copy must stay
  // identifiable after `projects` is deleted.
  const projectNames = new Map<string, string | null>();
  async function projectName(projectId: unknown): Promise<string | null> {
    if (typeof projectId !== 'string') return null;
    if (projectNames.has(projectId)) return projectNames.get(projectId) ?? null;
    const { data } = await admin
      .from('projects')
      .select('name')
      .eq('id', projectId)
      .maybeSingle();
    const name = (data as { name: string } | null)?.name ?? null;
    projectNames.set(projectId, name);
    return name;
  }

  for (const source of ARCHIVE_SOURCES) {
    const { data: rows, error } = await db
      .from(source.table)
      .select('*')
      .eq('company_id', companyId);
    if (error) {
      failures.push(`${source.table}: read failed: ${error.message}`);
      continue;
    }

    for (const row of (rows ?? []).filter(source.isSigned)) {
      const sourceId = row.id as string;
      if (done.has(`${source.table}:${sourceId}`)) continue;

      // Re-home the PDFs first: if a copy fails, no archive row is written,
      // so the retry re-attempts the whole instrument.
      const pdfPaths: Array<{ column: string; from: string; to: string }> = [];
      let pdfFailed = false;
      for (const col of source.fileColumns) {
        const fileId = row[col];
        if (typeof fileId !== 'string') continue;
        const { data: file } = await admin
          .from('files')
          .select('file_path')
          .eq('id', fileId)
          .maybeSingle();
        const filePath = (file as { file_path: string } | null)?.file_path;
        if (!filePath) {
          failures.push(`${source.table} ${sourceId}: ${col} names a missing files row`);
          pdfFailed = true;
          continue;
        }
        const { data: blob, error: dlErr } = await admin.storage
          .from('project-files')
          .download(filePath);
        if (dlErr || !blob) {
          failures.push(`${source.table} ${sourceId}: download ${filePath}: ${dlErr?.message ?? 'no body'}`);
          pdfFailed = true;
          continue;
        }
        const dest = `${companyId}/${source.table}/${sourceId}/${col}-${fileId}`;
        const { error: upErr } = await admin.storage
          .from('archives')
          .upload(dest, blob, { upsert: true });
        if (upErr) {
          failures.push(`${source.table} ${sourceId}: upload ${dest}: ${upErr.message}`);
          pdfFailed = true;
          continue;
        }
        pdfPaths.push({ column: col, from: filePath, to: dest });
      }
      if (pdfFailed) continue;

      // The context riders: amounts for a client contract, line items for a CO.
      let amounts: Record<string, unknown> | null = null;
      let document: Record<string, unknown> = row;
      if (source.table === 'client_contracts') {
        const { data: amt } = await admin
          .from('client_contract_amounts')
          .select('*')
          .eq('client_contract_id', sourceId)
          .maybeSingle();
        amounts = (amt as Record<string, unknown> | null) ?? null;
      }
      if (source.table === 'change_orders') {
        const [items, lineRows] = await Promise.all([
          db.from('change_order_line_items').select('*').eq('change_order_id', sourceId),
          db.from('change_order_line_rows').select('*').eq('change_order_id', sourceId),
        ]);
        document = {
          ...row,
          _archived_line_items: items.data ?? [],
          _archived_line_rows: lineRows.data ?? [],
        };
      }

      const { error: insErr } = await (admin as unknown as {
        from: (t: string) => {
          upsert: (
            v: Record<string, unknown>,
            o: { onConflict: string; ignoreDuplicates: boolean }
          ) => Promise<{ error: { message: string } | null }>;
        };
      })
        .from('archived_documents')
        .upsert(
          {
            source_table: source.table,
            source_id: sourceId,
            company_id: companyId,
            company_name: companyName,
            project_name: await projectName(row.project_id),
            document,
            amounts,
            pdf_paths: pdfPaths,
          },
          { onConflict: 'source_table,source_id', ignoreDuplicates: true }
        );
      if (insErr) {
        failures.push(`${source.table} ${sourceId}: archive insert: ${insErr.message}`);
        continue;
      }
      archived += 1;
    }
  }

  return { archived, failures };
}

/**
 * Every company-scoped table the walk deletes, leaf-ish first.
 *
 * The order is a HINT, not a contract: `deleteRows` retries in passes and lets
 * foreign keys decide the real order, so a wrong guess here costs a pass rather
 * than correctness. That matters because this list has to survive schema
 * changes made by people who are not thinking about deletion.
 */
export const COMPANY_TABLES: string[] = [
  'chat_message_mentions', 'chat_message_photos', 'chat_reads', 'chat_messages', 'chat_threads',
  // Lien releases FK invoices/expenses/subcontractor_contracts (NO ACTION),
  // so they go FIRST. Executed ones were archived before this walk began
  // [Q3]; templates carry SET NULL from releases, and every company has 8
  // seeded ones pinning the shell.
  'lien_releases', 'lien_release_template_boxes', 'lien_release_templates',
  'change_order_line_rows', 'change_order_line_items',
  'co_signing_sessions', 'signing_sessions',
  // Signed change orders were archived (with their line items embedded)
  // before the walk [Q3]; the originals now go with everything else.
  'change_orders',
  'client_payment_applications', 'client_refunds', 'client_payments', 'retainage_releases',
  'invoice_cost_claims', 'invoice_hour_claims', 'invoice_lines', 'invoices',
  'expense_payments', 'expense_allocations', 'expenses',
  // purchase_order_item_assignments references purchase_order_items (20261043).
  // purchase_order_edits (20261320000000) FK purchase_orders with NO ACTION and
  // purchase_order_items with SET NULL — it MUST be walked, and before
  // purchase_orders, or the PO delete is blocked and the audit rows orphan [S103].
  'purchase_order_edits',
  'delivery_items', 'deliveries', 'purchase_order_item_assignments', 'purchase_order_items', 'purchase_orders',
  'daily_log_crew', 'daily_log_sub_entries', 'daily_logs',
  'safety_incident_injuries', 'safety_incident_witnesses', 'safety_incidents',
  'punch_list_items', 'punch_lists',
  'task_dependencies', 'tasks', 'phases', 'inspections', 'schedule_entries',
  'time_session_rate_snapshots', 'time_edit_logs', 'time_segments', 'time_clock_sessions',
  // Estimates redesign children (S103): estimate_events (cascades with estimates),
  // estimate_award_bases + estimate_sub_bid_requests (hang off estimates), and
  // scope_library (company-scoped template library). Walked explicitly, before
  // estimates, per the proposal_views precedent.
  'estimate_events', 'estimate_award_bases', 'estimate_sub_bid_requests', 'scope_library',
  'estimate_sub_bids', 'estimate_line_rows', 'estimate_line_items',
  // proposal_views cascades with estimates (20261052); listed anyway so the
  // walk stays explicit about every company-scoped table it owns.
  'proposal_views',
  'estimate_subcategories', 'estimate_categories', 'estimate_files', 'estimates',
  // Selections (20261026+) — added by the Q4 ruling; their absence was §3a of
  // deletion-sweep-analysis.md (selections FK projects/cost_catalog/
  // project_budget_items with NO ACTION, so a company that used them could
  // never finish deleting). Leaf-first: message photos → messages → threads;
  // option amounts → options; amounts/notes/signing sessions → selections;
  // selections → areas (selections.area_id) → projects.
  'selection_message_photos', 'selection_messages', 'selection_threads',
  'selection_option_amounts', 'selection_options',
  'selection_amounts', 'selection_notes', 'selection_signing_sessions',
  'selections', 'selection_areas',
  'project_budget_amounts', 'project_budget_items', 'project_financials',
  'project_contacts', 'project_assignments',
  // Client + sub contracts: archived first [Q3], amounts ride the client
  // parent. contract_documents FK estimates/projects/sub_contracts, its
  // children cascade but are listed; templates go after documents.
  'client_contract_amounts', 'client_contracts',
  'contract_document_attachments', 'contract_signing_sessions', 'contract_documents',
  'contract_template_boxes', 'contract_templates',
  'subcontractor_contracts',
  'subcontractor_financials', 'subcontractor_compliance_documents',
  // file_categories sits between files and projects: files reference it
  // (files_category_fkey) and its per-job rows reference projects (20261039).
  'files', 'file_categories', 'projects',
  // contacts_dedupe_log (20261265000000) — append-only audit of the one-time
  // email dedupe; company-scoped, walked before contacts [S103].
  'contacts_dedupe_log',
  'contact_addresses', 'contacts', 'subcontractors',
  'member_pay_rates', 'member_burden_settings', 'instrument_rates', 'cost_catalog',
  // email_unsubscribes (20261060, Email §3) — a company-scoped consent leaf,
  // company_id FK NO ACTION and nothing references it, so it must be walked or
  // the company could never finish deleting. The consent is meaningless once
  // the company (and its whole reminder audience) is gone.
  'tag_options', 'client_reminder_settings', 'sync_conflicts', 'email_unsubscribes',
  // QuickBooks scaffolding (20260929/20260930) — operational state, not a
  // record anyone must retain [Q4]. Queue rows self-reference with SET NULL;
  // all three otherwise hang off companies only.
  'qb_sync_queue', 'qb_read_budget', 'qb_webhook_events',
  // M-J (20261430000000) adds two more. ⚠️ THE ORDER IS A REAL CONSTRAINT, not
  // tidiness: `expenses.payment_account_id` references company_payment_accounts
  // with NO ACTION, so that table cannot go until `expenses` has (line 342,
  // well above this). `company_members.default_payment_account_id` is
  // ON DELETE SET NULL and members go at 407, after this — either order works
  // there, and this one keeps the QuickBooks tables together.
  //
  // Both are operational state rather than a record anyone must retain [Q4]:
  // qb_account_cache is a copy of the customer's own chart of accounts, and
  // the payment list is configuration that means nothing without the
  // connection it names.
  'company_payment_accounts', 'qb_account_cache',
  // client_access_events cascades with profiles (profile_id NOT NULL,
  // ON DELETE CASCADE) — listed anyway, before profiles, because the walk is
  // explicit about every company-scoped table it owns (the proposal_views
  // precedent) [Q4].
  'client_access_events',
  'push_subscriptions', 'notifications', 'invitations',
  'company_members', 'profiles', 'subscriptions',
];

/**
 * Delete a company's rows, in passes, letting foreign keys decide the order.
 *
 * A table that fails is retried on the next pass. When a whole pass deletes
 * from nothing new, the remainder cannot be resolved by trying again — that is
 * a real FK problem, and it is reported rather than looped on.
 */
export async function deleteRows(
  admin: SupabaseClient<Database>,
  companyId: string,
  alreadyDone: string[]
): Promise<{ done: string[]; failed: Record<string, string> }> {
  const done = [...alreadyDone];
  let remaining = COMPANY_TABLES.filter((t) => !done.includes(t) && !SURVIVES[t]);
  let failed: Record<string, string> = {};

  let progress = true;
  while (remaining.length > 0 && progress) {
    progress = false;
    failed = {};
    const stillRemaining: string[] = [];

    for (const table of remaining) {
      const error = await deleteTableChunked(admin, table, companyId);
      if (error) {
        failed[table] = error;
        stillRemaining.push(table);
      } else {
        done.push(table);
        progress = true;
      }
    }
    remaining = stillRemaining;
  }

  return { done, failed };
}

/** Rows deleted per statement. Small enough that no single DELETE can hit the
 *  statement timeout on a big tenant; the ceiling is per-chunk, so total
 *  table size stops mattering. */
export const DELETE_CHUNK = 2000;

/**
 * Delete one table's rows in bounded chunks — id-batch selects, then
 * `DELETE … IN (ids)` — instead of one `DELETE WHERE company_id` statement.
 *
 * ⚠️ THE s138 TIMEOUT CLASS IS THE REASON [analysis §5]. "canceling statement
 * due to statement timeout" was observed in the shared purge and never
 * root-caused; a 90-day cancellation tenant is bigger than anything this job
 * has run against. A table that is always too big for one statement would
 * fail all three attempts and stop the sweep permanently — chunking removes
 * the ceiling rather than betting on it.
 *
 * FK semantics are unchanged: a chunk holding a still-referenced row fails
 * whole, the table reports the error, and the pass loop retries it after its
 * children go — same as the one-statement shape, at chunk granularity.
 * Returns null on success, the error message otherwise.
 */
async function deleteTableChunked(
  admin: SupabaseClient<Database>,
  table: string,
  companyId: string
): Promise<string | null> {
  // ⚠️ UNTYPED CLIENT FOR THE DYNAMIC LOOP, deliberately. A table name that
  // varies at runtime makes the generated `Database` generic resolve every
  // table's row type at once — TS2589 / "not assignable to never" — and the
  // cast that silences it would be a lie about which tables exist. What this
  // function asserts is a deletion outcome, not a column shape. Same reasoning
  // and same shape as `s131-roster-floor.live.ts`'s `count()` helper.
  const db = admin as unknown as {
    from: (t: string) => {
      delete: () => {
        in: (c: string, v: string[]) => Promise<{ error: { message: string } | null }>;
      };
      select: (c: string) => {
        eq: (
          c: string,
          v: string
        ) => {
          limit: (n: number) => Promise<{
            data: Array<{ id: string }> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };

  for (;;) {
    const { data, error: selErr } = await db
      .from(table)
      .select('id')
      .eq('company_id', companyId)
      .limit(DELETE_CHUNK);
    if (selErr) return `select ids: ${selErr.message}`;
    const ids = (data ?? []).map((r) => r.id);
    // The loop ends on a CONFIRMED-empty select, not on a short chunk — rows
    // can appear between statements.
    if (ids.length === 0) return null;

    const { error: delErr } = await db.from(table).delete().in('id', ids);
    if (delErr) return delErr.message;
  }
}

/** Null the tenant linkage on rows that survive but must not stay attached. */
export async function detachSurvivors(
  admin: SupabaseClient<Database>,
  companyId: string
): Promise<void> {
  // ai_tag_logs: keep the spend, drop the tenant [Josh, S137 Q1]. The same
  // instinct as its file_id FK, which is ON DELETE SET NULL precisely so cost
  // data survives the thing it describes.
  await admin
    .from('ai_tag_logs')
    .update({ company_id: null as unknown as string })
    .eq('company_id', companyId);
}

/**
 * Remove every storage object under the company prefix, in all three buckets.
 *
 * ⚠️ FAILURES ARE RETURNED, NEVER SWALLOWED [§4 of the analysis, ruled]. The
 * previous shape ignored a failed remove() and read a failed list() as an
 * empty folder — then the caller stamped `storage_done: true` over surviving
 * customer photos, making the policy sentence false in a way nothing
 * surfaced. A failure here now holds the job open for a retry, exactly like
 * a failed table delete.
 */
export async function deleteStorage(
  admin: SupabaseClient<Database>,
  companyId: string
): Promise<{ removed: number; failures: string[] }> {
  let removed = 0;
  const failures: string[] = [];
  for (const bucket of ['project-files', 'company-logos', 'exports']) {
    // Recursive walk: list() is one level at a time.
    const stack = [companyId];
    const paths: string[] = [];
    while (stack.length) {
      const prefix = stack.pop()!;
      const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
      if (error) {
        // An unlistable folder is NOT an empty folder.
        failures.push(`${bucket}/${prefix}: list failed: ${error.message}`);
        continue;
      }
      for (const entry of data ?? []) {
        const full = `${prefix}/${entry.name}`;
        // A folder has no id in Supabase's listing; a file does.
        if ((entry as { id: string | null }).id === null) stack.push(full);
        else paths.push(full);
      }
    }
    for (let i = 0; i < paths.length; i += 100) {
      const slice = paths.slice(i, i + 100);
      const { error } = await admin.storage.from(bucket).remove(slice);
      if (error) failures.push(`${bucket}: remove ${slice.length} failed: ${error.message}`);
      else removed += slice.length;
    }
  }
  return { removed, failures };
}

/** Delete the auth users of a company. Ruled: they go [Josh, S137].
 *  Failures returned, same reasoning as deleteStorage. */
export async function deleteAuthUsers(
  admin: SupabaseClient<Database>,
  userIds: string[]
): Promise<{ deleted: number; failures: string[] }> {
  let deleted = 0;
  const failures: string[] = [];
  for (const id of userIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (!error) deleted += 1;
    else failures.push(`auth ${id}: ${error.message}`);
  }
  return { deleted, failures };
}

/**
 * ⚠️ A `stopped` JOB ALARMS [Q6 ruling]. "A terminal state nobody reads is
 * not a terminal state" — every transition to `stopped` emails the platform
 * admins. Internal ops mail: no email_logs row (that table is the CUSTOMER
 * audit), no tenant branding, and a failure to alert must never fail the
 * sweep — it is recorded and swallowed, because the job row still holds the
 * truth and the alert is the messenger, not the record.
 */
export async function alertDeletionStopped(
  admin: SupabaseClient<Database>,
  companyId: string,
  detail: string
): Promise<void> {
  try {
    const { data } = await admin
      .from('platform_admins')
      .select('email')
      .order('created_at', { ascending: true });
    const emails = ((data ?? []) as Array<{ email: string }>).map((a) => a.email);
    for (const to of emails) {
      const { error } = await sendEmail({
        from: `${brand.name} <notices@${SENDING_DOMAIN}>`,
        to,
        subject: `⚠️ Deletion job STOPPED — company ${companyId}`,
        react: createElement(NotificationEmail, {
          brandColor: brand.themeColor,
          heading: 'A deletion job stopped and needs a human',
          message:
            `Company: ${companyId}\n` +
            `${detail}\n\n` +
            `The job is in deletion_jobs with state 'stopped' and will not be retried ` +
            `automatically. A half-deleted company needs a human, not another attempt.`,
          estimateUrl:
            (process.env.NEXT_PUBLIC_APP_URL || 'https://frame-focus-eight.vercel.app') +
            '/admin',
          ctaLabel: 'Open admin',
        }),
      });
      if (error) console.error(`deletion alert to ${to} failed: ${error}`);
    }
  } catch (err) {
    console.error('deletion alert failed entirely:', err);
  }
}

/**
 * The DRY RUN [Q8]: exactly the sweep's due-selection, zero writes. The ruled
 * chain requires the first real run's scope to be reviewed BY HAND before the
 * cron entry lands — this is what gets reviewed. Sharing the selection with
 * `runTrialDeletion()` (same filters, same postpone rule) is the point: a
 * separate query would be a second copy of "who is due", divergent exactly
 * when it matters.
 */
export interface DueForDeletion {
  companyId: string;
  companyName: string | null;
  reason: string;
  lockedAt: string | null;
  deleteAfter: string;
  /** Whole days PAST delete_after — how long this has been due. */
  daysPastDue: number;
  /** The retention-warning stamps [Q8 review]: a due company with BOTH null
   *  lapsed before the warnings existed and would be deleted having received
   *  no notice — the exact outcome the chain exists to prevent. */
  warned1At: string | null;
  warned2At: string | null;
  postponed: boolean;
}

export async function listDueForDeletion(
  admin: SupabaseClient<Database>,
  now: Date
): Promise<DueForDeletion[]> {
  const { data, error } = await admin
    .from('trial_lifecycle')
    .select(
      'company_id, locked_at, delete_after, postponed_until, reason, retention_warned_1_at, retention_warned_2_at'
    )
    .is('deleted_at', null)
    .not('delete_after', 'is', null)
    .lte('delete_after', now.toISOString());
  if (error) throw new Error(`dry run read: ${error.message}`);

  const out: DueForDeletion[] = [];
  for (const row of (data ?? []) as Array<{
    company_id: string;
    locked_at: string | null;
    delete_after: string;
    postponed_until: string | null;
    reason: string;
    retention_warned_1_at: string | null;
    retention_warned_2_at: string | null;
  }>) {
    const { data: co } = await admin
      .from('companies')
      .select('name')
      .eq('id', row.company_id)
      .maybeSingle();
    out.push({
      companyId: row.company_id,
      companyName: (co as { name: string } | null)?.name ?? null,
      reason: row.reason,
      lockedAt: row.locked_at,
      deleteAfter: row.delete_after,
      daysPastDue: Math.floor(
        (now.getTime() - new Date(row.delete_after).getTime()) / 86_400_000
      ),
      warned1At: row.retention_warned_1_at,
      warned2At: row.retention_warned_2_at,
      postponed: isPostponed(row, now),
    });
  }
  return out;
}

/**
 * The job. Selects companies past `delete_after` and works them to completion.
 *
 * Called daily at 15:00 by `/api/cron/trial-deletion` since 2026-08-30
 * (superseded: "⚠️ NOTHING CALLS THIS ON A SCHEDULE"). See the header.
 */
export async function runTrialDeletion(
  admin: SupabaseClient<Database>,
  now: Date
): Promise<DeletionOutcome> {
  const outcome: DeletionOutcome = {
    processed: 0,
    completed: 0,
    stopped: 0,
    postponed: 0,
    companyRowsRemaining: 0,
  };

  const { data: due, error } = await admin
    .from('trial_lifecycle')
    .select('company_id, delete_after, postponed_until')
    .is('deleted_at', null)
    .not('delete_after', 'is', null)
    .lte('delete_after', now.toISOString());
  if (error) throw new Error(`trial_lifecycle due: ${error.message}`);

  for (const row of (due ?? []) as Array<{ company_id: string; postponed_until: string | null }>) {
    if (isPostponed(row, now)) {
      outcome.postponed += 1;
      continue;
    }
    outcome.processed += 1;

    // Resume an existing job or start one. `attempts` is incremented up front:
    // a job that crashes mid-run still counts its attempt, so a crash loop
    // reaches MAX_ATTEMPTS and stops instead of running forever.
    const { data: existing } = await admin
      .from('deletion_jobs')
      .select('id, tables_done, attempts, state')
      .eq('company_id', row.company_id)
      .not('state', 'eq', 'complete')
      .maybeSingle();

    const job = existing as
      | { id: string; tables_done: string[]; attempts: number; state: string }
      | null;

    if (job && job.state === 'stopped') continue; // needs a human

    let jobId: string;
    let tablesDone: string[] = [];
    let attempts = 0;

    if (job) {
      jobId = job.id;
      tablesDone = job.tables_done ?? [];
      attempts = job.attempts + 1;
      await admin
        .from('deletion_jobs')
        .update({ state: 'running', attempts, started_at: now.toISOString() })
        .eq('id', jobId);
    } else {
      const { data: created, error: cErr } = await admin
        .from('deletion_jobs')
        .insert({
          company_id: row.company_id,
          state: 'running',
          attempts: 1,
          started_at: now.toISOString(),
        })
        .select('id')
        .single();
      if (cErr || !created) continue;
      jobId = (created as { id: string }).id;
      attempts = 1;
    }

    // The auth user ids must be read BEFORE profiles are deleted — afterwards
    // there is nothing left to join them from.
    const { data: profiles } = await admin
      .from('profiles')
      .select('user_id')
      .eq('company_id', row.company_id);
    const userIds = ((profiles ?? []) as Array<{ user_id: string | null }>)
      .map((p) => p.user_id)
      .filter((v): v is string => Boolean(v));

    await detachSurvivors(admin, row.company_id);

    // ⚠️ THE ARCHIVE GATES THE WALK [Q3]. An original whose copy did not land
    // must not be deleted — a failure here holds the WHOLE company open for
    // the next run (or stops with an alarm at MAX_ATTEMPTS), before a single
    // row goes.
    const archive = await archiveSignedDocuments(admin, row.company_id);
    if (archive.failures.length > 0) {
      const stop = attempts >= MAX_ATTEMPTS;
      await admin
        .from('deletion_jobs')
        .update({
          state: stop ? 'stopped' : 'pending',
          tables_done: tablesDone,
          last_error: JSON.stringify({ archive: archive.failures }).slice(0, 2000),
        })
        .eq('id', jobId);
      if (stop) {
        outcome.stopped += 1;
        await alertDeletionStopped(
          admin,
          row.company_id,
          `Signed-document archive failed after ${attempts} attempts: ` +
            `${archive.failures.length} failures. Nothing was deleted for this company.`
        );
      }
      continue;
    }

    const { done, failed } = await deleteRows(admin, row.company_id, tablesDone);

    if (Object.keys(failed).length > 0) {
      const stop = attempts >= MAX_ATTEMPTS;
      await admin
        .from('deletion_jobs')
        .update({
          state: stop ? 'stopped' : 'pending',
          tables_done: done,
          last_error: JSON.stringify(failed).slice(0, 2000),
        })
        .eq('id', jobId);
      if (stop) {
        outcome.stopped += 1;
        await alertDeletionStopped(
          admin,
          row.company_id,
          `Tables failed after ${attempts} attempts: ${JSON.stringify(failed).slice(0, 800)}`
        );
      }
      continue;
    }

    // Storage and auth failures hold the job open EXACTLY like table
    // failures [§4 fix, ruled]: recorded, retried next run, stopped-with-
    // alarm at MAX_ATTEMPTS. The *_done stamps are written only over clean
    // phases — never over survivors.
    const storage = await deleteStorage(admin, row.company_id);
    const auth = await deleteAuthUsers(admin, userIds);
    if (storage.failures.length > 0 || auth.failures.length > 0) {
      const stop = attempts >= MAX_ATTEMPTS;
      await admin
        .from('deletion_jobs')
        .update({
          state: stop ? 'stopped' : 'pending',
          tables_done: done,
          storage_done: storage.failures.length === 0,
          auth_done: auth.failures.length === 0,
          last_error: JSON.stringify({ storage: storage.failures, auth: auth.failures }).slice(
            0,
            2000
          ),
        })
        .eq('id', jobId);
      if (stop) {
        outcome.stopped += 1;
        await alertDeletionStopped(
          admin,
          row.company_id,
          `Storage/auth cleanup failed after ${attempts} attempts. ` +
            `Storage: ${storage.failures.length} failures; auth: ${auth.failures.length}.`
        );
      }
      continue;
    }

    // ========================================================================
    // ⚠️ THE COMPANY ROW USUALLY SURVIVES, AND THIS USED TO REPORT SUCCESS
    // ANYWAY. FOUND BY RUNNING THE JOB [S138] — see TECH_DEBT #3-trial.
    // ========================================================================
    // The first real execution of this function (s138-trial-deletion-run.live.ts)
    // destroyed every tenant row, the storage objects and the auth users, then
    // left `companies` standing and returned `completed: 1`.
    //
    // The cause is structural, not a typo. FIVE tables on the SURVIVES list
    // hold a plain `REFERENCES companies(id)` with NO on-delete action, so the
    // parent delete is RESTRICTed by the very rows the ruling says must
    // outlive the tenant:
    //
    //     email_logs · trial_lifecycle · trial_warning_acknowledgements
    //     deletion_jobs · export_jobs
    //
    // `trial_lifecycle` cannot even be nulled out of the way — `company_id` is
    // its primary key, and it is where `deleted_at` is recorded.
    //
    // Whether "deleted" should mean "the company shell survives with its NAME
    // on it" is a RULING, not a code fix, and it sits directly under TL-24.
    // Until that is answered this function's job is to be HONEST: it reports
    // what actually happened and stops the job for a human rather than
    // claiming a completion it did not achieve.
    const { error: companyError } = await admin
      .from('companies')
      .delete()
      .eq('id', row.company_id);

    // The tenant's data really is gone by this point, so the stamp is accurate
    // even when the shell remains — it is what takes the company out of the
    // due-for-deletion walk on the next run.
    await admin
      .from('trial_lifecycle')
      .update({ deleted_at: now.toISOString() })
      .eq('company_id', row.company_id);

    if (companyError) {
      await admin
        .from('deletion_jobs')
        .update({
          state: 'stopped',
          tables_done: done,
          storage_done: true,
          auth_done: true,
          last_error: `tenant data deleted, but the companies row remains: ${companyError.message}`.slice(
            0,
            2000
          ),
          finished_at: now.toISOString(),
        })
        .eq('id', jobId);
      outcome.stopped += 1;
      outcome.companyRowsRemaining += 1;
      await alertDeletionStopped(
        admin,
        row.company_id,
        `Tenant data deleted, but the companies row remains: ${companyError.message}`
      );
      continue;
    }

    await admin
      .from('deletion_jobs')
      .update({
        state: 'complete',
        tables_done: done,
        storage_done: true,
        auth_done: true,
        finished_at: now.toISOString(),
      })
      .eq('id', jobId);

    outcome.completed += 1;
  }

  return outcome;
}
