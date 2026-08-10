import type { Metadata } from 'next';

/**
 * ⚠️ A HOLDING PAGE. **MODULE 9 DELETES THIS FILE.**
 *
 * Ruling A [Josh, S131]. Path constant: `lib/dashboard-access.ts`.
 *
 * ---------------------------------------------------------------------------
 * WHY IT EXISTS
 * ---------------------------------------------------------------------------
 * `DASHBOARD_ROLES` excludes `client`, and S131 made that exclusion real. A
 * blocked role has to land somewhere: without a destination the guard in
 * `middleware.ts` would redirect to a route that does not exist, and a guard in
 * a layout would bounce between `/dashboard` and `/sign-in` forever. This page
 * is that somewhere and is nothing else.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ THIS IS NOT THE PORTAL, AND IT IS NOT THE FIRST PIECE OF ONE
 * ---------------------------------------------------------------------------
 * The **Pre-Module 9 gate is OPEN and untouched** [S131]: whether the client
 * experience is a hosted portal or email plus magic-link tokenised pages has
 * not been ruled. Building anything real here would presume the hosted answer
 * and quietly decide the gate. So, deliberately:
 *
 *  · **no data** — this file makes no Supabase call of any kind;
 *  · **no company information** — not the name, not the logo. A client landing
 *    here is told the portal is coming and nothing whatsoever about the tenant;
 *  · **no nav** — nowhere to go is correct, because there is nowhere to go;
 *  · **no auth check** — and that is on purpose. Reading the caller's profile
 *    to decide what to render is exactly how a redirect loop gets built, and
 *    there is nothing here worth protecting. It is a paragraph of static text.
 *
 * ---------------------------------------------------------------------------
 * IT SERVES NOBODY TODAY
 * ---------------------------------------------------------------------------
 * **There are no client accounts, and none will be created before the portal is
 * built** [Josh, S131]. This closes a hole rather than serving a user: it is
 * what makes the `client` half of Ruling A safe to enforce now instead of
 * waiting for Module 9.
 *
 * When Module 9 lands: delete this directory and repoint
 * `CLIENT_PLACEHOLDER_PATH` in `lib/dashboard-access.ts` at the real surface —
 * or drop the constant entirely if the gate rules against a hosted one.
 */

export const metadata: Metadata = {
  title: 'Client portal — coming soon',
};

export default function ClientPlaceholderPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        backgroundColor: '#f9fafb',
      }}
    >
      <div style={{ maxWidth: '32rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.75rem', color: '#111827' }}>
          Your client portal is coming soon
        </h1>
        <p style={{ color: '#4b5563', fontSize: '0.9375rem', lineHeight: 1.6 }}>
          There is nothing here yet. When the portal is ready you will be able to follow your
          project, review documents and approve selections from this page.
        </p>
        <p style={{ color: '#6b7280', fontSize: '0.875rem', lineHeight: 1.6, marginTop: '1rem' }}>
          If you need something in the meantime, contact your project manager directly.
        </p>
      </div>
    </main>
  );
}
