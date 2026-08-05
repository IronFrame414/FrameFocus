import { getIncidentsForProject } from '@/lib/services/safety';
import { SectionHeader } from '../section-header';
import { EmptyState, ListRow, StatusPill } from '../../../mobile-ui';

// M6M §4.11.9 — M-19 · Safety incidents.
//
// INJURIES ARE INDICATED BY PRESENCE, NOT DETAIL, AND NO INJURED-PERSON NAME
// APPEARS ON THIS LIST (A-39) — every role reaches this screen (D-11), and a
// name on a list is a different disclosure from a name on a record someone
// deliberately opened. IncidentListItem does not carry injury rows at all; the
// count lives on the detail read (safety.ts:87), which this screen does not make.
//
// REPORTING AN INCIDENT IS NOT OFFERED HERE (A-39b). 7e / M-23 is the capture
// screen (§4.12.5) and is a later slice; the tile must not imply otherwise.

const TYPE_LABEL: Record<string, string> = {
  injury: 'Injury',
  property_damage: 'Property damage',
  near_miss: 'Near miss',
};

export default async function ProjectSafetyPage({
  params,
}: {
  params: { projectId: string };
}) {
  const incidents = await getIncidentsForProject(params.projectId);

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SectionHeader projectId={params.projectId} title="Safety" />

      {incidents.length === 0 ? (
        <EmptyState>No incidents reported.</EmptyState>
      ) : (
        <ul className="rounded-[15px] border border-m6m-border bg-m6m-card px-[12px]">
          {incidents.map((i) => (
            <ListRow key={i.id} testId="m-incident-row">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-bold leading-tight text-m6m-navy">
                  {TYPE_LABEL[i.incident_type] ?? i.incident_type}
                </p>
                <p className="mt-[3px] flex flex-wrap items-center gap-[6px]">
                  <StatusPill
                    label={i.status === 'open' ? 'Open' : 'Closed'}
                    tone={i.status === 'open' ? 'danger' : 'muted'}
                  />
                  <span className="font-mono text-[11px] text-m6m-muted">{i.incident_date}</span>
                  {i.reporter?.display_name ? (
                    <span className="text-[13px] text-m6m-muted">{i.reporter.display_name}</span>
                  ) : null}
                </p>
              </div>
            </ListRow>
          ))}
        </ul>
      )}
    </div>
  );
}
