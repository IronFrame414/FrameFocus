import { getOpenSession, getSessions, getSessionSegments } from '@/lib/services/time-tracking';
import { getProjects } from '@/lib/services/projects';
import { getMyMember } from '@/lib/services/members';
import { getMyProfile } from '@/lib/services/profiles';
import type { TimeSegment } from '@/lib/services/time-tracking';
import { TimeclockScreen, type PickerProject } from './timeclock-screen';

// M6M §4.5 / §4.5a / §4.12.1 — M-5 · Timeclock. Tab slot 2; sign-in lands here
// (D-12).
//
// This page is the SERVER HALF: it reads the open session, today's segments and
// the visible projects, and hands them to the client screen where the D-27
// interaction lives. Every read goes through the service layer.
//
// ---------------------------------------------------------------------------
// ⚠️ NEAREST-FIRST IS UNBINDABLE TODAY, AND THIS IS FLAGGED, NOT FUDGED.
// ---------------------------------------------------------------------------
// D-33 orders the project list by proximity — but distance needs two ends, and
// NO PROJECT COORDINATE EXISTS ANYWHERE IN THE SCHEMA (verified: `projects`
// carries no lat/lng, and `contact_addresses` is street/city/state/zip only).
// §4.13's binding rule — "bound to a named service function, or CUT; nothing is
// derived to fill a gap" — therefore cuts the proximity sort until a ruling
// says what distance is measured TO. Deriving a project position from past
// clock-in fixes would be exactly the invented derivation the rule forbids.
//
// What renders instead is D-44's fallback order — RECENTLY-USED first (the
// named function getMyRecentProjectIds(), A-7l3), never-worked projects after,
// alphabetical — which D-44 already required to be the order "when no fix
// exists". Today that is every render. The "Here" chip is likewise not
// rendered: with no distance there is no "you appear to be at this one".
// D-33's OTHER half — nothing preselected, a tap always required — is fully in
// force (A-7l).

export default async function MobileTimeclockPage() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [openSession, projects, todaySessions, me, profile] = await Promise.all([
    getOpenSession(),
    getProjects({ status: 'active' }),
    getSessions({ from: todayStart.toISOString() }),
    getMyMember(),
    // The role rides to the client so an OFFLINE clock-in can queue the right
    // approval status without an rpc it cannot make: owner sessions carry NO
    // approval state (6A §8), everyone else defaults to 'pending'.
    getMyProfile(),
  ]);

  // Today's segments (§4.5's list): the caller's OWN sessions only. getSessions
  // is RLS-scoped, but the rank ladder shows a supervisor their subordinates'
  // rows too — and M-5's list is about the caller's own day, not the crew's.
  const ownSessions = todaySessions.filter((s) => me && s.member_id === me.id);

  const segmentLists = await Promise.all(ownSessions.map((s) => getSessionSegments(s.id)));
  const todaySegments: TimeSegment[] = segmentLists
    .flat()
    .sort((a, b) => (a.segment_start < b.segment_start ? -1 : 1));

  const picker: PickerProject[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    project_number: p.project_number,
  }));

  return (
    <TimeclockScreen
      openSession={openSession}
      projects={picker}
      todaySegments={todaySegments}
      isOwner={profile?.role === 'owner'}
    />
  );
}
