import type { GpsDisplay } from '@framefocus/shared/utils/gps-display';
import { color } from '@/lib/theme';

/**
 * S127 item 4c (B-1) — one clock event's location, as `describeGps()` words it.
 * Renders NOTHING for a never-attempted capture (null): that is not a failure.
 * A failure shows its REASON in the warning colour; a fix shows coordinates and
 * a map link. The day page and the week sheet both use this.
 */
export function GpsLine({
  label,
  gps,
  testId,
}: {
  label: string;
  gps: GpsDisplay | null;
  testId: string;
}) {
  if (!gps) return null;
  return (
    <span
      data-testid={testId}
      data-gps={gps.kind}
      style={{ fontSize: '12px', color: color.bodyAlt }}
    >
      <span style={{ color: color.faint }}>{label}: </span>
      {gps.kind === 'fix' ? (
        <>
          <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            {gps.text}
          </span>{' '}
          <a
            href={gps.mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: color.primary }}
          >
            Map
          </a>
        </>
      ) : (
        <span style={{ color: color.warning }}>{gps.text}</span>
      )}
    </span>
  );
}
