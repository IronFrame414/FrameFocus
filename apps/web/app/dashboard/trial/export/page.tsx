import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';
import { ExportClient, type ExportStatus } from './export-client';

/**
 * S138 — the export screen (Part 3.3).
 *
 * Owner/Admin only, and unreachable once the trial has expired: the export
 * window is the PRE-EXPIRY period by ruling, and the middleware lock guard
 * would have redirected a locked tenant to `/locked` before this renders.
 */
export default async function TrialExportPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile || !['owner', 'admin'].includes((profile as { role: string }).role)) {
    redirect('/dashboard');
  }

  // The most recent job, so a returning customer sees their download rather
  // than an empty form. RLS-scoped: Owner/Admin of this company only.
  const { data: latest } = await supabase
    .from('export_jobs')
    .select('id, state, bytes_written, expires_at, last_error')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // `parts` is empty here by design: signed URLs are minted by
  // GET /api/trial/export/[id], which the client calls on mount and on every
  // poll. Minting them during server render would burn a one-hour signature on
  // a page the customer might leave open.
  const row = latest as Omit<ExportStatus, 'parts'> | null;
  const initialJob: ExportStatus | null = row ? { ...row, parts: [] } : null;

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-gray-900">Export your data</h1>
      <p className="mt-2 text-sm text-gray-700">
        Prepare a copy of this company&apos;s records to download.
      </p>

      <ExportClient initialJob={initialJob} />

      <p className="mt-8">
        <Link href="/dashboard/trial" className="text-sm text-gray-600 underline">
          Back to trial status
        </Link>
      </p>
    </main>
  );
}
