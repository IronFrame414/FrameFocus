import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getProject } from '@/lib/services/projects';
import {
  getDailyLog,
  getLogPhotos,
  getProjectDayPresence,
} from '@/lib/services/daily-logs';
import { getDeliveriesForProjectDay } from '@/lib/services/deliveries';
import { getMyMember } from '@/lib/services/members';
import { FieldTabs } from '@/components/field/field-tabs';
import { DeleteLogButton, DownloadPdfButton, PhotoGrid } from './detail-client';
import { SIGNED_URL_TTL_SECONDS } from '@/lib/services/signed-url-ttl';

// 6B-1 §3 — the 4c read/detail view: the office reads the day's field
// record. Employee hours derive at read time (presence RPC); sub hours are
// manual; deliveries render read-only from 6D. Read-only markers caption
// every derived field per the handoff token rules.

const card = 'rounded-[13px] border border-[#e6e9ef] bg-white';

function fmtYmd(ymd: string, opts?: Intl.DateTimeFormatOptions): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString(
    'en-US',
    { timeZone: 'UTC', ...(opts ?? { month: 'short', day: 'numeric' }) }
  );
}

function FreeTextCard({ title, value }: { title: string; value: string | null }) {
  return (
    <div className={`${card} p-[16px]`}>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#8a919c]">
        {title}
      </div>
      <div className={value ? 'text-[13px] text-[#374151]' : 'text-[13px] text-[#9aa1ac]'}>
        {value || '—'}
      </div>
    </div>
  );
}

export default async function DailyLogDetailPage({
  params,
}: {
  params: { projectId: string; logId: string };
}) {
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
  if (!profile) redirect('/dashboard');

  const [project, log] = await Promise.all([
    getProject(params.projectId),
    getDailyLog(params.logId),
  ]);
  if (!project || project.is_deleted || !log || log.is_deleted) notFound();
  if (log.project_id !== params.projectId) notFound();

  const [presence, photos, deliveries, myMember] = await Promise.all([
    getProjectDayPresence(log.project_id, log.log_date),
    // Log-bound (S87): only this log's attachments — never a same-day
    // sibling's.
    getLogPhotos(log.id),
    getDeliveriesForProjectDay(log.project_id, log.log_date),
    getMyMember(),
  ]);

  const isAdminRole = profile.role === 'owner' || profile.role === 'admin';
  const canEdit = isAdminRole || (myMember != null && myMember.id === log.author_member_id);
  const canDelete = isAdminRole;

  const hoursByMember = new Map(presence.map((p) => [p.member_id, p]));

  // Signed thumbnails, batch (1h) — server-side so the grid gets plain URLs.
  const { data: signed } = photos.length
    ? await supabase.storage
        .from('project-files')
        .createSignedUrls(
          photos.map((p) => p.file_path),
          SIGNED_URL_TTL_SECONDS
        )
    : { data: [] };
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  // Current PDF (regenerate-on-edit — one file, always current).
  let pdfPath: string | null = null;
  let pdfName: string | null = null;
  if (log.pdf_file_id) {
    const { data: pdfFile } = await supabase
      .from('files')
      .select('file_path, file_name')
      .eq('id', log.pdf_file_id)
      .maybeSingle();
    pdfPath = pdfFile?.file_path ?? null;
    pdfName = pdfFile?.file_name ?? null;
  }

  const escalationHref = `/dashboard/field-ops/${project.id}/safety/new?date=${log.log_date}`;

  return (
    <div>
      <div className="mb-2 font-mono text-[12px] font-medium text-[#9aa1ac]">
        <Link href="/dashboard/projects" className="hover:text-[#14213d]">
          Projects
        </Link>{' '}
        /{' '}
        <Link href={`/dashboard/projects/${project.id}`} className="hover:text-[#14213d]">
          {project.name}
        </Link>{' '}
        /{' '}
        <Link
          href={`/dashboard/field-ops/${project.id}/daily-logs`}
          className="hover:text-[#14213d]"
        >
          Field
        </Link>{' '}
        / <span className="text-[#6b7280]">Daily Logs</span>
      </div>

      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-[24px] font-extrabold tracking-[-0.01em] text-[#14213d]">
            Daily Log — {fmtYmd(log.log_date)}
          </h2>
          <div className="mt-[2px] text-[13px] text-[#6b7280]">
            by {log.author?.display_name ?? 'Unknown'} · {project.name} ·{' '}
            {fmtYmd(log.log_date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
        <div className="flex gap-[10px]">
          <DownloadPdfButton logId={log.id} pdfPath={pdfPath} pdfName={pdfName} />
          {canEdit ? (
            <Link
              href={`/dashboard/field-ops/${project.id}/daily-logs/${log.id}/edit`}
              className="rounded-[9px] border border-[#e0e4ea] bg-white px-[15px] py-[9px] text-[13px] font-semibold text-[#374151] transition-colors hover:border-[#c9d2e4]"
            >
              Edit
            </Link>
          ) : null}
          {canDelete ? (
            <DeleteLogButton logId={log.id} projectId={project.id} />
          ) : null}
        </div>
      </div>

      <FieldTabs projectId={project.id} active="daily-logs" />

      <div className="grid grid-cols-[1fr_320px] items-start gap-[18px]">
        {/* Left column */}
        <div className="flex flex-col gap-4">
          <div className={`${card} p-[20px]`}>
            <div className="mb-[10px] text-[13px] font-bold uppercase text-[#14213d]">
              Work performed
            </div>
            <div
              className={
                log.work_performed
                  ? 'text-[14px] leading-relaxed text-[#374151]'
                  : 'text-[14px] text-[#9aa1ac]'
              }
            >
              {log.work_performed || '—'}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FreeTextCard title="Material used" value={log.material_used} />
            <FreeTextCard title="Material needed" value={log.material_needed} />
            <FreeTextCard title="Equipment used" value={log.equipment_used} />
            <FreeTextCard title="Tasks for tomorrow" value={log.tasks_tomorrow} />
          </div>

          {/* Notes — in the data spec (§6.7a) though absent from the 4c mock;
              rendered full-width under the 2×2 per 6B-1 §3. */}
          <div className={`${card} p-[20px]`}>
            <div className="mb-2 text-[13px] font-bold uppercase text-[#14213d]">Notes</div>
            <div
              className={
                log.notes ? 'text-[13px] leading-relaxed text-[#374151]' : 'text-[13px] text-[#9aa1ac]'
              }
            >
              {log.notes || '—'}
            </div>
          </div>

          <div className={`${card} p-[20px]`}>
            <div className="mb-3 text-[13px] font-bold uppercase text-[#14213d]">
              Photos{' '}
              <span className="text-[11px] font-medium normal-case tracking-normal text-[#9aa1ac]">
                — attached to this log
              </span>
            </div>
            <PhotoGrid
              photos={photos.map((p) => ({
                id: p.id,
                file_name: p.file_name,
                client_visible: p.client_visible,
                signedUrl: urlByPath.get(p.file_path) ?? null,
              }))}
            />
          </div>
        </div>

        {/* Right rail */}
        <div className="flex flex-col gap-4">
          {log.hazards_present ? (
            <div className="rounded-[13px] border border-[#f3e2c4] bg-[#fdf6ec] p-[16px]">
              <div className="mb-2 text-[13px] font-bold text-[#8a5a12]">⚠ Hazard flagged</div>
              <div className="mb-3 text-[13px] leading-snug text-[#8a5a12]">
                {log.hazard_notes}
              </div>
              {/* §2.4: 404s until the 6C UI ships — accepted, not hidden. */}
              <Link
                href={escalationHref}
                className="block w-full rounded-[8px] bg-[#c0362c] px-3 py-[9px] text-center text-[13px] font-semibold text-white transition-colors hover:bg-[#a52d24]"
              >
                File an incident report
              </Link>
            </div>
          ) : null}

          <div className={`${card} p-[18px]`}>
            <div className="text-[13px] font-bold uppercase text-[#14213d]">
              Crew present{' '}
              <span className="text-[11px] font-medium normal-case tracking-normal text-[#9aa1ac]">
                · auto-filled
              </span>
            </div>
            <div className="mt-2 flex flex-col">
              {log.crew.length === 0 ? (
                <p className="py-1 text-[12px] text-[#9aa1ac]">No crew recorded.</p>
              ) : (
                log.crew.map((c) => {
                  const p = hoursByMember.get(c.member_id);
                  return (
                    <div
                      key={c.id}
                      className="flex items-center justify-between border-b border-[#f4f6f9] py-2 last:border-0"
                    >
                      <span className="text-[13px] text-[#374151]">
                        {c.member?.display_name ?? 'Member'}
                        {p?.warranty_only ? (
                          <span className="ml-2 rounded-full bg-[#eef1f6] px-2 py-[1px] text-[10px] font-semibold text-[#6b7280]">
                            warranty visit
                          </span>
                        ) : null}
                      </span>
                      <span className="font-mono text-[13px] font-semibold text-[#14213d]">
                        {p ? `${p.hours.toFixed(1)} h` : '—'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
            <p className="mt-2 text-[11px] text-[#9aa1ac]">
              Employee hours read-only, from time tracking (6A)
            </p>
          </div>

          <div className={`${card} p-[18px]`}>
            <div className="mb-[10px] text-[13px] font-bold uppercase text-[#14213d]">
              Subs on site{' '}
              <span className="text-[11px] font-medium normal-case tracking-normal text-[#9aa1ac]">
                · manual
              </span>
            </div>
            {log.sub_entries.length === 0 ? (
              <p className="text-[12px] text-[#9aa1ac]">No subcontractors recorded.</p>
            ) : (
              log.sub_entries.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-[6px]">
                  <span className="text-[13px] text-[#374151]">
                    {s.member?.display_name ?? 'Sub'}
                    {s.note ? ` — ${s.note}` : ''}
                  </span>
                  <span className="font-mono text-[13px] font-semibold text-[#14213d]">
                    {s.hours.toFixed(1)} h
                  </span>
                </div>
              ))
            )}
          </div>

          <div className={`${card} p-[18px]`}>
            <div className="flex justify-between gap-4">
              <div>
                <div className="text-[13px] font-bold uppercase text-[#14213d]">Weather</div>
                <div
                  className={
                    log.weather ? 'mt-[6px] text-[13px] text-[#374151]' : 'mt-[6px] text-[13px] text-[#9aa1ac]'
                  }
                >
                  {log.weather || '—'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[13px] font-bold uppercase text-[#14213d]">Deliveries</div>
                {deliveries.length === 0 ? (
                  <div className="mt-[6px] text-[13px] text-[#9aa1ac]">None</div>
                ) : (
                  deliveries.map((d) => (
                    <div key={d.id} className="mt-[6px] text-[13px] text-[#374151]">
                      {d.vendor_name} {d.has_exceptions ? '⚠' : '✓'}
                    </div>
                  ))
                )}
                <div className="mt-1 text-[10px] text-[#9aa1ac]">read-only, from 6D</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
