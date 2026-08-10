'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AtSign, Send } from 'lucide-react';
import { color, font } from '@/lib/theme';
import type { ThreadKind } from '@/lib/chat/threads';

/**
 * The composer — §7.3 — and the `@` affordance, which is §5.1 and §2.4.
 *
 * ===========================================================================
 * THE `@` BUTTON IS PROMINENT ON PURPOSE, AND THAT IS NOT A STYLE PREFERENCE
 * ===========================================================================
 * Under parent R6 a plain message notifies NOBODY. Only an `@mention` does.
 * Josh accepted that and closed the gap with enforcement rather than a feature,
 * which means the entire delivery guarantee of this module rests on a human
 * remembering to type one character.
 *
 * So the affordance carries far more weight than its size suggests: §5.1 —
 * "The picker is PROMINENT, not a hidden keyboard shortcut." It is a labelled
 * button beside Send, not an icon tucked into a corner, and the line under the
 * input says plainly what the button is for. Making this subtler to tidy the
 * layout would be trading the feature's only delivery guarantee for whitespace.
 */

export interface MentionPerson {
  profileId: string;
  name: string;
  role: string;
  /** null when no unambiguous token exists — see `insertTokenFor`. */
  token: string | null;
}

interface ChatComposerProps {
  projectId: string;
  kind: ThreadKind;
  disabled?: boolean;
  onSend: (body: string) => Promise<{ ok: boolean; unresolved: string[] }>;
}

/** The `@fragment` immediately before the caret, or null. */
function activeFragment(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const match = before.match(/@([A-Za-z0-9._-]*)$/);
  if (!match) return null;
  return { start: caret - match[0].length, query: match[1].toLowerCase() };
}

export function ChatComposer({ projectId, kind, disabled, onSend }: ChatComposerProps) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [people, setPeople] = useState<MentionPerson[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingCaret, setPendingCaret] = useState<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /**
   * ⚠️ THE CARET IS RESTORED IN useLayoutEffect, NOT requestAnimationFrame.
   *
   * _Superseded implementation, quoted not rewritten: `requestAnimationFrame(()
   * => { input?.focus(); input?.setSelectionRange(pos, pos); })`._
   *
   * That version LOST THE FIRST CHARACTER TYPED AFTER PICKING A NAME. RAF fires
   * after the browser has already processed pending input, so a keystroke that
   * arrived between the click and the frame landed at caret 0 — and the rest of
   * the sentence then landed correctly after the token. Typing "can you count"
   * straight after choosing Casey produced:
   *
   *     con it — @caseyan you count what is left?
   *
   * Every assertion passed, because the test that checked insertion never typed
   * afterwards. It was found by taking a screenshot and reading it.
   *
   * useLayoutEffect runs synchronously after the DOM update and before the
   * browser paints or delivers further input, so there is no window to race.
   */
  useLayoutEffect(() => {
    if (pendingCaret === null) return;
    const input = inputRef.current;
    if (input) {
      input.focus();
      input.setSelectionRange(pendingCaret, pendingCaret);
    }
    setPendingCaret(null);
  }, [pendingCaret]);

  // The postable set, fetched once per thread. Not computed here: §7.5 lists
  // the POSTABLE set and `postableSet()` on the server is the only thing that
  // knows what that is.
  useEffect(() => {
    let cancelled = false;
    setPeople(null);
    fetch(`/api/chat/mentions?project_id=${projectId}&kind=${kind}`)
      .then((r) => (r.ok ? r.json() : { people: [] }))
      .then((json) => {
        if (!cancelled) setPeople(json.people ?? []);
      })
      .catch(() => {
        if (!cancelled) setPeople([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, kind]);

  const syncPicker = useCallback((text: string, caret: number) => {
    const fragment = activeFragment(text, caret);
    if (fragment) {
      setQuery(fragment.query);
      setPickerOpen(true);
    } else {
      setPickerOpen(false);
      setQuery('');
    }
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setBody(e.target.value);
    syncPicker(e.target.value, e.target.selectionStart ?? e.target.value.length);
  }

  /** The `@` button: insert the character and open the picker in one action. */
  function openPicker() {
    const input = inputRef.current;
    const caret = input?.selectionStart ?? body.length;
    // A space before `@` when mid-sentence, so the token starts cleanly.
    const needsSpace = caret > 0 && !/\s$/.test(body.slice(0, caret));
    const inserted = `${needsSpace ? ' ' : ''}@`;
    const next = body.slice(0, caret) + inserted + body.slice(caret);
    setBody(next);
    setQuery('');
    setPickerOpen(true);
    setPendingCaret(caret + inserted.length);
  }

  function choose(person: MentionPerson) {
    if (!person.token) {
      // Refusing to insert is the correct behaviour, not an unhandled case. A
      // token is null when it would resolve to nobody — either because someone
      // else here answers to the same name, or because the name itself is not
      // something the parser can read back (a surname with a space in it).
      // Inserting either would send a message the sender believes notified
      // someone.
      setNotice(
        `${person.name} has no unique @name in this thread — nothing was inserted, so they would not be notified.`
      );
      setPickerOpen(false);
      return;
    }
    const input = inputRef.current;
    const caret = input?.selectionStart ?? body.length;
    const fragment = activeFragment(body, caret);
    const start = fragment ? fragment.start : caret;
    const next = `${body.slice(0, start)}@${person.token} ${body.slice(caret)}`;
    setBody(next);
    setPickerOpen(false);
    setNotice(null);
    // `@` + token + the trailing space.
    setPendingCaret(start + person.token.length + 2);
  }

  async function submit() {
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setNotice(null);
    const outcome = await onSend(trimmed);
    setSending(false);
    if (outcome.ok) {
      setBody('');
      setPickerOpen(false);
      // The parser reports tokens it refused to guess at. Saying so is the
      // difference between "you notified nobody" and the sender never finding
      // out — §5.1's ambiguity rule is only safe if it is visible.
      if (outcome.unresolved.length > 0) {
        setNotice(
          `Sent, but ${outcome.unresolved.map((t) => `@${t}`).join(', ')} matched nobody — no one was notified about that.`
        );
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape' && pickerOpen) {
      e.preventDefault();
      setPickerOpen(false);
      return;
    }
    // Enter sends, Shift+Enter is a newline — the shape every chat has.
    if (e.key === 'Enter' && !e.shiftKey && !pickerOpen) {
      e.preventDefault();
      void submit();
    }
  }

  const filtered = (people ?? []).filter(
    (p) => query === '' || p.name.toLowerCase().includes(query) || (p.token ?? '').includes(query)
  );

  return (
    <div style={{ borderTop: `1px solid ${color.cardBorder}`, padding: '12px 14px' }}>
      {pickerOpen && (
        <div
          data-testid="chat-mention-picker"
          style={{
            marginBottom: '8px',
            maxHeight: '176px',
            overflowY: 'auto',
            border: `1px solid ${color.inputBorder}`,
            borderRadius: '9px',
            backgroundColor: color.cardBg,
          }}
        >
          {people === null && (
            <p style={{ ...hintStyle, padding: '10px 12px' }}>Loading people…</p>
          )}
          {/* §7.5 — an empty picker is a real state, not a crash. */}
          {people !== null && filtered.length === 0 && (
            <p data-testid="chat-mention-empty" style={{ ...hintStyle, padding: '10px 12px' }}>
              Nobody here to mention.
            </p>
          )}
          {filtered.map((p) => (
            <button
              key={p.profileId}
              type="button"
              data-testid="chat-mention-option"
              onClick={() => choose(p)}
              style={{
                display: 'flex',
                width: '100%',
                alignItems: 'baseline',
                gap: '8px',
                padding: '8px 12px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: font.sans,
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 600, color: color.navy }}>{p.name}</span>
              <span style={{ fontSize: '12px', color: color.muted }}>{p.role}</span>
            </button>
          ))}
        </div>
      )}

      <textarea
        ref={inputRef}
        data-testid="chat-composer-input"
        value={body}
        disabled={disabled || sending}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onClick={(e) => syncPicker(body, e.currentTarget.selectionStart ?? body.length)}
        rows={2}
        placeholder="Write a message…"
        style={{
          width: '100%',
          resize: 'none',
          padding: '9px 11px',
          borderRadius: '9px',
          border: `1px solid ${color.inputBorder}`,
          fontFamily: font.sans,
          fontSize: '13px',
          color: color.body,
          outline: 'none',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
        {/* §5.1 — PROMINENT, and adjacent to send. Labelled, not a bare icon. */}
        <button
          type="button"
          data-testid="chat-mention-button"
          onClick={openPicker}
          disabled={disabled || sending}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '9px 14px',
            borderRadius: '9px',
            border: `1px solid ${color.primary}`,
            backgroundColor: color.blueTint,
            color: color.primary,
            fontFamily: font.sans,
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <AtSign size={15} strokeWidth={2.2} aria-hidden />
          Mention
        </button>

        <button
          type="button"
          data-testid="chat-send"
          onClick={() => void submit()}
          disabled={disabled || sending || body.trim() === ''}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            marginLeft: 'auto',
            padding: '9px 16px',
            borderRadius: '9px',
            border: 'none',
            backgroundColor: body.trim() === '' ? color.faintAlt : color.primary,
            color: '#fff',
            fontFamily: font.sans,
            fontSize: '13px',
            fontWeight: 600,
            cursor: body.trim() === '' ? 'default' : 'pointer',
          }}
        >
          <Send size={14} strokeWidth={2.2} aria-hidden />
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>

      {/* R6, said out loud. A message with no `@` reaches nobody's phone, and
          the only place a person can learn that is here. */}
      <p data-testid="chat-mention-hint" style={{ ...hintStyle, marginTop: '7px' }}>
        Only <strong style={{ fontWeight: 700, color: color.primary }}>@mentions</strong> notify
        someone. A plain message waits until they open chat.
      </p>

      {notice && (
        <p
          data-testid="chat-composer-notice"
          style={{ ...hintStyle, marginTop: '6px', color: color.warningDeep }}
        >
          {notice}
        </p>
      )}
    </div>
  );
}

const hintStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: font.sans,
  fontSize: '12px',
  color: color.muted,
};
