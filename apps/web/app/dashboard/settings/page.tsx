import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getCompanySettingsBundle } from '@/lib/services/company';
import { SettingsForm } from './settings-form';
import { EstimatingSettingsForm } from './estimating-settings-form';
import { ProposalSettingsForm } from './proposal-settings-form';
import { TimeTrackingSettingsForm } from './time-tracking-settings-form';
import { GLMappingSettingsForm } from './gl-mapping-settings-form';
import { getTemplateBoxesByTemplate, getTemplates } from '@/lib/services/lien-releases';
import { LienReleaseSettingsForm } from './lien-release-settings-form';
import { getContractTemplateBoxesByTemplate, getContractTemplates } from '@/lib/services/contracts';
import { ContractSettingsForm, type ContractTemplateRow } from './contract-settings-form';
import { NotificationSettingsForm } from './notification-settings-form';
import { FileCategoriesManager } from './file-categories-manager';
import { SettingsTabs } from './settings-tabs';
import { getSubscription } from '@/lib/services/billing';
import { getAddOns } from '@/lib/services/add-ons';
import { getSeatUsage } from '@/lib/services/seats';
import { BillingSettingsTab } from './billing-settings-tab';
import { color, h2Style } from '@/lib/theme';

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
  // One `.in(...)` for the whole family instead of a box read per template —
  // the N+1 this replaces ran once for client_contract and once for
  // sub_contract. getContractTemplateBoxesByTemplate preserves the same
  // page-asc order per template, so the map is byte-for-byte what the per-row
  // loop produced.
  const boxesByTemplate = await getContractTemplateBoxesByTemplate(templates.map((t) => t.id));
  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    pdf_file_id: t.pdf_file_id,
    is_default: t.is_default,
    boxes: (boxesByTemplate.get(t.id) ?? []).map((b) => ({
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
  }));
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  // Check role — only owner and admin can access settings.
  // M1-03 [S152]: `company_id` comes back with the role, because the page then
  // hands it to the settings bundle. It used to read the role here and then
  // call getCompany(), which re-ran auth.getUser() AND re-read this same row.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, company_id')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();

  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    redirect('/dashboard');
  }

  // M1-03 [S152] — ONE round trip for every `companies` field on this page.
  // Was five sequential ones against the same row (getCompany,
  // getEstimatingSettings, getProposalSettings, getTimeTrackingSettings,
  // getGLMappingSettings), each selecting a different column list.
  //
  // The template reads are independent of it and of each other, so they run
  // alongside rather than after. They were three more serial awaits.
  //
  // ⚠️ The redirect below still fires on a missing company, exactly as before.
  // The only difference is that the template fetches have also been issued by
  // then — wasted work on a path that redirects, and cheaper than the four
  // extra serial round trips it replaces on the path that does not.
  const [company, lienTemplates, clientContractTemplates, subContractTemplates] = await Promise.all([
    getCompanySettingsBundle(profile.company_id),
    // 7F §4 / §10.2 — release forms and the signatory. Owner/Admin by RLS, which
    // is the same set this page already admits.
    getTemplates('client_outbound'),
    // 7I §5.2 / §10.2 — TWO sets, keyed on `document_kind`. Read unconditionally:
    // §5.2a keeps forms authorable while the master toggle is off, so this must
    // not be gated on `company.client_contracts_enabled`.
    // ⚠️ `.then(withBoxes)`, NOT `withBoxes(await …)`. An `await` inside the
    // array literal is evaluated BEFORE Promise.all is called, so the awaited
    // form leaves these two serial and ahead of everything else — which is the
    // bug this whole change exists to remove, reintroduced one line later.
    getContractTemplates('client_contract').then(withBoxes),
    getContractTemplates('sub_contract').then(withBoxes),
  ]);

  if (!company) redirect('/dashboard');

  // One object feeds all five forms: `CompanySettingsBundle` is the intersection
  // of their prop types, so a structurally wider object satisfies each.
  const estimatingSettings = company;
  const proposalSettings = company;
  const timeTrackingSettings = company;
  const glMappingSettings = company;
  // #2-7i FIXED [S150] — 7F's box editor never loaded the existing map, so
  // re-opening it and saving wiped what was placed. `getTemplateBoxes` existed
  // and had exactly one caller (the generate route); no settings surface read
  // it. Read here for the same reason 7I's is: the function imports
  // `next/headers` and cannot be called from a client component.
  const lienBoxesByTemplate = await getTemplateBoxesByTemplate(lienTemplates.map((t) => t.id));
  const lienTemplatesWithBoxes = lienTemplates.map((t) => ({
    id: t.id,
    name: t.name,
    type: t.type,
    is_final: t.is_final,
    jurisdiction_state: t.jurisdiction_state,
    pdf_file_id: t.pdf_file_id,
    is_default: t.is_default,
    boxes: (lienBoxesByTemplate.get(t.id) ?? []).map((b) => ({
      page: b.page,
      // numeric arrives from PostgREST as a STRING; left as one the size
      // comparison is lexical and silently stops working.
      x: Number(b.x),
      y: Number(b.y),
      width: Number(b.width),
      height: Number(b.height),
      kind: b.kind,
      value_key: b.value_key,
      custom_label: b.custom_label,
    })),
  }));

  // §8.11.1 — the seven tabs. The Documents tab hosts the categories manager
  // (Entry 20's deferral) plus BOTH template forms; Notifications hosts the
  // quiet-hours/push form (the routing grid is a schema change, unbuilt).
  const tabs = [
    { key: 'company', label: 'Company', content: <SettingsForm company={company} /> },
    {
      key: 'estimating',
      label: 'Estimating',
      content: <EstimatingSettingsForm settings={estimatingSettings} />,
    },
    {
      key: 'proposals',
      label: 'Proposals & Email',
      content: <ProposalSettingsForm settings={proposalSettings} />,
    },
    {
      key: 'time',
      label: 'Time Tracking',
      content: <TimeTrackingSettingsForm settings={timeTrackingSettings} />,
    },
    {
      key: 'accounting',
      label: 'Accounting',
      content: <GLMappingSettingsForm settings={glMappingSettings} />,
    },
    {
      key: 'documents',
      label: 'Documents',
      content: (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          <FileCategoriesManager />
          <LienReleaseSettingsForm
            companyId={company.id}
            templates={lienTemplatesWithBoxes}
            signatoryName={company.signatory_name}
            signatoryTitle={company.signatory_title}
            hasSignature={Boolean(company.contractor_signature_path)}
          />
          {/* 7I §5.2 — the master client-contract toggle. Owner/Admin by
              `companies_update_owner_admin`, the same set this page already
              admits above. */}
          <ContractSettingsForm
            companyId={company.id}
            enabled={Boolean(company.client_contracts_enabled)}
            clientTemplates={clientContractTemplates}
            subTemplates={subContractTemplates}
          />
        </div>
      ),
    },
    {
      key: 'notifications',
      label: 'Notifications',
      content: <NotificationSettingsForm settings={company} />,
    },
  ];

  // §8.11.1 — the EIGHTH tab: Billing, moved here from its own sidebar item
  // [Josh, "move Billing into Settings"]. Billing is company configuration, so
  // it belongs with the other company-level settings.
  //
  // ⚠️ OWNER-ONLY, AND THIS IS THE GATE — not the tab strip. Settings admits
  // owner AND admin (the redirect at the top of this file), but Billing is
  // Owner-only. `settings-tabs.tsx` keeps every panel mounted (hidden with
  // display:none, so autosave debounces survive a switch), which means a tab
  // rendered for an admin ships in the admin's DOM even when hidden — hiding is
  // NOT a gate. So the billing tab is only ADDED to the array for an owner, and
  // its data is only fetched for an owner. An admin's payload never contains it.
  // A direct URL (`?tab=billing`) is harmless: settings-tabs falls back to the
  // first tab when the key is absent, and every Stripe API and the /plans and
  // /success pages enforce owner-only themselves (403 / redirect).
  if (profile.role === 'owner') {
    const [subscription, addOns, seatUsage] = await Promise.all([
      getSubscription(),
      getAddOns(),
      getSeatUsage(),
    ]);
    // No subscription row (shouldn't happen — one is created at signup) → no
    // tab, rather than redirecting the whole Settings page off the screen.
    if (subscription) {
      // Caller-scoped RPC (§1 sum, trashed rows included), run as the signed-in
      // owner, exactly as the old /dashboard/billing page did.
      const { data: usedBytes } = await supabase.rpc('company_storage_used_bytes');
      tabs.push({
        key: 'billing',
        label: 'Billing',
        content: (
          <BillingSettingsTab
            subscription={subscription}
            addOns={addOns}
            seatUsage={seatUsage}
            usedBytes={Number(usedBytes ?? 0)}
          />
        ),
      });
    }
  }

  return (
    <div>
      <h1 style={{ ...h2Style, marginBottom: '0.375rem' }}>Company Settings</h1>
      <p style={{ color: color.mutedAlt, marginBottom: '1.25rem', fontSize: '13.5px' }}>
        What appears on estimates, invoices, and client-facing documents — and how the app behaves
        for your team.
      </p>
      <SettingsTabs tabs={tabs} initialTab={searchParams?.tab} />
    </div>
  );
}
