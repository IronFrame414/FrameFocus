// One consistent color per member everywhere (5B §6, Q-N6). The color lives
// on company_members.schedule_color (company-assigned, Owner/Admin). When a
// member has no assigned color yet, fall back to a deterministic palette pick
// so rendering is stable before assignment.

const FALLBACK_PALETTE = [
  '#2563eb', // blue
  '#16a34a', // green
  '#d97706', // amber
  '#dc2626', // red
  '#7c3aed', // violet
  '#0891b2', // cyan
  '#db2777', // pink
  '#65a30d', // lime
  '#ea580c', // orange
  '#4f46e5', // indigo
];

export function memberColor(memberId: string | null, explicit: string | null): string {
  if (explicit) return explicit;
  if (!memberId) return '#6b7280'; // job-level events (inspections)
  let hash = 0;
  for (let i = 0; i < memberId.length; i++) {
    hash = (hash * 31 + memberId.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length];
}
