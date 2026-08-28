import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getProjects } from '@/lib/services/projects';
import { getProjectLogSummaries } from '@/lib/services/daily-logs';
import { getCompanyTimeSettings } from '@/lib/services/company';
import { companyToday } from '@framefocus/shared/utils/dates';

// Field Ops hub — minimal v1 (Phase 2 Q8): the caller's visible projects
// (RLS-scoped by projects_select_visible), each with its latest daily-log
// date, log count, and a hazard badge, linking into the per-project Field
// surface. Ungated nav item (S86 round-2 decision 6) — per-project RLS
// scopes the content. The company-wide Safety log takes its slot here when
// the 6C UI ships.
//
// Step 10 (§8.12.5) — "N of M jobs logged yesterday". The cron
// (`runDailyLogMissing`) asks a NARROWER question (projects with clocked
// time that day) on a service-role client a page cannot call; this is the
// page-callable derivation over ACTIVE projects, phrased that way. Both
// sides of the comparison are company-calendar days (the S106 lesson), and
// the counts are caller-RLS-scoped — a crew member's "M" is the jobs they
// can see.

function fmtYmd(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString(
    'en-US',
    { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
  );
}

/** Pure calendar-day arithmetic on a YMD string — no timezone involved. */
function ymdMinusDays(ymd: string, days: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
}

export default async function FieldOpsHubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const [projects, summaries, { timezone }] = await Promise.all([
    getProjects(),
    getProjectLogSummaries(),
    getCompanyTimeSettings(),
  ]);
  const visible = projects.filter((p) => p.status !== 'archived' && p.status !== 'cancelled');

  const yesterday = ymdMinusDays(companyToday(timezone), 1);
  const { data: yesterdayLogs } = await supabase
    .from('daily_logs')
    .select('project_id')
    .eq('is_deleted', false)
    .eq('log_date', yesterday);
  const loggedYesterday = new Set((yesterdayLogs ?? []).map((r) => r.project_id));

  const activeProjects = visible.filter((p) => p.status === 'active');
  const loggedCount = activeProjects.filter((p) => loggedYesterday.has(p.id)).length;

  return (
    <div>
      <h2 className="text-[24px] font-extrabold tracking-[-0.01em] text-[#0f1729]">Field Ops</h2>
      <p className="mt-[2px] text-[13px] text-[#7b8699]">
        The jobsite&rsquo;s daily record — logs, briefings, deliveries, and safety, per project.
      </p>
      {activeProjects.length > 0 && (
        <p
          data-testid="fieldops-logged-yesterday"
          className={`mt-2 text-[13px] font-semibold ${
            loggedCount === activeProjects.length ? 'text-[#1f8f4e]' : 'text-[#b45309]'
          }`}
        >
          {loggedCount} of {activeProjects.length} active job
          {activeProjects.length === 1 ? '' : 's'} logged yesterday
          {loggedCount < activeProjects.length ? ' — the gap in the record is the problem.' : '.'}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-3">
        {visible.length === 0 ? (
          <div className="rounded-[13px] border border-[#e4e8ef] bg-white p-6 text-sm text-[#7b8699]">
            No projects visible to you yet.
          </div>
        ) : (
          visible.map((project) => {
            const summary = summaries.get(project.id);
            const missedYesterday =
              project.status === 'active' && !loggedYesterday.has(project.id);
            return (
              <Link
                key={project.id}
                href={`/dashboard/field-ops/${project.id}/daily-logs`}
                className="flex items-center justify-between rounded-[13px] border border-[#e4e8ef] bg-white px-5 py-4 transition-colors hover:border-[#c3cad8]"
              >
                <div>
                  <div className="text-[15px] font-semibold text-[#0f1729]">{project.name}</div>
                  <div className="mt-[2px] text-[12px] text-[#8792a8]">
                    {summary
                      ? `${summary.log_count} daily log${summary.log_count === 1 ? '' : 's'} · latest ${fmtYmd(summary.latest_log_date)}`
                      : 'No daily logs yet'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {missedYesterday ? (
                    <span className="rounded-full bg-[#fff5e6] px-[10px] py-[3px] text-[11px] font-semibold text-[#b45309]">
                      No log yesterday
                    </span>
                  ) : null}
                  {summary?.hazard_flagged ? (
                    <span className="rounded-full bg-[#fdece0] px-[10px] py-[3px] text-[11px] font-semibold text-[#b45309]">
                      Hazard flagged
                    </span>
                  ) : null}
                  <span className="text-[13px] font-semibold text-[#3b4ae0]">Open →</span>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
