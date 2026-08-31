import Link from 'next/link';
import type { Metadata } from 'next';
import { brand } from '@/lib/brand';
import { SiteHeader } from '@/components/public/site-header';
import { SiteFooter } from '@/components/public/site-footer';
import { PricingTable } from '@/components/public/pricing-table';

export const metadata: Metadata = {
  title: `Pricing — ${brand.name}`,
  description: 'Three plans for residential and commercial contractors. Start a 30-day free trial.',
};

// Every claim here must be something the product actually does (public-site §0):
// the trial is 30 days and locks at expiry; seats and storage are enforced; the
// AI photo-tagging add-on is a hard cap. No AI estimates, no QuickBooks sync.
const DETAILS = [
  {
    q: 'How does the free trial work?',
    a: 'Every plan starts with a 30-day free trial. Nothing is charged without your approval — at the end of the trial you choose a plan to continue, or the account simply locks.',
  },
  {
    q: 'What are team members?',
    a: 'The number of people from your company who can sign in — owner, admins, project managers, foremen and crew. The limit is enforced: Starter includes 3, Professional 7, Business 20.',
  },
  {
    q: 'What is the client portal?',
    a: 'A place your clients sign in to review selections, sign documents and see progress. It is included on Professional and Business.',
  },
  {
    q: 'What is AI photo tagging?',
    a: 'An optional add-on that auto-tags jobsite photos so they are easy to find. $20/month for up to 1,500 photos, a hard cap — you are never billed for overage.',
  },
];

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 py-16">
          <div className="mb-10 text-center">
            <h1 className="text-3xl font-bold text-brand-900 sm:text-4xl">Pricing</h1>
            <p className="mx-auto mt-3 max-w-2xl text-gray-600">
              Three plans for contractors running jobs with subs, client selections, and progress
              billing. Every plan includes unlimited active projects.
            </p>
          </div>

          <PricingTable />

          <div className="mx-auto mt-16 max-w-3xl">
            <h2 className="mb-6 text-2xl font-bold text-brand-900">Details</h2>
            <dl className="space-y-6">
              {DETAILS.map((d) => (
                <div key={d.q}>
                  <dt className="font-semibold text-brand-900">{d.q}</dt>
                  <dd className="mt-1 text-gray-600">{d.a}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-12 rounded-xl bg-gray-50 p-6 text-center">
              <p className="text-lg font-semibold text-brand-900">Ready to start?</p>
              <Link
                href="/sign-up"
                className="mt-4 inline-block rounded-lg bg-brand-500 px-8 py-3 text-base font-semibold text-white hover:bg-brand-600"
              >
                Start your 30-day free trial
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
