import { SlicePlaceholder } from "../../slice-placeholder";

// M6M §1 — the project sections hub. The real screen is M-3 (§4.3), a later
// slice.
//
// It exists in THIS slice for two shell rules that have no other surface:
//   §3.1  inside a project the hamburger is replaced by a back chevron
//   A-1c  arriving at /m/p/{id} by any path leaves Projects active
//
// The mono sub-line carries the raw project id rather than the project name.
// That is placeholder behaviour, not a design: M-3 will resolve the name. It is
// mono because §2 puts every ID in IBM Plex Mono.
// `params` is a plain object, not a Promise — this repo is Next 14.2, matching
// app/dashboard/projects/[id]/page.tsx:43.
export default function MobileProjectHubPage({ params }: { params: { projectId: string } }) {
  return (
    <SlicePlaceholder
      screen="M-3 · Project sections"
      title="Project"
      sub={params.projectId}
    />
  );
}
