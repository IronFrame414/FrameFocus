import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-brand-900">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-white mb-4">
          Frame<span className="text-accent-400">Focus</span>
        </h1>
        <p className="text-xl text-brand-200 mb-8">Construction Management Platform</p>
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
