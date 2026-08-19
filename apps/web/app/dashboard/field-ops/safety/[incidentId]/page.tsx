import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getFailedIncidentEmails, getIncident, getIncidentPhotos } from '@/lib/services/safety';
import { getMyMember } from '@/lib/services/members';
import { TypeBadge, StatusBadge } from '@/components/field/incident-badges';
import {
  DeleteIncidentButton,
  IncidentPdfButton,
  ResolutionCard,
  RetryBanner,
} from './incident-detail-client';
import { SIGNED_URL_TTL_SECONDS } from '@/lib/services/signed-url-ttl';

// 6C — incident detail (4d right panel, expanded to a full page; also the
// home of project-less incidents). Edit = reporter or Owner/Admin (live
// RLS); resolution card Owner/Admin; retry banner Owner/Admin (§4 / Q6).

const card = 'rounded-[13px] border border-[#e6e9ef] bg-white';

function fmtYmd(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString(
    'en-US',
    { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
  );
}

function Field({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[#f4f6f9] py-[9px] last:border-0">
      <div className="font-mono text-[11px] font-semibold uppercase text-[#8a919c]">{title}</div>
      <div className="mt-[3px] text-[13px] text-[#374151]">{children}</div>
    </div>
  );
}

export default async function IncidentDetailPage({
  params,
}: {
  params: { incidentId: string };
}) {
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

  const [incident, myMember] = await Promise.all([
    getIncident(params.incidentId),
    getMyMember(),
  ]);
  if (!incident || incident.is_deleted) notFound();

  const isAdminRole = profile.role === 'owner' || profile.role === 'admin';
  const canEdit =
    isAdminRole || (myMember != null && myMember.id === incident.reported_by_member_id);

  const [photos, failedEmails] = await Promise.all([
    getIncidentPhotos(incident.id),
    isAdminRole ? getFailedIncidentEmails(incident.id) : Promise.resolve([]),
  ]);

  const { data: signed } = photos.length
    ? await supabase.storage
        .from('project-files')
        .createSignedUrls(
          photos.map((p) => p.file_path),
          SIGNED_URL_TTL_SECONDS
        )
    : { data: [] };
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  let pdfPath: string | null = null;
  let pdfName: string | null = null;
  if (incident.pdf_file_id) {
    const { data: pdfFile } = await supabase
      .from('files')
      .select('file_path, file_name')
      .eq('id', incident.pdf_file_id)
      .maybeSingle();
    pdfPath = pdfFile?.file_path ?? null;
    pdfName = pdfFile?.file_name ?? null;
  }

  const projectName = incident.project?.name ?? 'No project (shop/yard)';

  return (
    <div>
      <div className="mb-2 font-mono text-[12px] font-medium text-[#9aa1ac]">
        <Link href="/dashboard/field-ops/safety" className="hover:text-[#14213d]">
          Field Ops / Safety
        </Link>{' '}
        / <span className="text-[#6b7280]">{incident.incident_date}</span>
      </div>

      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-[10px]">
            <h2 className="text-[24px] font-extrabold tracking-[-0.01em] text-[#14213d]">
              Incident — {fmtYmd(incident.incident_date)}
            </h2>
            <TypeBadge type={incident.incident_type} />
            <StatusBadge status={incident.status} />
          </div>
          <div className="mt-[2px] text-[13px] text-[#6b7280]">
            {projectName} · reported by {incident.reporter?.display_name ?? 'Unknown'}
          </div>
        </div>
        <div className="flex gap-[10px]">
          <IncidentPdfButton incidentId={incident.id} pdfPath={pdfPath} pdfName={pdfName} />
          {canEdit ? (
            <Link
              href={`/dashboard/field-ops/safety/${incident.id}/edit`}
              className="rounded-[9px] border border-[#e0e4ea] bg-white px-[15px] py-[9px] text-[13px] font-semibold text-[#374151] transition-colors hover:border-[#c9d2e4]"
            >
              Edit
            </Link>
          ) : null}
          {isAdminRole ? <DeleteIncidentButton incidentId={incident.id} /> : null}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_320px] items-start gap-[18px]">
        {/* Left */}
        <div className="flex flex-col gap-4">
          {isAdminRole && failedEmails.length > 0 ? (
            <RetryBanner incidentId={incident.id} failedEmails={failedEmails.map((f) => f.email)} />
          ) : null}

          <div className={`${card} p-[20px]`}>
            <Field title="Description">{incident.description}</Field>
            <Field title="Injured parties">
              {incident.injuries.length === 0 ? (
                <span className="text-[#9aa1ac]">None recorded</span>
              ) : (
                incident.injuries.map((p) => (
                  <div key={p.id} className="py-[2px]">
                    <strong className="text-[#14213d]">
                      {p.member?.display_name ?? p.injured_name}
                    </strong>
                    {p.member_id === null ? ' (outside party)' : ''} —{' '}
                    {p.treatment_sought
                      ? `treatment sought${p.treatment_notes ? `: ${p.treatment_notes}` : ''}`
                      : 'no treatment sought'}
                  </div>
                ))
              )}
            </Field>
            <Field title="Witnesses">
              {incident.witnesses.length === 0 ? (
                <span className="text-[#9aa1ac]">None recorded</span>
              ) : (
                incident.witnesses
                  .map(
                    (w) =>
                      `${w.member?.display_name ?? w.witness_name}${w.member_id === null ? ' (outside party)' : ''}`
                  )
                  .join(', ')
              )}
            </Field>
            <Field title="Prevention">
              {incident.prevention_notes || <span className="text-[#9aa1ac]">—</span>}
            </Field>
            <Field title="Reported by">
              {incident.reporter?.display_name ?? 'Unknown'}
            </Field>
          </div>

          <div className={`${card} p-[20px]`}>
            <div className="mb-3 text-[13px] font-bold uppercase text-[#14213d]">
              Photos{' '}
              <span className="text-[11px] font-medium normal-case tracking-normal text-[#9aa1ac]">
                — attached to this incident
              </span>
            </div>
            {photos.length === 0 ? (
              <p className="text-[12px] text-[#9aa1ac]">No photos attached.</p>
            ) : (
              <div className="grid grid-cols-4 gap-[10px]">
                {photos.map((photo) => {
                  const url = urlByPath.get(photo.file_path);
                  return (
                    <div
                      key={photo.id}
                      className="aspect-square overflow-hidden rounded-[9px] bg-[#eef1f6]"
                    >
                      {url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- signed URL
                        <img src={url} alt={photo.file_name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[11px] text-[#9aa1ac]">
                          {photo.file_name}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right rail */}
        <div className="flex flex-col gap-4">
          <ResolutionCard
            incidentId={incident.id}
            status={incident.status}
            outcome={incident.outcome}
            canEdit={isAdminRole}
          />
          <div className="flex items-center gap-2 rounded-[9px] border border-[#dfe4f5] bg-[#f5f7ff] p-[11px] text-[12px] text-[#3a4db0]">
            ✉ Everyone above the reporter was notified · PDF filed to {projectName} → Safety
          </div>
          <div className="text-[11px] font-medium text-[#9aa1ac]">
            OSHA 300 recordkeeping handled outside the app in v1.
          </div>
        </div>
      </div>
    </div>
  );
}
