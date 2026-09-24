import { beforeEach, describe, expect, it, vi } from 'vitest';

// resolveCompanyReplyTo — THE FALLBACK CHAIN, against mocked rows.
//
//   companies.email  ->  the OWNER's profile email  ->  null (omit the header)
//
// ⚠️ WHY THIS IS A UNIT TEST NOW [Josh, 2026-09-24, ruling Q6]. The chain used
// to be proven live, in s97ct-reply-to.live.ts cases 2 and 4, by clearing a
// real company's email and inserting an email-less company. Both are now
// refused by `companies_email_required_check` (20261760000000), so the second
// and third arms CANNOT BE REACHED against a real database.
//
// ⚠️ THEY ARE KEPT DELIBERATELY, AS BELT AND BRACES — NOT AS A LIVE PATH.
// Ruling 2: if the constraint is ever dropped, a blank company email must still
// degrade to the owner, and then to no header, rather than failing the send or
// inventing an address. This file is what keeps those arms honest while
// nothing in production exercises them.

interface Call {
  table: string;
  select?: string;
  eq: Array<[string, unknown]>;
  order: Array<[string, unknown]>;
  limit?: number;
}

const calls: Call[] = [];
let rows: Record<string, { email: string | null } | null> = {};

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      const call: Call = { table, eq: [], order: [] };
      calls.push(call);
      const chain = {
        select(cols: string) {
          call.select = cols;
          return chain;
        },
        eq(col: string, val: unknown) {
          call.eq.push([col, val]);
          return chain;
        },
        order(col: string, opts: unknown) {
          call.order.push([col, opts]);
          return chain;
        },
        limit(n: number) {
          call.limit = n;
          return chain;
        },
        async maybeSingle() {
          return { data: rows[table] ?? null, error: null };
        },
      };
      return chain;
    },
  }),
}));

const COMPANY_ID = '22222222-2222-2222-2222-222222222222';

/** Fresh module per call — the resolver caches per company for 60 s. */
async function resolve(): Promise<string | null> {
  vi.resetModules();
  const { resolveCompanyReplyTo } = await import('@/lib/services/email-service');
  return resolveCompanyReplyTo(COMPANY_ID);
}

beforeEach(() => {
  calls.length = 0;
  rows = {};
});

describe('resolveCompanyReplyTo — arm 1, the only arm reachable today', () => {
  it('returns companies.email, trimmed, and never reads the owner', async () => {
    rows.companies = { email: '  office@example-contractor.com ' };
    expect(await resolve()).toBe('office@example-contractor.com');
    expect(calls.map((c) => c.table)).toEqual(['companies']);
    expect(calls[0].eq).toEqual([['id', COMPANY_ID]]);
  });
});

describe('resolveCompanyReplyTo — arms 2 and 3, UNREACHABLE while the constraint holds', () => {
  it.each([
    ['NULL', null],
    ['empty', ''],
    ['whitespace', '   '],
  ])('a %s companies.email falls back to the OWNER of THAT company', async (_label, blank) => {
    rows.companies = { email: blank };
    rows.profiles = { email: 'owner@example-contractor.com' };

    expect(await resolve()).toBe('owner@example-contractor.com');

    // It really is the live OWNER of the same company, not any profile. A
    // missing filter here would route one company's replies to another's
    // inbox, or to a crew member.
    const owner = calls.find((c) => c.table === 'profiles');
    expect(owner, 'the owner arm never ran').toBeTruthy();
    expect(owner!.eq).toEqual(
      expect.arrayContaining([
        ['company_id', COMPANY_ID],
        ['role', 'owner'],
        ['is_deleted', false],
      ])
    );
  });

  it('a company with no row at all falls back to the owner too', async () => {
    rows.companies = null;
    rows.profiles = { email: 'owner@example-contractor.com' };
    expect(await resolve()).toBe('owner@example-contractor.com');
  });

  it('neither a company email nor an owner address resolves to null — never an invented one', async () => {
    rows.companies = { email: null };
    rows.profiles = { email: '  ' };
    expect(await resolve()).toBeNull();
  });
});
