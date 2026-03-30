import { createClient } from '@/lib/supabase-server';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, role')
    .eq('user_id', user?.id ?? '')
    .single();

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">
        Welcome back, {profile?.first_name ?? 'there'}
      </h1>
      <p className="mt-2 text-gray-600">
        This is your FrameFocus dashboard. Modules will appear here as they&apos;re built.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="text-sm font-medium text-gray-500">Module 1</div>
          <div className="mt-1 text-lg font-semibold text-gray-900">Settings &amp; Admin</div>
          <div className="mt-2 inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
            In Progress
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="text-sm font-medium text-gray-500">Module 2</div>
          <div className="mt-1 text-lg font-semibold text-gray-900">Contacts &amp; CRM</div>
          <div className="mt-2 inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
            Not Started
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="text-sm font-medium text-gray-500">Module 4</div>
          <div className="mt-1 text-lg font-semibold text-gray-900">Sales &amp; Estimating</div>
          <div className="mt-2 inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
            Not Started
          </div>
        </div>
      </div>
    </div>
  );
}