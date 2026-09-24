'use client';

import { useT } from '@/components/i18n/language-provider';

/**
 * S110 H [RULED Josh, Q14 → A + C, never B] — THE SEND-TIME WARNING, one
 * component for every client-facing send (proposal, change order, invoice; on
 * /dashboard and /m — parity S122).
 *
 * The server named fields that are not in English. The office sender either
 * cancels and edits them, or sends anyway — the override is recorded
 * server-side on the send. Nothing is translated for the client, ever: the
 * document goes out exactly as written.
 *
 * Its own words follow the surface (English on /dashboard; the user's language
 * on /m). The FIELD names come from the server in English.
 */
export function NotEnglishWarning({
  fields,
  doc,
  busy,
  onSendAnyway,
}: {
  fields: string[];
  doc: 'proposal' | 'changeOrder' | 'invoice';
  busy?: boolean;
  onSendAnyway: () => void;
}) {
  const t = useT();
  return (
    <div
      role="alert"
      data-testid="send-not-english"
      style={{
        padding: '0.75rem 1rem',
        borderRadius: '0.375rem',
        marginBottom: '1rem',
        backgroundColor: '#fffbeb',
        border: '1px solid #f5cf8f',
        color: '#7c4a03',
        fontSize: '0.875rem',
      }}
    >
      <strong>{t('sendcheck.title')}</strong>{' '}
      {t('sendcheck.body', { doc: t(`sendcheck.doc.${doc}`) })}
      <ul style={{ margin: '0.5rem 0 0.5rem 1.25rem', listStyle: 'disc' }}>
        {fields.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      {t('sendcheck.hint')}
      <div style={{ marginTop: '0.5rem' }}>
        <button
          type="button"
          data-testid="send-anyway"
          onClick={onSendAnyway}
          disabled={busy}
          style={{
            padding: '0.375rem 0.75rem',
            fontSize: '0.8125rem',
            fontWeight: 600,
            backgroundColor: '#fff',
            border: '1px solid #d4a24c',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            minHeight: '44px',
          }}
        >
          {t('sendcheck.sendAnyway')}
        </button>
      </div>
    </div>
  );
}
