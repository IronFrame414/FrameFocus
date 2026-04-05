import { Suspense } from 'react';
import AcceptInviteContent from './accept-invite';

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <p className="text-gray-500">Loading invitation...</p>
        </div>
      }
    >
      <AcceptInviteContent />
    </Suspense>
  );
}