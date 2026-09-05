import Link from 'next/link';
import { brand } from '@/lib/brand';

// Shared footer for the public pages. The contact address is the one Josh ruled
// published (public-site §4); it is also SUPPORT_REPLY_TO in email-service.ts.
//
// ⚠️ THE INTUIT PAYMENTS DISCLOSURE LIVES HERE, AND IT IS A COMMITMENT TO
// INTUIT — NOT A NICETY. 7g2-spec.md §5.5, RULED [S103]: Josh answered YES to
// Intuit on BOTH marketing and product disclosure, and Intuit reviews an app
// against what was declared. Removing this line breaks that commitment.
//
// It sits in the shared footer rather than on /pricing alone so that every
// public page carries it — one placement instead of four that can drift apart,
// and a new marketing page inherits it automatically. That is placement 1 of
// the three §5.5 requires; placement 2 is the invoice pay-link surface, and
// placement 3 (the client-portal pay surface) is a FORWARD OBLIGATION recorded
// in GATED.md for immediately after M7, because the portal is Module 9 and its
// pay surface does not exist yet.
export const PUBLIC_CONTACT_EMAIL = 'ezcontractorbinder@gmail.com';

export function SiteFooter() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p>© {brand.name}</p>
          <p className="mt-1 text-xs text-gray-500">
            Payment service provided by Intuit Payments Inc.
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/pricing" className="hover:text-brand-900">
            Pricing
          </Link>
          <Link href="/terms" className="hover:text-brand-900">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-brand-900">
            Privacy
          </Link>
          <Link href="/sign-in" className="hover:text-brand-900">
            Sign in
          </Link>
          <a href={`mailto:${PUBLIC_CONTACT_EMAIL}`} className="hover:text-brand-900">
            {PUBLIC_CONTACT_EMAIL}
          </a>
        </nav>
      </div>
    </footer>
  );
}
