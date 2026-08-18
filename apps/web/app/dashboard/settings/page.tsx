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
import { getContractTemplateBoxes, getContractTemplates } from '@/lib/services/contracts';
import { ContractSettingsForm, type ContractTemplateRow } from './contract-settings-form';

// ⚠️ SLICE A [S150] — WITHOUT THIS, A SAVED BOX MAP READS BACK STALE.
//
// Symptom: place boxes, save, reopen the editor — the PRE-SAVE map is shown. A
// hard reload shows the real one. Nothing is ever lost; the write always
// succeeded (`s146-C2` asserts the service round-trip, and the harness passes).
//
// ⚠️ THIS IS THE INVERSE OF #2-7i AND MUST NOT BE CONFLATED WITH IT. 7F shows an
// EMPTY map and destroys real data on save. This showed STALE data and destroyed
// nothing. Opposite direction, opposite severity.
//
// The cause is Next's DATA CACHE, not the refresh wiring — which was the
// original diagnosis and was wrong. `onSaved` → `onDone()` → `router.refresh()`
// is present and correct (`contract-settings-form.tsx:88`), and `router.refresh()`
// does invalidate the client Router Cache. But `@supabase/ssr` 0.5.2 and
// `postgrest-js` 2.100.1 set no `cache` option (verified in node_modules), so the
// PostgREST GET goes through Next 14's patched `fetch` and lands in the Data
// Cache. `getContractTemplateBoxes` issues a byte-identical URL before and after
// a save (`template_id=eq.<id>`), so the refetch is served from that entry.
//
// `force-dynamic` sets the fetch default to `no-store` for this route. The page
// was ALREADY dynamically rendered — it calls `cookies()` via `createClient()`,
// and the build reports it as `ƒ` — so this costs nothing at render time; it
// changes only the caching of the reads. Precedent: both notifications pages.
//
// Reached by elimination rather than by observing a browser: a stale snapshot in
// `placing` cannot produce this symptom, because closing the modal unmounts it
// and reopening reads from the current `templates` prop. For the reopened editor
// to show an old map, the SERVER RENDER must have returned one.
export const dynamic = 'force-dynamic';

/**
 * 7I §2.1 — attach each template's CURRENT box map.
 *
 * ⚠️ READ HERE RATHER THAN IN THE EDITOR, and it is not a preference.
 * `getContractTemplateBoxes` lives in `contracts.ts`, which imports
 * `next/headers`; a client component calling it would fail at RUNTIME with tsc
 * silent (`contracts-shared.ts`'s header records why that boundary has its own
 * file). Reads are server-side per CLAUDE.md's service pattern, so the map
 * arrives as a prop.
 *
 * The editor MUST open on the real map — see #2-7i, where 7F's opens on an
 * empty one and saving wipes what was placed.
 */
async function withBoxes(
  templates: {
    id: string;
    name: string;
    pdf_file_id: string | null;
    is_default: boolean;
  }[]
): Promise<ContractTemplateRow[]> {
  return Promise.all(
    templates.map(async (t) => ({
      id: t.id,
      name: t.name,
      pdf_file_id: t.pdf_file_id,
      is_default: t.is_default,
      boxes: (await getContractTemplateBoxes(t.id)).map((b) => ({
        page: b.page,
        // numeric(8,6) arrives from PostgREST as a STRING. Left as one, a
        // comparison like `width < minWidth` compares lexically and the §2.2
        // size warning silently stops working.
        x: Number(b.x),
        y: Number(b.y),
        width: Number(b.width),
        height: Number(b.height),
        kind: b.kind,
        value_key: b.value_key,
        custom_label: b.custom_label,
        party: b.party,
      })),
    }))
  );
}

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
  // 7I §5.2 / §10.2 — TWO sets, keyed on `document_kind`. Read unconditionally:
  // §5.2a keeps forms authorable while the master toggle is off, so this must
  // not be gated on `company.client_contracts_enabled`.
  const clientContractTemplates = await withBoxes(await getContractTemplates('client_contract'));
  const subContractTemplates = await withBoxes(await getContractTemplates('sub_contract'));

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
      {/* 7I §5.2 — the master client-contract toggle. Owner/Admin by
          `companies_update_owner_admin`, the same set this page already
          admits at :34. */}
      <ContractSettingsForm
        companyId={company.id}
        enabled={Boolean(company.client_contracts_enabled)}
        clientTemplates={clientContractTemplates}
        subTemplates={subContractTemplates}
      />
    </div>
  );
}
