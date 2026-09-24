import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { MAX_CHARS, MAX_TEXTS, translateForReader } from '@/lib/translation/translate';

// S110 H — POST /api/translate { texts: string[], target: 'en' | 'es' }
// → { results: [{ sourceLang, translated, failed? }] } in the same order.
//
// THE CALLER'S SESSION DECIDES, BEFORE THE SERVICE ROLE EXISTS (the s107
// route-order pattern): signed in, a live profile, and a role that is NOT
// `client` — ruling 5: nothing is ever translated for a client. The cache is
// read and written with the service role, scoped to the caller's company.
const READERS = new Set([
  'owner',
  'admin',
  'project_manager',
  'foreman',
  'crew_member',
  'subcontractor',
]);

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .maybeSingle();
  if (!profile || !READERS.has(profile.role)) {
    console.error('[POST /api/translate] refused', {
      check: 'role may read translations',
      role: profile?.role ?? null,
    });
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  let body: { texts?: unknown; target?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { texts, target } = body;
  if (target !== 'en' && target !== 'es')
    return NextResponse.json({ error: 'Unsupported target' }, { status: 400 });
  if (
    !Array.isArray(texts) ||
    texts.length === 0 ||
    texts.length > MAX_TEXTS ||
    !texts.every((t) => typeof t === 'string' && t.trim().length > 0 && t.length <= MAX_CHARS)
  ) {
    return NextResponse.json(
      { error: `Send 1–${MAX_TEXTS} non-empty texts of at most ${MAX_CHARS} characters.` },
      { status: 400 }
    );
  }

  const admin = getSupabaseAdmin() as SupabaseClient<Database>;
  const results = await translateForReader(admin, profile.company_id, texts as string[], target);
  return NextResponse.json({ results });
}
