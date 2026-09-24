import { redirect } from 'next/navigation';

// S110 B [RULED Josh, Q5 → A] — the desktop site-visit record MOVED to
// /dashboard/site-visits/[id], beside the new top-level "Site visits" list,
// because foreman and crew now reach it (Section A) and the Estimates area
// stays office-only. This path is kept so old notifications and bookmarks land.
export default function MovedSiteVisitPage({ params }: { params: { id: string } }) {
  redirect(`/dashboard/site-visits/${params.id}`);
}
