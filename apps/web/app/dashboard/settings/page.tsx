import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import {
  getCompany,
  getEstimatingSettings,
  getGLMappingSettings,
  getProposalSettings,
  getTimeTrackingSettings,
} from '@/lib/services/company';
import { SettingsForm } from './settings-form';
import { EstimatingSettingsForm } from './estimating-settings-form';
import { ProposalSettingsForm } from './proposal-settings-form';
import { TimeTrackingSettingsForm } from './time-tracking-settings-form';
import { GLMappingSettingsForm } from './gl-mapping-settings-form';
import { getTemplates } from '@/lib/services/lien-releases';
import { LienReleaseSettingsForm } from './lien-release-settings-form';

export default async function SettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  // Check role — only owner and admin can access settings
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();

  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    redirect('/dashboard');
  }

  const company = await getCompany();
  if (!company) redirect('/dashboard');

  const estimatingSettings = await getEstimatingSettings();
  const proposalSettings = await getProposalSettings();
  const timeTrackingSettings = await getTimeTrackingSettings();
  const glMappingSettings = await getGLMappingSettings();
  // 7F §4 / §10.2 — release forms and the signatory. Owner/Admin by RLS, which
  // is the same set this page already admits.
  const lienTemplates = await getTemplates('client_outbound');

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
        Company Settings
      </h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
        Update your company information. This will appear on estimates, invoices, and client-facing
        documents.
      </p>
      <SettingsForm company={company} />
      {estimatingSettings && <EstimatingSettingsForm settings={estimatingSettings} />}
      {proposalSettings && <ProposalSettingsForm settings={proposalSettings} />}
      {timeTrackingSettings && <TimeTrackingSettingsForm settings={timeTrackingSettings} />}
      {glMappingSettings && <GLMappingSettingsForm settings={glMappingSettings} />}
      <LienReleaseSettingsForm
        companyId={company.id}
        templates={lienTemplates.map((t) => ({
          id: t.id,
          name: t.name,
          type: t.type,
          is_final: t.is_final,
          jurisdiction_state: t.jurisdiction_state,
          pdf_file_id: t.pdf_file_id,
          is_default: t.is_default,
        }))}
        signatoryName={company.signatory_name}
        signatoryTitle={company.signatory_title}
        hasSignature={Boolean(company.contractor_signature_path)}
      />
    </div>
  );
}
