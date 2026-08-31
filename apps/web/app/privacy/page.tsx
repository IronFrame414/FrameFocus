import type { Metadata } from 'next';
import { brand } from '@/lib/brand';
import { SiteHeader } from '@/components/public/site-header';
import { SiteFooter, PUBLIC_CONTACT_EMAIL } from '@/components/public/site-footer';

export const metadata: Metadata = {
  title: `Privacy Policy — ${brand.name}`,
};

// ⚠️ PLACEHOLDER — the reviewed Privacy Policy text is not yet available
// (docs/specs/privacy-policy.md is empty at time of writing). This page
// deliberately asserts NO policy: it makes no claim about what data is or is not
// collected. When Josh provides the reviewed text it is rendered here VERBATIM
// (public-site §S-LEGAL). ⚠️ The reviewed policy states there is no analytics or
// tracking — keep that true (public-site §8): add no pixels or scripts here.
export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="mx-auto max-w-3xl flex-1 px-6 py-16">
        <h1 className="text-3xl font-bold text-brand-900">Privacy Policy</h1>
        <p className="mt-6 text-gray-600">
          Our Privacy Policy is being finalised and will be published here shortly. For questions in
          the meantime, contact{' '}
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
