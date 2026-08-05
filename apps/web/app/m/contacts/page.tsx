import { CONTACT_TYPE_LABELS } from '@framefocus/shared/constants';
import { getContacts } from '@/lib/services/contacts';
import { SetMobileHeader } from '../mobile-header';
import {
  ContactActions,
  EmptyState,
  FilterChips,
  ListRow,
  StatusPill,
  type Chip,
} from '../mobile-ui';

// M6M §4.13.6 — M-29 · Contacts. The COMPANY-scoped list; M-17 is the
// project-scoped one. They are not duplicates and neither replaces the other.

// ─────────────────────────────────────────────────────────────────────────────
// THE CHIPS DELIBERATELY DO NOT COVER THE DOMAIN.
// ─────────────────────────────────────────────────────────────────────────────
// `contacts_contact_type_check` permits SEVEN values — lead, client, vendor,
// architect, inspector, building_dept, other_external — and this row offers two.
// That is §4.13.6's decision, not an oversight: leads and clients are the two a
// field user looks up, and a seven-chip row does not fit 402px.
//
// WHAT MAKES IT SAFE IS THAT "All" IS THE UNFILTERED CALL — an architect or an
// inspector appears there and is never hidden. A-49 asserts precisely that, so a
// build that "tidies up" by filtering All to lead|client loses five contact
// types silently. Do not add five more chips, and do not narrow All.
const CHIPS: readonly Chip[] = [
  { value: null, label: 'All' },
  { value: 'lead', label: 'Leads' },
  { value: 'client', label: 'Clients' },
];

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  inactive: 'Inactive',
  archived: 'Archived',
};

/**
 * §4.13.6's naming rule. `first_name`, `last_name` and `company_name` are all
 * nullable, so a company-only contact is a real state rather than a defensive
 * check — A-49b asserts the fallback and that neither branch leaves a blank row
 * or a stray separator.
 */
function displayName(c: {
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
}): string {
  const person = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
  return person || c.company_name?.trim() || 'Unnamed contact';
}

export default async function MobileContactsPage({
  searchParams,
}: {
  searchParams: { type?: string };
}) {
  const raw = searchParams.type;
  const active = raw === 'lead' || raw === 'client' ? raw : null;

  const contacts = await getContacts(active ? { contact_type: active } : undefined);

  const emptyCopy =
    active === 'lead' ? 'No leads.' : active === 'client' ? 'No clients.' : 'No contacts.';

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SetMobileHeader title="Contacts" sub="Company directory" />

      <FilterChips chips={CHIPS} active={active} basePath="/m/contacts" param="type" />

      {contacts.length === 0 ? (
        <div className="pt-[18px]">
          <EmptyState>{emptyCopy}</EmptyState>
        </div>
      ) : (
        <ul className="mt-[14px] rounded-[15px] border border-m6m-border bg-m6m-card px-[12px]">
          {contacts.map((c) => {
            const name = displayName(c);
            return (
              <ListRow key={c.id} testId="m-contact-row">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[17px] font-bold leading-tight text-m6m-navy">
                    {name}
                  </p>
                  <p className="mt-[3px] flex flex-wrap items-center gap-[6px]">
                    <StatusPill label={STATUS_LABEL[c.status] ?? c.status} />
                    {/* NEVER the raw enum — `building_dept` and `other_external`
                        are the two that give a guess away. A-49c. */}
                    <span
                      data-testid="m-contact-type"
                      className="font-mono text-[11px] font-semibold text-m6m-muted"
                    >
                      {CONTACT_TYPE_LABELS[c.contact_type] ?? c.contact_type}
                    </span>
                  </p>

                  {/* CUT: `notes` and `tags`. getContacts() does select('*') so
                      both are in the payload for every role — the cut is UI-only
                      and A-49d is what holds it. `notes` on a lead can carry
                      commercial detail with no reason to be on a crew phone. */}
                </div>

                <ContactActions
                  phone={c.phone}
                  mobile={c.mobile}
                  email={c.email}
                  name={name}
                />
              </ListRow>
            );
          })}
        </ul>
      )}
    </div>
  );
}
