import { getProjects } from '@/lib/services/projects';
import { CaptureScreen, type CaptureProjectChoice } from './capture-screen';

// M6M §6 / §1 — `/m/capture`, "the camera action target".
//
// ===========================================================================
// THIS ROUTE DOES NOT OPEN THE CAMERA, AND CANNOT
// ===========================================================================
// §1 listed `capture/page.tsx` as the "camera action target", which reads as
// though the route opened the camera. §6's [S98] reconciliation is explicit
// that it does not: the camera is a FILE INPUT rendered in the tab bar, so
// tapping it navigates nowhere (A-21c2). What this route is for is everything
// that happens AFTER the shutter —
//
//   · the project prompt when there is no project in context (A-21)
//   · the confirmation
//   · the offline "will upload later" message
//
// "With a project already in context and online, the route may be passed
// through without being seen" — which is A-21b, and is why the screen submits
// on mount in that case rather than asking anything.
//
// The project list is loaded HERE, server-side, so the prompt has something to
// offer the moment it is needed. It is loaded unconditionally and cheaply
// rather than on demand: the prompt appears immediately after a shutter, and a
// spinner at that moment would read as the photo being lost.

export default async function CapturePage() {
  const projects = await getProjects({ status: 'active' }).catch(() => []);

  const choices: CaptureProjectChoice[] = (projects ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    projectNumber: p.project_number ?? null,
  }));

  return <CaptureScreen projects={choices} />;
}
