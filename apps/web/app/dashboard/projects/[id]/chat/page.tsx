import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { ChatTab } from '@/components/chat/chat-tab';

/**
 * The project Chat tab — §7.1b.
 *
 * ---------------------------------------------------------------------------
 * FOR READING PROPERLY, NOT FOR REACHABILITY
 * ---------------------------------------------------------------------------
 * The panel (ND-33) is the primary surface and this is the other one: full
 * height, full history, the auditing view. Q6's "where does the record live six
 * months later" is answered HERE, not in a panel corner — and it is also how an
 * ARCHIVED project's thread stays reachable after the switcher drops it
 * (§7.1a-i, A-C38). The messages never vanish; the project simply stops being
 * one tap away.
 *
 * ⚠️ NO ROLE GATE, AND THE ABSENCE IS THE DECISION (ND-35, A-C27). RLS already
 * decides who can read a thread via `can_view_project()`. A `roles` entry on
 * the tab would be a second answer to a question already answered, and the two
 * would then have to be kept in step forever. Several sibling tabs do carry
 * `roles`; chat deliberately does not.
 *
 * It renders `ChatThreadView` — the SAME component the panel renders (A-C28).
 * The only difference is `surface`, which picks ND-38's page size: 50 here, 25
 * in the panel.
 */
export default async function ProjectChatPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile) redirect('/dashboard');

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 260px)',
        minHeight: '420px',
        overflow: 'hidden',
        backgroundColor: '#fff',
        border: '1px solid #e6e9ef',
        borderRadius: '13px',
      }}
    >
      <ChatTab projectId={params.id} myProfileId={profile.id} />
    </div>
  );
}
