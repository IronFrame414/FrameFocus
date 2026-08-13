import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * ONE company purge, shared by the vitest live harnesses (`test/`) and the
 * Playwright fixtures (`e2e/`).
 *
 * ============================================================================
 * ⚠️ WHY THIS IS ONE MODULE AND NOT A COPY IN EACH TREE
 * ============================================================================
 * `#1-s147` fixed this for `e2e/trial-fixture.ts` and `#4-s146` fixed it for
 * `s97ct-reply-to.live.ts` — two implementations of the same idea, which is
 * exactly the divergence CLAUDE.md's parity ruling names: "a second
 * implementation that does the same thing is the divergence, written in a form
 * that looks like agreement." The child list below is the thing that goes
 * stale, and it must go stale in ONE place.
 *
 * ============================================================================
 * ⚠️ THE MECHANISM THIS EXISTS TO CLOSE — SIX HARNESSES, THREE SESSIONS
 * ============================================================================
 * 7F's seed trigger (`20260922000000`) creates 8 `lien_release_templates` on
 * EVERY company insert, and `lien_release_templates_company_id_fkey` is
 * `NO ACTION`. Every teardown written before that migration deletes the company
 * and gets:
 *
 *   23503: update or delete on table "companies" violates foreign key
 *   constraint "lien_release_templates_company_id_fkey"
 *
 * …which none of them read, because they all called `.delete()` without
 * destructuring `error`. The company survived, the auth user did not, and the
 * orphan became unreachable by any id or email the harness still held.
 *
 * Measured on rebuild-test at S147: **109 orphan companies out of 111**, and a
 * single full live-suite run re-created **12**. Only `desktop-trial-screens`
 * ever went red, because it was the only harness asserting a company count —
 * the one that was failing was the only one telling us.
 *
 * A CLEANUP THAT CANNOT FAIL ITS OWN RUN IS NOT A CLEANUP.
 */

/**
 * Children of `companies` that must be deleted first, IN THIS ORDER.
 *
 * ⚠️ THIS LIST IS NOT EXHAUSTIVE OVER THE SCHEMA, AND DOES NOT NEED TO BE.
 * 87 tables reference `companies` with `NO ACTION`; these are the ones the
 * harnesses actually populate, measured rather than guessed. A harness that
 * starts leaving rows in a table not listed here does NOT silently leak — the
 * error check in `deleteCompanies()` raises the constraint name, which names
 * the table to add. That is the whole design: fail loudly, extend the list.
 *
 * `profiles`, `tag_options` and `ai_tag_logs` cascade; `trial_emails` is
 * SET NULL. They need no entry, and `profiles` is kept only because a harness
 * may want its rows gone before the parent for its own assertions.
 */
export const COMPANY_CHILDREN = [
  'lien_release_template_boxes',
  'lien_release_templates',
  'deletion_jobs',
  'export_jobs',
  'trial_warning_acknowledgements',
  'trial_lifecycle',
  'email_logs',
  'tag_options',
  'subscriptions',
  'company_members',
  'profiles',
] as const;

/**
 * Delete these companies and everything pinning them — and THROW if the parent
 * survives.
 *
 * ⚠️ THE ERROR CHECK ON THE PARENT DELETE IS THE POINT. Without it a blocked
 * delete is silent and the next thing to fail is something else entirely,
 * several sessions later.
 */
export async function deleteCompanies(admin: SupabaseClient, ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  for (const table of COMPANY_CHILDREN) {
    const { error } = await admin.from(table).delete().in('company_id', ids);
    if (error) throw new Error(`purge ${table}: ${error.message}`);
  }
  await admin.from('trial_emails').update({ company_id: null }).in('company_id', ids);

  const { error } = await admin.from('companies').delete().in('id', ids);
  if (error) throw new Error(`purge companies: ${error.message}`);
}

/**
 * Purge every company whose name starts with one of `prefixes`, and return how
 * many were removed.
 *
 * ⚠️ KEYED ON THE NAME, NOT ON IDS CAPTURED THIS RUN — the property that makes
 * it self-healing. A run that DIED before capturing its ids cannot clean up by
 * id, and a run whose auth user was deleted while the company survived cannot
 * clean up by email either. The name is the only handle that outlives both.
 *
 * ⚠️ MATCHED CASE-INSENSITIVELY. `s136-company-slug` names companies both
 * `S136 Idem …` and `s136-walk-…`, and a case-sensitive `like` silently misses
 * half of them — which is the same class of bug as the leak itself.
 *
 * Call from BOTH ends: `beforeAll` so a crashed run cannot poison the next, and
 * `afterAll` so this run leaves nothing.
 */
export async function purgeCompaniesNamed(
  admin: SupabaseClient,
  prefixes: readonly string[]
): Promise<number> {
  const ids: string[] = [];
  for (const prefix of prefixes) {
    const { data, error } = await admin.from('companies').select('id').ilike('name', `${prefix}%`);
    if (error) throw new Error(`purgeCompaniesNamed(${prefix}): ${error.message}`);
    for (const row of data ?? []) {
      const id = (row as { id: string }).id;
      if (!ids.includes(id)) ids.push(id);
    }
  }
  await deleteCompanies(admin, ids);
  return ids.length;
}
