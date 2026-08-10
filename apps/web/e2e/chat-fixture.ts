import type { Page } from '@playwright/test';
import { adminClient, COMPANY_A } from './hub-fixture';

// ---------------------------------------------------------------------------
// Chat fixtures for the slice-3 desktop specs.
//
// EVERY CHAT TABLE IS EMPTY ON REBUILD-TEST AND MUST GO BACK TO EMPTY. Slice 1
// verified 0/0/0/0 and the post-rebuild pass re-verified it, so a spec that
// leaves rows behind does not just pollute the next run — it invalidates a
// documented, re-checked claim. `teardownChat()` removes everything for the
// projects a spec touched, and each spec calls it in afterAll.
//
// The threads themselves are created BY THE APP, not seeded, wherever the spec
// can manage it: a fixture that inserts a chat_threads row would test the
// renderer against a state the real lazy-creation path might never produce.
// ---------------------------------------------------------------------------

export const PASSWORD = process.env.E2E_PASSWORD ?? 'FrameFocusTest!2026';

/** Owner. Reaches every project by role, so the switcher is never empty. */
export const OWNER = 'josh+test50@worthprop.com';
/** Crew. Assigned to QA A, `test` and `test4` — the least-privileged reader. */
export const CREW = 'josh+crew@worthprop.com';

/** "QA A — isolation fixture" — crew, PM, foreman and the QA sub are assigned. */
export const PROJECT_QA_A = '4a4f8567-67f8-4394-baae-181229974bd9';
export const PROJECT_QA_A_NAME = 'QA A — isolation fixture';
/** "test" — also assigned to crew, so a second row exists to order against. */
export const PROJECT_TEST = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4';

export async function signIn(page: Page, email: string): Promise<void> {
  // ⚠️ COOKIES CLEARED FIRST, so signing in as a SECOND identity in one test
  // works. `middleware.ts` redirects an AUTHENTICATED request away from
  // /sign-in to /dashboard — the same behaviour auth.setup.ts documents as the
  // reason the anonymous and authenticated Playwright projects are separate —
  // so without this the form never renders and the call hangs on `#email`
  // until the test times out. Found exactly that way.
  await page.context().clearCookies();
  await page.goto('/sign-in');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

/** Profile id for an email — messages are attributed to a PROFILE, not a user. */
export async function profileIdFor(email: string): Promise<string> {
  const admin = adminClient();
  const { data } = await admin.from('profiles').select('id').eq('email', email).single();
  return (data as { id: string }).id;
}

/**
 * Put a message into a project's crew thread AS SOMEBODY ELSE.
 *
 * Someone else's message on purpose: `chat_switcher_threads()` deliberately
 * never counts your OWN messages as unread, so seeding as the viewer would make
 * every unread assertion pass at zero and prove nothing.
 */
export async function seedMessage(
  projectId: string,
  authorEmail: string,
  body: string
): Promise<{ threadId: string; messageId: string }> {
  const admin = adminClient();

  const { data: existing } = await admin
    .from('chat_threads')
    .select('id')
    .eq('project_id', projectId)
    .eq('kind', 'crew')
    .maybeSingle();

  let threadId = (existing as { id: string } | null)?.id;
  if (!threadId) {
    const { data: created, error } = await admin
      .from('chat_threads')
      .insert({ company_id: COMPANY_A, project_id: projectId, kind: 'crew' })
      .select('id')
      .single();
    if (error) throw new Error(`seedMessage: thread insert failed — ${error.message}`);
    threadId = (created as { id: string }).id;
  }

  const authorProfileId = await profileIdFor(authorEmail);
  const { data: msg, error: msgError } = await admin
    .from('chat_messages')
    .insert({
      company_id: COMPANY_A,
      thread_id: threadId,
      author_profile_id: authorProfileId,
      body,
    })
    .select('id')
    .single();
  if (msgError) throw new Error(`seedMessage: message insert failed — ${msgError.message}`);

  return { threadId, messageId: (msg as { id: string }).id };
}

/** Remove every chat row for these projects, in FK order. */
export async function teardownChat(projectIds: string[]): Promise<void> {
  const admin = adminClient();

  const { data: threads } = await admin
    .from('chat_threads')
    .select('id')
    .in('project_id', projectIds);

  const ids = ((threads ?? []) as Array<{ id: string }>).map((t) => t.id);
  if (ids.length === 0) return;

  const { data: messages } = await admin.from('chat_messages').select('id').in('thread_id', ids);
  const messageIds = ((messages ?? []) as Array<{ id: string }>).map((m) => m.id);

  if (messageIds.length > 0) {
    await admin.from('chat_message_mentions').delete().in('message_id', messageIds);
    // ⚠️ THE NOTIFICATION IS A CHAT ROW TOO, AND IT IS NOT IN A chat_* TABLE.
    // A mention sent through the UI writes a real `notifications` row, and the
    // first version of this teardown left one behind — caught only by counting
    // `notifications` afterwards rather than trusting the four chat tables.
    // Deleted BEFORE the messages, because `source_id` is how they are found.
    await admin
      .from('notifications')
      .delete()
      .eq('source_table', 'chat_messages')
      .in('source_id', messageIds);
  }
  await admin.from('chat_reads').delete().in('thread_id', ids);
  await admin.from('chat_messages').delete().in('thread_id', ids);
  await admin.from('chat_threads').delete().in('id', ids);
}
