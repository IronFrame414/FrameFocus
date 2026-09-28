import { describe, it, expect } from 'vitest';
import { BID_SCOPE_TAG, SUB_UPLOAD_TAG, bidderCanSeeFile } from '@/lib/services/sub-bid-files';

// S107 Part B — WHO SEES WHAT ON AN ANONYMOUS PAGE.
//
// ⚠️ The failure this guards is a competitor's BID PDF being handed to a rival
// bidder. An estimate's files are the estimator's scope documents AND every
// other sub's upload, the page is anonymous, and the token is the only
// credential — so an unfiltered list is a money disclosure to whoever holds a
// link. This is the rule that stops it, and it is tested as a rule rather than
// only exercised through the route.

// [S114 C-3 hotfix] A scope document is one staff SHARED WITH BIDDERS (the bid-scope tag).
// _Superseded, quoted:_ `const staffScopeDoc = { created_by: 'staff-uuid', tags: ['plans'] };`
const staffScopeDoc = { created_by: 'staff-uuid', tags: ['plans', BID_SCOPE_TAG] };
const subUpload = { created_by: null, tags: [SUB_UPLOAD_TAG] };

// [S114] _Superseded title, quoted:_ 'bidderCanSeeFile — the anonymous bidder sees scope docs and nothing else'
describe('bidderCanSeeFile — the anonymous bidder sees SHARED scope docs and nothing else', () => {
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
    expect(bidderCanSeeFile({ created_by: 'staff-uuid', tags: [SUB_UPLOAD_TAG, BID_SCOPE_TAG] })).toBe(false);
  });

  it('hides a row that is neither — no created_by and no tags at all', () => {
    expect(bidderCanSeeFile({})).toBe(false);
  });

  // [S114 C-3 hotfix, RULED Josh 2026-09-28] INVERTED, not deleted. _Superseded title, quoted:_ "a
  // staff file carrying OTHER tags is still visible (the tag test is exact, not fuzzy)", which asserted
  // `tags: ['sub', 'bid', 'upload']` and `tags: ['sub-bid-upload-draft']` → `true`. That is exactly how
  // every site-visit photo, voice note and Files-tab attachment reached any bid-token holder. A staff
  // file is now HIDDEN unless staff shared it.
  it('a staff file NOT shared with bidders is HIDDEN — site-visit photo, voice note, worksheet', () => {
    expect(bidderCanSeeFile({ created_by: 'staff-uuid', tags: [] })).toBe(false);
    expect(bidderCanSeeFile({ created_by: 'staff-uuid', tags: null })).toBe(false);
    expect(bidderCanSeeFile({ created_by: 'staff-uuid', tags: ['sub', 'bid', 'upload'] })).toBe(false);
    expect(bidderCanSeeFile({ created_by: 'staff-uuid', tags: ['sub-bid-upload-draft'] })).toBe(false);
  });

  it('the share tag is exact, not fuzzy', () => {
    expect(bidderCanSeeFile({ created_by: 'staff-uuid', tags: ['bid-scope-draft'] })).toBe(false);
    expect(bidderCanSeeFile({ created_by: 'staff-uuid', tags: [BID_SCOPE_TAG] })).toBe(true);
  });
});
