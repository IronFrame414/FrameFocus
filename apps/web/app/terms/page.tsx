import type { Metadata } from 'next';
import { brand } from '@/lib/brand';
import { SiteHeader } from '@/components/public/site-header';
import { SiteFooter, PUBLIC_CONTACT_EMAIL } from '@/components/public/site-footer';

export const metadata: Metadata = {
  title: `Terms of Service — ${brand.name}`,
};

// ⚠️ PLACEHOLDER — the reviewed Terms of Service text is not yet available
// (docs/specs/terms-of-service.md is empty at time of writing). This page
// deliberately asserts NO policy: no invented terms, no invented numbers. When
// Josh provides the reviewed text it is rendered here VERBATIM (public-site §S-LEGAL).
export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="mx-auto max-w-3xl flex-1 px-6 py-16">
        <h1 className="text-3xl font-bold text-brand-900">Terms of Service</h1>
        <p className="mt-6 text-gray-600">
          Our Terms of Service are being finalised and will be published here shortly. For questions
          in the meantime, contact{' '}
          <a href={`mailto:${PUBLIC_CONTACT_EMAIL}`} className="font-medium text-brand-500 hover:text-brand-600">
            {PUBLIC_CONTACT_EMAIL}
          </a>
          .
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
