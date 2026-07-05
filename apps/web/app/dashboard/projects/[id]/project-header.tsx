'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ProjectWithContact } from '@/lib/services/projects';
import { PROJECT_STATUS_LABELS } from '@/lib/services/projects';

interface ProjectHeaderProps {
  project: ProjectWithContact;
}

const TABS: { slug: string; label: string }[] = [
  { slug: '', label: 'Overview' },
  { slug: 'schedule', label: 'Schedule' },
  { slug: 'budget', label: 'Budget' },
  { slug: 'changes', label: 'Change Orders' },
  { slug: 'punch', label: 'Punch List' },
  { slug: 'files', label: 'Files' },
  { slug: 'contacts', label: 'Contacts' },
  { slug: 'contracts', label: 'Contracts' },
  { slug: 'team', label: 'Team' },
];

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  active: { bg: '#dcfce7', fg: '#166534' },
  on_hold: { bg: '#fef3c7', fg: '#92400e' },
  complete: { bg: '#dbeafe', fg: '#1e40af' },
  archived: { bg: '#f3f4f6', fg: '#374151' },
  cancelled: { bg: '#fee2e2', fg: '#991b1b' },
};

export function ProjectHeader({ project }: ProjectHeaderProps) {
  const pathname = usePathname();
  const base = `/dashboard/projects/${project.id}`;
  const colors = STATUS_COLORS[project.status] ?? STATUS_COLORS.archived;

  function isActive(slug: string): boolean {
    if (slug === '') return pathname === base;
    return pathname.startsWith(`${base}/${slug}`);
  }

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ marginBottom: '0.25rem' }}>
        <Link
          href="/dashboard/projects"
          style={{ fontSize: '0.8125rem', color: '#6b7280', textDecoration: 'none' }}
        >
          ← Projects
        </Link>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '1rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{project.name}</h1>
            <span
              style={{
                padding: '0.125rem 0.625rem',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 600,
                backgroundColor: colors.bg,
                color: colors.fg,
              }}
            >
              {PROJECT_STATUS_LABELS[project.status]}
            </span>
          </div>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            {project.project_number}
            {project.contact
              ? ` · ${project.contact.first_name} ${project.contact.last_name}`
              : ''}
            {project.contract_value !== null
              ? ` · ${project.contract_value.toLocaleString('en-US', {
                  style: 'currency',
                  currency: 'USD',
                })}`
              : ''}
          </p>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          gap: '0.25rem',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        {TABS.map((tab) => (
          <Link
            key={tab.slug}
            href={tab.slug === '' ? base : `${base}/${tab.slug}`}
            style={{
              padding: '0.5rem 0.875rem',
              fontSize: '0.875rem',
              fontWeight: isActive(tab.slug) ? 600 : 400,
              color: isActive(tab.slug) ? '#2563eb' : '#6b7280',
              borderBottom: isActive(tab.slug) ? '2px solid #2563eb' : '2px solid transparent',
              textDecoration: 'none',
              marginBottom: '-1px',
            }}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
