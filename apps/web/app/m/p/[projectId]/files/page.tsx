import { getFiles } from '@/lib/services/files';
import { getMyProfile } from '@/lib/services/profiles';
import { canReachDetail } from '@/app/m/detail-access';
import { SectionHeader } from '../section-header';
import { DeniedNotice, EmptyState, ListRow } from '../../../mobile-ui';
import { OpenFileButton } from './open-file';

// M6M §4.11.6 — M-16 · Files. Non-photo documents.
//
// PHOTOS ARE EXCLUDED — category = 'photos' belongs to M-8 (A-36). M-16 lists
// the document categories: plans, permits, contracts, daily_logs, receipts,
// other, plus invoices and change_orders WHERE RLS RETURNS THEM.
//
// RLS DOES THE GATING, NOT THE UI (A-36b). files_select_non_client
// (20260728000000:53-75) already restricts contracts, change_orders and invoices
// to Owner/Admin plus the PM-invoices carve-out. THIS SCREEN ADDS NO SECOND ROLE
// CHECK — a UI filter that disagrees with RLS is how a "missing file" bug that
// is really a permission becomes unexplainable.
//
// CUT: upload. Camera capture is §6's job and files to 'photos'; general
// document upload from a phone was never specced.

export default async function ProjectFilesPage({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams: { denied?: string };
}) {
  // NOTE: the filter key is `project_id`, not `projectId` — §4.11.6 writes it
  // as `getFiles({ projectId })` in prose; the real signature is snake_case.
  const [files, profile] = await Promise.all([
    getFiles({ project_id: params.projectId }),
    getMyProfile(),
  ]);

  // D-54 step 1 — HIDE the affordance. Step 2, the real gate, is the route
  // guard on the open path. A subcontractor still gets the LIST (§4.11.10b's
  // tile table is explicit: "Gets the list. Only opening a document is
  // blocked"), so the rows render without a tap target rather than vanishing.
  const canOpen = canReachDetail(profile?.role);

  // The ONLY filter, and it is a category split rather than a role check.
  const docs = files.filter((f) => f.category !== 'photos');

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SectionHeader projectId={params.projectId} title="Files" />
      <DeniedNotice kind={searchParams.denied} />

      {docs.length === 0 ? (
        <EmptyState>No documents.</EmptyState>
      ) : (
        <ul className="rounded-[15px] border border-m6m-border bg-m6m-card px-[12px]">
          {docs.map((f) => (
            <ListRow key={f.id} testId="m-file-row">
              {canOpen && f.file_path ? (
                <OpenFileButton path={f.file_path} fileName={f.file_name}>
                  <FileRowBody file={f} />
                </OpenFileButton>
              ) : (
                <div className="min-w-0 flex-1">
                  <FileRowBody file={f} />
                </div>
              )}
            </ListRow>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The row's visible content, shared by the tappable and non-tappable forms so
 *  the two cannot drift apart. */
function FileRowBody({
  file,
}: {
  file: { file_name: string; category: string | null; created_at: string | null; file_size: number | null };
}) {
  return (
    <>
      <p className="truncate text-[17px] font-bold leading-tight text-m6m-navy">{file.file_name}</p>
      <p className="mt-[2px] flex flex-wrap items-center gap-[6px]">
        <span className="font-mono text-[11px] font-semibold text-m6m-muted">{file.category}</span>
        {/* §2 — every number and date is mono. */}
        <span className="font-mono text-[11px] text-m6m-muted">
          {(file.created_at ?? '').slice(0, 10)}
        </span>
        <span className="font-mono text-[11px] text-m6m-muted">
          {Math.max(1, Math.round(Number(file.file_size ?? 0) / 1024))} KB
        </span>
      </p>
    </>
  );
}
