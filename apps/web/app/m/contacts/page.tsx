import { CONTACT_TYPE_LABELS } from '@framefocus/shared/constants';
import { getContacts } from '@/lib/services/contacts';
import { getMyProfile } from '@/lib/services/profiles';
import { canReachDetail } from '@/app/m/detail-access';
import { getMobileT } from '@/lib/i18n/server';
import type { MsgKey, T } from '@/lib/i18n/messages';
import { SetMobileHeader } from '../mobile-header';
import {
  ContactActions,
  EmptyState,
  FilterChips,
  ListRow,
  ListRowLink,
  StatusPill,
  DeniedNotice,
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
// S110 H — labels are message keys, resolved with t() at render time.
function chips(t: T): readonly Chip[] {
  return [
    { value: null, label: t('directory.chip.all'), testKey: 'All' },
    { value: 'lead', label: t('directory.contacts.chip.leads'), testKey: 'Leads' },
    { value: 'client', label: t('directory.contacts.chip.clients'), testKey: 'Clients' },
  ];
}

const STATUS_KEY: Record<string, MsgKey> = {
  active: 'directory.status.active',
  inactive: 'directory.status.inactive',
  archived: 'directory.status.archived',
};

/**
 * §4.13.6's naming rule. `first_name`, `last_name` and `company_name` are all
 * nullable, so a company-only contact is a real state rather than a defensive
 * check — A-49b asserts the fallback and that neither branch leaves a blank row
 * or a stray separator.
 */
function displayName(
  c: {
    first_name: string | null;
    last_name: string | null;
    company_name: string | null;
  },
  t: T
): string {
  const person = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
  return person || c.company_name?.trim() || t('directory.contacts.unnamed');
}

export default async function MobileContactsPage({
  searchParams,
}: {
  searchParams: { type?: string; denied?: string };
}) {
  const raw = searchParams.type;
  const active = raw === 'lead' || raw === 'client' ? raw : null;

  const [contacts, profile, t] = await Promise.all([
    getContacts(active ? { contact_type: active } : undefined),
    getMyProfile(),
    getMobileT(),
  ]);

  // D-54 step 1 — hide the row tap for a subcontractor; requireDetailAccess()
  // on M-36 is the real gate. The tap-to-act circles stay for every role.
  const canOpen = canReachDetail(profile?.role);

  const emptyCopy =
    active === 'lead'
      ? t('directory.contacts.emptyLeads')
      : active === 'client'
        ? t('directory.contacts.emptyClients')
        : t('directory.contacts.empty');

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SetMobileHeader
        title={t('directory.contacts.title')}
        sub={t('directory.companyDirectory')}
      />

      <FilterChips chips={chips(t)} active={active} basePath="/m/contacts" param="type" t={t} />

      <DeniedNotice kind={searchParams.denied} t={t} />

      {contacts.length === 0 ? (
        <div className="pt-[18px]">
          <EmptyState>{emptyCopy}</EmptyState>
        </div>
      ) : (
        <ul className="mt-[14px] rounded-[15px] border border-m6m-border bg-m6m-card px-[12px]">
          {contacts.map((c) => {
            const name = displayName(c, t);
            return (
              <ContactRow
                key={c.id}
                href={canOpen ? `/m/contacts/${c.id}` : null}
                label={name}
                actions={
                  <ContactActions
                    phone={c.phone}
                    mobile={c.mobile}
                    email={c.email}
                    name={name}
                    t={t}
                  />
                }
              >
                <p className="truncate text-[17px] font-bold leading-tight text-m6m-navy">{name}</p>
                <p className="mt-[3px] flex flex-wrap items-center gap-[6px]">
                  <StatusPill label={STATUS_KEY[c.status] ? t(STATUS_KEY[c.status]) : c.status} />
                  {/* NEVER the raw enum — `building_dept` and `other_external`
                        are the two that give a guess away. A-49c. */}
                  <span
                    data-testid="m-contact-type"
                    className="font-mono text-[11px] font-semibold text-m6m-muted"
                  >
                    {c.contact_type in CONTACT_TYPE_LABELS
                      ? t(`directory.contactType.${c.contact_type}` as MsgKey)
                      : c.contact_type}
                  </span>
                </p>

                {/* CUT: `notes` and `tags`. getContacts() does select('*') so
                      both are in the payload for every role — the cut is UI-only
                      and A-49d is what holds it. `notes` on a lead can carry
                      commercial detail with no reason to be on a crew phone. */}
              </ContactRow>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** One M-29 row. Navigation AROUND the action circles, never wrapping them —
 *  §4.11.16. Identical shape to M-17's, because the two lists reach the same
 *  detail route and must not behave differently. */
function ContactRow({
  href,
  label,
  actions,
  children,
}: {
  href: string | null;
  label: string;
  actions: React.ReactNode;
  children: React.ReactNode;
}) {
  if (!href) {
    return (
      <ListRow testId="m-contact-row">
        <div className="min-w-0 flex-1">{children}</div>
        {actions}
      </ListRow>
    );
  }
  return (
    <ListRowLink href={href} testId="m-contact-row" label={label} trailing={actions}>
      {children}
    </ListRowLink>
  );
}
