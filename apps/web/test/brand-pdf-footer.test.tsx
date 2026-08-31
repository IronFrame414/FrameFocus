import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { pdfText } from './pdf-text';
import { brand } from '@/lib/brand';
import { DailyLogDocument, type DailyLogPdfData } from '@/lib/daily-logs/daily-log-template';
import { DeliveryDocument, type DeliveryPdfData } from '@/lib/deliveries/delivery-template';
import { IncidentDocument, type IncidentPdfData } from '@/lib/safety/incident-template';

// Renders the three INTERNAL field PDFs (daily log, delivery, incident) and
// asserts the footer carries the product name from lib/brand.ts.
//
// WHY THIS EXISTS BEYOND THE REBRAND: these three are the only templates that
// name the product at all — the client-facing three (invoice, proposal, change
// order) are deliberately white-label and carry the CONTRACTOR's identity, so
// they must never gain a product footer. A future rename now has a test that
// fails if any of these three drifts back to a literal, and
// invoice-template.test.tsx's opening note — that a template can break at
// render time with type-check, tests and build all green — applies here too.
//
// Two levels, because they catch different things:
//   1. react-dom renderToString — the house pattern (see
//      lib/invoices/invoice-template.test.tsx). Exercises the component tree
//      and every value reaching a text node, fast, no PDF process.
//   2. @react-pdf renderToBuffer — a REAL PDF. Text is extracted by inflating
//      the Flate content streams. This is the only check that proves the
//      string survives @react-pdf's own layout and font pipeline.

const daily: DailyLogPdfData = {
  companyName: 'Sabal Point Construction',
  projectName: 'Maple St Remodel',
  logDate: '2026-08-04',
  authorName: 'Josh Bishop',
  weather: 'Clear, 82F',
  workPerformed: 'Framed the east wall.',
  materialUsed: null,
  materialNeeded: null,
  equipmentUsed: null,
  tasksTomorrow: null,
  notes: null,
  hazardsPresent: false,
  hazardNotes: null,
  crew: [{ name: 'A. Rivera', hours: 8, warrantyOnly: false }],
  subs: [],
  deliveries: [],
  photos: [],
  photoCount: 0,
  generatedAt: '2026-08-04T18:00:00.000Z',
  timeZone: 'America/Denver',
};

const delivery: DeliveryPdfData = {
  companyName: 'Sabal Point Construction',
  projectName: 'Maple St Remodel',
  vendorName: 'Mountain Supply',
  deliveryDate: '2026-08-04',
  receiverName: 'A. Rivera',
  poTitle: null,
  hasExceptions: false,
  notes: null,
  lines: [
    { description: '2x4 studs', qtyReceived: 200, qtyDamaged: 0, issueNote: null, photos: [], photoCount: 0 },
  ],
  generalPhotos: [],
  generalPhotoCount: 0,
  generatedAt: '2026-08-04T18:00:00.000Z',
  timeZone: 'America/Denver',
};

const incident: IncidentPdfData = {
  companyName: 'Sabal Point Construction',
  projectName: 'Maple St Remodel',
  incidentDate: '2026-08-04',
  incidentType: 'near_miss',
  status: 'open',
  reporterName: 'Josh Bishop',
  description: 'Ladder slipped, no contact.',
  preventionNotes: null,
  outcome: null,
  injuries: [],
  witnesses: [],
  photos: [],
  photoCount: 0,
  generatedAt: '2026-08-04T18:00:00.000Z',
  timeZone: 'America/Denver',
};

// Factories, not JSX literals: elements sitting directly in an array trip
// react/jsx-key, and building them per-test keeps the cases independent.
const CASES = [
  ['daily log', () => <DailyLogDocument data={daily} />],
  ['delivery', () => <DeliveryDocument data={delivery} />],
  ['incident', () => <IncidentDocument data={incident} />],
] as const;

describe('internal field PDFs carry the rebranded footer', () => {
  it('brand.name is the new product name', () => {
    expect(brand.name).toBe('EZ Contractor Binder');
  });

  describe.each(CASES)('%s', (_label, makeElement) => {
    it('component tree renders the product name, not FrameFocus', () => {
      const html = renderToString(makeElement());
      expect(html).toContain(brand.name);
      expect(html).not.toContain('FrameFocus');
      // the footer is "{companyName} · {brand.name}"
      expect(html).toContain('Sabal Point Construction');
    });

    it('the real PDF contains the product name, not FrameFocus', async () => {
      const buf = await renderToBuffer(makeElement());
      expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
      const text = pdfText(buf);
      expect(text).toContain(brand.name);
      expect(text).not.toContain('FrameFocus');
    });
  });
});
