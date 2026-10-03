import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// S127 item 5a, FIXED AFTER MERGE — marking a daily-log photo CLIENT-FACING.
//
// ⚠️ WHY THIS IS A SERVER MECHANISM. `client_visible` is Owner/Admin only in the
// database: `enforce_files_column_scope` raises "client_visible is Owner/Admin
// only." on any other role's UPDATE, and `files_insert_non_client` refuses
// `client_visible = true` on their INSERT. 5a first set the flag through the
// CALLER's client, so for the foremen and crew who write the logs — the people
// the slot is for — every client-facing photo failed. Ruling #4 ("a dedicated
// photo slot … a crew member must never be unsure which pictures the client can
// see") puts the choice in the log author's hands, so the flag is set here with
// the service role, the same admin write the selection-spec PDF service makes.
//
// ⚠️ NOT A WIDENING OF WHO MAY FLIP `client_visible` ON AN ARBITRARY FILE. This
// admits exactly one thing: the log's own author (or an Owner/Admin) sharing a
// photo THEY uploaded, linked to THAT log, on the same project. Every read that
// decides it goes through the CALLER's client, so RLS decides what they can see
// before the service role writes anything.
//
// One mechanism for every surface (PARITY): the desktop retry queue, the /m
// online path and the /m offline queue all reach it through
// `/api/daily-logs/client-photo`.
// ============================================================================

export type ClientPhotoShareResult =
  | { ok: true }
  | { ok: false; status: 401 | 403 | 404 | 409 | 500; error: string; cause: string };

export async function shareLogPhotoWithClient(args: {
  caller: SupabaseClient;
  admin: SupabaseClient;
  userId: string;
  fileId: string;
  logId: string;
}): Promise<ClientPhotoShareResult> {
  const { caller, admin, userId, fileId, logId } = args;

  const { data: profile } = await caller
    .from('profiles')
    .select('role')
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (!profile) {
    return { ok: false, status: 403, error: 'Not allowed.', cause: 'no live profile' };
  }
  const role = profile.role as string;
  const ownerAdmin = role === 'owner' || role === 'admin';

  const { data: log } = await caller
    .from('daily_logs')
    .select('id, project_id, author_member_id, is_deleted')
    .eq('id', logId)
    .maybeSingle();
  if (!log || log.is_deleted) {
    return {
      ok: false,
      status: 404,
      error: 'That daily log was not found.',
      cause: 'log not visible to caller',
    };
  }

  const { data: file } = await caller
    .from('files')
    .select('id, project_id, created_by, daily_log_id, mime_type, is_deleted')
    .eq('id', fileId)
    .maybeSingle();
  if (!file || file.is_deleted) {
    return {
      ok: false,
      status: 404,
      error: 'That photo was not found.',
      cause: 'file not visible to caller',
    };
  }
  if (!String(file.mime_type ?? '').startsWith('image/')) {
    return {
      ok: false,
      status: 409,
      error: 'Only a photo can be client-facing.',
      cause: `mime ${String(file.mime_type)}`,
    };
  }
  if (file.project_id !== log.project_id) {
    return {
      ok: false,
      status: 409,
      error: 'That photo is not on this log’s project.',
      cause: 'project mismatch',
    };
  }
  if (file.daily_log_id && file.daily_log_id !== logId) {
    return {
      ok: false,
      status: 409,
      error: 'That photo belongs to another log.',
      cause: 'linked to another log',
    };
  }

  if (!ownerAdmin) {
    // The log's UPDATE policy, restated: its author may change it.
    const { data: myMemberId } = await caller.rpc('get_my_member_id');
    if (!myMemberId || log.author_member_id !== myMemberId) {
      return {
        ok: false,
        status: 403,
        error: 'Only the log’s author can choose its client-facing photos.',
        cause: `role ${role}: not the log author`,
      };
    }
    if (file.created_by !== userId) {
      return {
        ok: false,
        status: 403,
        error: 'You can only share a photo you took.',
        cause: `role ${role}: not the uploader`,
      };
    }
  }

  const { data: updated, error } = await admin
    .from('files')
    .update({ daily_log_id: logId, client_visible: true })
    .eq('id', fileId)
    .eq('project_id', log.project_id)
    .select('id');
  if (error || (updated ?? []).length !== 1) {
    return {
      ok: false,
      status: 500,
      error: 'The photo was saved but not shared with the client.',
      cause: error?.message ?? `${(updated ?? []).length} rows`,
    };
  }
  return { ok: true };
}
