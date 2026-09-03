import { createClient } from '@/lib/supabase-browser';
import { applied, DISCARDED } from '@/lib/services/mutation-result';

/**
 * The id of an ACTIVE contact with this email in the caller's company, or null.
 * Case-insensitive (matches `contacts_company_email_unique`); RLS scopes the
 * read to the caller's company, so no company_id is passed. The JS re-check
 * makes the match exact regardless of ilike wildcard handling.
 */
async function findActiveContactIdByEmail(
  supabase: ReturnType<typeof createClient>,
  email: string
): Promise<string | null> {
  const trimmed = email.trim();
  if (!trimmed) return null;
  const escaped = trimmed.replace(/([\\%_])/g, '\\$1');
  const { data } = await supabase
    .from('contacts')
    .select('id, email')
    .eq('is_deleted', false)
    .ilike('email', escaped)
    .limit(5);
  const match = (data ?? []).find(
    (r) => (r.email ?? '').trim().toLowerCase() === trimmed.toLowerCase()
  );
  return (match?.id as string | undefined) ?? null;
}

export async function createContact(
  contact: Record<string, unknown>
): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = createClient();

  // §1d — REUSE an existing (company_id, lower(email)) contact rather than mint a
  // duplicate. Every create path funnels through here, and the portal-invite /
  // inline "add a contact" flows minted a fresh row each run (the Karen Foster
  // triple). Since `contacts_company_email_unique` landed, a blind insert would
  // 23505 anyway; this turns that into a reuse. NULL/blank email is exempt from
  // the constraint, so those always insert.
  const email = typeof contact.email === 'string' ? contact.email.trim() : null;
  if (email) {
    const existingId = await findActiveContactIdByEmail(supabase, email);
    if (existingId) return { success: true, id: existingId };
  }

  // Postgres defaults fill in company_id, created_by, updated_by.
  const { data, error } = await supabase.from('contacts').insert(contact).select('id').single();

  if (error) {
    // Race backstop: the unique index fired between the check and the insert —
    // resolve to the row that won rather than surfacing a raw 23505.
    if (error.code === '23505' && email) {
      const existingId = await findActiveContactIdByEmail(supabase, email);
      if (existingId) return { success: true, id: existingId };
    }
    return { success: false, error: error.message };
  }
  return { success: true, id: data.id };
}

export async function updateContact(
  id: string,
  updates: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  // BEFORE UPDATE trigger `contacts_set_updated_by` handles updated_by.
  // updated_at is handled by the existing updated_at trigger.
  const { data, error } = await supabase
    .from('contacts')
    .update(updates)
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  // M2-03 [S154]. `contacts_update_authorized` admits owner/admin/PM only, so
  // foreman, crew, subcontractor and client all match ZERO rows — which is not
  // an error, and used to be reported as success.
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

export async function deleteContact(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  // BEFORE UPDATE trigger handles updated_by.
  const { data, error } = await supabase
    .from('contacts')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  // M2-03 [S154], and this was the perverse one: before the guard, a crew
  // member was told the contact was deleted (zero rows, no error) while an
  // Owner got a raw Postgres string, because M2-02 made the Owner's write the
  // only one that reached the WITH CHECK. Both halves are fixed now — the
  // Owner's succeeds, and everyone else is told the truth.
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}


/**
 * Put a soft-deleted contact back. [S158 · Finding 2]
 *
 * The exact inverse of `deleteContact()` — `is_deleted = false` and
 * `deleted_at = null` together, because a row with `is_deleted = false` and a
 * stale `deleted_at` would tell the trash view's "Deleted" column a date for a
 * record that is not deleted.
 *
 * ⚠️ This is possible ONLY because `contacts_select_authenticated` no longer
 * filters `is_deleted` (`20261005000000`). PostgREST's UPDATE returns rows, so
 * the row must satisfy the SELECT policy on the way in as well as on the way
 * out; the filter that used to be in that policy made both directions
 * impossible. `s154-m2-fixes.live.ts` A2 is the regression guard on the policy,
 * and the S158 harness is the guard on this function.
 *
 * `.select('id')` + `applied()` per `mutation-result.ts`: an UPDATE the policy
 * refuses affects zero rows and raises NO error, so a restore attempted by
 * foreman, crew or anyone else outside `contacts_update_authorized` would
 * otherwise report success over a row still sitting in the trash.
 */
export async function restoreContact(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  // BEFORE UPDATE trigger handles updated_by.
  const { data, error } = await supabase
    .from('contacts')
    .update({ is_deleted: false, deleted_at: null })
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}


// ── Picker options (4D estimate builder) ──

export interface ContactOption {
  id: string;
  first_name: string;
  last_name: string;
  company_name: string | null;
  email: string | null;
}

export async function listContactOptions(): Promise<{
  options: ContactOption[];
  error: string | null;
}> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, company_name, email')
    .eq('is_deleted', false)
    .order('last_name', { ascending: true });

  // M2-07 [S154]. Was `if (error) return []`, which renders a failure as "this
  // company has no contacts" — indistinguishable from the truth. This picker
  // feeds `contact_address_id` into proposals and lien releases, so a silent
  // empty list is how a document ends up with no job-site address.
  if (error) {
    console.error('listContactOptions: contacts query failed', error);
    return { options: [], error: error.message };
  }
  return { options: data ?? [], error: null };
}

/**
 * Email for one contact — feeds the proposal send modal on the
 * estimate builder (S173 Job 1). Null means "no email on the contact
 * record" (or the read failed); the modal disables Send and says so.
 */
export async function getContactEmail(contactId: string): Promise<string | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('contacts')
    .select('email')
    .eq('id', contactId)
    .single();

  if (error) {
    console.error('getContactEmail: contact query failed', error);
    return null;
  }
  return data?.email ?? null;
}
