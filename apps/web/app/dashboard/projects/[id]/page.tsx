import { createClient } from '@/lib/supabase-server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getProject, PROJECT_TYPE_LABELS } from '@/lib/services/projects';
import { StatusControl } from './status-control';

function money(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function date(value: string | null): string {
  if (!value) return '—';
  return new Date(value + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default async function ProjectOverviewPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile) redirect('/dashboard');

  const project = await getProject(params.id);
  if (!project) notFound();

  // Estimate link (when converted)
  let sourceEstimate: { id: string; estimate_number: string } | null = null;
  if (project.source_estimate_id) {
    const { data } = await supabase
      .from('estimates')
      .select('id, estimate_number')
      .eq('id', project.source_estimate_id)
      .single();
    sourceEstimate = data ?? null;
  }

  const canTransition = ['owner', 'admin', 'project_manager'].includes(profile.role);

  const sectionStyle: React.CSSProperties = {
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '0.5rem',
    padding: '1.25rem',
    marginBottom: '1rem',
  };
  const titleStyle: React.CSSProperties = {
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase',
    marginBottom: '0.75rem',
  };
  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.375rem 0',
    fontSize: '0.875rem',
  };
  const keyStyle: React.CSSProperties = { color: '#6b7280' };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
      <div>
        <div style={sectionStyle}>
          <div style={titleStyle}>Details</div>
          <div style={rowStyle}>
            <span style={keyStyle}>Project Number</span>
            <span style={{ fontWeight: 600 }}>{project.project_number}</span>
          </div>
          <div style={rowStyle}>
            <span style={keyStyle}>Internal #</span>
            <span>{String(project.project_internal_seq).padStart(3, '0')}</span>
          </div>
          <div style={rowStyle}>
            <span style={keyStyle}>Type</span>
            <span>{PROJECT_TYPE_LABELS[project.project_type]}</span>
          </div>
          <div style={rowStyle}>
            <span style={keyStyle}>Client</span>
            <span>
              {project.contact
                ? `${project.contact.first_name} ${project.contact.last_name}`
                : '—'}
            </span>
          </div>
          <div style={rowStyle}>
            <span style={keyStyle}>Contract Value</span>
            <span style={{ fontWeight: 600 }}>{money(project.contract_value)}</span>
          </div>
          <div style={rowStyle}>
            <span style={keyStyle}>Source Estimate</span>
            <span>
              {sourceEstimate ? (
                <Link
                  href={`/dashboard/estimates/${sourceEstimate.id}`}
                  style={{ color: '#2563eb', textDecoration: 'none' }}
                >
                  {sourceEstimate.estimate_number}
                </Link>
              ) : (
                'Manual (no estimate)'
              )}
            </span>
          </div>
          <div style={rowStyle}>
            <span style={keyStyle}>Start Date</span>
            <span>{date(project.start_date)}</span>
          </div>
          <div style={rowStyle}>
            <span style={keyStyle}>Target End</span>
            <span>{date(project.target_end_date)}</span>
          </div>
          <div style={rowStyle}>
            <span style={keyStyle}>Actual End</span>
            <span>{date(project.actual_end_date)}</span>
          </div>
        </div>

        {project.scope_summary && (
          <div style={sectionStyle}>
            <div style={titleStyle}>Scope of Work</div>
            <p style={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>{project.scope_summary}</p>
          </div>
        )}

        {project.internal_notes && (
          <div style={sectionStyle}>
            <div style={titleStyle}>Internal Notes</div>
            <p style={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>{project.internal_notes}</p>
          </div>
        )}
      </div>

      <div>
        {canTransition && (
          <div style={sectionStyle}>
            <div style={titleStyle}>Status</div>
            <StatusControl
              projectId={project.id}
              currentStatus={project.status}
              userRole={profile.role}
            />
          </div>
        )}
      </div>
    </div>
  );
}
