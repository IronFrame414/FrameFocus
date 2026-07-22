import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getProjects } from '@/lib/services/projects';
import { getProjectLogSummaries } from '@/lib/services/daily-logs';

// Field Ops hub — minimal v1 (Phase 2 Q8): the caller's visible projects
// (RLS-scoped by projects_select_visible), each with its latest daily-log
// date, log count, and a hazard badge, linking into the per-project Field
// surface. Ungated nav item (S86 round-2 decision 6) — per-project RLS
// scopes the content. The company-wide Safety log takes its slot here when
// the 6C UI ships.

function fmtYmd(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString(
    'en-US',
    { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
  );
}

export default async function FieldOpsHubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const [projects, summaries] = await Promise.all([getProjects(), getProjectLogSummaries()]);
  const visible = projects.filter((p) => p.status !== 'archived' && p.status !== 'cancelled');

  return (
    <div>
      <h2 className="text-[24px] font-extrabold tracking-[-0.01em] text-[#14213d]">Field Ops</h2>
      <p className="mt-[2px] text-[13px] text-[#6b7280]">
        The jobsite&rsquo;s daily record — logs, briefings, deliveries, and safety, per project.
      </p>

      <div className="mt-5 flex flex-col gap-3">
        {visible.length === 0 ? (
          <div className="rounded-[13px] border border-[#e6e9ef] bg-white p-6 text-sm text-[#6b7280]">
            No projects visible to you yet.
          </div>
        ) : (
          visible.map((project) => {
            const summary = summaries.get(project.id);
            return (
              <Link
                key={project.id}
                href={`/dashboard/field-ops/${project.id}/daily-logs`}
                className="flex items-center justify-between rounded-[13px] border border-[#e6e9ef] bg-white px-5 py-4 transition-colors hover:border-[#c9d2e4]"
              >
                <div>
                  <div className="text-[15px] font-semibold text-[#14213d]">{project.name}</div>
                  <div className="mt-[2px] text-[12px] text-[#8a919c]">
                    {summary
                      ? `${summary.log_count} daily log${summary.log_count === 1 ? '' : 's'} · latest ${fmtYmd(summary.latest_log_date)}`
                      : 'No daily logs yet'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {summary?.hazard_flagged ? (
                    <span className="rounded-full bg-[#fdf6ec] px-[10px] py-[3px] text-[11px] font-semibold text-[#8a5a12]">
                      Hazard flagged
                    </span>
                  ) : null}
                  <span className="text-[13px] font-semibold text-[#2f49d1]">Open →</span>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
