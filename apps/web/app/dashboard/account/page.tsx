import { redirect } from 'next/navigation';
import { getMyProfile } from '@/lib/services/profiles';
import { NameForm } from '@/components/account/name-form';
import { PasswordForm } from '@/components/account/password-form';
import { LanguageForm } from '@/components/account/language-form';

// Personal account — self-service, EVERY role (no role gate; the dashboard layout
// already requires a session). Name [Josh, S177] and, since S109 #162, password —
// the "something real to add" the S177 note waited for: three staff on production
// were sharing one hand-set password with no way to change it. Still no
// disabled email/avatar fields. Email is an auth surface (a Supabase re-confirmation flow), not a
// profile field; notification preferences have no table.
export default async function AccountPage() {
  const profile = await getMyProfile();
  if (!profile) redirect('/sign-in');

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">Your account</h1>
      <p className="mt-1 text-sm text-gray-500">Your name, password and language.</p>
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
        <NameForm
          initialFirstName={profile.first_name ?? ''}
          initialLastName={profile.last_name ?? ''}
        />
      </div>
      <h2 className="mt-8 text-lg font-semibold text-gray-900">Password</h2>
      <div className="mt-3 rounded-xl border border-gray-200 bg-white p-6">
        <PasswordForm />
      </div>
      {/* S110 H, ruling 1 — the language toggle. The desktop page itself stays
          English (ruling 2); this setting translates /m and what people typed. */}
      <h2 className="mt-8 text-lg font-semibold text-gray-900">Language</h2>
      <div className="mt-3 rounded-xl border border-gray-200 bg-white p-6">
        <LanguageForm initial={profile.language} />
      </div>
    </div>
  );
}
