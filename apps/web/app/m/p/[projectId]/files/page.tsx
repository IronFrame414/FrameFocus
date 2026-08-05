import { getFiles } from '@/lib/services/files';
import { SectionHeader } from '../section-header';
import { EmptyState, ListRow } from '../../../mobile-ui';

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
}: {
  params: { projectId: string };
}) {
  // NOTE: the filter key is `project_id`, not `projectId` — §4.11.6 writes it
  // as `getFiles({ projectId })` in prose; the real signature is snake_case.
  const files = await getFiles({ project_id: params.projectId });

  // The ONLY filter, and it is a category split rather than a role check.
  const docs = files.filter((f) => f.category !== 'photos');

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SectionHeader projectId={params.projectId} title="Files" />

      {docs.length === 0 ? (
        <EmptyState>No documents.</EmptyState>
      ) : (
        <ul className="rounded-[15px] border border-m6m-border bg-m6m-card px-[12px]">
          {docs.map((f) => (
            <ListRow key={f.id} testId="m-file-row">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-bold leading-tight text-m6m-navy">
                  {f.file_name}
                </p>
                <p className="mt-[2px] flex flex-wrap items-center gap-[6px]">
                  <span className="font-mono text-[11px] font-semibold text-m6m-muted">
                    {f.category}
                  </span>
                  {/* §2 — every number and date is mono. */}
                  <span className="font-mono text-[11px] text-m6m-muted">
                    {(f.created_at ?? '').slice(0, 10)}
                  </span>
                  <span className="font-mono text-[11px] text-m6m-muted">
                    {Math.max(1, Math.round(Number(f.file_size ?? 0) / 1024))} KB
                  </span>
                </p>
              </div>
            </ListRow>
          ))}
        </ul>
      )}
    </div>
  );
}
