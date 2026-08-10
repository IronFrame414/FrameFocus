import { describe, it, expect } from 'vitest';
import {
  candidateTokens,
  extractTokens,
  parseMentions,
  type MentionCandidate,
} from '@/lib/chat/mentions';

// ============================================================================
// CHAT slice 2 — mention parsing. A-C14, A-C15.
// Spec: chat-spec.md §5.1 (on spec/chat-s124 @ 4b61b9d, not on this branch).
// ============================================================================
//
// §5.1 rests the ENTIRE delivery guarantee on a human typing `@`. That makes the
// parse the most load-bearing logic in chat, and the only part testable without
// a database — which is why it is a pure function and why these are `[unit]`.

const JOSH: MentionCandidate = { profileId: 'p-josh', tokens: candidateTokens('Josh', 'Bishop') };
const CASEY: MentionCandidate = { profileId: 'p-casey', tokens: candidateTokens('Casey', 'Crew') };
const PAT: MentionCandidate = { profileId: 'p-pat', tokens: candidateTokens('Pat', 'Manager') };
const SET = [JOSH, CASEY, PAT];

describe('candidateTokens', () => {
  it('offers first, last and both joined forms', () => {
    expect(candidateTokens('Josh', 'Bishop').sort()).toEqual(
      ['bishop', 'josh', 'josh.bishop', 'joshbishop'].sort()
    );
  });

  it('survives a missing last name without emitting junk tokens', () => {
    // Seeded identities have display names like "QA Subcontractor Co"; a blank
    // half must not produce "josh." or "" as an addressable token.
    expect(candidateTokens('Josh', '')).toEqual(['josh']);
    expect(candidateTokens('', '')).toEqual([]);
  });
});

describe('extractTokens', () => {
  it('finds a plain mention', () => {
    expect(extractTokens('@josh running short on trim')).toEqual(['josh']);
  });

  it('strips sentence punctuation but keeps an internal dot', () => {
    // `@josh.` ends a sentence; `@josh.bishop` is a name. The rule has to tell
    // them apart or every message ending in a mention resolves to nobody.
    expect(extractTokens('ask @josh.')).toEqual(['josh']);
    expect(extractTokens('ask @josh.bishop please')).toEqual(['josh.bishop']);
    expect(extractTokens('@casey, can you')).toEqual(['casey']);
  });

  it('is case-insensitive', () => {
    expect(extractTokens('@Josh and @CASEY')).toEqual(['josh', 'casey']);
  });

  it('ignores an email address in the body', () => {
    // A bare email contains `@` and would otherwise be read as a mention of
    // whatever follows the domain's first label.
    const t = extractTokens('mail me at josh@worthprop.com');
    expect(t).toEqual(['worthprop.com']);
    // …and it resolves to nobody, which is the behaviour that matters:
    expect(parseMentions('mail me at josh@worthprop.com', SET, null).profileIds).toEqual([]);
  });
});

describe('parseMentions', () => {
  it('resolves a mention to a profile id', () => {
    expect(parseMentions('@josh need more trim', SET, 'p-casey').profileIds).toEqual(['p-josh']);
  });

  it('A-C14 — the same person twice in one message is ONE id', () => {
    const r = parseMentions('@josh ... and @josh again', SET, 'p-casey');
    expect(r.profileIds).toEqual(['p-josh']);
  });

  it('A-C14 — two DIFFERENT people are two ids, in first-appearance order', () => {
    // The paired positive. Without it, a parser that returned at most one
    // mention would pass the de-duplication test above.
    const r = parseMentions('@casey and @josh', SET, null);
    expect(r.profileIds).toEqual(['p-casey', 'p-josh']);
  });

  it('A-C15 — a self-mention notifies nobody', () => {
    expect(parseMentions('@josh talking to myself', SET, 'p-josh').profileIds).toEqual([]);
  });

  it('A-C15 — and a self-mention does not suppress the others', () => {
    // The failure this catches: dropping the whole parse when the author is in
    // it, rather than dropping just the author.
    const r = parseMentions('@josh @casey', SET, 'p-josh');
    expect(r.profileIds).toEqual(['p-casey']);
  });

  it('AMBIGUITY RESOLVES TO NOBODY, and is reported', () => {
    // Two people called Chris. Guessing means the wrong person is told they are
    // needed on site and the right one is not.
    const chrisA = { profileId: 'p-a', tokens: candidateTokens('Chris', 'Alpha') };
    const chrisB = { profileId: 'p-b', tokens: candidateTokens('Chris', 'Beta') };
    const r = parseMentions('@chris can you look', [chrisA, chrisB], null);
    expect(r.profileIds).toEqual([]);
    expect(r.unresolved).toEqual(['chris']);
    // …and the unambiguous full form still works, so the answer is "be
    // specific", not "mentions are broken".
    expect(parseMentions('@chris.beta look', [chrisA, chrisB], null).profileIds).toEqual(['p-b']);
  });

  it('a token matching nobody is reported, not silently dropped', () => {
    const r = parseMentions('@nobody hello', SET, null);
    expect(r.profileIds).toEqual([]);
    expect(r.unresolved).toEqual(['nobody']);
  });

  it('RESOLVES ONLY AGAINST THE CANDIDATE SET IT IS GIVEN', () => {
    // The candidate set is the thread's POSTABLE set. Resolving against the
    // whole company would let a crew member mention a subcontractor into a crew
    // thread the sub cannot read — a notification whose link 404s for its
    // recipient. Passing a narrower set must narrow the result.
    const r = parseMentions('@josh and @casey', [CASEY], null);
    expect(r.profileIds).toEqual(['p-casey']);
    expect(r.unresolved).toEqual(['josh']);
  });

  it('a message with no mention notifies nobody — R6', () => {
    // Parent R6: a plain message is silent. This is the criterion a well-meaning
    // later change breaks (§2.4).
    expect(parseMentions('running short on trim', SET, 'p-casey').profileIds).toEqual([]);
  });
});
