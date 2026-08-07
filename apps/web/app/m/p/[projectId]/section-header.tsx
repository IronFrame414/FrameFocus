import { getProject } from '@/lib/services/projects';
import { SetMobileHeader } from '../../mobile-header';

// M6M §4.11's common app-bar rule, in one place so the nine section screens do
// not each re-derive it:
//
//   "App bar on every screen: back chevron (never a hamburger — §3.1), the
//    section name, and a mono sub-line `PRJ-### · {client}`. The tab bar stays
//    (§3.2), Projects active."
//
// The chevron and the active tab need no code here — the shell already derives
// both from the pathname (`showsBackChevron()` and `activeTabHref()` in
// mobile-shell.tsx), and A-30 asserts them. What each screen owes is the TITLE
// and the SUB-LINE, which is what this resolves.

/** `PRJ-### · {client}` — the client falls back to the company name, then to nothing. */
export async function sectionSubLine(projectId: string): Promise<string | null> {
  const project = await getProject(projectId);
  if (!project) return null;

  const client =
    [project.contact?.first_name, project.contact?.last_name].filter(Boolean).join(' ').trim() ||
    project.contact?.company_name?.trim() ||
    null;

  // project_number is the mono half; a project without one renders the client
  // alone rather than a stray separator (§4.11's "no empty slot" habit).
  const parts = [project.project_number, client].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** Renders §4.11's app-bar contract for one section screen. Draws nothing. */
export async function SectionHeader({
  projectId,
  title,
}: {
  projectId: string;
  title: string;
}) {
  const sub = await sectionSubLine(projectId);
  return <SetMobileHeader title={title} sub={sub} />;
}
