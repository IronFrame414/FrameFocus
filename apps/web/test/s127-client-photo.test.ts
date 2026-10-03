import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CLIENT_PHOTO_SKIP_REASONS,
  clientPhotoSatisfied,
  closeoutFromLog,
  emptyCloseout,
} from '@/lib/daily-logs/closeout';
import { buildPhotoEntry } from '@/lib/offline/capture';

// ============================================================================
// S127 item 5a — the client-facing photo, or a stated reason.
// ============================================================================

const SQL = readFileSync(
  fileURLToPath(
    new URL(
      '../../../supabase/migrations/20262134300000_s127_daily_log_client_photo.sql',
      import.meta.url
    )
  ),
  'utf8'
);

describe('S127 5a — the gate', () => {
  it('a photo OR a reason; neither blocks; more than one photo is fine (no cap)', () => {
    expect(clientPhotoSatisfied(0, null)).toBe(false);
    expect(clientPhotoSatisfied(1, null)).toBe(true);
    expect(clientPhotoSatisfied(7, null)).toBe(true);
    expect(clientPhotoSatisfied(0, 'weather')).toBe(true);
  });

  it('the four reasons, exactly — the same list the migration CHECK allows', () => {
    const values = CLIENT_PHOTO_SKIP_REASONS.map((r) => r.value);
    expect(values).toEqual(['inspection_day', 'weather', 'no_site_access', 'no_visible_progress']);
    const check = SQL.match(/client_photo_skip_reason IN \(([^)]*)\)/)![1];
    expect([...check.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])).toEqual(values);
  });

  it('a stored log round-trips its reason; an unknown value is not trusted', () => {
    expect(emptyCloseout().client_photo_skip_reason).toBeNull();
    expect(
      closeoutFromLog({ client_photo_skip_reason: 'no_site_access' }).client_photo_skip_reason
    ).toBe('no_site_access');
    expect(
      closeoutFromLog({ client_photo_skip_reason: 'bogus' }).client_photo_skip_reason
    ).toBeNull();
  });
});

describe('S127 5a — the migration', () => {
  it('adds ONE nullable column with no default, and drops nothing (box C keeps its live data)', () => {
    expect(SQL.match(/ADD COLUMN [^;]+/g)).toEqual(['ADD COLUMN client_photo_skip_reason text']);
    expect(SQL).not.toMatch(/DROP COLUMN/i);
    expect(SQL.match(/^\s*UPDATE\s/gim)).toBeNull();
  });
});

describe('S127 5a — offline, the client-facing flag rides the queued photo', () => {
  it('a client-facing photo entry carries client_visible; an ordinary one does not', () => {
    const base = {
      entryId: 'e',
      fileId: 'f',
      projectId: 'p',
      blob: new Blob(['x']),
      fileName: 'a.jpg',
      captured_at: 'now',
      dependsOn: 'log-entry',
      dailyLogId: 'log',
    };
    expect(buildPhotoEntry({ ...base, clientVisible: true }).payload).toMatchObject({
      client_visible: true,
    });
    expect(buildPhotoEntry(base).payload).not.toHaveProperty('client_visible');
  });
});

describe('S127 5a (fixed after merge) — ONE mechanism sets the flag, on every surface', () => {
  // `client_visible` is Owner/Admin only in the database, so a caller-client
  // write of it fails for the foremen and crew who write logs. The live proof is
  // test/s127-client-photo-share.live.ts; this pins that no surface goes back
  // to writing the flag itself.
  const src = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
  const CLIENT = src('../lib/services/daily-logs-client.ts');
  const OFFLINE = src('../app/m/offline-sync.tsx');
  const code = (s: string) => s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

  it('the desktop link and the /m online upload both go through markLogPhotoClientFacing', () => {
    const body = (name: string) => {
      const at = CLIENT.indexOf(`export async function ${name}(`);
      return code(CLIENT.slice(at, CLIENT.indexOf('\n}\n', at)));
    };
    expect(body('linkClientFacingLogPhoto')).toContain('markLogPhotoClientFacing(');
    expect(body('uploadClientFacingLogPhoto')).toContain('markLogPhotoClientFacing(');
    expect(body('markLogPhotoClientFacing')).toContain("'/api/daily-logs/client-photo'");
  });

  it('the /m offline queue goes through it too', () => {
    expect(code(OFFLINE)).toContain('markLogPhotoClientFacing(uploaded.id, payload.daily_log_id)');
  });

  it('no client code writes client_visible = true through its own client', () => {
    for (const [name, s] of [
      ['daily-logs-client.ts', CLIENT],
      ['offline-sync.tsx', OFFLINE],
    ] as const) {
      expect(code(s), name).not.toMatch(/client_visible:\s*true/);
    }
  });
});
