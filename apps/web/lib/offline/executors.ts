import type { SupabaseClient } from '@supabase/supabase-js';
import type { QueueEntry } from './queue';
import type { Executors } from './sync';

// M6M §5 — the REAL executors: the sync engine's seam bound to supabase-js.
//
// Built against an INJECTED client rather than importing supabase-browser, so
// the [live] harness can hand it a node-side client with a real member JWT and
// prove the replay against rebuild-test — the same code path the browser runs.

const TABLE: Record<string, string> = {
  time_clock_session: 'time_clock_sessions',
  time_segment: 'time_segments',
  daily_log: 'daily_logs',
};

export function makeExecutors(
  supabase: SupabaseClient,
  deps: {
    /**
     * §5.5.3 / A-20d — the photo path IS uploadFile: HEIC conversion, size
     * gate, storage path convention and the files row all live there. A raw
     * bucket PUT here would silently reopen #94. Injected so the live harness
     * (node — no File/DOM) can substitute a compatible uploader while the
     * browser passes the real one.
     */
    uploadPhoto: (payload: {
      blob: Blob;
      file_name: string;
      project_id: string;
      id: string;
      daily_log_id: string | null;
    }) => Promise<{ success: boolean; error?: string }>;
  }
): Executors {
  return {
    async insert(entry: QueueEntry) {
      const table = TABLE[entry.entity];
      // §5.3 — IDEMPOTENT UPSERT ON THE PRIMARY KEY. The payload carries the
      // client-generated id (D-7), so replaying N times lands one row (A-16).
      //
      // `ignoreDuplicates: true` — ON CONFLICT DO NOTHING, not DO UPDATE, and
      // the choice is load-bearing: a replay is byte-identical by definition,
      // and the DO UPDATE arm would run as an UPDATE through the 6A-1/6A-2
      // column-scope triggers, which refuse edits to columns outside the
      // self-allowlist even when the values are unchanged. DO NOTHING gives
      // exactly A-16's semantics with no trigger friction.
      const { data, error } = await supabase
        .from(table)
        .upsert(entry.payload as never, { onConflict: 'id', ignoreDuplicates: true })
        .select('updated_at')
        .maybeSingle();
      if (error) throw new Error(error.message);
      // Null on the replay of an already-landed row — the first landing did
      // the rebase, so nothing is lost.
      return { updated_at: (data as { updated_at?: string } | null)?.updated_at ?? null };
    },

    async update(entry: QueueEntry) {
      const table = TABLE[entry.entity];
      const { error } = await supabase
        .from(table)
        .update(entry.payload as never)
        .eq('id', entry.target_id);
      if (error) throw new Error(error.message);
    },

    async readUpdatedAt(entry: QueueEntry) {
      const table = TABLE[entry.entity];
      const { data, error } = await supabase
        .from(table)
        .select('updated_at')
        .eq('id', entry.target_id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as { updated_at?: string } | null)?.updated_at ?? null;
    },

    async recordConflict(entry: QueueEntry, serverUpdatedAt) {
      // The queue strips what sync_conflicts does not store; the body is the
      // payload EXACTLY as the online path would have sent it (§5.7).
      const { data: memberId } = await supabase.rpc('get_my_member_id');

      // ---------------------------------------------------------------
      // A-19j — NO `.select()` CHAINED ONTO THIS INSERT. The author can
      // INSERT their conflict row but CANNOT SELECT it back (Owner/Admin
      // read floor) — and Postgres refuses INSERT … RETURNING when the new
      // row fails the SELECT policy, ROLLING THE WRITE BACK entirely
      // (observed on rebuild-test, S105). A chained `.select()` would not
      // merely misreport this write; it would destroy it — the same
      // error-far-from-cause trap as the storage-policy helper.
      // ---------------------------------------------------------------
      const { error } = await supabase.from('sync_conflicts').insert({
        target_table: TABLE[entry.entity],
        target_row_id: entry.target_id,
        project_id: (entry.payload.project_id as string | undefined) ?? null,
        rejected_body: entry.payload,
        captured_at: entry.captured_at,
        author_member_id: memberId,
        server_updated_at: serverUpdatedAt,
      } as never);
      if (error) throw new Error(error.message);
    },

    async uploadPhoto(entry: QueueEntry) {
      const p = entry.payload as {
        blob: Blob;
        file_name: string;
        project_id: string;
        id: string;
        daily_log_id: string | null;
      };
      const result = await deps.uploadPhoto(p);
      if (!result.success) throw new Error(result.error ?? 'photo upload failed');
    },
  };
}
