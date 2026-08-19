import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';

import type { ContactType } from '@framefocus/shared/constants';
export type { ContactType };

type ContactRow = Database['public']['Tables']['contacts']['Row'];

// contact_type widened in Module 5 (5A §7a) — see CONTACT_TYPES in
// @framefocus/shared/constants/form-options.
export type Contact = Omit<ContactRow, 'contact_type' | 'status'> & {
  contact_type: ContactType;
  status: 'active' | 'inactive' | 'archived';
};

export async function getContacts(filters?: {
  contact_type?: string;
  status?: string;
}): Promise<Contact[]> {
  const supabase = await createClient();

  let query = supabase
    .from('contacts')
    .select('*')
    .eq('is_deleted', false)
    .order('last_name', { ascending: true });

  if (filters?.contact_type) {
    query = query.eq('contact_type', filters.contact_type);
  }
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;
  // M2-07 [S154]. The array return is KEPT here, unlike the two pickers: this
  // has four server-component callers and the repo has no `error.tsx`
  // boundaries yet (TECH_DEBT #2), so throwing would render a raw Next error
  // page. What is fixed is the SILENCE — CLAUDE.md requires the real cause be
  // logged server-side with the failing check even when the client message is
  // generic. Surface it in the UI when #2 lands.
  if (error) {
    console.error('getContacts: contacts query failed', { filters, error });
    return [];
  }
  return data ?? [];
}

/**
 * The trash view's list: ONLY soft-deleted contacts. [S158 · Finding 2]
 *
 * The third function of CLAUDE.md's trash-bin pattern, which `files.ts` has had
 * since Module 3 and this file has not: *"a separate `getTrash()` (or
 * `listDeleted()`) function filters `is_deleted = true` to power the trash
 * UI."* Without it a soft delete was indistinguishable from a hard one from the
 * user's side — the row vanished and nothing in the product listed it.
 *
 * ⚠️ NOT A `status` FILTER, AND THE TWO MUST NOT BE CONFLATED. `contacts.status`
 * is Active / Inactive / Archived — where a contact stands with the company —
 * and the list's status dropdown, "All Statuses" included, walks only that
 * column. `is_deleted` is whether the record exists at all. A contact that is
 * archived is still in the list; a contact that is deleted is only here.
 *
 * BOUNDED, and ordered by the column it is bounded on. An unbounded `select('*')`
 * is the M1-03 / M2-06 / M3-05 shape, and `.limit()` with no `ORDER BY` is the
 * other half of the same trap — the rows that survive the cap would otherwise be
 * whatever the planner happened to return.
 */
export const DEFAULT_TRASH_PAGE_SIZE = 200;

export async function getDeletedContacts(limit = DEFAULT_TRASH_PAGE_SIZE): Promise<Contact[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('is_deleted', true)
    .order('deleted_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  // Same reasoning as getContacts(): the array return stays until TECH_DEBT #2
  // gives this route an error boundary, but the SILENCE does not — an empty
  // trash and a failed query must not read alike in the log.
  if (error) {
    console.error('getDeletedContacts: contacts trash query failed', error);
    return [];
  }
  return data ?? [];
}

/**
 * A single contact BY ID, soft-deleted or not.
 *
 * ⚠️ DELIBERATELY DOES NOT FILTER `is_deleted` [M2-02, S154]. CLAUDE.md's
 * trash-bin pattern is explicit that a by-id fetch must return deleted rows:
 * *"`get{Entity}(id)` … does **not** filter `is_deleted`. It must return
 * soft-deleted rows so a restore flow can fetch a deleted record by id."*
 *
 * The filter that used to be here made restore impossible even once the RLS
 * half was fixed — the row was readable by the database and hidden by the
 * service instead. `getContacts()` is where list filtering belongs and it does
 * filter. Reference implementation for all three functions: `files.ts`.
 *
 * `maybeSingle()` and not `single()`: with the filter gone, "no such contact"
 * and "the contact is deleted" are different answers, and only the first should
 * look like an error to a caller.
 */
export async function getContact(id: string): Promise<Contact | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  return data ?? null;
}
