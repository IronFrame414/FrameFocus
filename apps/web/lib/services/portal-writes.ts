import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  completeCoSignature,
  createCoSigningSession,
  type CompleteCoSignatureParams,
} from '@/lib/services/co-signing-service';
import { resolveThread } from '@/lib/chat/threads';
import { insertMessage } from '@/lib/chat/messages';
import { attachPhotos } from '@/lib/chat/photos';

/**
 * Module 9 stage 5 — the three things a client may write.
 *
 * ===========================================================================
 * ⚠️ THE SERVICE ROLE APPEARS HERE, AND ONLY FOR ONE THING
 * ===========================================================================
 * `portal.ts` contains no service-role client at all and a probe asserts it.
 * This file is the exception, and the exception is narrow enough to state in a
 * sentence: **`co_signing_sessions` has no write policies for anybody.** The
 * token IS the credential (5D §6), which is why `createCoSigningSession` and
 * `completeCoSignature` have always taken the admin client — the public signing
 * page has no `auth.uid()` to run as.
 *
 * So the portal signature reaches the same write the same way. What it does NOT
 * do is use the service role to decide WHETHER she may sign:
 *
 *   `assertClientMayActOn()` reads the change order through **her** client, so
 *   `change_orders_select_client` is the authorisation. A CO she cannot read is
 *   a CO she cannot sign, and that decision is made by RLS before the admin
 *   client is touched.
 *
 * Everything else in this file — the thread, the message, the photo, the `files`
 * row — is written as the caller, because those tables DO have client arms.
 */

export interface PortalWriteResult {
  success: boolean;
  error?: string;
  id?: string;
}

/**
 * The gate, and it is one function so it cannot be applied inconsistently.
 *
 * Returns the change order only if HER OWN session can read it in a signable
 * state. `20261019000000`'s `change_orders_select_client` already excludes
 * drafts and anything outside her projects, and R17 empties it entirely for a
 * `signed_documents_only` client — so "can she read it" is the whole question.
 */
async function readSignableCo(
  supabase: SupabaseClient<Database>,
  changeOrderId: string
): Promise<
  | { ok: true; co: { id: string; company_id: string; status: string } }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('change_orders')
    .select('id, company_id, status')
    .eq('id', changeOrderId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  // CLAUDE.md: a permission failure never falls through to a "not found" path.
  // From her side this genuinely is not-found — RLS means the row does not
  // exist for her — and saying more would report the existence of rows she
  // cannot see.
  if (!data) return { ok: false, error: 'That change order could not be found.' };

  const co = data as { id: string; company_id: string; status: string };
  if (co.status !== 'sent') {
    return { ok: false, error: 'This change order is no longer awaiting signature.' };
  }
  return { ok: true, co };
}

/**
 * R10/R13 — sign a change order from the portal.
 *
 * ⚠️ IT CALLS `completeCoSignature`. It does not reimplement any part of it.
 * That function composites the v2 PDF, flips the CO, writes its budget lines
 * through `apply_change_order_budget`, notifies the office in-app and emails
 * both parties. A portal-specific "simpler" version would omit some of that and
 * the omission would be invisible — a signed CO with no budget lines looks
 * exactly like a signed CO until somebody opens the budget screen.
 *
 * R13 — "either client contact can sign; there is no designated signer" — is
 * expressed by there being no signer check here at all. Any client who can read
 * the CO can sign it.
 */
export async function signChangeOrderFromPortal(
  supabase: SupabaseClient<Database>,
  params: {
    changeOrderId: string;
    profileId: string;
    contactEmail: string | null;
    signature: Omit<CompleteCoSignatureParams, 'caller'>;
  }
): Promise<PortalWriteResult> {
  const gate = await readSignableCo(supabase, params.changeOrderId);
  if (!gate.ok) return { success: false, error: gate.error };

  const admin = getSupabaseAdmin() as SupabaseClient<Database>;

  // A CO sent by email already has a pending session; one surfaced only in the
  // portal may not. Rather than branch the WRITE on which surface created the
  // session, the portal creates the missing one and then takes the identical
  // path — so `completeCoSignature` sees the same shape either way.
  const { data: existing } = await admin
    .from('co_signing_sessions')
    .select('token, expires_at')
    .eq('change_order_id', gate.co.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let token = (existing as { token: string; expires_at: string } | null)?.token ?? null;
  const stillValid =
    !!existing &&
    new Date((existing as { expires_at: string }).expires_at).getTime() > Date.now();

  if (!token || !stillValid) {
    // 30 days, matching what the send route gives an emailed link. Not a new
    // number: a portal session that expired sooner than the email would make
    // the two surfaces disagree about whether a CO is still signable.
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const created = await createCoSigningSession(admin, {
      companyId: gate.co.company_id,
      changeOrderId: gate.co.id,
      recipientEmail: params.contactEmail,
      recipientName: params.signature.signerName,
      expiresAt,
    });
    if (created.error || !created.token) {
      return { success: false, error: created.error ?? 'Could not start the signing session.' };
    }
    token = created.token;
  }

  const result = await completeCoSignature(admin, token, {
    ...params.signature,
    // Q6 — this is the half that makes the shared write path safe to share.
    caller: { kind: 'portal_session', profileId: params.profileId },
  });

  return result.success
    ? { success: true, id: gate.co.id }
    : { success: false, error: result.error };
}

/**
 * R11 — a photo, a note, or a question. **One message, N photos.**
 *
 * ⚠️ "PHOTO AND NOTE STAY TIED TOGETHER — ONE UNIT, NOT TWO RECORDS." That is
 * §7.2's wording and it is the reason this posts ONE `chat_messages` row and
 * hangs the photo references off it, rather than writing a photo record and a
 * note record that a later reader has to correlate by timestamp.
 *
 * The file rows and their objects are uploaded by the caller BEFORE this runs
 * (see `/api/portal/messages`), because `attachPhotos()` references `files`
 * rows and has never had an upload path of its own — chat-spec A-C18 asserts
 * that absence deliberately, and this must not be the thing that introduces one.
 */
export async function postClientMessage(
  supabase: SupabaseClient<Database>,
  params: {
    projectId: string;
    profileId: string;
    body: string;
    fileIds: string[];
  }
): Promise<PortalWriteResult> {
  const body = params.body.trim();
  // A message with neither words nor a picture is not a question.
  if (!body && params.fileIds.length === 0) {
    return { success: false, error: 'Add a note or a photo before sending.' };
  }

  // Created lazily on first use, as `resolveThread` does for every other kind.
  // Null means RLS refused — a real answer, not a fault: a client whose access
  // has ended, or who is not on this project, gets nothing.
  const thread = await resolveThread(supabase, params.projectId, 'client');
  if (!thread) {
    return { success: false, error: 'You cannot post to this project.' };
  }

  const sent = await insertMessage(supabase, {
    threadId: thread.id,
    authorProfileId: params.profileId,
    // The body may be empty when she sends only a photo; the column is not
    // nullable, so an empty string is the honest value.
    body,
  });
  if (!sent.success || !sent.id) {
    return { success: false, error: sent.error ?? 'Could not post your message.' };
  }

  if (params.fileIds.length > 0) {
    // ⚠️ NOT `eligiblePhotoIds()`. That helper filters to photos the CALLER can
    // already read, which is right for the staff picker — it points at the
    // existing gallery. These files were created by this same request and are
    // hers by construction; the category and visibility are enforced by
    // `files_insert_client`'s WITH CHECK, at the point of insert, which is a
    // stronger guarantee than a re-read.
    const attached = await attachPhotos(supabase, sent.id, params.fileIds);
    if (attached.error) {
      // The message IS posted. Reporting a bare failure would invite her to
      // send it again and post it twice.
      return {
        success: true,
        id: sent.id,
        error: `Your message was posted, but the photo could not be attached: ${attached.error}`,
      };
    }
  }

  return { success: true, id: sent.id };
}
