import Link from 'next/link';
import { brand } from '@/lib/brand';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-brand-900">
      <div className="text-center">
        {/* ICE variant — this screen is bg-brand-900 (navy), so the kicker has
            to be light. logo-full-ice.svg is logo-full-dark.svg with the kicker
            fill changed from slate #7B849A (4.27:1 on navy) to ice #CED6E8
            (10.96:1); nothing else differs. The navy and full-light variants
            are for LIGHT backgrounds and would be near-invisible here.
            Hero scale — h-24 against the auth screens' h-16, matching the 5xl
            treatment this replaced. */}
        <h1 className="mb-4">
          <img
            src="/logo-full-ice.svg"
            alt={brand.name}
            width={251}
            height={96}
            className="mx-auto block h-24 w-auto"
          />
        </h1>
        {/* Amber to match the "Binder" wordmark immediately above it. Uses the
            LOGO's amber (#EDA122 via brand.logoAmber), not Tailwind
            accent-500 (#f59e0b) — see brand.ts. The two are different oranges
            and a near-miss directly under the wordmark reads as a mistake. */}
        <p className="text-xl mb-8" style={{ color: brand.logoAmber }}>
          Construction Management Platform
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/sign-in"
            className="rounded-lg bg-white px-6 py-3 text-sm font-semibold text-brand-900 hover:bg-gray-100"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded-lg bg-accent-500 px-6 py-3 text-sm font-semibold text-white hover:bg-accent-600"
          >
            Start free trial
          </Link>
        </div>
      </div>
    </main>
  );
}
