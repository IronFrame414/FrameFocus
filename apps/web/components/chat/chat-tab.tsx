'use client';

import { useEffect, useState } from 'react';
import type { ThreadKind } from '@/lib/chat/threads';
import { ChatThreadView } from './chat-thread';
import { ThreadSegments, type SwitcherEntry } from './chat-segments';

/**
 * The project Chat tab's client half — §7.1b.
 *
 * ---------------------------------------------------------------------------
 * IT READS THE SAME SWITCHER ROUTE THE PANEL DOES, AND THAT IS DELIBERATE
 * ---------------------------------------------------------------------------
 * The tab needs two things the page cannot render without: which segments this
 * project offers this caller (§7.1e, ND-25) and each segment's unread count.
 * Both already exist, computed once, in `GET /api/chat/threads`.
 *
 * The cheaper shape — have the page work out `kinds` for itself server-side and
 * skip the unread badges "because the tab opens the thread anyway" — is exactly
 * the divergence CLAUDE.md's parity ruling was written after #129 to prevent:
 * one feature, two surfaces, and the segments would quietly mean something
 * slightly different on each. Same route, same data, same component.
 *
 * ⚠️ An ARCHIVED project is absent from the switcher by ND-34, so `entry` is
 * null there — and §7.1a-i is explicit that the tab is how an archived thread
 * stays reachable (A-C38). The fallback renders the crew thread with no
 * segments rather than an error.
 */
export function ChatTab({
  projectId,
  myProfileId,
}: {
  projectId: string;
  myProfileId: string;
}) {
  const [entry, setEntry] = useState<SwitcherEntry | null>(null);
  const [kind, setKind] = useState<ThreadKind>('crew');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/chat/threads')
      .then((r) => (r.ok ? r.json() : { projects: [] }))
      .then((json: { projects?: SwitcherEntry[] }) => {
        if (cancelled) return;
        const found = (json.projects ?? []).find((p) => p.projectId === projectId) ?? null;
        setEntry(found);
        if (found) setKind(found.kinds[0] ?? 'crew');
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Held until the segment set is known. Rendering the crew thread first and
  // swapping would open — and MARK READ — a thread the caller may not have
  // chosen, and for a subcontractor it would be one they cannot read at all.
  if (!loaded) return null;

  return (
    <>
      {entry && (
        <ThreadSegments
          kinds={entry.kinds}
          value={kind}
          onChange={setKind}
          threads={entry.threads}
        />
      )}
      <ChatThreadView
        key={kind}
        projectId={projectId}
        myProfileId={myProfileId}
        surface="tab"
        kind={kind}
      />
    </>
  );
}
