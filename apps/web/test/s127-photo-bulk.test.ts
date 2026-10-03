import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { CompanyRole } from '@framefocus/shared/types/roles';
import { forEveryRole, JUNK_ROLES } from '@/test-support/role-matrix';
import {
  canBulkDeletePhotos,
  canDeletePhoto,
  canSharePhotosWithClient,
} from '@/lib/photos/delete-permission';

// ============================================================================
// S127 item 4d (A-1) — bulk actions on a SELECTION of photos. TOTAL maps.
//
// RULED A-1a [Josh, 2026-10-02, option A]: bulk delete is OWNER/ADMIN ONLY,
// SOFT, recoverable — narrower than one-photo delete (Owner/Admin/PM/PE) on
// purpose. "Show to client" is Owner/Admin because the database refuses
// `client_visible` to everyone else (enforce_files_column_scope).
// ============================================================================

const OWNER_ADMIN: Record<CompanyRole, boolean> = {
  owner: true,
  admin: true,
  project_executive: false,
  project_manager: false,
  foreman: false,
  crew_member: false,
  client: false,
  subcontractor: false,
};

describe('canBulkDeletePhotos — the multi-select "Delete" / "Move to Trash"', () => {
  forEveryRole(OWNER_ADMIN, (role, allowed) => {
    it(`${role} → ${allowed ? 'offered' : 'not offered'}`, () => {
      expect(canBulkDeletePhotos(role)).toBe(allowed);
    });
  });
  it('fails closed on anything that is not a role', () => {
    for (const junk of [...JUNK_ROLES, null, undefined])
      expect(canBulkDeletePhotos(junk)).toBe(false);
  });
  it('is NARROWER than one-photo delete: a PM and a PE keep single delete, lose bulk', () => {
    for (const role of ['project_manager', 'project_executive'] as const) {
      expect(canDeletePhoto(role)).toBe(true);
      expect(canBulkDeletePhotos(role)).toBe(false);
    }
  });
});

describe('canSharePhotosWithClient — the multi-select "Show to client"', () => {
  forEveryRole(OWNER_ADMIN, (role, allowed) => {
    it(`${role} → ${allowed ? 'offered' : 'not offered'}`, () => {
      expect(canSharePhotosWithClient(role)).toBe(allowed);
    });
  });
  it('fails closed on anything that is not a role', () => {
    for (const junk of [...JUNK_ROLES, null, undefined])
      expect(canSharePhotosWithClient(junk)).toBe(false);
  });
});

describe('ONE mechanism, both surfaces [PARITY]', () => {
  const src = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
  const M_GRID = src('../app/m/p/[projectId]/photos/photo-grid.tsx');
  const M_PAGE = src('../app/m/p/[projectId]/photos/page.tsx');
  const D_SEL = src('../app/dashboard/projects/[id]/photos/photo-selection.tsx');
  const D_PAGE = src('../app/dashboard/projects/[id]/photos/page.tsx');

  it('both selection bars write through lib/photos/bulk-actions', () => {
    for (const [name, s] of [
      ['/m grid', M_GRID],
      ['desktop selection', D_SEL],
    ] as const) {
      expect(s, name).toContain("from '@/lib/photos/bulk-actions'");
      expect(s, name).toContain('trashPhotos(');
      expect(s, name).toContain('setPhotosClientVisible(');
      expect(s, name).not.toContain('softDeleteFile(');
    }
  });

  it('both pages gate the bulk controls on the Owner/Admin rules, not canDeletePhoto', () => {
    for (const [name, s] of [
      ['/m page', M_PAGE],
      ['desktop page', D_PAGE],
    ] as const) {
      expect(s, name).toContain('canBulkDeletePhotos(profile?.role)');
      expect(s, name).toContain('canSharePhotosWithClient(profile?.role)');
    }
    expect(M_PAGE).not.toMatch(/<PhotoGrid[^>]*canDelete=\{canDelete\}/);
  });

  it('both confirmations say where deleted photos go and who will not see shared ones', () => {
    expect(D_SEL).toContain('Photos → Trash');
    expect(D_SEL).toContain('a documents-only client sees');
    expect(M_GRID).toContain("t('photos.grid.deleteToTrash')");
    expect(M_GRID).toContain("t('photos.grid.clientCaveat')");
  });
});
