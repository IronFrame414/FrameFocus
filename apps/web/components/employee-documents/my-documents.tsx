'use client';

import { useState } from 'react';
import { useT } from '@/components/i18n/language-provider';
import {
  employeeDocumentUrl,
  type EmployeeDocument,
} from '@/lib/services/employee-documents-client';

// S118 item 16 — "my documents": what the office has filed against the signed-in
// person. ONE component for /m/account and /dashboard/account (PARITY): an
// employee reading their own signed handbook does it on a phone. Read-only.
// The list comes from the server (their own rows only); the URL is signed by
// storage RLS, which admits them only for their OWN live document.

export function MyDocuments({ documents }: { documents: EmployeeDocument[] }) {
  const t = useT();
  const [failed, setFailed] = useState<string | null>(null);

  async function open(doc: EmployeeDocument) {
    setFailed(null);
    const url = await employeeDocumentUrl(doc.file_path);
    if (!url) {
      setFailed(doc.id);
      return;
    }
    window.open(url, '_blank', 'noopener');
  }

  return (
    <div data-testid="my-docs">
      <h2 className="mb-[10px] text-[15px] font-semibold">{t('account.docs.title')}</h2>
      {documents.length === 0 ? (
        <p className="text-[14px] opacity-70" data-testid="my-docs-empty">
          {t('account.docs.none')}
        </p>
      ) : (
        <ul>
          {documents.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-3 py-[6px] text-[14px]"
              data-testid="my-doc"
            >
              <span className="truncate">{d.file_name}</span>
              <button
                type="button"
                className="font-semibold text-blue-700"
                onClick={() => void open(d)}
              >
                {t('account.docs.open')}
              </button>
              {failed === d.id ? (
                <span role="alert" className="text-red-700">
                  {t('account.docs.openFailed')}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
