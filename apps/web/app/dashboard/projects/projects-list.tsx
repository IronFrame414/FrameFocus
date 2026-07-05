'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ProjectStatus, ProjectWithContact } from '@/lib/services/projects';
import { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS } from '@/lib/services/projects';

interface ProjectsListProps {
  projects: ProjectWithContact[];
  currentStatus: string;
}

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'complete', label: 'Complete' },
  { value: 'archived', label: 'Archived' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_COLORS: Record<ProjectStatus, { bg: string; fg: string }> = {
  active: { bg: '#dcfce7', fg: '#166534' },
  on_hold: { bg: '#fef3c7', fg: '#92400e' },
  complete: { bg: '#dbeafe', fg: '#1e40af' },
  archived: { bg: '#f3f4f6', fg: '#374151' },
  cancelled: { bg: '#fee2e2', fg: '#991b1b' },
};

function money(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function ProjectsList({ projects, currentStatus }: ProjectsListProps) {
  const router = useRouter();

  const cellStyle: React.CSSProperties = { padding: '0.75rem 0.5rem' };
  const headStyle: React.CSSProperties = {
    padding: '0.5rem',
    textAlign: 'left',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase',
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() =>
              router.push(
                f.value === 'all'
                  ? '/dashboard/projects'
                  : `/dashboard/projects?status=${f.value}`
              )
            }
            style={{
              padding: '0.375rem 0.75rem',
              fontSize: '0.875rem',
              borderRadius: '9999px',
              border: '1px solid #d1d5db',
              backgroundColor: currentStatus === f.value ? '#2563eb' : '#fff',
              color: currentStatus === f.value ? '#fff' : '#374151',
              cursor: 'pointer',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {projects.length === 0 ? (
        <div
          style={{
            padding: '3rem',
            textAlign: 'center',
            color: '#6b7280',
            backgroundColor: '#fff',
            borderRadius: '0.5rem',
            border: '1px solid #e5e7eb',
          }}
        >
          No projects{currentStatus !== 'all' ? ` with status "${currentStatus}"` : ''} yet.
          Convert an accepted estimate or create one manually.
        </div>
      ) : (
        <div
          style={{
            backgroundColor: '#fff',
            borderRadius: '0.5rem',
            border: '1px solid #e5e7eb',
            overflowX: 'auto',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <th style={headStyle}>Number</th>
                <th style={headStyle}>Name</th>
                <th style={headStyle}>Client</th>
                <th style={headStyle}>Type</th>
                <th style={headStyle}>Status</th>
                <th style={{ ...headStyle, textAlign: 'right' }}>Contract Value</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ ...cellStyle, fontWeight: 600 }}>
                    <Link
                      href={`/dashboard/projects/${p.id}`}
                      style={{ color: '#2563eb', textDecoration: 'none' }}
                    >
                      {p.project_number}
                    </Link>
                  </td>
                  <td style={cellStyle}>{p.name}</td>
                  <td style={{ ...cellStyle, color: '#6b7280' }}>
                    {p.contact
                      ? `${p.contact.first_name} ${p.contact.last_name}`
                      : '—'}
                  </td>
                  <td style={{ ...cellStyle, color: '#6b7280' }}>
                    {PROJECT_TYPE_LABELS[p.project_type]}
                  </td>
                  <td style={cellStyle}>
                    <span
                      style={{
                        padding: '0.125rem 0.5rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        backgroundColor: STATUS_COLORS[p.status].bg,
                        color: STATUS_COLORS[p.status].fg,
                      }}
                    >
                      {PROJECT_STATUS_LABELS[p.status]}
                    </span>
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 500 }}>
                    {money(p.contract_value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
