import { CONTACT_TYPE_LABELS } from '@framefocus/shared/constants';
import { getProjectContacts } from '@/lib/services/project-contacts';
import { getMyProfile } from '@/lib/services/profiles';
import { canReachDetail } from '@/app/m/detail-access';
import { SectionHeader } from '../section-header';
import { ContactActions, DeniedNotice, EmptyState, ListRow, ListRowLink } from '../../../mobile-ui';

// M6M §4.11.7 — M-17 · Project contacts.
//
// PROJECT-SCOPED. M-29 (/m/contacts) is the company-scoped list; they are not
// duplicates and neither replaces the other — §4.13.6 and D-9's first sentence
// both keep the company list in the hamburger.
//
// phone and email are TAP-TO-ACT (A-37). That is the screen's whole reason to
// exist on a phone: a list that only displays a number wastes the device.

export default async function ProjectContactsPage({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams: { denied?: string };
}) {
  const [rows, profile] = await Promise.all([
    getProjectContacts(params.projectId),
    getMyProfile(),
  ]);

  // D-54 step 1. The real gate is requireDetailAccess() on M-36.
  // ⚠️ THE TAP-TO-ACT CIRCLES STAY FOR EVERY ROLE — A-37 requires them and they
  // are the screen's reason to exist on a phone. What a sub loses is the ROW
  // navigation, not the ability to call the person.
  const canOpen = canReachDetail(profile?.role);

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SectionHeader projectId={params.projectId} title="Contacts" />
      <DeniedNotice kind={searchParams.denied} />

      {rows.length === 0 ? (
        <EmptyState>No contacts on this project.</EmptyState>
      ) : (
        <ul className="rounded-[15px] border border-m6m-border bg-m6m-card px-[12px]">
          {rows.map((pc) => {
            const c = pc.contact;
            const name =
              [c?.first_name, c?.last_name].filter(Boolean).join(' ').trim() ||
              c?.company_name?.trim() ||
              'Unnamed contact';
            return (
              <ContactRow
                key={pc.id}
                href={canOpen && c?.id ? `/m/contacts/${c.id}` : null}
                label={name}
                // `mobile` is NOT selected by getProjectContacts' join (it is a
                // Pick of seven columns), so it is not passed. M-36 has it —
                // getContact() selects '*' — which is one more reason the row
                // opening the contact is worth having.
                actions={<ContactActions phone={c?.phone} email={c?.email} name={name} />}
              >
                  <p className="truncate text-[17px] font-bold leading-tight text-m6m-navy">
                    {name}
                  </p>
                  <p className="mt-[2px] flex flex-wrap items-center gap-[6px]">
                    {c?.contact_type ? (
                      <span className="font-mono text-[11px] font-semibold text-m6m-muted">
                        {CONTACT_TYPE_LABELS[
                          c.contact_type as keyof typeof CONTACT_TYPE_LABELS
                        ] ?? c.contact_type}
                      </span>
                    ) : null}
                    {/* The role on THIS project, from the junction row. */}
                    {pc.role ? (
                      <span className="text-[13px] text-m6m-muted">{pc.role}</span>
                    ) : null}
                  </p>
              </ContactRow>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** One M-17 row. The navigation target sits AROUND the two action circles
 *  rather than wrapping them — §4.11.16: "the affordances must not swallow each
 *  other". ListRowLink keeps them siblings; nesting an <a> in an <a> would make
 *  the call button navigate to the contact instead of dialling. */
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
      <ListRow testId="m-project-contact-row">
        <div className="min-w-0 flex-1">{children}</div>
        {actions}
      </ListRow>
    );
  }
  return (
    <ListRowLink href={href} testId="m-project-contact-row" label={label} trailing={actions}>
      {children}
    </ListRowLink>
  );
}
