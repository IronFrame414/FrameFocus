// S110 F — ROUTES WHOSE RESPONSE IS A CONTRACT, AND EVERY FILE THAT DEPENDS ON IT.
// [RULED Josh, S110: "a change to a route's response contract must not be able
// to break a consumer silently again."]
//
// ⚠️ THE INCIDENT. #161 removed `url` from `GET /api/estimates/[id]/files`. Its
// search for consumers was piped through `head -10`, and the eleventh hit —
// `components/site-visits/site-visit-record.tsx`, which read `url` off each row —
// was never seen. Every site-visit photo went blank on production.
//
// `test/s110-route-contracts.test.ts` enforces this file in the CI unit suite:
//   1. CONSUMER SET — it walks app/, components/, lib/, e2e/ and test/
//      (comments stripped) for each route's path, and fails if the files found
//      differ from `consumers` below in EITHER direction. A new consumer must be
//      added here, which means someone read this entry first.
//   2. FIELDS — every field in `fields` must still be produced by the route
//      source, and every field a consumer declares must be in `fields`. So
//      removing a field forces an edit here, and that edit goes red against
//      each consumer that declared the field. (A consumer-set check ALONE would
//      not have caught #161: the record was already a consumer; a FIELD went.)
//   3. TYPES — the route `satisfies` the type in `estimate-files.ts` and the
//      consumers import it, so `tsc` catches a read of a removed field too.
//
// When you change a contract route's response: update `fields`, then fix or
// re-declare every consumer the test names. Paths must be literal template
// strings — a path assembled by concatenation or from a variable last segment
// is invisible to the walk, and is not allowed for a contract route.

export interface RouteContract {
  /** The route module, relative to apps/web. */
  route: string;
  /** Matches a consumer's reference to the route (after comments are stripped). */
  pattern: RegExp;
  /** Where the route's fields are read from: the JSON keys it returns, or the
   *  columns of every `.select('…')` in the module (a route that returns rows). */
  fieldSource: 'json' | 'select';
  /** The fields the route produces that consumers may rely on. */
  fields: string[];
  /** Every file that references the route → the fields it reads. [] = it
   *  references the route without reading response fields (a test importing the
   *  module, an upload that reads only `error`, …) — say which in the comment. */
  consumers: Record<string, string[]>;
}

// One path segment as a consumer writes it: `${expr}` or a literal id.
const SEG = String.raw`(?:\$\{[^}]+\}|[\w-]+)`;

export const ROUTE_CONTRACTS: RouteContract[] = [
  {
    route: 'app/api/estimates/[id]/files/route.ts',
    // The list/upload route: `/api/estimates/<id>/files` NOT followed by a
    // further segment, or the module path itself.
    pattern: new RegExp(
      String.raw`/api/estimates/${SEG}/files(?![/\w])|api/estimates/\[id\]/files/route`
    ),
    fieldSource: 'select',
    fields: ['id', 'file_name', 'file_size', 'mime_type', 'category', 'created_at', 'site_visit_capture'],
    consumers: {
      // The desktop Files tab: lists, opens (id), shows name/size/date, uploads.
      'app/dashboard/estimates/[id]/estimate-files-tab.tsx': [
        'id',
        'file_name',
        'file_size',
        'mime_type',
        'created_at',
      ],
      // THE #161 CONSUMER. Reads the list to find photos and audio, then signs
      // each through the /url route (lib/site-visits/media.ts).
      // [S110 A] also reads site_visit_capture: the tab shows captures only.
      'components/site-visits/site-visit-record.tsx': ['id', 'file_name', 'mime_type', 'created_at', 'site_visit_capture'],
      // POST only; reads `error` on failure, no row fields.
      'lib/services/site-visits-client.ts': [],
      // S2 asserts the list carries NO url and NO file_path (161.B).
      'e2e/desktop-file-sheet-s109.spec.ts': ['id'],
      // Import the route module / read its source.
      'test/s107-estimate-files-route-order.test.ts': [],
      'test/s109-file-sheet.test.ts': [],
    },
  },
  {
    route: 'app/api/estimates/[id]/files/[fileId]/url/route.ts',
    pattern: new RegExp(
      String.raw`/api/estimates/${SEG}/files/${SEG}/url|api/estimates/\[id\]/files/\[fileId\]/url/route`
    ),
    fieldSource: 'json',
    fields: ['url', 'file_name', 'mime_type'],
    consumers: {
      'app/dashboard/estimates/[id]/estimate-files-tab.tsx': ['url'],
      // resolveSiteVisitMedia() — every site-visit photo and voice note.
      'lib/site-visits/media.ts': ['url'],
      'test/s109-estimate-file-url-order.test.ts': [],
      'test/s109-file-sheet.test.ts': [],
      'test/s109-site-visit-media.test.ts': ['url'],
    },
  },
  {
    route: 'app/api/files/signed-url/route.ts',
    pattern: new RegExp(String.raw`/api/files/signed-url|api/files/signed-url/route`),
    fieldSource: 'json',
    fields: ['url', 'error'],
    consumers: {
      'app/dashboard/projects/[id]/files/file-row-actions.tsx': ['url'],
      'app/dashboard/projects/[id]/files/file-row.tsx': ['url'],
      // /m open-file distinguishes 403 from 500 by STATUS; reads only `url`.
      'app/m/p/[projectId]/files/open-file.tsx': ['url'],
      'e2e/m-details.spec.ts': [],
      // TECH_DEBT #142 — the error contract.
      'test/signed-url-error-contract.test.ts': ['error'],
    },
  },
];
