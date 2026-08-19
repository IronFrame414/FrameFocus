import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// S138 — export status and the download links (spec §4d).
//
// ⚠️ THE JOB IS FETCHED WITH THE CALLER'S CLIENT, NOT THE SERVICE ROLE. That
// is what makes `export_jobs_select_owner_admin` the gate: a PM or a crew
// member gets no row and therefore a 404, and a different company's job id is
// invisible for the same reason. Reaching for the admin client here would
// quietly move the authorisation decision into this file.

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: job } = await supabase
    .from('export_jobs')
    .select('id, company_id, state, categories, format, bytes_written, expires_at, last_error, created_at')
    .eq('id', params.id)
    .maybeSingle();
  if (!job) {
    // Genuinely not visible to this caller — RLS already applied the role and
    // tenant test, so this is a real "not found" and not a masked 403.
    return NextResponse.json({ error: 'Export not found' }, { status: 404 });
  }

  const row = job as {
    id: string;
    company_id: string;
    state: string;
    expires_at: string | null;
    bytes_written: number;
  };

  // Signed URLs are minted only for a COMPLETE, unexpired job. The bucket is
  // private, so this is the only way to the bytes.
  let parts: Array<{ name: string; url: string }> = [];
  if (row.state === 'complete') {
    const admin = getSupabaseAdmin() as SupabaseClient<Database>;
    const prefix = `${row.company_id}/${row.id}`;
    const { data: objects } = await admin.storage.from('exports').list(prefix, { limit: 1000 });
    for (const o of objects ?? []) {
      const { data: signed } = await admin.storage
        .from('exports')
        // ⚠️ The `exports` bucket, NOT `project-files`, so M3-04's
        // `SIGNED_URL_TTL_SECONDS` does not govern it [S157]. Minted with the
        // admin client for a completed trial export and returned in this
        // response for immediate download. Its own surface, its own duration.
        .createSignedUrl(`${prefix}/${o.name}`, 3600, { download: o.name });
      if (signed?.signedUrl) parts.push({ name: o.name, url: signed.signedUrl });
    }
    parts = parts.sort((a, b) => a.name.localeCompare(b.name));
  }

  return NextResponse.json({ ...row, parts });
}
