/**
 * Mention parsing — a PURE function, deliberately.
 *
 * Spec: chat-spec.md §5.1, ND-39. (Spec lives on `spec/chat-s124` @ 4b61b9d; it is
 * not on this branch — see docs/sessions/S126-progress.md.)
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS PURE AND SEPARATE FROM THE SEND PATH
 * ---------------------------------------------------------------------------
 * §5.1 puts the whole delivery guarantee on a human typing `@`. The parse is
 * therefore the single most load-bearing piece of logic in chat, and it is the
 * only part that can be tested exhaustively without a database, a session or a
 * thread. Keeping it free of Supabase is what makes A-C14 and A-C15 `[unit]`
 * criteria rather than live ones.
 *
 * ---------------------------------------------------------------------------
 * RESOLVED AGAINST A CANDIDATE SET, NEVER AGAINST THE WHOLE COMPANY
 * ---------------------------------------------------------------------------
 * The caller passes the thread's POSTABLE set (§5.2) — the same set the mention
 * picker offers. That is not a convenience: resolving against all profiles would
 * let a crew member mention a subcontractor into a crew thread the sub cannot
 * read, producing a notification for a message its recipient will 404 on.
 */

export interface MentionCandidate {
  profileId: string;
  /** Lower-cased tokens this person can be addressed by. */
  tokens: string[];
}

/**
 * Build the tokens a person can be `@`-addressed by.
 *
 * First name, last name, and `first.last` / `firstlast`. Deliberately NOT the
 * email local-part — `@josh+qa-sub` is not something anyone types, and the `+`
 * would fight the token boundary.
 */
export function candidateTokens(firstName: string, lastName: string): string[] {
  const f = firstName.trim().toLowerCase();
  const l = lastName.trim().toLowerCase();
  const out = new Set<string>();
  if (f) out.add(f);
  if (l) out.add(l);
  if (f && l) {
    out.add(`${f}.${l}`);
    out.add(`${f}${l}`);
  }
  return [...out];
}

/**
 * `@` followed by letters, digits, dot, underscore or hyphen.
 *
 * The token stops at whitespace and at ordinary sentence punctuation, so
 * `@Josh,` and `@Josh.` at the end of a sentence resolve to `josh` — the dot is
 * allowed INSIDE a token (`first.last`) but a trailing one is stripped below,
 * because "ends a sentence" is overwhelmingly more common than "is part of a
 * name".
 */
const MENTION_RE = /@([A-Za-z0-9._-]+)/g;

export function extractTokens(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(MENTION_RE)) {
    const raw = m[1].replace(/[.\-_]+$/, '').toLowerCase();
    if (raw) out.push(raw);
  }
  return out;
}

export interface ParseResult {
  /** Unique profile ids to notify, in first-appearance order. */
  profileIds: string[];
  /** Tokens that matched nobody, or matched more than one candidate. */
  unresolved: string[];
}

/**
 * Resolve the `@` tokens in `body` to profile ids.
 *
 * @param authorProfileId excluded from the result — §5.1's self-mention rule.
 *   Precedent: parent §16.5's self-assignment rule, same reasoning. It would be
 *   the most common notification the platform sends and every one useless.
 */
export function parseMentions(
  body: string,
  candidates: MentionCandidate[],
  authorProfileId: string | null
): ParseResult {
  const byToken = new Map<string, string[]>();
  for (const c of candidates) {
    for (const t of c.tokens) {
      const list = byToken.get(t) ?? [];
      if (!list.includes(c.profileId)) list.push(c.profileId);
      byToken.set(t, list);
    }
  }

  const profileIds: string[] = [];
  const unresolved: string[] = [];

  for (const token of extractTokens(body)) {
    const matches = byToken.get(token);

    // ⚠️ AMBIGUITY RESOLVES TO NOBODY, ON PURPOSE. Two people called Chris and a
    // message saying `@chris` is not a notification decision this code is
    // entitled to make — guessing means the wrong person is told they are needed
    // on site and the right one is not. An unresolved token stays plain text and
    // is reported so the composer can say so.
    if (!matches || matches.length !== 1) {
      if (!unresolved.includes(token)) unresolved.push(token);
      continue;
    }

    const id = matches[0];
    // §5.1: self-mention notifies nobody.
    if (id === authorProfileId) continue;
    // A-C14: `@Josh … @Josh` is ONE row. De-duplicated here as well as by the
    // UNIQUE (message_id, mentioned_profile_id) constraint — the constraint is
    // the guarantee, this is so the caller does not attempt an insert it knows
    // will conflict.
    if (!profileIds.includes(id)) profileIds.push(id);
  }

  return { profileIds, unresolved };
}
