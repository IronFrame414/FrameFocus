import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// S109 #159 — the UI half. SOURCE-LEVEL, for the reason `s158-ui-fixes.test.tsx`
// gives: `BiddingTab` pulls in the browser Supabase client and a dozen services,
// and what is being asserted is wiring, not markup. The DB half (sent_at is NULL
// until sent) is `s109-bid-request-sent-at.live.ts`.

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const tab = read('../app/dashboard/estimates/[id]/bidding-tab.tsx');
const client = read('../lib/services/sub-bid-requests-client.ts');
const subs = read('../lib/services/subcontractors-client.ts');

describe('S109 #159 — Send in the creation dialog, and a label that tells the truth', () => {
  it('createSubBidRequest returns the new id (the dialog cannot send without it)', () => {
    expect(client).toMatch(/\.select\('id, token'\)/);
    expect(client).toMatch(/return \{ success: true, token: data\.token, id: data\.id \}/);
  });

  it('the dialog sends through BiddingTab\'s handleSendRequest — ONE send path, not a second', () => {
    expect(tab).toMatch(/onSendRequest=\{handleSendRequest\}/);
    expect(tab).toMatch(/const ok = await onSendRequest\(createdId\)/);
    // No second call to the route from inside the dialog.
    const dialog = tab.slice(tab.indexOf('function RequestByLinkForm'));
    expect(dialog).not.toMatch(/sendSubBidRequest\(/);
  });

  it('Send is offered in BOTH reply modes (ASK-159.C)', () => {
    const emailedPanel = tab.slice(tab.indexOf('if (emailed) {'), tab.indexOf('if (link) {'));
    const linkPanel = tab.slice(tab.indexOf('if (link) {'), tab.indexOf('if (link) {') + 1500);
    expect(emailedPanel).toContain('{sendControl}');
    expect(linkPanel).toContain('{sendControl}');
  });

  it('a sub with no email disables Send and states the reason', () => {
    expect(subs).toMatch(/\.select\('id, company_name, trade_type, email'\)/);
    expect(tab).toMatch(/disabled=\{sending \|\| sent \|\| !!noEmailReason\}/);
    expect(tab).toMatch(/has no email address on file/);
    expect(tab).toContain('data-testid="bid-request-dialog-no-email"');
  });

  it('the chip says "not yet emailed" when sent_at is NULL, and Send/Resend keys on sent_at', () => {
    expect(tab).toMatch(/r\.status === 'sent' && !r\.sent_at \? 'not yet emailed' : r\.status/);
    expect(tab).toMatch(/r\.sent_at \? 'Resend' : 'Send'/);
  });
});
