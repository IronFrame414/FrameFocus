import { redirect } from 'next/navigation';
import { getMyProfile } from '@/lib/services/profiles';
import { NameForm } from '@/components/account/name-form';

// Personal account — self-service, EVERY role (no role gate; the dashboard layout
// already requires a session). Name only, for now [Josh, S177]. The page grows
// when there is something real to add — not with disabled password/email/avatar
// fields. Email is an auth surface (a Supabase re-confirmation flow), not a
// profile field; notification preferences have no table.
export default async function AccountPage() {
  const profile = await getMyProfile();
  if (!profile) redirect('/sign-in');

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">Your account</h1>
      <p className="mt-1 text-sm text-gray-500">Update the name shown across the app.</p>
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
        <NameForm
          initialFirstName={profile.first_name ?? ''}
          initialLastName={profile.last_name ?? ''}
        />
      </div>
    </div>
  );
}
