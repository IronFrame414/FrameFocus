import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { candidateTokens, insertTokenFor, parseMentions } from '@/lib/chat/mentions';
import type { MentionCandidate } from '@/lib/chat/mentions';

// ============================================================================
// SLICE 3 — the desktop chat UI.
// Spec: chat-spec.md §7.1, §7.5, A-C27, A-C28, A-C41 (on spec/chat-s124 @ 4b61b9d).
// ============================================================================

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/**
 * Source with comments removed.
 *
 * ⚠️ NEEDED, AND THE REASON IS ITSELF THE POINT. The A-C41 assertions below ban
 * `setInterval` and `new Date()` from the chat components — and the files being
 * checked EXPLAIN AT LENGTH why those two things are banned. Matching raw
 * source made both tests fail against their own rationale: the prose describing
 * the forbidden thing is not the forbidden thing.
 *
 * Comment lines are dropped whole rather than by stripping `//` anywhere, so a
 * `https://` inside a string can never be mistaken for the start of a comment.
 */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');
}

// ---------------------------------------------------------------------------
// The mention picker's token — the half of §5.1 that has no database in it
// ---------------------------------------------------------------------------
describe('§5.1/§7.5 — the token the picker inserts', () => {
  const chrisDoyle: MentionCandidate = {
    profileId: 'a',
    tokens: candidateTokens('Chris', 'Doyle'),
  };
  const chrisWells: MentionCandidate = {
    profileId: 'b',
    tokens: candidateTokens('Chris', 'Wells'),
  };
  const joshBishop: MentionCandidate = {
    profileId: 'c',
    tokens: candidateTokens('Josh', 'Bishop'),
  };

  it('an unambiguous first name is what gets inserted', () => {
    const all = [chrisDoyle, chrisWells, joshBishop];
    expect(insertTokenFor(joshBishop, all)).toBe('josh');
  });

  it('⚠️ two people called Chris get their SURNAME, not "@chris"', () => {
    // This is the whole reason the function exists. `parseMentions` resolves a
    // token only when exactly one candidate carries it, so a picker that
    // inserted `@chris` here would send a message that notified NEITHER of
    // them — while the picker had just confirmed the choice on screen. §2.4
    // puts the entire delivery guarantee on the `@`.
    const all = [chrisDoyle, chrisWells, joshBishop];
    expect(insertTokenFor(chrisDoyle, all)).toBe('doyle');
    expect(insertTokenFor(chrisWells, all)).toBe('wells');
  });

  it('ROUND TRIP — every token the picker inserts resolves back to that person', () => {
    // The property that matters, asserted directly rather than inferred from
    // the two cases above: picker output is parser input, and the two live in
    // one file so they cannot drift apart.
    const all = [chrisDoyle, chrisWells, joshBishop];
    for (const person of all) {
      const token = insertTokenFor(person, all);
      expect(token).not.toBeNull();
      const parsed = parseMentions(`hey @${token} look at this`, all, null);
      expect(parsed.profileIds).toEqual([person.profileId]);
      expect(parsed.unresolved).toEqual([]);
    }
  });

  it('returns null when a person has no unambiguous token at all', () => {
    // Two genuine namesakes. Null is a real answer: the picker says so instead
    // of inserting something it knows resolves to nobody.
    const one: MentionCandidate = { profileId: 'x', tokens: candidateTokens('Sam', 'Reed') };
    const two: MentionCandidate = { profileId: 'y', tokens: candidateTokens('Sam', 'Reed') };
    expect(insertTokenFor(one, [one, two])).toBeNull();

    // And the parser agrees — which is what makes null the honest answer.
    expect(parseMentions('@sam', [one, two], null).profileIds).toEqual([]);
    expect(parseMentions('@sam', [one, two], null).unresolved).toEqual(['sam']);
  });

  it('a single candidate keeps the short form', () => {
    expect(insertTokenFor(joshBishop, [joshBishop])).toBe('josh');
  });
});

// ---------------------------------------------------------------------------
// A-C27 — the Chat tab carries NO roles entry
// ---------------------------------------------------------------------------
describe('A-C27 (ND-35) — the Chat tab is ungated', () => {
  it('the TABS entry for chat has no `roles` key', () => {
    const src = read('../app/dashboard/projects/[id]/project-header.tsx');
    const entry = src.match(/\{\s*slug:\s*'chat'[^}]*\}/);
    expect(entry, 'no chat entry found in TABS').not.toBeNull();
    // Asserting the ABSENCE, because adding a role list here would look like a
    // safety improvement — RLS already answers this via can_view_project(), and
    // two answers would have to be kept in step forever.
    expect(entry![0]).not.toContain('roles');
  });

  it('sibling tabs DO carry roles — so the assertion above is not vacuous', () => {
    // If TABS had no `roles` anywhere, the test above would pass on a build
    // that deleted the whole gating mechanism.
    const src = read('../app/dashboard/projects/[id]/project-header.tsx');
    expect(src).toContain("roles: ['owner', 'admin', 'project_manager']");
  });
});

// ---------------------------------------------------------------------------
// A-C28 — the panel and the tab render through the SAME component
// ---------------------------------------------------------------------------
describe('A-C28 — one thread renderer, two surfaces', () => {
  it('both the panel and the tab import ChatThreadView', () => {
    expect(read('../components/chat/chat-panel.tsx')).toContain(
      "from './chat-thread'"
    );
    expect(read('../app/dashboard/projects/[id]/chat/page.tsx')).toContain(
      "from '@/components/chat/chat-thread'"
    );
  });

  it('they differ by the `surface` prop and nothing else', () => {
    expect(read('../components/chat/chat-panel.tsx')).toContain('surface="panel"');
    expect(read('../app/dashboard/projects/[id]/chat/page.tsx')).toContain('surface="tab"');
  });

  it('ND-38 — the two page sizes come from lib, not from the components', () => {
    // 50 in the tab, 25 in a panel. A literal in a component would be a second
    // place the number lives.
    expect(read('../lib/chat/messages.ts')).toContain('PAGE_SIZE = { tab: 50, panel: 25 }');
    for (const f of ['../components/chat/chat-thread.tsx', '../components/chat/chat-panel.tsx']) {
      expect(codeOnly(read(f))).not.toMatch(/\b(50|25)\b\s*[,)]/);
    }
  });
});

// ---------------------------------------------------------------------------
// A-C41 — nothing above the service function knows the transport
// ---------------------------------------------------------------------------
describe('A-C41 — the transport stays behind lib/chat', () => {
  const componentFiles = [
    '../components/chat/chat-panel.tsx',
    '../components/chat/chat-thread.tsx',
    '../components/chat/chat-composer.tsx',
    '../components/chat/use-chat-thread.ts',
  ];

  it('no component reaches for a timer or a Realtime subscription', () => {
    for (const f of componentFiles) {
      const src = codeOnly(read(f));
      // §9.1c: the Realtime swap stays "one file plus a migration" only while
      // nothing above the service function knows how messages arrive. A
      // setInterval here is what makes it a refactor instead.
      expect(src, `${f} sets its own interval`).not.toMatch(/setInterval|setTimeout\s*\(/);
      expect(src, `${f} subscribes directly`).not.toMatch(/\.channel\(|realtime|postgres_changes/i);
    }
  });

  it('the poll comes from lib/chat/poll.ts', () => {
    expect(read('../components/chat/use-chat-thread.ts')).toContain(
      "from '@/lib/chat/poll'"
    );
    expect(read('../components/chat/use-chat-thread.ts')).toContain('createChatPoll');
  });

  it('⚠️ the browser never mints a timestamp for `since`', () => {
    // The markThreadRead defect, one level up: `chat_messages.created_at` is on
    // the DATABASE clock, and a browser asking for messages newer than its own
    // "now" would silently receive nothing forever. Every `since` must be a
    // server value echoed back.
    const src = codeOnly(read('../components/chat/use-chat-thread.ts'));
    expect(src).not.toMatch(/new Date\(\)/);
    expect(src).not.toMatch(/Date\.now\(\)/);
  });
});

// ---------------------------------------------------------------------------
// ND-33 — the panel is mounted ONCE, globally
// ---------------------------------------------------------------------------
describe('ND-33 — the panel mounts in the shell, not per page', () => {
  it('dashboard-shell renders ChatPanel', () => {
    const shell = read('../app/dashboard/dashboard-shell.tsx');
    expect(shell).toContain('ChatPanel');
    expect(shell).toContain("from '@/components/chat/chat-panel'");
  });

  it('no page mounts it for itself', () => {
    // A per-page mount would be a second implementation of one surface (§7.1a,
    // #129's shape) and would pass every criterion except A-C24 on the pages
    // nobody thought to add it to.
    const shell = '../app/dashboard/dashboard-shell.tsx';
    const src = read(shell);
    expect(src.match(/<ChatPanel/g) ?? []).toHaveLength(1);
  });
});
