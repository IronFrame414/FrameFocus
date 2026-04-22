'use server';

import { createClient } from '@/lib/supabase-server';
import { createClient as createPlainClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getStripe } from '@/lib/stripe';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  updateTeamMember,
  softDeleteTeamMember,
  resetTeamMemberPassword,
  getTeamMember,
} from '@/lib/services/team';

async function getCallerProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, role, company_id')
    .eq('user_id', user.id)
    .single();
  if (error || !profile) throw new Error('Profile not found');
  return { supabase, profile, userId: user.id };
}

function assertCanEdit(callerRole: string, callerProfileId: string, targetProfileId: string, targetRole: string) {
  if (callerProfileId === targetProfileId) {
    throw new Error('Cannot edit your own profile from this page');
  }
  if (callerRole === 'owner') return;
  if (callerRole === 'admin') {
    if (targetRole === 'owner' || targetRole === 'admin') {
      throw new Error('Admins cannot edit Owners or other Admins');
    }
    return;
  }
  throw new Error('Insufficient permissions');
}

export async function updateTeamMemberAction(
  targetId: string,
  updates: { first_name: string; last_name: string; phone: string | null; role: string; notes: string | null }
) {
  const { supabase, profile } = await getCallerProfile();
  const target = await getTeamMember(supabase, targetId);
  assertCanEdit(profile.role, profile.id, target.id, target.role);

  if (profile.role === 'admin' && (updates.role === 'owner' || updates.role === 'admin')) {
    throw new Error('Admins cannot promote users to Owner or Admin');
  }

  await updateTeamMember(supabase, targetId, updates);
  revalidatePath('/dashboard/team');
  revalidatePath(`/dashboard/team/${targetId}`);
}

export async function deleteTeamMemberAction(targetId: string) {
  const { supabase, profile } = await getCallerProfile();
  const target = await getTeamMember(supabase, targetId);
  assertCanEdit(profile.role, profile.id, target.id, target.role);

  const supabaseAdmin = getSupabaseAdmin();
  await softDeleteTeamMember(supabase, supabaseAdmin, target.id, target.user_id);
  revalidatePath('/dashboard/team');
  redirect('/dashboard/team');
}

export async function resetPasswordAction(targetId: string) {
  const { supabase, profile } = await getCallerProfile();
  const target = await getTeamMember(supabase, targetId);
  assertCanEdit(profile.role, profile.id, target.id, target.role);

  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`;
  await resetTeamMemberPassword(supabase, target.email, redirectTo);
}

export async function transferOwnershipAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const newOwnerId = String(formData.get('new_owner_id') ?? '');
  const password = String(formData.get('password') ?? '');
  if (!newOwnerId || !password) {
    return { ok: false, error: 'Missing fields' };
  }

  let caller: Awaited<ReturnType<typeof getCallerProfile>>;
  try {
    caller = await getCallerProfile();
  } catch {
    return { ok: false, error: 'Not authenticated' };
  }
  if (caller.profile.role !== 'owner') {
    return { ok: false, error: 'Only the Owner can transfer ownership' };
  }
  const { supabase } = caller;
  const { id: profileId, company_id: companyId } = caller.profile;

  const { data: callerRow, error: callerErr } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', profileId)
    .single();
  if (callerErr || !callerRow?.email) {
    return { ok: false, error: 'Caller email not found' };
  }
  const callerEmail = callerRow.email;

  const { data: company, error: companyErr } = await supabase
    .from('companies')
    .select('id, stripe_customer_id')
    .eq('id', companyId)
    .single();
  if (companyErr || !company) {
    return { ok: false, error: 'Company not found' };
  }

  let target;
  try {
    target = await getTeamMember(supabase, newOwnerId);
  } catch {
    return { ok: false, error: 'Target not found' };
  }

  const plain = createPlainClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { error: pwErr } = await plain.auth.signInWithPassword({
    email: callerEmail,
    password,
  });
  if (pwErr) {
    return { ok: false, error: 'Incorrect password' };
  }

  const { error: rpcErr } = await supabase.rpc('transfer_ownership', {
    p_new_owner_id: newOwnerId,
  });
  if (rpcErr) {
    return { ok: false, error: rpcErr.message };
  }

  try {
    if (company.stripe_customer_id) {
      await getStripe().customers.update(company.stripe_customer_id, {
        email: target.email,
        name: `${target.first_name ?? ''} ${target.last_name ?? ''}`.trim(),
      });
    }
  } catch (e) {
    console.error('[transferOwnership] Stripe update failed:', e);
  }

  revalidatePath('/dashboard/team');
  redirect('/dashboard');
}
