'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { createInvitation } from '@/lib/services/team';

const INVITABLE_ROLES = [
  {
    value: 'admin',
    label: 'Admin',
    description: 'Full access except billing and promoting to Admin',
  },
  {
    value: 'project_manager',
    label: 'Project Manager',
    description: 'Estimates, projects, finances, and team coordination',
  },
  {
    value: 'foreman',
    label: 'Foreman',
    description: 'Field crew management, daily logs, and punch lists',
  },
  {
    value: 'crew_member',
    label: 'Crew Member',
    description: 'Clock in/out, daily logs, photos, and task updates',
  },
  {
    value: 'client',
    label: 'Client',
    description: 'Portal access to project timeline, payments, and documents',
  },
];

interface InviteFormProps {
  companyId: string;
  invitedBy: string;
}

export default function InviteForm({ companyId, invitedBy }: InviteFormProps) {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInviteLink(null);

    if (!email || !role) {
      setError('Please enter an email and select a role.');
      return;
    }

    try {
      setLoading(true);
      const invitation = await createInvitation(supabase, {
        companyId,
        email,
        role,
        invitedBy,
      });

      const baseUrl = window.location.origin;
      setInviteLink(`${baseUrl}/invite/accept?token=${invitation.token}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create invitation');
    } finally {
      setLoading(false);
    }
  }

  function handleCopyLink() {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
    }
  }

  function handleReset() {
    setEmail('');
    setRole('');
    setInviteLink(null);
    setError(null);
  }

  return (
    <div>
      <div className="mb-6">
        <a href="/dashboard/team" className="text-sm text-blue-600 hover:text-blue-800">
          &larr; Back to Team
        </a>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Invite Team Member</h1>
        <p className="text-sm text-gray-500 mt-1">Send an invitation to join your company.</p>
      </div>

      {inviteLink ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-green-800 mb-2">Invitation Created</h2>
          <p className="text-sm text-green-700 mb-4">
            Share this link with <strong>{email}</strong> to join as{' '}
            <strong>{INVITABLE_ROLES.find((r) => r.value === role)?.label}</strong>:
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={inviteLink}
              className="flex-1 rounded-md border border-green-300 bg-white px-3 py-2 text-sm text-gray-700"
            />
            <button
              onClick={handleCopyLink}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              Copy
            </button>
          </div>
          <p className="text-xs text-green-600 mt-3">This link expires in 7 days.</p>
          <button
            onClick={handleReset}
            className="mt-4 text-sm text-green-700 underline hover:text-green-900"
          >
            Invite another team member
          </button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
              <div className="space-y-2">
                {INVITABLE_ROLES.map((r) => (
                  <label
                    key={r.value}
                    className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      role === r.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={r.value}
                      checked={role === r.value}
                      onChange={() => setRole(r.value)}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{r.label}</p>
                      <p className="text-xs text-gray-500">{r.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-red-50 p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Creating invitation...' : 'Send Invitation'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
