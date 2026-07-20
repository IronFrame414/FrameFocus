import { cardStyle, color } from '@/lib/theme';

/**
 * Photos tab stub (ui-04 §S2 locked tab set + checkpoint decision). The tab
 * exists so the bar matches the locked set; the gallery itself is later work
 * (photo features live in Module 3 files today — see the Files tab).
 */
export default function ProjectPhotosPage() {
  return (
    <div style={{ ...cardStyle, padding: '48px', textAlign: 'center' }}>
      <p style={{ fontSize: '14px', fontWeight: 600, color: color.navy, margin: 0 }}>
        Photos — coming soon
      </p>
      <p style={{ fontSize: '13px', color: color.muted, margin: '6px 0 0' }}>
        Project photos currently live under the Files tab. A dedicated gallery view lands here in
        a later batch.
      </p>
    </div>
  );
}
