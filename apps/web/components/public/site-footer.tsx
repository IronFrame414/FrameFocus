import Link from 'next/link';
import { brand } from '@/lib/brand';

// Shared footer for the public pages. The contact address is the one Josh ruled
// published (public-site §4); it is also SUPPORT_REPLY_TO in email-service.ts.
export const PUBLIC_CONTACT_EMAIL = 'ezcontractorbinder@gmail.com';

export function SiteFooter() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {brand.name}
        </p>
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
