import { describe, it, expect } from 'vitest';
import { SUB_UPLOAD_TAG, bidderCanSeeFile } from '@/lib/services/sub-bid-files';

// S107 Part B — WHO SEES WHAT ON AN ANONYMOUS PAGE.
//
// ⚠️ The failure this guards is a competitor's BID PDF being handed to a rival
// bidder. An estimate's files are the estimator's scope documents AND every
// other sub's upload, the page is anonymous, and the token is the only
// credential — so an unfiltered list is a money disclosure to whoever holds a
// link. This is the rule that stops it, and it is tested as a rule rather than
// only exercised through the route.

const staffScopeDoc = { created_by: 'staff-uuid', tags: ['plans'] };
const subUpload = { created_by: null, tags: [SUB_UPLOAD_TAG] };

describe('bidderCanSeeFile — the anonymous bidder sees scope docs and nothing else', () => {
  it("shows the estimator's scope document", () => {
    expect(bidderCanSeeFile(staffScopeDoc)).toBe(true);
  });

  it("HIDES another subcontractor's upload", () => {
    expect(bidderCanSeeFile(subUpload)).toBe(false);
  });

  // ⚠️ The two guards must fail INDEPENDENTLY, or the redundancy is decorative.
  // These are the exact single-regression scenarios each one exists to survive.
  it('still hides it when the TAG is missing — created_by alone catches it', () => {
    expect(bidderCanSeeFile({ created_by: null, tags: [] })).toBe(false);
    expect(bidderCanSeeFile({ created_by: null, tags: null })).toBe(false);
  });

  it('still hides it when created_by IS set — the tag alone catches it', () => {
    // The regression: some future path stamps created_by on a sub upload.
    expect(bidderCanSeeFile({ created_by: 'staff-uuid', tags: [SUB_UPLOAD_TAG] })).toBe(false);
  });

  it('hides a row that is neither — no created_by and no tags at all', () => {
    expect(bidderCanSeeFile({})).toBe(false);
  });

  it('a staff file carrying OTHER tags is still visible (the tag test is exact, not fuzzy)', () => {
    expect(bidderCanSeeFile({ created_by: 'staff-uuid', tags: ['sub', 'bid', 'upload'] })).toBe(true);
    expect(bidderCanSeeFile({ created_by: 'staff-uuid', tags: ['sub-bid-upload-draft'] })).toBe(true);
  });
});
