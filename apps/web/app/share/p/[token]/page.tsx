import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { logShareView, resolveShareLink, type PublicSharePayload } from '@/lib/photos/share-link';

// ============================================================================
// S127 item 4e — THE PUBLIC PHOTO PAGE. No sign-in. Outside the middleware
// matcher (middleware.ts `config.matcher`), like /sign-co and /bid.
//
// ⚠️⚠️ IT SHOWS FOUR THINGS AND NOTHING ELSE [RULED Josh, #3; stop rule 10]:
// the photo, the company LOGO, the company NAME, the DATE. No project name, no
// site address, no client name, no task, note, file name or description. The
// URL is forwardable by design: a stranger holding it must learn who took the
// photo — never whose house it is, where it is, or what is wrong with it. That
// is Josh's client's privacy, and it is the detail most likely to be added
// later "for context" by someone who has not read this. Everything rendered
// comes from `PublicSharePayload`; this page is a server component with no
// client component, so nothing else reaches the browser — and
// e2e/share-link-s127.spec.ts reads the page's BYTES to prove it.
//
// ⚠️ The photo is streamed through the app (./image), never a storage URL.
// ============================================================================

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Shared photo',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

function Unavailable() {
  return (
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        padding: '48px 16px',
        textAlign: 'center',
        color: '#3f4a60',
      }}
    >
      <p data-testid="share-unavailable">This link is no longer available.</p>
    </main>
  );
}

function SharedPhoto({ token, payload }: { token: string; payload: PublicSharePayload }) {
  return (
    <main
      data-testid="share-page"
      style={{
        fontFamily: 'system-ui, sans-serif',
        maxWidth: 960,
        margin: '0 auto',
        padding: '16px',
        color: '#0f1729',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        {payload.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- the logo, streamed through the app (./logo)
          <img
            src={payload.logoUrl}
            alt=""
            style={{ height: 40, width: 'auto' }}
            data-testid="share-logo"
          />
        ) : null}
        <div>
          <div style={{ fontWeight: 700 }} data-testid="share-company">
            {payload.companyName}
          </div>
          <div style={{ fontSize: 13, color: '#687081' }} data-testid="share-date">
            {payload.date}
          </div>
        </div>
      </header>
      {/* eslint-disable-next-line @next/next/no-img-element -- bytes streamed through the app, never a storage URL */}
      <img
        src={`/share/p/${token}/image`}
        alt=""
        data-testid="share-photo"
        style={{ maxWidth: '100%', maxHeight: '85vh', display: 'block', margin: '0 auto' }}
      />
    </main>
  );
}

export default async function SharedPhotoPage({ params }: { params: { token: string } }) {
  const admin = getSupabaseAdmin();
  const link = await resolveShareLink(admin, params.token);
  if (!link) return <Unavailable />;
  await logShareView(admin, link, headers().get('user-agent'));
  return <SharedPhoto token={params.token} payload={link.payload} />;
}
