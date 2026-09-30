import type { Database } from '@framefocus/shared/types/database';
import type { MsgKey } from '@/lib/i18n/messages';

// S118 item 11 — the material sign-out (WP_Material_Signout_Form), shared by
// /m and /dashboard (PARITY: one set of rules, one set of words). The database
// decides every state change (record_material_signout_receipt /
// close_material_signout re-check role, project and state); the helpers here
// decide only what renders.

type Row = Database['public']['Tables']['material_signouts']['Row'];

export type SignoutStatus = 'pending_receipt' | 'open' | 'returned' | 'damaged_on_return' | 'not_returned';
export type ReleaseCondition = 'undamaged' | 'minor_damage' | 'pre_existing_damage';
export type ReturnCondition = 'same_as_released' | 'damage_occurred' | 'not_returned';
/** [S121 3-F] + 'return_location': the photo of WHERE the material was put. */
export type PhotoStage = 'release' | 'return' | 'return_location';
/** [S121 ASK-28] Why material did not come back — the DB CHECK, verbatim. */
export type NotReturnedReason = 'consumed' | 'installed' | 'lost' | 'still_out';
export const NOT_RETURNED_REASONS: readonly NotReturnedReason[] = ['consumed', 'installed', 'lost', 'still_out'];
export const NOT_RETURNED_REASON_KEY: Record<NotReturnedReason, MsgKey> = {
  consumed: 'signout.reason.consumed',
  installed: 'signout.reason.installed',
  lost: 'signout.reason.lost',
  still_out: 'signout.reason.still_out',
};
/** [S121] The return evidence is required exactly when the material came back. */
export function returnCameBack(c: ReturnCondition): boolean {
  return c === 'same_as_released' || c === 'damage_occurred';
}
/** [S121 3-A, RULED ASK-27] "Open" jobs for the sign-out picker. */
export const SIGNOUT_OPEN_PROJECT_STATUSES = ['active', 'on_hold'] as const;

/** The generator emits `string` for CHECK columns; restore the literal unions. */
export type MaterialSignout = Omit<
  Row,
  | 'status'
  | 'condition_at_release'
  | 'condition_at_return'
  | 'released_signature_type'
  | 'receiver_signature_type'
  | 'return_signature_type'
  | 'not_returned_reason'
> & {
  not_returned_reason: NotReturnedReason | null;
  status: SignoutStatus;
  condition_at_release: ReleaseCondition;
  condition_at_return: ReturnCondition | null;
  released_signature_type: 'draw' | 'type';
  receiver_signature_type: 'draw' | 'type' | null;
  return_signature_type: 'draw' | 'type' | null;
};

/**
 * ⚠️ VERBATIM from the paper form, and the SAME text the database stores
 * (record_material_signout_receipt's c_ack — test/s118-material-signouts.live.ts
 * reads the stored value back and compares). Never translated: it is what the
 * external party attests to, and the record must say exactly that.
 */
export const RECEIPT_ACKNOWLEDGEMENT =
  'By signing above, the receiving party acknowledges responsibility for the listed material while in their possession and agrees to return it in the same or better condition.';

/** Closes a sign-out (the return section). Creating one is any staff role. */
export const SIGNOUT_OFFICE_ROLES: readonly string[] = ['owner', 'admin', 'project_manager', 'project_executive'];

export function canCloseSignout(role: string | null | undefined): boolean {
  return typeof role === 'string' && SIGNOUT_OFFICE_ROLES.includes(role);
}

export const RELEASE_CONDITIONS: readonly ReleaseCondition[] = ['undamaged', 'minor_damage', 'pre_existing_damage'];
export const RETURN_CONDITIONS: readonly ReturnCondition[] = ['same_as_released', 'damage_occurred', 'not_returned'];

export const RELEASE_CONDITION_KEY: Record<ReleaseCondition, MsgKey> = {
  undamaged: 'signout.cond.undamaged',
  minor_damage: 'signout.cond.minor_damage',
  pre_existing_damage: 'signout.cond.pre_existing_damage',
};

export const RETURN_CONDITION_KEY: Record<ReturnCondition, MsgKey> = {
  same_as_released: 'signout.ret.same_as_released',
  damage_occurred: 'signout.ret.damage_occurred',
  not_returned: 'signout.ret.not_returned',
};

export const STATUS_KEY: Record<SignoutStatus, MsgKey> = {
  pending_receipt: 'signout.status.pending_receipt',
  open: 'signout.status.open',
  returned: 'signout.status.returned',
  damaged_on_return: 'signout.status.damaged_on_return',
  not_returned: 'signout.status.not_returned',
};

/**
 * OVERDUE is derived, never stored: open, and the expected return date is
 * before the company's today (`todayYmd`, the caller's company-timezone date).
 * A pending record is not overdue — it has not left yet.
 */
export function isOverdue(s: Pick<MaterialSignout, 'status' | 'expected_return_date'>, todayYmd: string): boolean {
  return s.status === 'open' && s.expected_return_date < todayYmd;
}

/** Needs someone: awaiting the receiver's signature, or out. Shown on the Field tab. */
export function isActive(s: Pick<MaterialSignout, 'status'>): boolean {
  return s.status === 'pending_receipt' || s.status === 'open';
}

export interface SignoutCreateInput {
  project_id: string;
  job_address: string | null;
  job_name: string;
  signout_date: string;
  material_type: string;
  color_pattern: string | null;
  manufacturer: string | null;
  model_sku: string | null;
  item_number: string | null;
  quantity: string;
  dimensions: string | null;
  condition_at_release: ReleaseCondition;
  condition_notes: string | null;
  work_to_be_performed: string | null;
  expected_return_date: string;
  return_location: string | null;
  receiver_company: string;
  receiver_contact_name: string | null;
  receiver_phone: string | null;
  receiver_driver_name: string | null;
  // [S121 3-B] `receiver_vehicle` is no longer sent: the input is removed. The
  // COLUMN stays (production: 1 row, 0 values — S121 §1.4); nothing is dropped.
  /** [S121 3-C] Sent for the column's NOT NULL, but IGNORED: the database
   *  stores the caller's own profile name (trigger
   *  material_signouts_released_signer_is_caller). */
  released_signer_name: string;
  // [S121 3-C] `released_title` ("Your title") is removed from the form.
  released_signature_type: 'draw' | 'type';
  released_signature_data: string;
}

/** Blank strings become null; required fields are checked by the form AND the table. */
export function blankToNull(v: string): string | null {
  const t = v.trim();
  return t === '' ? null : t;
}
