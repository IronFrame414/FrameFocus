import Link from 'next/link';
import type { Metadata } from 'next';
import { brand } from '@/lib/brand';
import { SiteHeader } from '@/components/public/site-header';
import { SiteFooter } from '@/components/public/site-footer';
import { PricingTable } from '@/components/public/pricing-table';

export const metadata: Metadata = {
  title: `${brand.name} — construction software for contractors who run the jobs`,
  description: brand.description,
};

// The four things it does, in the ruled order (public-site §2). Descriptions
// are the ruled copy verbatim — do not claim AI estimates or QuickBooks sync.
const FEATURES = [
  {
    title: 'Client portal and selections',
    body: 'The client picks their finishes and signs for them, without a phone call.',
  },
  {
    title: 'Contracts and lien releases',
    body: 'Your forms, filled and signed. The software fills the boxes you place and never writes the wording.',
  },
  {
    title: 'Budget and expense tracking',
    body: 'What the job was priced at, what you have committed, and what it has actually cost.',
  },
  {
    title: 'The field app',
    body: 'Clock in, log the day, and capture receipts and photos from the jobsite.',
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-4xl px-6 py-16 text-center sm:py-24">
          <h1 className="text-3xl font-bold tracking-tight text-brand-900 sm:text-5xl">
            The construction software for the contractor who runs the jobs and does the paperwork.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600">
            The big platforms are built for companies with an office staff. The cheap ones are
            invoice apps with a calendar. This is the one in between.
          </p>
          <p className="mx-auto mt-3 max-w-2xl text-base text-gray-500">
            For contractors running jobs with subs, client selections, and progress billing.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <Link
              href="/sign-up"
              className="rounded-lg bg-brand-500 px-8 py-3 text-base font-semibold text-white hover:bg-brand-600"
            >
              Start your 30-day free trial
            </Link>
            <p className="text-sm text-gray-500">Nothing is charged without your approval.</p>
          </div>
        </section>

        {/* The four things */}
        <section className="border-y border-gray-200 bg-gray-50 py-16">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
              {FEATURES.map((f) => (
                <div key={f.title}>
                  <h2 className="text-lg font-semibold text-brand-900">{f.title}</h2>
                  <p className="mt-2 text-gray-600">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Josh's paragraph — his voice, leads with running his own jobs. */}
        <section className="mx-auto max-w-3xl px-6 py-16">
          <blockquote className="text-lg leading-relaxed text-gray-700">
            <p>
              I run my own construction jobs on this software — the same version you would use, not a
              demo. I built it because nothing out there fit: the big platforms cost a fortune and did
              far more than I needed, and the cheap ones did nowhere near enough. I have spent my
              whole working life in the trades, and this is the tool I wanted.
            </p>
            <footer className="mt-4 text-sm font-semibold text-brand-900">
              — Josh Bishop, founder
            </footer>
          </blockquote>
        </section>

        {/* Pricing */}
        <section id="pricing" className="border-t border-gray-200 bg-gray-50 py-16">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mb-10 text-center">
              <h2 className="text-2xl font-bold text-brand-900 sm:text-3xl">Simple pricing</h2>
              <p className="mt-2 text-gray-600">
                Every plan includes unlimited active projects. Cancel anytime.
              </p>
            </div>
            <PricingTable />
            <p className="mt-8 text-center">
              <Link href="/pricing" className="text-sm font-semibold text-brand-500 hover:text-brand-600">
                See full plan details →
              </Link>
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
