import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { isPostponed } from '@/lib/trial/lifecycle';

/**
 * S137 — the deletion job.
 *
 * ==========================================================================
 * ⚠️ THIS IS BUILT AND DELIBERATELY NOT SCHEDULED.
 * ==========================================================================
 * TL-24 — whether these records may be deleted on this timetable AT ALL — is
 * UNANSWERED and with legal review. It can invalidate the expiry ruling
 * entirely. Josh ruled: build everything, leave the cron entry out of
 * `apps/web/vercel.json`. **The absence of that entry is not an oversight.**
 * See `app/api/cron/trial-deletion/route.ts` and the spec.
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
  // ⚠️ SIGNED DOCUMENTS — SEE THE BLOCK BELOW. Excluded WHOLESALE for now,
  // which keeps more than the ruling asks rather than less.
  client_contracts: 'signed copies must survive — mechanism unruled, see below',
  change_orders: 'signed copies must survive — mechanism unruled, see below',
  subcontractor_contracts: 'signed copies must survive — mechanism unruled, see below',
};

/**
 * ⚠️ UNRESOLVED, AND EXCLUDED WHOLESALE UNTIL IT IS — the signed-document
 * problem.
 *
 * The ruling is that **signed** client contracts, change orders and
 * subcontractor contracts survive deletion. The unsigned ones do not. That
 * cannot be expressed as a row filter alone, because every one of those tables
 * carries `project_id` REFERENCES `projects`, and the project IS deleted. A
 * surviving signed contract would hold a foreign key to a row that no longer
 * exists, so the delete of `projects` fails — or, if the FK were relaxed, the
 * surviving document would point at nothing and lose the context that makes it
 * a record of anything.
 *
 * Two reasonable answers, and nothing in the ruling picks one:
 *   (a) detach — null the project/company linkage on signed rows and keep them
 *       in place, accepting that a surviving contract is thereafter an orphan;
 *   (b) archive — copy signed documents (and enough context to identify them)
 *       into a table outside the company-scoped set before the walk, then
 *       delete the originals with everything else.
 *
 * Until that is ruled, all three tables are excluded ENTIRELY: the signed rows
 * survive as required, and the unsigned ones survive too. That keeps more than
 * asked, which is the safe direction to be wrong in while TL-24 is open.
 * Raised in TECH_DEBT as part of the S137 entry.
 */

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
  'change_order_line_rows', 'change_order_line_items',
  'co_signing_sessions', 'signing_sessions',
  'client_payment_applications', 'client_refunds', 'client_payments', 'retainage_releases',
  'invoice_cost_claims', 'invoice_hour_claims', 'invoice_lines', 'invoices',
  'expense_payments', 'expense_allocations', 'expenses',
  'delivery_items', 'deliveries', 'purchase_order_items', 'purchase_orders',
  'daily_log_crew', 'daily_log_sub_entries', 'daily_logs',
  'safety_incident_injuries', 'safety_incident_witnesses', 'safety_incidents',
  'punch_list_items', 'punch_lists',
  'task_dependencies', 'tasks', 'phases', 'inspections', 'schedule_entries',
  'time_session_rate_snapshots', 'time_edit_logs', 'time_segments', 'time_clock_sessions',
  'estimate_sub_bids', 'estimate_line_rows', 'estimate_line_items',
  'estimate_subcategories', 'estimate_categories', 'estimate_files', 'estimates',
  'project_budget_amounts', 'project_budget_items', 'project_financials',
  'project_contacts', 'project_assignments',
  'subcontractor_financials', 'subcontractor_compliance_documents',
  // file_categories sits between files and projects: files reference it
  // (files_category_fkey) and its per-job rows reference projects (20261039).
  'files', 'file_categories', 'projects',
  'contact_addresses', 'contacts', 'subcontractors',
  'member_pay_rates', 'member_burden_settings', 'instrument_rates', 'cost_catalog',
  'tag_options', 'client_reminder_settings', 'sync_conflicts',
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
  // ⚠️ UNTYPED CLIENT FOR THE DYNAMIC LOOP, deliberately. A table name that
  // varies at runtime makes the generated `Database` generic resolve every
  // table's row type at once — TS2589 / "not assignable to never" — and the
  // cast that silences it would be a lie about which tables exist. What this
  // function asserts is a deletion outcome, not a column shape. Same reasoning
  // and same shape as `s131-roster-floor.live.ts`'s `count()` helper.
  const db = admin as unknown as {
    from: (t: string) => {
      delete: () => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> };
    };
  };

  const done = [...alreadyDone];
  let remaining = COMPANY_TABLES.filter((t) => !done.includes(t) && !SURVIVES[t]);
  let failed: Record<string, string> = {};

  let progress = true;
  while (remaining.length > 0 && progress) {
    progress = false;
    failed = {};
    const stillRemaining: string[] = [];

    for (const table of remaining) {
      const { error } = await db.from(table).delete().eq('company_id', companyId);
      if (error) {
        failed[table] = error.message;
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

/** Remove every storage object under the company prefix, in all three buckets. */
export async function deleteStorage(
  admin: SupabaseClient<Database>,
  companyId: string
): Promise<number> {
  let removed = 0;
  for (const bucket of ['project-files', 'company-logos', 'exports']) {
    // Recursive walk: list() is one level at a time.
    const stack = [companyId];
    const paths: string[] = [];
    while (stack.length) {
      const prefix = stack.pop()!;
      const { data } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
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
      if (!error) removed += slice.length;
    }
  }
  return removed;
}

/** Delete the auth users of a company. Ruled: they go [Josh, S137]. */
export async function deleteAuthUsers(
  admin: SupabaseClient<Database>,
  userIds: string[]
): Promise<number> {
  let deleted = 0;
  for (const id of userIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (!error) deleted += 1;
  }
  return deleted;
}

/**
 * The job. Selects companies past `delete_after` and works them to completion.
 *
 * ⚠️ NOTHING CALLS THIS ON A SCHEDULE. See the header.
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
      if (stop) outcome.stopped += 1;
      continue;
    }

    const storageRemoved = await deleteStorage(admin, row.company_id);
    void storageRemoved;
    const authDeleted = await deleteAuthUsers(admin, userIds);
    void authDeleted;

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
