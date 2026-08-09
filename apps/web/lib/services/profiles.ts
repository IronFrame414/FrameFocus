import { createClient } from '@/lib/supabase-server';

/**
 * The caller's own `profiles` row.
 *
 * WHY THIS EXISTS (M6M §4.13.7, as corrected [S101]): M-30 renders the
 * signed-in role, and nothing returned it. `getMyMember()` reads
 * `company_members`, which carries `display_name`/`member_type` and no role;
 * the mobile layout's `profiles` select carries `company_id` only. §4.13.7
 * ruled a second read in the page over widening `MobileShell` — the shell is
 * mounted by every mobile screen and would otherwise become a courier for data
 * it does not render — and §4.13's binding rule plus CLAUDE.md's service-layer
 * rule both forbid the page calling Supabase directly. Hence a named function.
 *
 * ON CONSOLIDATING `estimates-client.ts:377`'s PRIVATE `getMyProfile`: NOT DONE,
 * deliberately. That one is a CLIENT-side helper — it takes an injected
 * `SupabaseClient` and runs in the browser — and this one is server-side. They
 * sit on opposite sides of the server/client service split CLAUDE.md maintains
 * on purpose, so they cannot literally become one function. Merging them would
 * mean either calling a browser-client helper from a server component (wrong) or
 * refactoring five estimate call sites for no behavioural change, inside a slice
 * about mobile screens. Left alone; the duplication is one small function on
 * each side of a boundary the repo keeps deliberately.
 *
 * RLS: `profiles_select_authenticated` is `company_id = get_my_company_id() AND
 * is_deleted = false`, so every role can read its own row — no policy work.
 */
export type MyProfile = {
  id: string;
  role: string;
  first_name: string | null;
  last_name: string | null;
};

export async function getMyProfile(): Promise<MyProfile | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('id, role, first_name, last_name')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .maybeSingle();

  return (data as MyProfile | null) ?? null;
}
