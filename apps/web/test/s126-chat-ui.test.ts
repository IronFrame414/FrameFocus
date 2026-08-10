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

  it('⚠️ never proposes a token the PARSER cannot read back', () => {
    // Found against real rebuild-test data, not by reading the code. Two
    // identities are "QA Admin A" and "QA Foreman A": they share the first name
    // `qa`, and their surnames contain a SPACE. `candidateTokens` generates
    // `admin a`, which is genuinely unique — and `MENTION_RE` stops at
    // whitespace, so `@admin a` comes back out of the parser as `admin` and
    // matches nothing. The picker would have inserted a mention that notified
    // nobody, which is the exact failure insertTokenFor exists to prevent.
    const admin: MentionCandidate = { profileId: 'p1', tokens: candidateTokens('QA', 'Admin A') };
    const foreman: MentionCandidate = {
      profileId: 'p2',
      tokens: candidateTokens('QA', 'Foreman A'),
    };
    const all = [admin, foreman];

    expect(admin.tokens).toContain('admin a'); // unique, and unusable
    expect(insertTokenFor(admin, all)).toBeNull();
    expect(insertTokenFor(foreman, all)).toBeNull();

    // The parser agrees, which is what makes null the honest answer.
    expect(parseMentions('@admin a', all, null).profileIds).toEqual([]);
  });

  it('a spaced surname is still fine when the FIRST name is unique', () => {
    // The rule is "no unreadable token", not "no spaced surname" — a build that
    // rejected the whole person would lose mentions it could have delivered.
    const solo: MentionCandidate = { profileId: 'p3', tokens: candidateTokens('Dale', 'Van Ness') };
    expect(insertTokenFor(solo, [solo])).toBe('dale');
    expect(parseMentions('@dale', [solo], null).profileIds).toEqual(['p3']);
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
  // ⚠️ REWRITTEN TWICE, AND BOTH TIMES THE TEST WAS WHAT WAS WRONG.
  //
  // Slice 4: the assertions pinned WHERE the tab imported ChatThreadView from,
  // a proxy that broke when the tab grew a client wrapper for the segments.
  // Slice 5: they pinned the PANEL rendering ChatThreadView directly, which
  // broke when the panel's behaviour moved into ChatBody so the mobile overlay
  // could share it rather than reimplement it.
  //
  // The property has never broken: there is exactly ONE thread renderer and
  // every surface reaches it. These assert that, and no longer care how many
  // components deep it sits.
  it('exactly one component renders a thread, and all THREE surfaces reach it', () => {
    // Two call sites, three surfaces: ChatBody serves the desktop panel AND the
    // mobile overlay; ChatTab serves the project tab.
    expect(read('../components/chat/chat-body.tsx')).toContain('<ChatThreadView');
    expect(read('../components/chat/chat-tab.tsx')).toContain('<ChatThreadView');

    // Nothing else renders one — a fourth call site would be the divergence.
    for (const f of [
      '../components/chat/chat-panel.tsx',
      '../components/chat/mobile-chat-overlay.tsx',
      '../app/dashboard/projects/[id]/chat/page.tsx',
    ]) {
      expect(read(f), `${f} renders its own thread`).not.toContain('<ChatThreadView');
    }
  });

  it('A-C16 — the desktop panel and the mobile overlay share ChatBody', () => {
    // #129's precedent, applied where it actually bites: two markup editors
    // "both worked" and disagreed about what a save produces. A second mobile
    // switcher would be that, written in the form that looks like agreement.
    for (const f of [
      '../components/chat/chat-panel.tsx',
      '../components/chat/mobile-chat-overlay.tsx',
    ]) {
      expect(read(f)).toContain('<ChatBody');
      expect(read(f)).toContain("from './chat-body'");
    }
  });

  it('they differ by the `surface` prop and nothing else', () => {
    expect(read('../components/chat/chat-body.tsx')).toContain('surface="panel"');
    expect(read('../components/chat/chat-tab.tsx')).toContain('surface="tab"');
  });

  it('§7.1e — the segmented control is ONE component, shared by every surface', () => {
    for (const f of ['../components/chat/chat-body.tsx', '../components/chat/chat-tab.tsx']) {
      expect(read(f)).toContain("from './chat-segments'");
      expect(read(f)).toContain('<ThreadSegments');
    }
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

// ---------------------------------------------------------------------------
// A-C20 / ND-24 — chat is NOT enrolled in the offline queue
// ---------------------------------------------------------------------------
describe('A-C20 (ND-24) — chat fails visibly and is never queued', () => {
  const chatFiles = [
    '../lib/chat/messages.ts',
    '../lib/chat/threads.ts',
    '../components/chat/use-chat-thread.ts',
    '../components/chat/chat-composer.tsx',
    '../components/chat/chat-body.tsx',
    '../app/api/chat/messages/route.ts',
  ];

  it('no chat module imports the offline queue', () => {
    // ⚠️ THIS ASSERTS AN ABSENCE, WHICH IS WHAT A-C20 ACTUALLY IS. ND-24 is a
    // deliberate divergence from M6M's offline model, chosen at interview Q16 —
    // "sees it fail". A build that reuses the queue "because everything else
    // does" is the likeliest wrong build, and it would pass every other chat
    // criterion. Until now nothing asserted the absence at all; S126's ruling
    // sweep found it unguarded.
    for (const f of chatFiles) {
      expect(codeOnly(read(f)), `${f} reaches for the offline queue`).not.toMatch(
        /lib\/offline|OfflineQueue|useOfflineSync|enqueue/
      );
    }
  });

  it('⚠️ and the queue itself has no chat entity to enrol INTO', () => {
    // The stronger guarantee, and the one that cannot be got round by renaming
    // an import: QueueEntity is a closed union, so enrolling chat would require
    // editing this line — which is a visible, reviewable act rather than an
    // accident.
    const queue = read('../lib/offline/queue.ts');
    const union = /export type QueueEntity =([^;]*);/.exec(queue);
    expect(union, 'QueueEntity not found').not.toBeNull();
    expect(union![1]).not.toMatch(/chat/i);
    // Not vacuous: the union genuinely lists the things that ARE queued.
    expect(union![1]).toContain('daily_log');
  });
});

// ---------------------------------------------------------------------------
// A-C18 / ND-22 — chat exposes NO file-upload path
// ---------------------------------------------------------------------------
describe('A-C18 (ND-22) — reference, not upload', () => {
  const chatFiles = [
    '../lib/chat/photos.ts',
    '../lib/chat/messages.ts',
    '../components/chat/chat-composer.tsx',
    '../components/chat/chat-thread.tsx',
    '../app/api/chat/messages/route.ts',
    '../app/api/chat/photos/route.ts',
  ];

  it('⚠️ nothing in chat can ingest a file', () => {
    // "The build that adds one because it's easier fails there and nowhere
    // else" — every other photo criterion passes just as well with an upload
    // bolted on, which is why this asserts the ABSENCE.
    for (const f of chatFiles) {
      const src = codeOnly(read(f));
      expect(src, `${f} uploads`).not.toMatch(/\.upload\(|storage\.from\(|FormData|multipart/);
      // A file input is the other shape it would take — the composer's attach
      // button opens the project gallery, deliberately not a picker of the
      // device's own files.
      expect(src, `${f} has a file input`).not.toMatch(/type="file"|accept="image/);
    }
  });

  it('the picker reuses getProjectPhotos rather than querying files itself', () => {
    // A-C19 comes from reuse: getProjectPhotos already filters
    // category='photos' per project AND resolves displayUrl (D-31). A second
    // query here would be a second definition of "a project photo", and would
    // show the unmarked original for an annotated one.
    const route = read('../app/api/chat/photos/route.ts');
    expect(route).toContain('getProjectPhotos');
    expect(codeOnly(route)).not.toMatch(/from\('files'\)/);
  });

  it('chat never resolves a file path itself (D-31)', () => {
    for (const f of ['../lib/chat/photos.ts', '../components/chat/chat-thread.tsx']) {
      expect(codeOnly(read(f)), f).not.toMatch(/createSignedUrl|getPublicUrl|file_path/);
    }
  });
});
