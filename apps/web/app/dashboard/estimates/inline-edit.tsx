'use client';

import { useEffect, useRef, useState } from 'react';

// Inline-edit primitives for the estimate builder (4D).
// Click → input. Enter or blur saves; Esc cancels. On save failure
// the field stays dirty with the error shown so input is never
// silently lost (Q2 decision b).

interface InlineTextProps {
  value: string;
  onSave: (value: string) => Promise<{ success: boolean; error?: string }>;
  disabled?: boolean;
  placeholder?: string;
  multiline?: boolean;
  style?: React.CSSProperties;
}

export function InlineText({
  value,
  onSave,
  disabled,
  placeholder,
  multiline,
  style,
}: InlineTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function save() {
    if (draft === value) {
      setEditing(false);
      setError(null);
      return;
    }
    setSaving(true);
    const result = await onSave(draft);
    setSaving(false);
    if (result.success) {
      setEditing(false);
      setError(null);
    } else {
      // stay dirty — user can retry (Enter/blur) or Esc to discard
      setError(result.error || 'Save failed — press Enter to retry');
    }
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
    setError(null);
  }

  if (!editing) {
    return (
      <span
        onClick={() => !disabled && setEditing(true)}
        style={{
          cursor: disabled ? 'default' : 'pointer',
          borderBottom: disabled ? 'none' : '1px dashed #d1d5db',
          color: value ? 'inherit' : '#9ca3af',
          ...style,
        }}
        title={disabled ? undefined : 'Click to edit'}
      >
        {value || placeholder || '—'}
      </span>
    );
  }

  const commonProps = {
    value: draft,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft(e.target.value),
    onBlur: save,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !multiline) {
        e.preventDefault();
        save();
      }
      if (e.key === 'Escape') cancel();
    },
    disabled: saving,
    placeholder,
    style: {
      padding: '0.25rem 0.5rem',
      border: error ? '1px solid #dc2626' : '1px solid #2563eb',
      borderRadius: '0.25rem',
      fontSize: 'inherit',
      fontFamily: 'inherit',
      width: '100%',
      ...style,
    } as React.CSSProperties,
  };

  return (
    <span style={{ display: 'inline-block', minWidth: '8rem', width: '100%' }}>
      {multiline ? (
        <textarea
          {...commonProps}
          ref={(el) => {
            inputRef.current = el;
          }}
          rows={3}
        />
      ) : (
        <input
          {...commonProps}
          ref={(el) => {
            inputRef.current = el;
          }}
        />
      )}
      {error && (
        <span style={{ display: 'block', color: '#dc2626', fontSize: '0.75rem' }}>{error}</span>
      )}
    </span>
  );
}

interface InlineNumberProps {
  value: number | null;
  onSave: (value: number | null) => Promise<{ success: boolean; error?: string }>;
  disabled?: boolean;
  /** Renders the display value (e.g. money or percent formatting). */
  format?: (value: number | null) => string;
  /** Client-side validation; return an error message to block save. */
  validate?: (value: number | null) => string | null;
  allowNull?: boolean;
  placeholder?: string;
  width?: string;
}

export function InlineNumber({
  value,
  onSave,
  disabled,
  format,
  validate,
  allowNull,
  placeholder,
  width,
}: InlineNumberProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value == null ? '' : String(value));
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function save() {
    const raw = draft.trim();
    let parsed: number | null;
    if (raw === '') {
      if (!allowNull) {
        setError('A value is required');
        return;
      }
      parsed = null;
    } else {
      const num = Number(raw);
      if (Number.isNaN(num)) {
        setError('Enter a number');
        return;
      }
      parsed = num;
    }

    const validationError = validate ? validate(parsed) : null;
    if (validationError) {
      setError(validationError);
      return;
    }

    if (parsed === value) {
      setEditing(false);
      setError(null);
      return;
    }

    setSaving(true);
    const result = await onSave(parsed);
    setSaving(false);
    if (result.success) {
      setEditing(false);
      setError(null);
    } else {
      setError(result.error || 'Save failed — press Enter to retry');
    }
  }

  function cancel() {
    setDraft(value == null ? '' : String(value));
    setEditing(false);
    setError(null);
  }

  if (!editing) {
    const display = format ? format(value) : value == null ? '—' : String(value);
    return (
      <span
        onClick={() => !disabled && setEditing(true)}
        style={{
          cursor: disabled ? 'default' : 'pointer',
          borderBottom: disabled ? 'none' : '1px dashed #d1d5db',
          color: value == null ? '#9ca3af' : 'inherit',
        }}
        title={disabled ? undefined : 'Click to edit'}
      >
        {display}
      </span>
    );
  }

  return (
    <span style={{ display: 'inline-block' }}>
      <input
        ref={inputRef}
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            save();
          }
          if (e.key === 'Escape') cancel();
        }}
        disabled={saving}
        placeholder={placeholder}
        style={{
          padding: '0.25rem 0.5rem',
          border: error ? '1px solid #dc2626' : '1px solid #2563eb',
          borderRadius: '0.25rem',
          fontSize: 'inherit',
          width: width || '6rem',
        }}
      />
      {error && (
        <span style={{ display: 'block', color: '#dc2626', fontSize: '0.75rem' }}>{error}</span>
      )}
    </span>
  );
}
