'use client';

// 7A §5.3 — page host for the shared capture form (one column, camera-first).

import { useRouter } from 'next/navigation';
import { ExpenseCaptureForm } from '@/components/expenses/expense-capture-form';
import { cardStyle, color, h2Style } from '@/lib/theme';

interface NewExpenseClientProps {
  projects: { id: string; name: string }[];
  initialProjectId?: string;
  todayYmd: string;
  callerRole: string;
}

export function NewExpenseClient({
  projects,
  initialProjectId,
  todayYmd,
  callerRole,
}: NewExpenseClientProps) {
  const router = useRouter();

  return (
    <div style={{ maxWidth: '480px' }}>
      <h2 style={{ ...h2Style, marginBottom: '4px' }}>Log expense</h2>
      <p style={{ color: color.muted, fontSize: '13px', margin: '0 0 16px' }}>
        Photograph the receipt at the register — it lands pending until reviewed.
      </p>
      <div style={{ ...cardStyle, padding: '20px 24px' }}>
        <ExpenseCaptureForm
          projects={projects}
          initialProjectId={initialProjectId}
          todayYmd={todayYmd}
          callerRole={callerRole}
          onDone={() => {
            router.push('/dashboard/expenses');
            router.refresh();
          }}
          onCancel={() => router.back()}
        />
      </div>
    </div>
  );
}
