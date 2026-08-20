/**
 * M9 R17 — the client access states, in ONE place, reachable from both sides.
 *
 * ⚠️ NO `server-only` HERE, AND THAT IS THE WHOLE REASON THE FILE EXISTS.
 * `client-portal.ts` is server-only (it writes through the caller's session and
 * must never be bundled). Stage 4's dashboard control is a `'use client'`
 * component that needs the same four state values and the same four words for
 * them. Importing the server module from a client component is a build error;
 * retyping the list in the component is worse, because it builds.
 *
 * Same shape as `invoices-shared.ts` and `invoice-delivery-shared.ts`, and the
 * same reason CLAUDE.md's PARITY rule gives: *"share the mechanism, not just
 * the intent. A second implementation that 'does the same thing' IS the
 * divergence, written in a form that looks like agreement."*
 *
 * ⚠️ `CLIENT_ACCESS_STATES` MIRRORS A CHECK CONSTRAINT —
 * `profiles_client_access_state_check` in `20261017000000`. If a fifth state is
 * ever ruled, the constraint is the authority and this list follows it, not the
 * other way round.
 */

/** R17's three termination states, plus the default. */
export const CLIENT_ACCESS_STATES = [
  'active',
  'deactivated',
  'signed_documents_only',
  'documents_for_signature',
] as const;

export type ClientAccessState = (typeof CLIENT_ACCESS_STATES)[number];

/**
 * Human labels, so the three states read the way R17 words them.
 *
 * They are deliberately long. "Documents sent for signature, signed or not" is
 * a mouthful and it is the ruling's own sentence — an Owner choosing between
 * these is making a decision a lawyer may later ask about, and a terse label
 * ("Limited") would leave them guessing which limit they picked.
 */
export const CLIENT_ACCESS_STATE_LABELS: Record<ClientAccessState, string> = {
  active: 'Full portal access',
  deactivated: 'Fully deactivated',
  signed_documents_only: 'Signed documents only',
  documents_for_signature: 'Documents sent for signature, signed or not',
};

/**
 * One row of the dashboard's portal panel.
 *
 * ⚠️ A CONTACT WITH NO ACCOUNT AND A CONTACT WITH A DEACTIVATED ACCOUNT ARE NOT
 * THE SAME ROW, AND THE SCREEN MUST NOT OFFER THE SAME BUTTON FOR BOTH.
 * `inviteClientToPortal()` already refuses the second case with a sentence that
 * names the remedy — *"change their access state to restore it rather than
 * sending a new invite"* — but a screen that offers "Invite" and then explains
 * why it did not work is a screen that wasted the click.
 */
export interface PortalAccountRow {
  contactId: string;
  contactName: string;
  email: string | null;
  /** Null when this contact has never been given an account. */
  profileId: string | null;
  state: ClientAccessState | null;
}
