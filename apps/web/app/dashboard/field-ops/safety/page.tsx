import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getIncidents, type IncidentListItem } from '@/lib/services/safety';
import { TypeBadge } from '@/components/field/incident-badges';

// 6C — handoff 4d: the company-wide incident log (Phase 3 Q7, surface 1 of
// 2). Left = the log table (Date · Incident · Project · Type); right = the
// selected incident's summary panel (?sel=, defaults to the newest). RLS
// scopes rows: Owner/Admin see all; others see assigned projects + own
// project-less reports.

function fmtYmd(ymd: string, year = false): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString(
    'en-US',
    { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' }
  );
}

function incidentSubline(incident: IncidentListItem): string {
  if (incident.incident_type === 'near_miss') return 'Near miss';
  if (incident.incident_type === 'property_damage') return 'No injuries';
  return 'Injury';
}

export default async function SafetyLogPage({
  searchParams,
}: {
  searchParams: { sel?: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const incidents = await getIncidents();
  const selected =
    incidents.find((i) => i.id === searchParams.sel) ?? incidents[0] ?? null;

  return (
    <div>
      <div className="mb-[18px] flex items-start justify-between">
        <div>
          <h2 className="text-[26px] font-extrabold tracking-[-0.01em] text-[#14213d]">
            Safety Incidents
          </h2>
          <div className="mt-[2px] text-[14px] text-[#6b7280]">
            Company-wide log · every incident emails everyone above the reporter
          </div>
        </div>
        <Link
          href="/dashboard/field-ops/safety/new"
          className="rounded-[9px] bg-[#c0362c] px-[16px] py-[9px] text-[13px] font-semibold text-white transition-colors hover:bg-[#a52d24]"
        >
          + Report incident
        </Link>
      </div>

      <div className="grid grid-cols-[1.15fr_320px] items-start gap-[18px]">
        {/* Log table */}
        <div className="overflow-hidden rounded-[13px] border border-[#e6e9ef] bg-white">
          <div className="grid grid-cols-[1fr_1.6fr_1.2fr_1fr] gap-3 border-b border-[#eef1f6] bg-[#f7f9fc] px-5 py-3 font-mono text-[11px] font-semibold uppercase text-[#8a919c]">
            <div>Date</div>
            <div>Incident</div>
            <div>Project</div>
            <div>Type</div>
          </div>
          {incidents.length === 0 ? (
            <div className="p-6 text-sm text-[#6b7280]">
              No incidents on record. That&rsquo;s the goal — keep it that way.
            </div>
          ) : (
            incidents.map((incident) => (
              <Link
                key={incident.id}
                href={`/dashboard/field-ops/safety/${incident.id}`}
                className={`grid grid-cols-[1fr_1.6fr_1.2fr_1fr] items-center gap-3 border-b border-[#f1f3f7] px-5 py-[14px] transition-colors last:border-0 hover:bg-[#fbfcfe] ${
                  selected?.id === incident.id ? 'bg-[#fbfcfe]' : ''
                }`}
              >
                <div className="font-mono text-[12px] font-medium text-[#6b7280]">
                  {fmtYmd(incident.incident_date)}
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-[#14213d]">
                    {incident.description.length > 60
                      ? `${incident.description.slice(0, 60)}…`
                      : incident.description}
                  </div>
                  <div className="text-[12px] text-[#9aa1ac]">{incidentSubline(incident)}</div>
                </div>
                <div className="text-[13px] text-[#4b5563]">
                  {incident.project?.name ?? 'No project (shop/yard)'}
                </div>
                <div>
                  <TypeBadge type={incident.incident_type} />
                </div>
              </Link>
            ))
          )}
        </div>

        {/* Selected-incident panel (4d right rail) */}
        {selected ? (
          <div className="rounded-[13px] border border-[#e6e9ef] bg-white p-[20px]">
            <div className="mb-[14px] flex items-center justify-between">
              <div className="text-[15px] font-bold text-[#14213d]">
                {fmtYmd(selected.incident_date, true)}
              </div>
              <TypeBadge type={selected.incident_type} />
            </div>
            <div className="flex flex-col">
              <div className="border-b border-[#f4f6f9] py-[9px]">
                <div className="font-mono text-[11px] font-semibold uppercase text-[#8a919c]">
                  Project
                </div>
                <div className="mt-[3px] text-[13px] text-[#374151]">
                  {selected.project?.name ?? 'No project (shop/yard)'}
                </div>
              </div>
              <div className="border-b border-[#f4f6f9] py-[9px]">
                <div className="font-mono text-[11px] font-semibold uppercase text-[#8a919c]">
                  Description
                </div>
                <div className="mt-[3px] text-[13px] text-[#374151]">{selected.description}</div>
              </div>
              <div className="py-[9px]">
                <div className="font-mono text-[11px] font-semibold uppercase text-[#8a919c]">
                  Reported by
                </div>
                <div className="mt-[3px] text-[13px] text-[#374151]">
                  {selected.reporter?.display_name ?? 'Unknown'}
                </div>
              </div>
            </div>
            <Link
              href={`/dashboard/field-ops/safety/${selected.id}`}
              className="mt-3 block w-full rounded-[8px] bg-[#2f49d1] px-3 py-[9px] text-center text-[13px] font-semibold text-white transition-colors hover:bg-[#2438a8]"
            >
              Open incident
            </Link>
            <div className="mt-[10px] text-[11px] font-medium text-[#9aa1ac]">
              OSHA 300 recordkeeping handled outside the app in v1.
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
