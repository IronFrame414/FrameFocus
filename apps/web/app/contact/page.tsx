import type { Metadata } from 'next';
import { brand } from '@/lib/brand';
import { SiteHeader } from '@/components/public/site-header';
import { SiteFooter, PUBLIC_CONTACT_EMAIL } from '@/components/public/site-footer';

export const metadata: Metadata = {
  title: `Contact — ${brand.name}`,
  description: `How to reach ${brand.name}.`,
};

// PUBLIC, AND THAT IS THE ENTIRE POINT [public-site, Intuit review].
//
// ⚠️ Reachable with NO session. It is not in middleware.ts's `config.matcher`,
// which is an explicit allowlist of GUARDED paths — so the middleware never
// runs here, exactly as for /pricing, /terms and /privacy. If a future edit
// adds '/contact' to that matcher, this page stops being public and the reason
// it exists is gone.
//
// ---------------------------------------------------------------------------
// WHAT THIS PAGE MAY AND MAY NOT SAY — these are constraints, not preferences
// ---------------------------------------------------------------------------
// EZ Contractor Binder is NOT a registered entity. Therefore:
//
//   - NO corporate suffix. Not "LLC", not "Inc.", not "Corp." — writing one is
//     a claim of a legal form that does not exist.
//   - NO claim of incorporation, registration or legal form of any kind.
//   - NO owner, founder or officer is named HERE. (/terms §1 and /privacy do
//     name a natural person as the operator — that is the honest disclosure for
//     an unregistered business and is deliberately left alone. This page simply
//     does not repeat it; silence is not a contradiction.)
//   - Worth Properties is a SEPARATE entity and is named nowhere on the public
//     site.
//
// ⚠️ NO INVENTED DETAIL. No founding date, no team size, no location, no
// response-time promise, no phone number, no mailing address. Everything on a
// public page is a public claim about a real business, and an About/Contact
// page is exactly where invented detail creeps in.
//
// The product description below is not new copy: `brand.description` is the
// ruled manifest description, and the four capabilities are the ruled landing
// copy (app/page.tsx FEATURES) verbatim. Reusing already-ruled claims means
// this page adds no claim that has not already been approved.
//
// ONE contact detail is published — PUBLIC_CONTACT_EMAIL, imported from the
// footer rather than retyped so the site cannot drift into naming two
// addresses. It matches what /terms and /privacy already publish.

const CAPABILITIES = [
  'Client portal and selections',
  'Contracts and lien releases',
  'Budget and expense tracking',
  'The field app',
];

export default function ContactPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-6 py-16">
          <h1 className="text-3xl font-bold text-brand-900 sm:text-4xl">Contact</h1>

          <p className="mt-4 text-lg text-gray-600">
            Questions about {brand.name} — before you sign up, or while you are using it — go to one
            address.
          </p>

          <div className="mt-8 rounded-xl border border-gray-200 bg-gray-50 p-6">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">Email</p>
            <a
              href={`mailto:${PUBLIC_CONTACT_EMAIL}`}
              className="mt-2 inline-block break-all text-xl font-semibold text-brand-500 hover:text-brand-600"
            >
              {PUBLIC_CONTACT_EMAIL}
            </a>
            <p className="mt-3 text-sm text-gray-600">
              The same address handles account and billing questions, privacy requests, and anything
              in the{' '}
              <a href="/terms" className="font-medium text-brand-500 hover:text-brand-600">
                Terms of Service
              </a>
              .
            </p>
          </div>

          <div className="mt-12">
            <h2 className="text-xl font-bold text-brand-900">What {brand.name} is</h2>
            <p className="mt-3 text-gray-600">{brand.description}</p>
            <ul className="mt-4 space-y-2 text-gray-600">
              {CAPABILITIES.map((c) => (
                <li key={c} className="flex gap-2">
                  <span aria-hidden="true" className="text-brand-500">
                    &bull;
                  </span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-gray-600">
              See{' '}
              <a href="/pricing" className="font-medium text-brand-500 hover:text-brand-600">
                pricing and plans
              </a>
              , or{' '}
              <a href="/sign-up" className="font-medium text-brand-500 hover:text-brand-600">
                start a 30-day free trial
              </a>
              .
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
