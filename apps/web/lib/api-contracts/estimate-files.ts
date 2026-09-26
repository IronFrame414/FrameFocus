// S110 F — THE RESPONSE CONTRACT OF THE ESTIMATE FILES ROUTES, as types.
//
// ⚠️ WHY THIS FILE EXISTS. On 2026-09-23 #161 removed `url` from the list
// response. `site-visit-record.tsx` read `url` off each row through a
// HAND-WRITTEN interface, so `tsc` had nothing to compare and every site-visit
// photo went blank on production. The routes now `satisfies` these types and
// every consumer imports them — so removing a field from a route's response is
// a type error in the route, and removing it from the type is a type error in
// every consumer that reads it.
//
// Next.js rejects non-route exports from `route.ts`, so the types live here.
// The consumer set is pinned separately: `lib/api-contracts/registry.ts` and
// `test/s110-route-contracts.test.ts`.

/** One row of `GET /api/estimates/[id]/files` (and `POST`'s `file`). No URL and
 *  no `file_path` by ruling 161.B — sign one file on click via the `/url` route. */
export interface EstimateFileListItem {
  id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  category: string;
  created_at: string | null;
  /** [S110 A] captured through the site-visit record — the only files a
   *  foreman or crew member may read on an estimate. */
  site_visit_capture: boolean;
  /** [S112] tagged `bid-scope`: served to the estimate's bidders on /bid. */
  shared_with_bidders: boolean;
}

export interface EstimateFileListResponse {
  files: EstimateFileListItem[];
}

export interface EstimateFileUploadResponse {
  file: EstimateFileListItem;
}

/** `GET /api/estimates/[id]/files/[fileId]/url` — one signed URL, on click. */
export interface EstimateFileUrlResponse {
  url: string;
  file_name: string;
  mime_type: string;
  /**
   * [S111 D] The stored 400px grid thumbnail, signed in the SAME call as `url`.
   * Null for a non-image, or when no thumbnail exists yet — a consumer showing
   * a tile then uses `url` (ruled: never an invisible photo).
   */
  thumb_url: string | null;
}

/** Every error body these routes return. */
export interface ApiErrorResponse {
  error: string;
}
