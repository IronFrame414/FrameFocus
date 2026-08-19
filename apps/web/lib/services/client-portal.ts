import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { applied, DISCARDED } from '@/lib/services/mutation-result';

/**
 * Module 9 stage 2 — the client portal's invite path and its three termination
 * states.
 *
 * ===========================================================================
 * EVERY FUNCTION TAKES THE CALLER'S CLIENT. NEVER THE SERVICE ROLE.
 * ===========================================================================
 * Same contract as `assignments-server.ts`: `supabase` is the request-scoped
 * client carrying the signed-in user's JWT, so these writes run under exactly
 * the policies they would have run under as a client-direct call.
 *
 * That is load-bearing for R17 specifically. "Owner and Admin only" is enforced
 * by `profiles_update_owner` / `profiles_update_admin` — `profiles` has **no
 * self-update arm**, so a client cannot change her own state and neither can a
 * PM. Reaching for `getSupabaseAdmin()` here would delete that floor silently
 * and every test would still pass.
 */

/** R17's three states, plus the default. Mirrors the CHECK on the column. */
export const CLIENT_ACCESS_STATES = [
  'active',
  'deactivated',
  'signed_documents_only',
  'documents_for_signature',
] as const;

export type ClientAccessState = (typeof CLIENT_ACCESS_STATES)[number];

/** Human labels, so the three states read the way R17 words them. */
export const CLIENT_ACCESS_STATE_LABELS: Record<ClientAccessState, string> = {
  active: 'Full portal access',
  deactivated: 'Fully deactivated',
  signed_documents_only: 'Signed documents only',
  documents_for_signature: 'Documents sent for signature, signed or not',
};

export interface PortalInviteResult {
  success: boolean;
  invitationId?: string;
  token?: string;
  error?: string;
}

/**
 * Invite a contact to the client portal.
 *
 * ⚠️ THE EMAIL REFUSAL IS THE POINT OF THIS FUNCTION, not a validation detail.
 * `9-spec.md` §3 `§S.1`: `contacts.email` is nullable with no CHECK and **by
 * ruling it will never have one** [Josh, S154] — a lead with only a phone
 * number must still be savable. So "portal access requires an email" lands
 * HERE, at the point of use, and must name what is missing.
 *
 * The failure it prevents is not a crash. R1 makes the email the username, so
 * an invite sent for a contact with no email creates **an account that can
 * never be signed into** — which surfaces weeks later as "the portal is
 * broken", with nothing in the logs.
 *
 * ⚠️ DO NOT "FIX" THIS BY ADDING A CHECK CONSTRAINT OR A NOT NULL to
 * `contacts.email`. That was considered and rejected deliberately; a later
 * session tightening the schema here would be undoing a ruling.
 */
export async function inviteClientToPortal(
  supabase: SupabaseClient<Database>,
  params: { contactId: string; projectId: string; invitedBy: string }
): Promise<PortalInviteResult> {
  const { data: contactRow, error: cErr } = await supabase
    .from('contacts')
    .select('id, company_id, email, first_name, last_name, is_deleted')
    .eq('id', params.contactId)
    .maybeSingle();

  if (cErr) return { success: false, error: cErr.message };
  if (!contactRow) {
    // Not "no such contact" — RLS may simply be hiding it. Saying which would
    // report the existence of rows the caller cannot see.
    return { success: false, error: 'That contact could not be found.' };
  }
  const contact = contactRow as {
    id: string;
    company_id: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    is_deleted: boolean | null;
  };

  if (contact.is_deleted) {
    return { success: false, error: 'That contact is in the trash. Restore it before inviting them.' };
  }

  const email = contact.email?.trim();
  if (!email) {
    const who = `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() || 'this contact';
    return {
      success: false,
      error: `Add an email address for ${who} before inviting them to the portal. The portal sign-in name is their email address.`,
    };
  }

  // The invitation's project governs its lifetime (R2), so it must be a project
  // this contact is actually on. Inviting against an unrelated project would
  // hand the invite a clock that has nothing to do with their job — and it
  // would look correct until that other project completed.
  const { data: projectRow, error: pErr } = await supabase
    .from('projects')
    .select('id, contact_id, is_deleted')
    .eq('id', params.projectId)
    .maybeSingle();
  if (pErr) return { success: false, error: pErr.message };
  if (!projectRow) return { success: false, error: 'That project could not be found.' };
  const project = projectRow as { id: string; contact_id: string; is_deleted: boolean | null };
  if (project.is_deleted) {
    return { success: false, error: 'That project is in the trash.' };
  }

  let onProject = project.contact_id === contact.id;
  if (!onProject) {
    const { data: junction } = await supabase
      .from('project_contacts')
      .select('id')
      .eq('project_id', params.projectId)
      .eq('contact_id', params.contactId)
      .eq('is_deleted', false)
      .limit(1);
    onProject = (junction ?? []).length > 0;
  }
  if (!onProject) {
    return {
      success: false,
      error: 'Add this contact to the project before inviting them to its portal.',
    };
  }

  // Already has an account? `profiles.contact_id` is UNIQUE, so a second invite
  // would produce a signup that fails inside an auth trigger. Say so plainly
  // instead — and point at the remedy, which is R17's state, not a new invite.
  const { data: existing } = await supabase
    .from('profiles')
    .select('id, client_access_state')
    .eq('contact_id', params.contactId)
    .maybeSingle();
  if (existing) {
    const state = (existing as { client_access_state: string }).client_access_state;
    return {
      success: false,
      error:
        state === 'active'
          ? 'That contact already has a portal account.'
          : 'That contact already has a portal account. Change their access state to restore it rather than sending a new invite.',
    };
  }

  const { data, error } = await supabase
    .from('invitations')
    .insert({
      company_id: contact.company_id,
      email,
      role: 'client',
      invited_by: params.invitedBy,
      created_by: params.invitedBy,
      contact_id: params.contactId,
      project_id: params.projectId,
    })
    .select('id, token')
    .single();

  if (error) return { success: false, error: error.message };
  const row = data as { id: string; token: string };
  return { success: true, invitationId: row.id, token: row.token };
}

export interface AccessStateResult {
  success: boolean;
  error?: string;
}

/**
 * R17 — set a client's termination state, and record that it happened.
 *
 * ⚠️ THE EVENT ROW IS NOT OPTIONAL BOOKKEEPING. Josh's reason for R17 being
 * three states rather than a switch is that *"it survives a lawyer asking what
 * she had access to"*, and a current-state column cannot answer that question —
 * it answers what she has access to now. The log is the half that answers it.
 *
 * Written state-first, then logged: if the UPDATE is discarded by RLS there is
 * nothing to log, and a log row for a change that did not happen would be worse
 * than no log at all.
 */
export async function setClientAccessState(
  supabase: SupabaseClient<Database>,
  params: { profileId: string; state: ClientAccessState; reason?: string }
): Promise<AccessStateResult> {
  if (!CLIENT_ACCESS_STATES.includes(params.state)) {
    return { success: false, error: `Unknown access state: ${params.state}` };
  }

  const { data: before, error: bErr } = await supabase
    .from('profiles')
    .select('id, role, company_id, client_access_state')
    .eq('id', params.profileId)
    .maybeSingle();
  if (bErr) return { success: false, error: bErr.message };
  if (!before) return { success: false, error: 'That portal account could not be found.' };
  const prev = before as {
    role: string;
    company_id: string;
    client_access_state: ClientAccessState;
  };

  if (prev.role !== 'client') {
    return { success: false, error: 'Access states apply to client portal accounts only.' };
  }
  if (prev.client_access_state === params.state) {
    return { success: true }; // already there; no event, because nothing changed
  }

  // UPDATE-shaped write: `.select('id')` + `applied()`. A zero-row UPDATE is
  // not an error in Postgres, so `error === null` alone would report success
  // over a row RLS refused — which for R17 means telling an Admin they had
  // revoked someone's access when they had not.
  const { data: updated, error: uErr } = await supabase
    .from('profiles')
    .update({ client_access_state: params.state })
    .eq('id', params.profileId)
    .select('id');
  if (uErr) return { success: false, error: uErr.message };
  if (!applied(updated)) return { success: false, error: DISCARDED };

  const { error: logErr } = await supabase.from('client_access_events').insert({
    company_id: prev.company_id,
    profile_id: params.profileId,
    from_state: prev.client_access_state,
    to_state: params.state,
    reason: params.reason ?? null,
  });
  if (logErr) {
    // The state HAS changed at this point. Surfacing a generic success would
    // hide a gap in the very record R17 exists to produce.
    return {
      success: false,
      error: `Access was changed, but the audit record failed to write: ${logErr.message}`,
    };
  }

  return { success: true };
}

export interface ClientAccessEvent {
  id: string;
  from_state: string;
  to_state: string;
  reason: string | null;
  created_at: string | null;
  actor_id: string | null;
}

/** The R17 trail for one portal account, newest first. Owner/Admin by RLS. */
export async function getClientAccessEvents(
  supabase: SupabaseClient<Database>,
  profileId: string
): Promise<ClientAccessEvent[]> {
  const { data, error } = await supabase
    .from('client_access_events')
    .select('id, from_state, to_state, reason, created_at, actor_id')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as ClientAccessEvent[];
}
