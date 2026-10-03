// S118 item 12 — the paper form "WP-Daily-CloseOut-Lookahead", as data. ONE
// definition read by the desktop form, the /m form, both detail pages and the
// PDF (PARITY: lib/, not a surface's folder). The order is the paper's order.
import type { MsgKey } from '@/lib/i18n/messages';

/** Section A — the ten close-out checks, in the paper form's order. */
export const CLOSEOUT_ITEMS = [
  { key: 'closeout_floors_swept', labelKey: 'field.closeout.floorsSwept' },
  { key: 'closeout_debris_hauled', labelKey: 'field.closeout.debrisHauled' },
  { key: 'closeout_cut_station_clean', labelKey: 'field.closeout.cutStationClean' },
  { key: 'closeout_tools_secured', labelKey: 'field.closeout.toolsSecured' },
  { key: 'closeout_cords_clear', labelKey: 'field.closeout.cordsClear' },
  { key: 'closeout_materials_covered', labelKey: 'field.closeout.materialsCovered' },
  { key: 'closeout_work_protected', labelKey: 'field.closeout.workProtected' },
  { key: 'closeout_utilities_off', labelKey: 'field.closeout.utilitiesOff' },
  { key: 'closeout_site_secured', labelKey: 'field.closeout.siteSecured' },
  { key: 'closeout_first_task_staged', labelKey: 'field.closeout.firstTaskStaged' },
// `labelKey`, not `label`: it holds a MESSAGE KEY, and the /m anti-rot guard
// reads a `label:` string as hard-coded text (test/s110-m-i18n-guard.test.ts).
] as const satisfies readonly { key: string; labelKey: MsgKey }[];

export type CloseoutKey = (typeof CLOSEOUT_ITEMS)[number]['key'];

/** The new daily-log columns the form writes (never the office_* ones). */
/**
 * [S127 item 5a] Why a log carries NO client-facing photo — one tap, stored on
 * the log (`daily_logs.client_photo_skip_reason`, CHECK in 20262134300000).
 * [RULED Josh: option B — a photo, or a reason; never a filler photo.]
 */
export const CLIENT_PHOTO_SKIP_REASONS = [
  { value: 'inspection_day', labelKey: 'field.clientPhoto.reason.inspection_day' },
  { value: 'weather', labelKey: 'field.clientPhoto.reason.weather' },
  { value: 'no_site_access', labelKey: 'field.clientPhoto.reason.no_site_access' },
  { value: 'no_visible_progress', labelKey: 'field.clientPhoto.reason.no_visible_progress' },
] as const satisfies readonly { value: string; labelKey: MsgKey }[];

export type ClientPhotoSkipReason = (typeof CLIENT_PHOTO_SKIP_REASONS)[number]['value'];

/** The send gate both forms apply: at least one client-facing photo, or a reason. */
export function clientPhotoSatisfied(clientPhotoCount: number, reason: ClientPhotoSkipReason | null): boolean {
  return clientPhotoCount > 0 || reason !== null;
}

export type CloseoutFields = Record<CloseoutKey, boolean | null> & {
  photos_sent_at: string | null;
  tasks_tomorrow_date: string | null;
  tasks_day_after: string | null;
  tasks_day_after_date: string | null;
  blockers: string | null;
  /** [S127 5a] NULL when the log has a client-facing photo. */
  client_photo_skip_reason: ClientPhotoSkipReason | null;
};

export function emptyCloseout(): CloseoutFields {
  const base = Object.fromEntries(CLOSEOUT_ITEMS.map((i) => [i.key, null])) as Record<
    CloseoutKey,
    boolean | null
  >;
  return {
    ...base,
    photos_sent_at: null,
    tasks_tomorrow_date: null,
    tasks_day_after: null,
    tasks_day_after_date: null,
    blockers: null,
    client_photo_skip_reason: null,
  };
}

/** Section D — one "needed on site, not here now" line (the 48-hour rule). */
export interface MaterialNeedInput {
  /** Present for an existing row. */
  id?: string;
  item: string;
  qty: number | null;
  unit: string | null;
  needed_by: string | null;
  vendor_source: string | null;
}

export interface MaterialNeed extends MaterialNeedInput {
  id: string;
  ordered_at: string | null;
  ordered_by_name: string | null;
}

/** "Office" — the roles that mark a log reviewed and a line ordered (the DB decides; this hides controls). */
export const DAILY_LOG_OFFICE_ROLES: readonly string[] = [
  'owner',
  'admin',
  'project_manager',
  'project_executive',
];

export function isDailyLogOffice(role: string | null | undefined): boolean {
  return typeof role === 'string' && DAILY_LOG_OFFICE_ROLES.includes(role);
}

/** A D line worth saving: an item name. Blank rows are dropped, not stored. */
export function cleanNeeds(rows: MaterialNeedInput[]): MaterialNeedInput[] {
  return rows
    .map((r) => ({
      ...r,
      item: r.item.trim(),
      unit: r.unit?.trim() || null,
      vendor_source: r.vendor_source?.trim() || null,
      needed_by: r.needed_by || null,
      qty: r.qty != null && Number.isFinite(r.qty) && r.qty > 0 ? r.qty : null,
    }))
    .filter((r) => r.item.length > 0);
}

/** The CloseoutFields of a stored log row (for an edit form's initial state). */
export function closeoutFromLog(
  log: Partial<Record<keyof CloseoutFields, unknown>>
): CloseoutFields {
  const out = emptyCloseout();
  for (const { key } of CLOSEOUT_ITEMS) {
    const v = log[key];
    out[key] = typeof v === 'boolean' ? v : null;
  }
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  out.photos_sent_at = str(log.photos_sent_at);
  out.tasks_tomorrow_date = str(log.tasks_tomorrow_date);
  out.tasks_day_after = str(log.tasks_day_after);
  out.tasks_day_after_date = str(log.tasks_day_after_date);
  out.blockers = str(log.blockers);
  const reason = str(log.client_photo_skip_reason);
  out.client_photo_skip_reason = CLIENT_PHOTO_SKIP_REASONS.some((r) => r.value === reason)
    ? (reason as ClientPhotoSkipReason)
    : null;
  return out;
}
