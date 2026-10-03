import { createClient, getRequestUser } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getProposalData } from '@/lib/proposal/proposal-data';
import {
  DEFAULT_PROPOSAL_BODY,
  DEFAULT_PROPOSAL_SUBJECT,
} from '@/lib/proposal/proposal-defaults';
import { ProposalPreviewClient } from './proposal-preview-client';
import { canReadEstimates } from '@/lib/estimate-access';

// Spec 2 (4E E4) — full-page proposal preview. RLS scopes the fetch
// (Owner/Admin company-wide, PM own only); the Send buttons are
// Owner/Admin only.

interface PageProps {
  params: { id: string };
}

export default async function ProposalPreviewPage({ params }: PageProps) {
  const supabase = await createClient();

  const user = await getRequestUser();
  if (!user) redirect('/sign-in');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, company_id')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  // [S115 R11] + the Project Executive: preview and PDF only — `isManager`
  // below stays Owner/Admin, so no send control (R1 carve-out 2).
  if (!profile || !canReadEstimates(profile.role)) {
    redirect('/dashboard');
  }

  const data = await getProposalData(supabase, params.id);
  if (!data) redirect('/dashboard/estimates');

  const { data: company } = await supabase
    .from('companies')
    .select('default_proposal_email_subject, default_proposal_email_body')
    .eq('id', profile.company_id)
    .single();

  return (
    <ProposalPreviewClient
      data={data}
      isManager={['owner', 'admin'].includes(profile.role)}
      contactEmail={data.client.email}
      defaultSubject={company?.default_proposal_email_subject || DEFAULT_PROPOSAL_SUBJECT}
      defaultBody={company?.default_proposal_email_body || DEFAULT_PROPOSAL_BODY}
    />
  );
}
