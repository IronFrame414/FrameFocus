import { redirect } from 'next/navigation';

// Money representation A-5 (S93): Budget and Job Cost merged into one
// "Budget & Cost" screen. This route survives only as a redirect so old
// links and bookmarks keep working.
export default function JobCostRedirect({ params }: { params: { id: string } }) {
  redirect(`/dashboard/projects/${params.id}/budget`);
}
