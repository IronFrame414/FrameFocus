import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getProject } from '@/lib/services/projects';
import { getDailyLogs } from '@/lib/services/daily-logs';
import { FieldTabs } from '@/components/field/field-tabs';

// 6B-1 §3a — per-project daily-log list. Minimal v1: date, author, hazard
// badge, newest first; multiple logs per project-day are legal and all show.

function fmtYmd(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString(
    'en-US',
    { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
  );
}

export default async function DailyLogListPage({
  params,
}: {
  params: { projectId: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const project = await getProject(params.projectId);
  if (!project || project.is_deleted) notFound();

  const logs = await getDailyLogs(params.projectId);

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
        / Field / <span className="text-[#6b7280]">Daily Logs</span>
      </div>

      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-[24px] font-extrabold tracking-[-0.01em] text-[#14213d]">
            Daily Logs
          </h2>
          <div className="mt-[2px] text-[13px] text-[#6b7280]">{project.name}</div>
        </div>
        <Link
          href={`/dashboard/field-ops/${project.id}/daily-logs/new`}
          className="rounded-[9px] bg-[#2f49d1] px-[15px] py-[9px] text-[13px] font-semibold text-white transition-colors hover:bg-[#2438a8]"
        >
          + New daily log
        </Link>
      </div>

      <FieldTabs projectId={project.id} active="daily-logs" />

      <div className="flex flex-col gap-2">
        {logs.length === 0 ? (
          <div className="rounded-[13px] border border-[#e6e9ef] bg-white p-6 text-sm text-[#6b7280]">
            No daily logs yet. The first log written for this project will appear here.
          </div>
        ) : (
          logs.map((log) => (
            <Link
              key={log.id}
              href={`/dashboard/field-ops/${project.id}/daily-logs/${log.id}`}
              className="flex items-center justify-between rounded-[13px] border border-[#e6e9ef] bg-white px-5 py-[14px] transition-colors hover:border-[#c9d2e4]"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-[13px] font-semibold text-[#14213d]">
                  {fmtYmd(log.log_date)}
                </span>
                <span className="text-[13px] text-[#6b7280]">
                  by {log.author?.display_name ?? 'Unknown'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {log.hazards_present ? (
                  <span className="rounded-full bg-[#fdf6ec] px-[10px] py-[3px] text-[11px] font-semibold text-[#8a5a12]">
                    Hazard flagged
                  </span>
                ) : null}
                <span className="text-[13px] font-semibold text-[#2f49d1]">View →</span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
