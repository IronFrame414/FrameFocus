import { describe, it, expect } from 'vitest';
import type { CompanyRole } from '@framefocus/shared';
import { mentionEmailAudience, mentionEmailUrl } from '@/lib/chat/mention-email';
import { mentionTitle, truncateBody } from '@/lib/chat/mention-notify';

// ============================================================================
// SLICE 4 — ND-42's filter, and the two rulings S126's sweep found unguarded.
// ============================================================================

const person = (role: CompanyRole, email: string | null = `${role}@x.test`) => ({
  profileId: `p-${role}`,
  role,
  email,
});

// ---------------------------------------------------------------------------
// ND-42 / A-C47 — SUBS ONLY, and the exclusion is the criterion
// ---------------------------------------------------------------------------
describe('ND-42 — only a subcontractor gets an email', () => {
  it('⚠️ a mentioned CREW MEMBER is not in the audience', () => {
    // A-C47, and it is the criterion that carries the whole ruling: without it
    // a build that emails every mentioned recipient passes every other
    // criterion in the block — and emailing everyone is what parent R3 READS
    // like, so it is the likeliest wrong build.
    const audience = mentionEmailAudience([person('crew_member'), person('subcontractor')]);
    expect(audience.map((r) => r.role)).toEqual(['subcontractor']);
  });

  it('nor a foreman, PM, admin or owner', () => {
    const audience = mentionEmailAudience([
      person('foreman'),
      person('project_manager'),
      person('admin'),
      person('owner'),
    ]);
    expect(audience).toEqual([]);
  });

  it('a subcontractor with NO email address is dropped rather than crashing', () => {
    // profiles.email is NOT NULL, so this is unreachable today. It is asserted
    // because the wrong column — subcontractors.email — IS nullable and is null
    // on one of four live rows, and a build that reached for it would silently
    // send nothing for that sub while appearing to work for the others.
    expect(mentionEmailAudience([person('subcontractor', null)])).toEqual([]);
  });

  it('several subs all get one', () => {
    const audience = mentionEmailAudience([
      { profileId: 'a', role: 'subcontractor', email: 'a@x.test' },
      { profileId: 'b', role: 'subcontractor', email: 'b@x.test' },
      person('owner'),
    ]);
    expect(audience.map((r) => r.profileId)).toEqual(['a', 'b']);
  });
});

// ---------------------------------------------------------------------------
// A-C50 — the link is the MOBILE destination
// ---------------------------------------------------------------------------
describe('A-C50 — the email links to the mobile surface', () => {
  it('is /m/p/{id}?chat=1 — a param, never a route', () => {
    // DASHBOARD_ROLES excludes subcontractor, so a /dashboard link would send
    // the one audience this email has to a surface they cannot use. ND-40 also
    // forbids `/m/p/{id}/chat` existing at all, so this must stay a param.
    expect(mentionEmailUrl('https://example.test', 'abc-123')).toBe(
      'https://example.test/m/p/abc-123?chat=1'
    );
    expect(mentionEmailUrl('https://example.test', 'abc-123')).not.toContain('/dashboard');
    expect(mentionEmailUrl('https://example.test', 'abc-123')).not.toMatch(/\/chat$/);
  });
});

// ---------------------------------------------------------------------------
// ND-23 — the thread is NAMED. Both forms, because only one had ever executed.
// ---------------------------------------------------------------------------
describe('ND-23 / A-C12 — the notification names the thread', () => {
  it('a crew-thread mention reads {author} ({project}): {body}', () => {
    expect(mentionTitle('Casey Crew', 'Alvarez', 'crew', 'trim is short')).toBe(
      'Casey Crew (Alvarez): trim is short'
    );
  });

  it('⚠️ a SUB-thread mention reads {author} ({project} — subs): {body}', () => {
    // S126's ruling sweep found this branch had NEVER EXECUTED. The only
    // assertion anywhere pinned the crew form, so `— subs` was specified,
    // written, and unproven — deleting the conditional would have failed
    // nothing.
    expect(mentionTitle('Casey Crew', 'Alvarez', 'sub', 'trim is short')).toBe(
      'Casey Crew (Alvarez — subs): trim is short'
    );
  });

  it('the two forms differ ONLY in the thread token', () => {
    const crew = mentionTitle('A B', 'P', 'crew', 'x');
    const sub = mentionTitle('A B', 'P', 'sub', 'x');
    expect(sub).toBe(crew.replace('(P)', '(P — subs)'));
  });
});

// ---------------------------------------------------------------------------
// ND-31 — truncation, which no test called until now
// ---------------------------------------------------------------------------
describe('ND-31 — 140 characters of body, cut at a word boundary', () => {
  it('a short body is untouched', () => {
    expect(truncateBody('trim is short')).toBe('trim is short');
  });

  it('⚠️ a long body is cut to 140 or fewer and gains an ellipsis', () => {
    // Found unguarded by S126's sweep: truncateBody() existed and NOTHING
    // called it. The one live title assertion used a short body, so removing
    // truncation entirely would have failed no test at all.
    const long = 'word '.repeat(60).trim(); // 299 chars
    const out = truncateBody(long);
    expect(out.length).toBeLessThanOrEqual(141); // 140 + the ellipsis
    expect(out.endsWith('…')).toBe(true);
    expect(long.startsWith(out.slice(0, -1).trimEnd())).toBe(true);
  });

  it('cuts at a word boundary rather than mid-word', () => {
    const body = `${'a'.repeat(100)} ${'b'.repeat(80)}`;
    const out = truncateBody(body);
    // The 'b' run would be sliced mid-word at 140; the boundary is preferred.
    expect(out).toBe(`${'a'.repeat(100)}…`);
  });

  it('falls back to a hard cut when there is no usable boundary', () => {
    // One 300-character "word": there is no space to cut at, and returning the
    // whole thing would defeat the point.
    const out = truncateBody('z'.repeat(300));
    expect(out.length).toBeLessThanOrEqual(141);
    expect(out.endsWith('…')).toBe(true);
  });

  it('collapses whitespace, so a pasted multi-line body does not blow the line', () => {
    expect(truncateBody('one\n\n  two   three')).toBe('one two three');
  });

  it('the TITLE truncates, and the prefix is never cut', () => {
    // ND-31: the author-and-project prefix is what tells the reader whether to
    // tap at all, so truncation applies to the body and not to the whole line.
    const title = mentionTitle('Casey Crew', 'Alvarez', 'sub', 'word '.repeat(60).trim());
    expect(title.startsWith('Casey Crew (Alvarez — subs): ')).toBe(true);
    expect(title.endsWith('…')).toBe(true);
  });
});
