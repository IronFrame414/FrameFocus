import { getProjectPhotos } from '@/lib/services/photos';
import { getMyProfile } from '@/lib/services/profiles';
import { getProject } from '@/lib/services/projects';
import { getCompanyTimeSettings } from '@/lib/services/company';
import { companyToday } from '@framefocus/shared/utils/dates';
import { SetMobileHeader } from '../../../mobile-header';
import { FilterChips, type Chip } from '../../../mobile-ui';
import { PhotoGrid, type GridPhoto } from './photo-grid';
import { PhotoSearch } from './photo-search';

// M6M §4.8 — M-8 · Project photos, the gallery.
//
// ---------------------------------------------------------------------------
// WHAT THIS SCREEN DOES **NOT** DO: draw an overlay.
// ---------------------------------------------------------------------------
// D-31 [S99] reversed the display rule. Each tile is one flat <img> whose src
// is already the correct file — the annotated derivative for a photo with
// markup, the original otherwise. There is no SVG, no `markup_data` on the
// render path, and no second fetch. A-23f asserts the derivative renders here;
// A-23s asserts the original never flashes first, which this shape makes
// impossible rather than merely unlikely: there is only ever ONE src.
//
// ---------------------------------------------------------------------------
// THE CHIPS ARE PROVENANCE FILTERS, and Punch is the read-only join (D-15).
// ---------------------------------------------------------------------------
// All / Daily logs / Deliveries / Punch, single-select, bound to the same
// `source` derivation the badges use — so a photo under the Punch chip is
// exactly a photo carrying the Punch badge (A-22b). Rendering this screen
// writes nothing to `punch_list_items` (A-22c); the join is a SELECT of two
// columns and the two keep their distinct meanings.

const CHIPS: readonly Chip[] = [
  { value: null, label: 'All' },
  { value: 'log', label: 'Daily logs' },
  { value: 'delivery', label: 'Deliveries' },
  { value: 'punch', label: 'Punch' },
];

/** `TODAY` / `JUL 8` — §4.8's mono uppercase day label. */
function dayLabel(iso: string, todayIso: string): string {
  if (iso === todayIso) return 'TODAY';
  const d = new Date(`${iso}T00:00:00`);
  return d
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    .toUpperCase();
}

export default async function ProjectPhotosPage({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams: { source?: string; q?: string };
}) {
  const raw = searchParams.source;
  const active = raw === 'log' || raw === 'delivery' || raw === 'punch' ? raw : null;

  const [photos, profile, project] = await Promise.all([
    getProjectPhotos(params.projectId),
    getMyProfile(),
    getProject(params.projectId),
  ]);

  // A-25d — `files_delete_owner_admin` restricts DELETE to Owner/Admin, and the
  // UI must not offer an action the DB will reject.
  const canDelete = profile?.role === 'owner' || profile?.role === 'admin';

  const filtered = active ? photos.filter((p) => p.source === active) : photos;

  const q = (searchParams.q ?? '').trim().toLowerCase();
  const searched = q
    ? filtered.filter(
        (p) =>
          p.file_name.toLowerCase().includes(q) ||
          (p.tags ?? []).some((t) => t.toLowerCase().includes(q)) ||
          (p.ai_tags ?? []).some((t) => t.toLowerCase().includes(q))
      )
    : filtered;

  // Company-tz calendar day [S106]. The TODAY label is compared against
  // created_at's date part, so a UTC "today" mislabelled the day's own photos
  // every evening west of UTC.
  const todayIso = companyToday((await getCompanyTimeSettings()).timezone);

  // Day is derived once, on the server, so the grid never has to parse dates
  // and the "Today" label cannot disagree between two components.
  const rows: GridPhoto[] = searched.map((p) => {
    const day = (p.created_at ?? '').slice(0, 10);
    return {
      id: p.id,
      file_name: p.file_name,
      displayUrl: p.displayUrl,
      hasMarkup: p.hasMarkup,
      source: p.source,
      day,
      dayLabel: day ? dayLabel(day, todayIso) : 'UNDATED',
    };
  });

  return (
    <div className="pb-[18px]">
      {/* §4.8's app bar: "Photos" over mono `{project} · {n} photos`.
          The count is the WHOLE gallery, not the filtered view — it names the
          project's photo total, which is the same figure M-3's Photos badge
          carries (D-14 as amended: total count, and NO unseen dot anywhere). */}
      <SetMobileHeader
        title="Photos"
        sub={`${project?.name ?? 'Project'} · ${photos.length} photos`}
      />

      <div className="px-[18px] pt-[14px]">
        {/* §4.8 puts a search control in the app bar. It is rendered HERE, at
            44px, rather than as the specified 38px button in the bar itself —
            two deliberate deviations, both flagged in the slice report:
              · 38px is below §2's 44px floor, and A-5 exempts only the markup
                colour swatches. D-36 CUT the app bar's 38px avatar for exactly
                this reason, so shipping a second sub-floor control in the same
                bar would re-introduce what that ruling removed.
              · §3.1 as amended by D-36 ends "Right: nothing", and A-40 asserts
                the app bar renders no right-hand element on any /m route. A
                search button in the bar fails it. */}
        <PhotoSearch
          basePath={`/m/p/${params.projectId}/photos`}
          source={active}
          initial={searchParams.q ?? ''}
        />

        <div className="mt-[12px]">
          <FilterChips
            chips={CHIPS}
            active={active}
            basePath={`/m/p/${params.projectId}/photos`}
            param="source"
          />
        </div>
      </div>

      <PhotoGrid photos={rows} projectId={params.projectId} canDelete={canDelete} />
    </div>
  );
}
