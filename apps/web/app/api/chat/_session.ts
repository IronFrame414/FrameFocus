import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { createClient } from '@/lib/supabase-server';

/**
 * The caller, resolved once, for every chat route.
 *
 * Not in `lib/chat/` on purpose: this is route plumbing (who is asking), not
 * chat behaviour. `lib/chat/` stays the thing both surfaces share and this
 * stays the thing only the HTTP layer needs.
 *
 * ⚠️ THE CLIENT RETURNED IS THE CALLER'S, NOT THE SERVICE ROLE. Every chat read
 * and write runs under the caller's RLS (ND-18); the service role appears in
 * exactly two places — resolving who may be mentioned, and writing the
 * notification — and both are named where they happen.
 */

export interface ChatSession {
  supabase: SupabaseClient<Database>;
  userId: string;
  profileId: string;
  companyId: string;
  role: string;
  authorName: string;
}

export async function chatSession(): Promise<ChatSession | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, role, company_id')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile) return null;

  return {
    supabase,
    userId: user.id,
    profileId: profile.id,
    companyId: profile.company_id,
    role: profile.role,
    authorName: `${profile.first_name} ${profile.last_name}`.trim(),
  };
}
