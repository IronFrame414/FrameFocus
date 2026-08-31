import Link from 'next/link';
import { brand } from '@/lib/brand';

// Shared header for the public (signed-out) pages. Light background, so the
// light-background logo variant (dark kicker). Links are the only two actions a
// visitor has: sign in, or start a trial.

export function SiteHeader() {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        {/* The logo IS the way home. It already linked to `/`; the fault was
            affordance — too small to read as a target and no hover cue. Larger
            (h-12, so the "EZ Contractor" line is legible) + a hover/focus state
            so it reads as clickable. */}
        <Link
          href="/"
          aria-label={`${brand.name} — home`}
          className="inline-block rounded transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          <img src="/logo-full-light.svg" alt={brand.name} className="block h-12 w-auto" />
        </Link>
        <nav className="flex items-center gap-3">
          <Link
            href="/pricing"
            className="hidden px-3 py-2 text-sm font-medium text-gray-700 hover:text-brand-900 sm:block"
          >
            Pricing
          </Link>
          <Link
            href="/sign-in"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-brand-900 hover:bg-gray-100"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
          >
            Start free trial
          </Link>
        </nav>
      </div>
    </header>
  );
}
