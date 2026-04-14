// Throwaway test page for the MarkupViewer component.
// Delete after Module 3G is validated.

import { MarkupViewer } from '@framefocus/shared/components/MarkupViewer';
import type { MarkupData } from '@framefocus/shared/types/markup';

const TEST_IMAGE_URL = 'https://picsum.photos/id/1043/1200/800';

const TEST_MARKUP: MarkupData = {
  version: 1,
  imageWidth: 1200,
  imageHeight: 800,
  shapes: [
    {
      id: '1',
      type: 'arrow',
      x1: 100,
      y1: 100,
      x2: 400,
      y2: 300,
      color: '#ef4444',
      strokeWidth: 6,
    },
    {
      id: '2',
      type: 'circle',
      cx: 700,
      cy: 250,
      rx: 120,
      ry: 80,
      color: '#22c55e',
      strokeWidth: 6,
    },
    {
      id: '3',
      type: 'rectangle',
      x: 150,
      y: 450,
      width: 300,
      height: 200,
      color: '#3b82f6',
      strokeWidth: 6,
    },
    {
      id: '4',
      type: 'pen',
      points: [
        { x: 600, y: 500 },
        { x: 650, y: 520 },
        { x: 700, y: 490 },
        { x: 750, y: 530 },
        { x: 800, y: 510 },
        { x: 850, y: 540 },
        { x: 900, y: 500 },
      ],
      color: '#a855f7',
      strokeWidth: 6,
    },
    {
      id: '5',
      type: 'text',
      x: 200,
      y: 80,
      content: 'Check this area',
      color: '#000000',
      fontSize: 36,
    },
  ],
};

export default function MarkupTestPage() {
  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '1rem' }}>Markup Viewer Test</h1>
      <p style={{ marginBottom: '1rem', color: '#666' }}>
        Should show a photo with: red arrow (top-left), green circle (top-right), blue rectangle
        (bottom-left), purple squiggle (bottom-middle), black text label.
      </p>
      <div style={{ border: '1px solid #ccc' }}>
        <MarkupViewer imageUrl={TEST_IMAGE_URL} markup={TEST_MARKUP} />
      </div>
    </div>
  );
}
