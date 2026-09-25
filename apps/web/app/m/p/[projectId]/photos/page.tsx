import { getProjectPhotos } from '@/lib/services/photos';
import { M_LIBRARY_INPUT_ID } from '@/app/m/library-input';
import { getMyProfile } from '@/lib/services/profiles';
import { getProject } from '@/lib/services/projects';
import { getCompanyTimeSettings } from '@/lib/services/company';
import { calendarDayInZone, companyToday } from '@framefocus/shared/utils/dates';
import { SetMobileHeader } from '../../../mobile-header';
import { FilterChips, type Chip } from '../../../mobile-ui';
import { PhotoGrid, type GridPhoto } from './photo-grid';
import { PhotoSearch } from './photo-search';
import { getMobileT } from '@/lib/i18n/server';
import type { T } from '@/lib/i18n/messages';

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

// [S110 H] Labels translated; `testKey` keeps each `m-chip-*` id on the English
// word, so the ids do not change with the reader's language.
function chips(t: T): readonly Chip[] {
  return [
    { value: null, label: t('photos.chip.all'), testKey: 'All' },
    { value: 'log', label: t('photos.chip.dailyLogs'), testKey: 'Daily logs' },
    { value: 'delivery', label: t('photos.chip.deliveries'), testKey: 'Deliveries' },
    { value: 'punch', label: t('photos.chip.punch'), testKey: 'Punch' },
  ];
}

/** `TODAY` / `JUL 8` — §4.8's mono uppercase day label. */
function dayLabel(iso: string, todayIso: string, t: T): string {
  if (iso === todayIso) return t('photos.day.today');
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
  const t = await getMobileT();
  const raw = searchParams.source;
  const active = raw === 'log' || raw === 'delivery' || raw === 'punch' ? raw : null;

  const [photos, profile, project] = await Promise.all([
    getProjectPhotos(params.projectId, { thumbnails: true }),
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
          (p.tags ?? []).some((tag) => tag.toLowerCase().includes(q)) ||
          (p.ai_tags ?? []).some((tag) => tag.toLowerCase().includes(q))
      )
    : filtered;

  // Company-tz calendar day [S106, COMPLETED S112]. BOTH SIDES OF THIS
  // COMPARISON MUST LIVE IN THE SAME ZONE — S106 moved `todayIso` here and left
  // the other side as `created_at.slice(0, 10)`, the UTC day, so from ~20:00
  // EDT a photo taken tonight was grouped under TOMORROW and never said TODAY.
  // The A-22d Playwright assertion agreed with the bug for four hours a night
  // and failed at 01:40 UTC; the boundary is now pinned in a unit test
  // (m6m-hubs.test.ts) instead of depending on when the suite runs.
  const timezone = (await getCompanyTimeSettings()).timezone;
  const todayIso = companyToday(timezone);

  // Day is derived once, on the server, so the grid never has to parse dates
  // and the "Today" label cannot disagree between two components.
  const rows: GridPhoto[] = searched.map((p) => {
    // NOT `.slice(0, 10)` — that is the UTC day. See the note above `timezone`.
    const day = p.created_at ? calendarDayInZone(p.created_at, timezone) : '';
    return {
      id: p.id,
      file_name: p.file_name,
      displayUrl: p.displayUrl,
      thumbUrl: p.thumbUrl,
      hasMarkup: p.hasMarkup,
      source: p.source,
      day,
      dayLabel: day ? dayLabel(day, todayIso, t) : t('photos.day.undated'),
    };
  });

  return (
    <div className="pb-[18px]">
      {/* §4.8's app bar: "Photos" over mono `{project} · {n} photos`.
          The count is the WHOLE gallery, not the filtered view — it names the
          project's photo total, which is the same figure M-3's Photos badge
          carries (D-14 as amended: total count, and NO unseen dot anywhere). */}
      <SetMobileHeader
        title={t('photos.gallery.title')}
        sub={t('photos.gallery.sub', {
          project: project?.name ?? t('photos.gallery.projectFallback'),
          n: photos.length,
        })}
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

        {/* [S111 Part Two, RULED Q16] "Add photos" opens the photo LIBRARY. Before
            S111 this screen had no upload control; the only way in was the tab
            bar, whose big amber control is camera-only (M6M D-8) with the
            library as a small icon beside it. This is a label on that SAME
            library input (M_LIBRARY_INPUT_ID), not a second upload path: the
            project comes from this URL, bursts work, and it queues offline
            exactly as the tab bar does. Same authority as the tab bar, which
            every /m role already has. */}
        <label
          htmlFor={M_LIBRARY_INPUT_ID}
          data-testid="m-photos-add"
          className="mt-[12px] flex min-h-[48px] w-full cursor-pointer items-center justify-center rounded-[14px] border border-m6m-border bg-m6m-card text-[15px] font-bold text-m6m-blue"
        >
          {t('photos.gallery.addPhotos')}
        </label>

        <div className="mt-[12px]">
          <FilterChips
            chips={chips(t)}
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
