import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';

export type AddOns = Pick<
  Database['public']['Tables']['companies']['Row'],
  'ai_tagging_enabled'
>;

export async function getAddOns(): Promise<AddOns | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile) return null;

  const { data: addOns } = await supabase
    .from('companies')
    .select('ai_tagging_enabled')
    .eq('id', profile.company_id)
    .single();

  return addOns ?? null;
}