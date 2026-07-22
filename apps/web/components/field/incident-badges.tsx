import {
  INCIDENT_STATUS_LABELS,
  INCIDENT_TYPE_LABELS,
  type IncidentStatus,
  type IncidentType,
} from '@framefocus/shared';

// 6C — incident badges per the handoff token table (4d): Injury red,
// Property amber, Near miss indigo; status open amber / closed grey.

const TYPE_STYLES: Record<IncidentType, string> = {
  injury: 'bg-[#fbe4e2] text-[#c0362c]',
  property_damage: 'bg-[#fdece0] text-[#b45309]',
  near_miss: 'bg-[#e7ebf9] text-[#3a4db0]',
};

export function TypeBadge({ type }: { type: IncidentType }) {
  return (
    <span
      className={`rounded-full px-[9px] py-[3px] text-[11px] font-semibold ${TYPE_STYLES[type]}`}
    >
      {INCIDENT_TYPE_LABELS[type]}
    </span>
  );
}

export function StatusBadge({ status }: { status: IncidentStatus }) {
  return status === 'open' ? (
    <span className="rounded-full bg-[#fdece0] px-[9px] py-[3px] text-[11px] font-semibold text-[#b45309]">
      {INCIDENT_STATUS_LABELS.open}
    </span>
  ) : (
    <span className="rounded-full bg-[#eef1f6] px-[9px] py-[3px] text-[11px] font-semibold text-[#6b7280]">
      {INCIDENT_STATUS_LABELS.closed}
    </span>
  );
}
