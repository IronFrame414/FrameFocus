import Link from 'next/link';
import {
  canBulkDeletePhotos,
  canDeletePhoto,
  canSharePhotoWithClient,
  canSharePhotosWithClient,
} from '@/lib/photos/delete-permission';
import { getProjectPhotos } from '@/lib/services/photos';
import { getMyProfile } from '@/lib/services/profiles';
import { getCompanyTimeSettings } from '@/lib/services/company';
import { calendarDayInZone, companyToday } from '@framefocus/shared/utils/dates';
import { cardStyle, color, font, microLabelStyle } from '@/lib/theme';
import PhotoVisibilityToggle from './photo-visibility-toggle';
import { AddPhotosButton } from './add-photos-button';
import { GridThumb } from './grid-thumb';
import { PhotoSelectionProvider, SelectablePhotoTile } from './photo-selection';

// Redesign 6.2 — the desktop gallery: A SURFACING JOB, NOT A BUILD. The data
// derivation is the SAME `getProjectPhotos()` the mobile gallery uses (lib —
// shared mechanism, per the parity rule), including D-31's display rule: each
// tile is ONE flat <img> whose src is already the correct file — the
// `.markup.jpg` derivative for an annotated photo, the original otherwise.
// No overlay, no markup_data on the render path.
// [S111 D] …as a 400x400 THUMBNAIL of that file (`thumbUrl`), loaded ahead of
// the viewport — lib/photos/thumbnail.ts. The grid never loads an original.
//
// The chip set carries the mobile four PLUS the two that were data-ready and
// unrendered (§8.9.2): Safety (files.safety_incident_id — the service already
// derives source 'safety') and Marked up (hasMarkup). ⚠️ The mobile chip row
// does not yet carry those two — /m is a ruled surface and widening its chip
// set is flagged in the build log rather than done as a rider.
//
// A tile opens the EXISTING desktop markup surface (files/[fileId]/markup) —
// the one viewer/annotator desktop already has; no second lightbox is built.
// The "turn this into work" actions are DEFERRED by ruling (create-punch is
// unbuilt everywhere; attach-to-CO has no backing path; share-with-client is
// the mobile Web Share API).

const CHIPS: { value: string | null; label: string }[] = [
  { value: null, label: 'All' },
  { value: 'log', label: 'Daily logs' },
  { value: 'delivery', label: 'Deliveries' },
  { value: 'punch', label: 'Punch' },
  { value: 'safety', label: 'Safety' },
  { value: 'marked-up', label: 'Marked up' },
];

function dayLabel(iso: string, todayIso: string): string {
  if (iso === todayIso) return 'TODAY';
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
}

export default async function ProjectPhotosPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { source?: string };
}) {
  const raw = searchParams.source;
  const active =
    raw === 'log' || raw === 'delivery' || raw === 'punch' || raw === 'safety' || raw === 'marked-up'
      ? raw
      : null;

  const [photos, profile, timeSettings] = await Promise.all([
    getProjectPhotos(params.id, { thumbnails: true, photoView: true }),
    getMyProfile(),
    getCompanyTimeSettings(),
  ]);
  const isStaff = !!profile && !['client', 'subcontractor'].includes(profile.role);

  const filtered =
    active === null
      ? photos
      : active === 'marked-up'
        ? photos.filter((p) => p.hasMarkup)
        : photos.filter((p) => p.source === active);

  // Company-tz day grouping — BOTH sides of the comparison in one zone
  // (the S106 lesson; `.slice(0, 10)` is the UTC day and is wrong here).
  const todayIso = companyToday(timeSettings.timezone);
  const byDay = new Map<string, typeof filtered>();
  for (const p of filtered) {
    const day = p.created_at ? calendarDayInZone(p.created_at, timeSettings.timezone) : '';
    const list = byDay.get(day) ?? [];
    list.push(p);
    byDay.set(day, list);
  }
  const days = [...byDay.keys()].sort((a, b) => b.localeCompare(a));

  const base = `/dashboard/projects/${params.id}/photos`;
  // [S127 4d, A-1] Multi-select is Owner/Admin (RULED A-1a; client_visible is
  // Owner/Admin in the database). Every other role gets the grid unchanged.
  const canBulkDelete = canBulkDeletePhotos(profile?.role);
  const canShareWithClient = canSharePhotosWithClient(profile?.role);
  const canShareOne = canSharePhotoWithClient(profile?.role);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
        <p style={{ ...microLabelStyle, margin: 0 }}>
          Photos · {photos.length} total
        </p>
        {/* [S111 Q16] Staff only: files_insert_non_client refuses a client, and a
            subcontractor never reaches /dashboard. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* [S127 4e] Every active public link, with one-click revoke. */}
          {profile && (profile.role === 'owner' || profile.role === 'admin') && (
            <Link
              href="/dashboard/photo-links"
              data-testid="photo-links-link"
              style={{ color: color.primary, fontSize: '13px', textDecoration: 'none' }}
            >
              Share links
            </Link>
          )}
          {/* [S127 4a] The trash this tab never had — for the roles that may
              trash and restore a photo (canDeletePhoto), as the database says. */}
          {profile && canDeletePhoto(profile.role) && (
            <Link
              href={`${base}/trash`}
              data-testid="photos-trash-link"
              style={{ color: color.primary, fontSize: '13px', textDecoration: 'none' }}
            >
              Trash
            </Link>
          )}
          {isStaff && <AddPhotosButton projectId={params.id} />}
        </div>
      </div>

      {/* Provenance chips + the two newly surfaced filters. URL-param driven
          so the filter survives refresh and is linkable. */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {CHIPS.map((chip) => {
          const selected = active === chip.value;
          return (
            <Link
              key={chip.label}
              href={chip.value === null ? base : `${base}?source=${chip.value}`}
              style={{
                padding: '7px 14px',
                fontFamily: font.sans,
                fontSize: '13px',
                fontWeight: 600,
                borderRadius: '8px',
                border: selected ? '1px solid transparent' : `1px solid ${color.cardBorder}`,
                backgroundColor: selected ? color.navy : '#fff',
                color: selected ? '#fff' : color.bodyAlt,
                textDecoration: 'none',
              }}
            >
              {chip.label}
            </Link>
          );
        })}
      </div>

      <PhotoSelectionProvider
        enabled={filtered.length > 0 && (canBulkDelete || canShareWithClient)}
        canBulkDelete={canBulkDelete}
        canShareWithClient={canShareWithClient}
        trashHref={`${base}/trash`}
      >
      {filtered.length === 0 ? (
        <div style={{ ...cardStyle, padding: '48px', textAlign: 'center', color: color.muted }}>
          No photos{active ? ' under this filter' : ' yet'}. Photos land here from uploads, daily
          logs, deliveries, punch items and safety incidents.
        </div>
      ) : (
        days.map((day) => (
          <div key={day || 'undated'} style={{ marginBottom: '18px' }}>
            <p style={{ ...microLabelStyle, marginBottom: '8px' }}>
              {day ? dayLabel(day, todayIso) : 'UNDATED'}
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                gap: '10px',
              }}
            >
              {byDay.get(day)!.map((p) => (
                <SelectablePhotoTile key={p.id} id={p.id}>
                <Link
                  key={p.id}
                  // [S122 0-B-5] ?from=photos — the markup screen's back link returns here.
                  // [S127 4b, A-2] VIEW first; markup is a button on the view.
                  // SUPERSEDED: href={markupHref(params.id, p.id, 'photos')}.
                  href={`${base}/${p.id}`}
                  // H-5 [S115] — one prefetch PER TILE ran the middleware for a
                  // 249 B payload with no page data; none now.
                  prefetch={false}
                  style={{
                    position: 'relative',
                    display: 'block',
                    aspectRatio: '1 / 1',
                    overflow: 'hidden',
                    borderRadius: '11px',
                    backgroundColor: '#e4e8ef',
                  }}
                >
                  {/* [S111 D] A thumbnail, loaded ahead of the viewport — never the
                      original (the markup page it links to loads that). */}
                  <GridThumb url={p.thumbUrl} alt={p.file_name} />
                  {p.hasMarkup && (
                    <span
                      style={{
                        position: 'absolute',
                        bottom: '6px',
                        left: '6px',
                        padding: '2px 8px',
                        fontSize: '10.5px',
                        fontWeight: 700,
                        borderRadius: '9px',
                        backgroundColor: 'rgba(15, 23, 41, 0.65)',
                        color: '#fff',
                      }}
                    >
                      Marked up
                    </span>
                  )}
                  {/* [S127, RULED 2026-10-03] Drawn for exactly the roles the
                      database lets change it (canSharePhotoWithClient).
                      SUPERSEDED, quoted: {isStaff && (<PhotoVisibilityToggle … />)}
                      — drawn for every staff role; a foreman's or crew's
                      toggle was refused. */}
                  {canShareOne && (
                    <PhotoVisibilityToggle fileId={p.id} initial={Boolean(p.client_visible)} />
                  )}
                </Link>
                </SelectablePhotoTile>
              ))}
            </div>
          </div>
        ))
      )}
      </PhotoSelectionProvider>
    </div>
  );
}
