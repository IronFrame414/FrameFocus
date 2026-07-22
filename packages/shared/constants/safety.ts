// ============================================================
// 6C Safety Incidents — enum constants (single declaration).
// Closes 6C-spec open item #1 / Q3: declared ONCE here, consumed
// by UI, validation, and service types. The SQL CHECKs
// (safety_incidents_incident_type_check / _status_check) are the
// DB-side source; keep the two in lockstep. Do NOT hand-copy
// these unions into other files (the row_type lesson).
// ============================================================

export const INCIDENT_TYPES = ['injury', 'property_damage', 'near_miss'] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  injury: 'Injury',
  property_damage: 'Property damage',
  near_miss: 'Near miss',
};

export const INCIDENT_STATUSES = ['open', 'closed'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  open: 'Open',
  closed: 'Closed',
};
