import { isOwnerOnlyGrant } from '@framefocus/shared';

/**
 * Who may edit, remove or restore a team member's LOGIN. Desktop Team and `/m`
 * Team both call this, so the rule has one home.
 *
 * ⚠️ [S127] MOVED HERE from `app/dashboard/team/[id]/actions.ts`, unchanged.
 * `/m`'s Active/Inactive toggle now removes and restores the person through the
 * same mechanism as desktop Remove, and that mechanism carries this rule. A copy
 * in `app/m/` would be the second implementation PARITY forbids.
 */
export function assertCanEditTeamMember(
  callerRole: string,
  callerProfileId: string,
  targetProfileId: string,
  targetRole: string
): void {
  if (callerProfileId === targetProfileId) {
    // Backstop for the UI pointer in page.tsx: your own name is edited on the
    // Account page (/dashboard/account), never here. Blocking self-edit in Team
    // keeps a single save path for your name (parity ruling S122).
    throw new Error('Edit your own name from your Account page, not from Team.');
  }
  if (callerRole === 'owner') return;
  if (callerRole === 'admin') {
    // [S111 Q11] owner, admin AND project_executive — OWNER_ONLY_GRANT_ROLES.
    if (isOwnerOnlyGrant(targetRole)) {
      throw new Error('Admins cannot edit Owners, Admins or Project Executives');
    }
    return;
  }
  throw new Error('Insufficient permissions');
}
