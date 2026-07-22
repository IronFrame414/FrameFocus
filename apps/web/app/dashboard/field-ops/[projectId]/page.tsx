import { redirect } from 'next/navigation';

// The project's Field surface defaults to Daily Logs (handoff 4c's active
// tab). 6C/6D/6E tabs claim sibling segments as they ship.
export default function FieldOpsProjectPage({ params }: { params: { projectId: string } }) {
  redirect(`/dashboard/field-ops/${params.projectId}/daily-logs`);
}
