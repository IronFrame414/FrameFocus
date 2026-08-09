import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';

type FileRow = Database['public']['Tables']['files']['Row'];

export type FileCategory =
  | 'photos'
  | 'contracts'
  | 'plans'
  | 'permits'
  | 'invoices'
  | 'change_orders'
  | 'daily_logs'
  | 'receipts'
  // 'safety' has been in the live files_category_check since the M3 CHECK
  // shipped; first consumed by 6C incident photos + PDFs (S88).
  | 'safety'
  // 'deliveries' added to files_category_check by migration 20260723010000
  // (S90) — delivery record PDFs only; check-in photos stay in 'photos'.
  | 'deliveries'
  | 'other';

export type FileRecord = Omit<FileRow, 'category'> & {
  category: FileCategory;
};

// Trash-bin pattern (list): filters is_deleted = false by default so deleted rows never appear in
// normal listings. Pass include_deleted: true to surface soft-deleted rows for the trash UI. See CLAUDE.md "Trash-bin pattern".
export async function getFiles(filters?: {
  project_id?: string;
  category?: FileCategory;
  include_deleted?: boolean;
}): Promise<FileRecord[]> {
  const supabase = await createClient();

  let query = supabase
    .from('files')
    .select('*')
    .order('created_at', { ascending: false });

  if (!filters?.include_deleted) {
    query = query.eq('is_deleted', false);
  }
  if (filters?.project_id) {
    query = query.eq('project_id', filters.project_id);
  }
  if (filters?.category) {
    query = query.eq('category', filters.category);
  }

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as FileRecord[];
}

// Trash-bin pattern (single-row fetch): intentionally does NOT filter is_deleted so a
// restore-from-trash flow can fetch a soft-deleted record by id. See CLAUDE.md "Trash-bin pattern".
export async function getFile(id: string): Promise<FileRecord | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('files')
    .select('*')
    .eq('id', id)
    .single();

  return (data as FileRecord | null) ?? null;
}

/**
 * What Storage said when it refused to sign. Structural on purpose: this is
 * `StorageError`'s shape, but that class is exported by `@supabase/storage-js`
 * — a TRANSITIVE dependency we do not declare — and `@supabase/supabase-js`
 * does not re-export it. Naming the four fields we actually read keeps the
 * contract honest without adding a package.json entry for a package we do not
 * own the version of.
 */
export interface SignedUrlFailure {
  message: string;
  /** HTTP status, when Storage answered at all. Absent on network failures. */
  status?: number;
  /** Storage's own code. Absent on network failures. */
  statusCode?: string;
  name?: string;
}

export type SignedUrlResult =
  | { url: string; error: null }
  | { url: null; error: SignedUrlFailure };

/**
 * Sign a path, KEEPING THE REASON IT FAILED — TECH_DEBT #142 [S122].
 *
 * ===========================================================================
 * ⚠️ THE SWALLOWED CAUSE WAS THE DEFECT, NOT THE STATUS CODE
 * ===========================================================================
 * `getSignedUrl()` below returned `string | null` and did `if (error) return
 * null`, discarding the only object that knew WHY. Every caller downstream —
 * `/api/files/signed-url` most visibly — was then structurally incapable of
 * telling an RLS refusal from a storage outage, so it answered 500 for both
 * and logged neither. Fixing the route's status code alone would have been
 * guessing: the information had already been destroyed one layer down. So the
 * cause is preserved HERE, and the route decides what to say with it.
 *
 * ⚠️ WHY `getSignedUrl()` SURVIVES RATHER THAN BEING REPLACED. A null return
 * is CORRECT for one caller: `resolveUrls()` in photos.ts probes for a
 * `.markup.jpg` derivative that is legitimately absent most of the time, and
 * turns the null into `derivativeMissing`. That is an expected answer, not a
 * failure, and making it throw or carry an error object would turn a normal
 * path into an exceptional one. So the null-returning wrapper stays for the
 * callers that genuinely want "no url", and this result-returning form is for
 * the callers that must report why.
 */
export async function signedUrlFor(
  filePath: string,
  expiresIn: number = 3600
): Promise<SignedUrlResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .storage
    .from('project-files')
    .createSignedUrl(filePath, expiresIn);

  if (error) return { url: null, error };
  if (!data?.signedUrl) {
    // No error and no URL should not happen; if it does, it is not a refusal,
    // and saying so beats reporting a permission problem that did not occur.
    return {
      url: null,
      error: { message: 'Storage returned no error and no signed URL', name: 'EmptySignedUrl' },
    };
  }
  return { url: data.signedUrl, error: null };
}

/**
 * The null-returning form. Use when "no url" is an acceptable answer and the
 * reason does not need reporting — see `signedUrlFor` above for when it does.
 */
export async function getSignedUrl(
  filePath: string,
  expiresIn: number = 3600
): Promise<string | null> {
  return (await signedUrlFor(filePath, expiresIn)).url;
}