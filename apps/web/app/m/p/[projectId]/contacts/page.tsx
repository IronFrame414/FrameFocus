import { CONTACT_TYPE_LABELS } from '@framefocus/shared/constants';
import { getProjectContacts } from '@/lib/services/project-contacts';
import { SectionHeader } from '../section-header';
import { ContactActions, EmptyState, ListRow } from '../../../mobile-ui';

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
}: {
  params: { projectId: string };
}) {
  const rows = await getProjectContacts(params.projectId);

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SectionHeader projectId={params.projectId} title="Contacts" />

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
              <ListRow key={pc.id} testId="m-project-contact-row">
                <div className="min-w-0 flex-1">
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
                </div>
                <ContactActions phone={c?.phone} email={c?.email} name={name} />
              </ListRow>
            );
          })}
        </ul>
      )}
    </div>
  );
}
