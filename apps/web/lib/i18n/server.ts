import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase-server';
import { asLang, type Lang } from '@/lib/i18n/lang';
import { makeT, type T } from '@/lib/i18n/messages';

/**
 * S110 H — the signed-in user's language, for SERVER components, once per
 * request (React `cache`). Half of /m's screens are server components, which
 * cannot read the client provider.
 */
export const getMyLanguage = cache(async (): Promise<Lang> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 'en';
  const { data } = await supabase
    .from('profiles')
    .select('language')
    .eq('user_id', user.id)
    .maybeSingle();
  return asLang(data?.language);
});

/** System-text translator for a /m server component. /dashboard never calls it
 *  (ruling 2) — its chrome is English. */
export async function getMobileT(): Promise<T> {
  return makeT(await getMyLanguage());
}
