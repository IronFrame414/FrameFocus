import { test, expect } from '@playwright/test';
import { OWNER, signIn } from './chat-fixture';
import { adminClient } from './hub-fixture';

// ============================================================================
// S173 Job 1 — THE SEND AFFORDANCE MUST EXIST, and this file goes red if it
// disappears again.
//
// History, so nobody re-bisects: no commit ever removed a Send button. Since
// M4 shipped, the ONLY email-send affordance was "Send Proposal" on the
// proposal PREVIEW page (Details tab → "Preview Proposal" → Send) — the
// builder itself offered only "Mark as Sent", a status flip that emails
// nobody. S173 put "Send to Client" (draft) and "Approve & Send" (review) on
// the builder, both opening the same SendProposalModal → api/proposals/send.
//
// The suite covered the ROUTE and nothing covered the AFFORDANCE — the same
// class as the CO signature being broken for ten days. These tests assert the
// buttons render; they deliberately do NOT click through to a real email send.
// ============================================================================

const MARKER = 'E2ESEND';
const CONTACT_EMAIL = 'e2esend-client@example.com';

let estimateId = '';

async function sweep(): Promise<string[]> {
  const admin = adminClient();
  const errors: string[] = [];
  const check = (label: string, error: { message: string } | null) => {
    if (error) errors.push(`${label}: ${error.message}`);
  };
  const { data: ests } = await admin.from('estimates').select('id').like('name', `${MARKER}%`);
  const ids = (ests ?? []).map((e) => e.id);
  if (ids.length) {
    check('email_logs', (await admin.from('email_logs').delete().in('estimate_id', ids)).error);
    check(
      'signing_sessions',
      (await admin.from('signing_sessions').delete().in('estimate_id', ids)).error
    );
    check('estimates', (await admin.from('estimates').delete().in('id', ids)).error);
  }
  check('contacts', (await admin.from('contacts').delete().like('first_name', `${MARKER}%`)).error);
  return errors;
}

test.beforeAll(async () => {
  const errors = await sweep();
  expect(errors, 'pre-run sweep met refusals — residue would poison the run').toEqual([]);
  const admin = adminClient();
  const { data: company } = await admin
    .from('companies')
    .select('id')
    .eq('name', 'Sabal Point Construction')
    .single();
  const { data: contact, error: contactError } = await admin
    .from('contacts')
    .insert({
      company_id: company!.id,
      contact_type: 'client',
      first_name: `${MARKER} Test`,
      last_name: 'Client',
      email: CONTACT_EMAIL,
    })
    .select('id')
    .single();
  expect(contactError, 'contact fixture insert refused').toBeNull();
  // Service role: get_my_company_id()/get_my_role()/next_estimate_number()
  // defaults all resolve NULL — supply them explicitly.
  const { data: est, error: estError } = await admin
    .from('estimates')
    .insert({
      company_id: company!.id,
      estimate_number: `${MARKER}-1`,
      name: `${MARKER} Draft estimate`,
      contact_id: contact!.id,
      status: 'draft',
      created_by_role: 'owner',
    })
    .select('id')
    .single();
  expect(estError, 'estimate fixture insert refused').toBeNull();
  estimateId = est!.id;
});

test.afterAll(async () => {
  const errors = await sweep();
  expect(errors, 'teardown met refusals').toEqual([]);
});

test.describe('S173 — the builder offers a real Send, not just the status flip', () => {
  // ⚠️ REWRITTEN AT S107 — THE HEADER BUTTON IS GONE ON PURPOSE.
  //
  // This asserted `est-send`, the header "Send to Client" button, which
  // `00eb9a6` REMOVED deliberately: "send lives in Review & Send" [S103].
  // `est-send` is absent from the app, so the test had been asserting a
  // deliberately deleted affordance and had been red in CI since #290
  // (2026-09-05). The button is NOT restored.
  //
  // S173's claim survives the move intact — "the builder offers a real Send,
  // not just the status flip" — because the real send is still reachable from
  // the builder, one step deeper:
  //
  //   est-review-send  ->  Review & Send sheet  ->  "Send to client"
  //                    ->  openSendModal()      ->  the Send Proposal modal
  //
  // So the same three things are asserted as before: a real send affordance
  // exists for a draft, the status flip (`est-mark-sent`) is still a SEPARATE
  // control, and the send is addressed to the contact. Only the path changed.
  test('Draft, owner: the builder reaches a real Send, addressed to the contact', async ({
    page,
  }) => {
    await signIn(page, OWNER);
    await page.goto(`/dashboard/estimates/${estimateId}`);

    // The real send affordance, and the status flip beside it — still two
    // different controls, which is the half of S173 that the move could have
    // quietly collapsed.
    await expect(page.getByTestId('est-review-send').first()).toBeVisible();
    await expect(page.getByTestId('est-mark-sent').first()).toBeVisible();

    await page.getByTestId('est-review-send').first().click();
    // The sheet, then the send it hands off to.
    await page.getByRole('button', { name: 'Send to client' }).click();

    await expect(page.getByRole('heading', { name: 'Send Proposal' })).toBeVisible();
    await expect(page.getByText(CONTACT_EMAIL)).toBeVisible();
    // Close without sending — delivery is the route's covered job, not this file's.
    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  test('the preview page still has its own "Send Proposal" (the original, once-only affordance)', async ({
    page,
  }) => {
    await signIn(page, OWNER);
    await page.goto(`/dashboard/estimates/${estimateId}/proposal`);
    await expect(page.getByTestId('preview-send')).toBeVisible();
  });

  test('Review, owner: "Approve & Send" opens the send modal (the route stamps the review fields)', async ({
    page,
  }) => {
    const admin = adminClient();
    const { error } = await admin
      .from('estimates')
      .update({ status: 'review' })
      .eq('id', estimateId);
    expect(error).toBeNull();
    await signIn(page, OWNER);
    await page.goto(`/dashboard/estimates/${estimateId}`);
    await expect(page.getByTestId('est-approve-send').first()).toBeVisible();
    await expect(page.getByTestId('est-approve-mark-sent').first()).toBeVisible();
    await page.getByTestId('est-approve-send').first().click();
    await expect(page.getByRole('heading', { name: 'Send Proposal' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    // Put the fixture back so test order doesn't leak state.
    await admin.from('estimates').update({ status: 'draft' }).eq('id', estimateId);
  });
});
