'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase-server';

// The ONE self-service name-edit mechanism, shared by the desktop (/dashboard/account)
// and mobile (/m/account) pages — parity ruling S122: one mechanism, both surfaces.
//
// This writes ONLY first/last name for the CALLER'S OWN row. It is safe by the
// database, not by this code: the profiles_update_self policy admits the row and
// the enforce_profiles_self_column_scope trigger refuses any non-name change
// (20261080000000). So even if this function were wrong, a role/company change
// could not get through — see s177-self-name-edit.live.ts.

export type UpdateMyNameResult = { ok: true } | { ok: false; error: string };

export async function updateMyName(input: {
  first_name: string;
  last_name: string;
}): Promise<UpdateMyNameResult> {
  const first_name = input.first_name.trim();
  const last_name = input.last_name.trim();
  if (!first_name || !last_name) {
    return { ok: false, error: 'First and last name are both required.' };
  }
  if (first_name.length > 100 || last_name.length > 100) {
    return { ok: false, error: 'That name is too long.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'You are not signed in.' };
  }

  // RLS (profiles_update_self) scopes this to the caller's own row; the column
  // scope trigger keeps it to the name. We do not filter is_deleted: a user must
  // be able to correct their own name regardless.
  const { error } = await supabase
    .from('profiles')
    .update({ first_name, last_name })
    .eq('user_id', user.id);

  if (error) {
    return { ok: false, error: 'Could not update your name. Please try again.' };
  }

  // The name shows in both shells (desktop sidebar, mobile header) and on the
  // settings/account screens — refresh them.
  revalidatePath('/dashboard', 'layout');
  revalidatePath('/m', 'layout');
  return { ok: true };
}
