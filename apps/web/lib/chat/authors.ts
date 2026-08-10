import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import type { AuthorName, AuthorResolver } from './messages';

/**
 * Author display names, resolved through the SERVICE ROLE — Ruling B [S131].
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT A HOLE IN THE ROSTER FLOOR
 * ---------------------------------------------------------------------------
 * Ruling B floors `profiles`: a subcontractor reads Owner, Admin, PM and their
 * own row, and nothing else. Message reads run as the CALLER (ND-18), so the
 * embedded `author:profiles(...)` join this replaces was filtered by that
 * floor — and in a sub thread the posters include OTHER SUBS, whose bubbles
 * would have rendered with no name at all. Silently: no error, no failure.
 *
 * The distinction the floor actually draws is between BROWSING THE ROSTER and
 * NAMING A ROW YOU CAN ALREADY SEE. This function does only the second, and is
 * narrow by construction:
 *
 *  · it takes ids the caller already holds, from messages **RLS let them read**;
 *  · it returns first and last name and NOTHING else — no email, no role, no
 *    company, no id they did not already have;
 *  · it cannot enumerate. There is no "list everyone" path through it, so it
 *    answers "who wrote this?" and can never answer "who works here?".
 *
 * That is the same separation `app/api/chat/mentions/route.ts` already makes
 * deliberately for `postableSet()` — "runs as admin by design (working out who
 * MAY be mentioned is not the same act as reading the thread)".
 *
 * ⚠️ DO NOT WIDEN THE SELECT BELOW. Adding `email` or `role` would turn a
 * decoration into the roster read the floor exists to prevent, and it would do
 * it in a file whose name suggests it only renders names.
 */
export function adminAuthorResolver(admin: SupabaseClient<Database>): AuthorResolver {
  return async (profileIds: string[]): Promise<Map<string, AuthorName>> => {
    if (profileIds.length === 0) return new Map();

    const { data } = await admin
      .from('profiles')
      .select('id, first_name, last_name')
      .in('id', profileIds);

    return new Map(
      (data ?? []).map((p) => [p.id, { first_name: p.first_name, last_name: p.last_name }])
    );
  };
}
