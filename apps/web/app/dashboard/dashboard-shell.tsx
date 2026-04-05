'use client';

import { createClient } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ROLE_LABELS } from '@framefocus/shared';

interface DashboardShellProps {
  children: React.ReactNode;
  userName: string;
  userRole: string;
  companyName: string;
}

export function DashboardShell({ children, userName, userRole, companyName }: DashboardShellProps) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/sign-in');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="flex w-64 flex-col bg-brand-900 text-white">
        <div className="p-6">
          <h1 className="text-xl font-bold">
            Frame<span className="text-accent-400">Focus</span>
          </h1>
          <p className="mt-1 text-sm text-brand-300">{companyName}</p>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          <Link
            href="/dashboard/contacts"
            className="flex items-center rounded-lg px-3 py-2 text-sm font-medium text-brand-100 hover:bg-brand-800"
          >
            Contacts
          </Link>
          <Link
            href="/dashboard/subcontractors"
            className="flex items-center rounded-lg px-3 py-2 text-sm font-medium text-brand-100 hover:bg-brand-800"
          >
            Subs & Vendors
          </Link>
          <Link
            href="/dashboard/settings"
            className="flex items-center rounded-lg px-3 py-2 text-sm font-medium text-brand-100 hover:bg-brand-800"
          >
            Settings
          </Link>
          {(userRole === 'owner' || userRole === 'admin') && (
            <Link
              href="/dashboard/settings"
              className="flex items-center rounded-lg px-3 py-2 text-sm font-medium text-brand-100 hover:bg-brand-800"
            >
              Settings
            </Link>
          )}
          {userRole === 'owner' && (
            <Link
              href="/dashboard/billing"
              className="flex items-center rounded-lg px-3 py-2 text-sm font-medium text-brand-100 hover:bg-brand-800"
            >
              Billing
            </Link>
          )}
        </nav>

        <div className="border-t border-brand-800 p-4">
          <div className="mb-3">
            <p className="text-sm font-medium text-white">{userName}</p>
            <p className="text-xs text-brand-300">{ROLE_LABELS[userRole] ?? userRole}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full rounded-lg bg-brand-800 px-3 py-2 text-sm text-brand-200 hover:bg-brand-700"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
