'use server';

import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
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
