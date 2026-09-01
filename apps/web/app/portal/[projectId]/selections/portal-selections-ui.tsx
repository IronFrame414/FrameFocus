'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { color, font } from '@/lib/theme';
import { selectionConsentTextFor } from '@/lib/selections/consent-text';
import type { PortalSelection, PortalSelectionOption } from '@/lib/services/selections';
import { money } from '../../portal-ui';
import { SignatureCapture, buttonStyle, secondaryButtonStyle } from '../portal-writes-ui';

/**
 * ===========================================================================
 * S175 STAGE 7 — SHE PICKS, AND SHE SIGNS. Spec §9.3.
 * ===========================================================================
 *
 * The one client component on the Selections page. Everything that decides what
 * she may SEE is server-side and in RLS; this file decides only what happens
 * when she taps.
 *
 * ---------------------------------------------------------------------------
 * ONE SIGNATURE PER SELECTION, AND PARTIAL BATCHES ARE THE NORMAL CASE
 * ---------------------------------------------------------------------------
 * Josh, S173, deliberately: *"1 signature per selection category and allow
 * partial batch"* — and the reason, in his words: *"this will give the client a
 * chance to think about options if they aren't decided on 1. Then the company
 * can move forward with the selections that have been made."*
 *
 * ⚠️ ONE SIGNATURE OVER THE WHOLE BATCH IS THE OBVIOUS DESIGN AND A LATER
 * READER WILL PROPOSE IT. The reason it is wrong is structural, not
 * preferential: each signature binds ONE selection against ONE allowance, so no
 * instrument ever spans several allowance lines and there is no cross-allowance
 * variance to reconcile. The batch exists as DELIVERY only. She signs floor and
 * paint, leaves tile pending, and the company proceeds — an unsigned selection
 * blocks nothing, by construction rather than by a rule somebody enforces.
 *
 * ---------------------------------------------------------------------------
 * THE GREEN BOX IS REUSED, NOT REINVENTED
 * ---------------------------------------------------------------------------
 * Josh pointed at the company sheet's affordance specifically. A chosen option
 * gets `2px solid` green — `color.success`, the same `#16a34a` the sheet's
 * option card carries at `selection-sheet.tsx` — plus a ticked box. There is
 * deliberately no second affordance invented here.
 *
 * The box is a CHECKBOX in both modes, including single-choice, and the handler
 * enforces one-of. A radio would be the conventional control and it cannot be
 * un-picked by clicking, which would leave her unable to undo a mis-tap on a
 * selection she wants to think about — the exact behaviour the one-signature
 * ruling exists to protect. **How a single-choice selection communicates that
 * picking B un-picks A is Josh's to look at** (§Y): the mechanism is correct and
 * the feel is unverified.
 *
 * ---------------------------------------------------------------------------
 * WHY THE TOTALS ARE COMPUTED HERE AND NOT ON THE SERVER
 * ---------------------------------------------------------------------------
 * They move as she picks, and the binding wording names them. The figures
 * themselves are NOT computed here — every `sell` came from
 * `selection_client_option_sell()` and the deduction from
 * `selection_client_allowance_deduction()`, both SECURITY DEFINER reads
 * (20261037000000), because she may read neither `selection_option_amounts` nor
 * `project_budget_amounts`. This file adds them up; it does not price anything.
 *
 * ⚠️ AND THE WORDING IS THE SERVER'S WORDING. `selectionConsentTextFor()` is
 * the same function `completeSelectionSignature()` stores in `consent_text` —
 * shared through `lib/selections/consent-text.ts` rather than retyped, because
 * a signature attesting to words other than the ones recorded is worth nothing.
 *
 * ---------------------------------------------------------------------------
 * AFTER SHE SIGNS, THE PICKS ARE FROZEN (Q5.3)
 * ---------------------------------------------------------------------------
 * `selection_client_pick()` refuses outside `awaiting_approval`, and this
 * renders read-only outside it for the same reason: once `signed_*` is stamped,
 * re-picking would leave those figures describing a set she no longer holds.
 * Revision is the company's `revise` path, which supersedes the session and
 * clears the stamps first.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The one place a chosen card's border is decided. */
const cardBorder = (chosen: boolean) =>
  chosen ? `2px solid ${color.success}` : `1px solid ${color.cardBorder}`;

function Tick({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: '20px',
        height: '20px',
        flex: '0 0 20px',
        borderRadius: '5px',
        border: `2px solid ${checked ? color.success : color.inputBorder}`,
        backgroundColor: checked ? color.success : '#ffffff',
        color: '#ffffff',
        fontSize: '13px',
        fontWeight: 800,
        lineHeight: '17px',
        textAlign: 'center',
      }}
    >
      {checked ? '✓' : ''}
    </span>
  );
}

function OptionCard({
  option,
  chosen,
  interactive,
  onToggle,
}: {
  option: PortalSelectionOption;
  chosen: boolean;
  interactive: boolean;
  onToggle: () => void;
}) {
  const body = (
    <>
      {option.imageUrl || option.linkThumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={(option.imageUrl ?? option.linkThumbnailUrl)!}
          alt={option.name}
          style={{
            width: '86px',
            height: '86px',
            objectFit: 'cover',
            borderRadius: '9px',
            border: `1px solid ${color.cardBorder}`,
            flex: '0 0 86px',
          }}
        />
      ) : (
        <span
          style={{
            width: '86px',
            height: '86px',
            flex: '0 0 86px',
            borderRadius: '9px',
            backgroundColor: color.tableHeadBg,
            border: `1px solid ${color.cardBorder}`,
          }}
        />
      )}
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontWeight: 700, color: color.navy, fontSize: '14px' }}>
          {option.name}
        </span>
        {option.spec_detail && (
          <span style={{ display: 'block', fontSize: '12.5px', color: color.muted, marginTop: '2px' }}>
            {option.spec_detail}
          </span>
        )}
        {option.description && (
          <span style={{ display: 'block', fontSize: '12.5px', color: color.body, marginTop: '2px' }}>
            {option.description}
          </span>
        )}
        {option.link_url && (
          <a
            href={option.link_url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{ fontSize: '12.5px', color: color.primary, marginTop: '3px', display: 'inline-block' }}
          >
            View this product ↗
          </a>
        )}
      </span>
      {/* NULL sell renders nothing at all, never "$0.00" — a client-supplied
          selection has no price and an unpriced option is not a free one. */}
      {option.sell !== null && (
        <span
          data-testid="portal-option-sell"
          style={{ fontWeight: 700, color: color.navy, fontSize: '14px', whiteSpace: 'nowrap' }}
        >
          {money(option.sell)}
        </span>
      )}
    </>
  );

  const frame: React.CSSProperties = {
    display: 'flex',
    gap: '11px',
    alignItems: 'center',
    padding: '11px',
    borderRadius: '11px',
    border: cardBorder(chosen),
    backgroundColor: chosen ? color.successBg : color.cardBg,
    marginBottom: '9px',
  };

  if (!interactive) {
    return (
      <div data-testid={`portal-option-${option.id}`} data-chosen={chosen ? 'true' : 'false'} style={frame}>
        <Tick checked={chosen} />
        {body}
      </div>
    );
  }

  return (
    // The WHOLE card is the label, so the tap target is the card and not the
    // 20px box. Tap-target sizing is Josh's to review (§Y).
    <label
      data-testid={`portal-option-${option.id}`}
      data-chosen={chosen ? 'true' : 'false'}
      style={{ ...frame, cursor: 'pointer' }}
    >
      <input
        type="checkbox"
        checked={chosen}
        onChange={onToggle}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
      />
      <Tick checked={chosen} />
      {body}
    </label>
  );
}

/** One line of §9.3's ruled totals block. */
function TotalLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: '12px',
        fontSize: '13.5px',
        padding: '3px 0',
      }}
    >
      <span style={{ color: color.bodyAlt, fontWeight: strong ? 700 : 400 }}>{label}</span>
      <span
        style={{
          color: color.navy,
          fontWeight: strong ? 800 : 600,
          fontFamily: font.mono,
        }}
      >
        {value}
      </span>
    </div>
  );
}

export function PortalSelectionCard({
  selection,
  defaultName,
}: {
  selection: PortalSelection;
  defaultName: string;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>(
    selection.options.filter((o) => o.is_chosen).map((o) => o.id)
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signing, setSigning] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [declineNote, setDeclineNote] = useState('');

  const open = selection.status === 'awaiting_approval';

  async function toggle(optionId: string) {
    const was = picked;
    const next = picked.includes(optionId)
      ? picked.filter((id) => id !== optionId)
      // ⚠️ A single-choice selection REPLACES rather than appends — picking B
      // un-picks A, in one statement. `selection_client_pick()` refuses the
      // two-pick state as a backstop; this is the affordance that stops her
      // reaching it.
      : selection.allowMultiple
        ? [...picked, optionId]
        : [optionId];
    setPicked(next);
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/portal/pick-selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectionId: selection.id, optionIds: next }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Put it back. A pick that looks saved and is not is the worst of the
        // three outcomes: she signs believing the set on screen is the set of
        // record.
        setPicked(was);
        setError(payload.error ?? 'That choice could not be saved.');
      }
    } catch {
      setPicked(was);
      setError('That choice could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  const sellById = new Map(selection.options.map((o) => [o.id, o.sell]));
  const priced = picked.map((id) => sellById.get(id)).filter((v): v is number => typeof v === 'number');
  const sellTotal = r2(priced.reduce((n, v) => n + v, 0));
  const deduction = selection.allowanceDeduction ?? 0;
  const variance = r2(sellTotal - deduction);

  // ⚠️ NO TOTALS UNTIL SHE HAS PICKED SOMETHING, AND THIS WAS FOUND IN A
  // BROWSER RATHER THAN REASONED OUT.
  //
  // The first build rendered the block whenever the selection carried money.
  // With nothing picked that is `Selections Price $0.00`, `Allowance Deduction
  // -$6,000.00`, `Credit $6,000.00` — the page telling a client who has chosen
  // NOTHING that she is owed the entire allowance back. It is §5.4's phantom
  // underage arriving from a different direction: there the danger was joining a
  // client-supplied selection at zero, here it is summing an empty pick set
  // against a real deduction.
  //
  // A total over no choices is not a total. It appears when there is something
  // to total, which is also the moment the signature becomes available.
  const showMoney =
    !selection.clientSupplied && selection.allowanceDeduction !== null && picked.length > 0;
  const consentText = selectionConsentTextFor({
    clientSupplied: selection.clientSupplied,
    sellAmount: sellTotal,
    allowanceDeduction: deduction,
    variance,
  });

  async function decline() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/portal/decline-selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectionId: selection.id, notes: declineNote.trim() || null }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload.error ?? 'That could not be recorded.');
        return;
      }
      setDeclining(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      data-testid={`portal-selection-${selection.id}`}
      data-status={selection.status}
      style={{
        border: `1px solid ${color.cardBorder}`,
        borderRadius: '12px',
        padding: '15px 16px',
        marginBottom: '13px',
        backgroundColor: color.cardBg,
      }}
    >
      <header style={{ marginBottom: '10px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: color.navy, margin: 0 }}>
          {selection.name}
        </h3>
        {selection.description && (
          <p style={{ fontSize: '13px', color: color.muted, margin: '3px 0 0' }}>
            {selection.description}
          </p>
        )}
        <p style={{ fontSize: '12.5px', color: color.mutedAlt, margin: '4px 0 0' }}>
          {selection.clientSupplied
            ? 'You are supplying this item yourself — no charge applies.'
            : selection.allowMultiple
              ? 'Choose as many as you would like.'
              : 'Choose one.'}
          {selection.dueDate ? ` · Needed by ${new Date(selection.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
        </p>
      </header>

      {selection.options.length === 0 ? (
        <p style={{ fontSize: '13px', color: color.muted, margin: '0 0 10px' }}>
          Your contractor has not added any options to this one yet.
        </p>
      ) : (
        selection.options.map((o) => (
          <OptionCard
            key={o.id}
            option={o}
            chosen={picked.includes(o.id)}
            interactive={open && !busy}
            onToggle={() => void toggle(o.id)}
          />
        ))
      )}

      {error && (
        <p data-testid="portal-selection-error" style={{ fontSize: '12.5px', color: color.danger, margin: '0 0 10px' }}>
          {error}
        </p>
      )}

      {/* ── Approved: the figures she actually signed, and the date ────────── */}
      {selection.status === 'approved' && (
        <div
          data-testid="portal-selection-signed"
          style={{
            borderTop: `1px solid ${color.rowDivider}`,
            paddingTop: '10px',
            marginTop: '4px',
          }}
        >
          {selection.signed ? (
            <>
              <TotalLine label="Selections Price" value={money(selection.signed.sellAmount)} />
              <TotalLine
                label="Allowance Deduction"
                value={`-${money(selection.signed.allowanceDeduction)}`}
              />
              <TotalLine
                label={selection.signed.variance >= 0 ? 'Added Price' : 'Credit'}
                value={money(Math.abs(selection.signed.variance))}
                strong
              />
            </>
          ) : (
            <p style={{ fontSize: '13px', color: color.bodyAlt, margin: 0 }}>
              Supplied by you — no charge.
            </p>
          )}
          <p style={{ fontSize: '12.5px', color: color.successOnBg, fontWeight: 700, margin: '8px 0 0' }}>
            Approved
            {/* ⚠️ `approvedAt` is NOT always `selections.signed_at` — see
                `PortalSelection.approvedAt`. A client-supplied selection has all
                four `signed_*` stamps NULL by CHECK, and reading the column
                alone would print a date on every selection except that one. */}
            {selection.approvedAt
              ? ` on ${new Date(selection.approvedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
              : ''}
          </p>
        </div>
      )}

      {selection.status === 'denied' && (
        <p data-testid="portal-selection-denied" style={{ fontSize: '13px', color: color.warning, margin: '6px 0 0' }}>
          You told your contractor this one is not right. They will come back to you with a revision.
        </p>
      )}

      {selection.status === 'in_discussion' && (
        <p style={{ fontSize: '13px', color: color.muted, margin: '6px 0 0' }}>
          Your contractor is still putting this one together. Nothing to do yet.
        </p>
      )}

      {/* ── Awaiting: the totals, the wording, the signature ───────────────── */}
      {open && (
        <div style={{ borderTop: `1px solid ${color.rowDivider}`, paddingTop: '11px', marginTop: '4px' }}>
          {/* §9.3's ruled layout, in its ruled order. THE TOTALS ARE ABOVE THE
              SIGNATURE because this is what she is signing against. */}
          {showMoney && (
            <div data-testid="portal-selection-totals" style={{ marginBottom: '10px' }}>
              <TotalLine label="Selections Price" value={money(sellTotal)} />
              <TotalLine label="Allowance Deduction" value={`-${money(deduction)}`} />
              <TotalLine
                label={variance >= 0 ? 'Added Price' : 'Credit'}
                value={money(Math.abs(variance))}
                strong
              />
            </div>
          )}

          {signing ? (
            <SignatureCapture
              title={`Sign ${selection.name}`}
              defaultName={defaultName}
              /* The SERVER's sentence, from the shared module, over the figures
                 immediately above it. */
              consentText={consentText}
              submitLabel="Sign this selection"
              busyLabel="Signing…"
              testId="portal-selection-sign"
              onCancel={() => setSigning(false)}
              onSubmit={async (payload) => {
                const res = await fetch('/api/portal/sign-selection', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ selectionId: selection.id, ...payload, consent_given: true }),
                });
                const body = await res.json().catch(() => ({}));
                if (!res.ok) return body.error ?? 'That signature could not be recorded.';
                setSigning(false);
                router.refresh();
                return null;
              }}
            />
          ) : declining ? (
            <div>
              <label
                htmlFor={`decline-${selection.id}`}
                style={{ display: 'block', fontSize: '12.5px', color: color.bodyAlt, marginBottom: '4px' }}
              >
                Tell your contractor what is not right (optional)
              </label>
              <textarea
                id={`decline-${selection.id}`}
                value={declineNote}
                onChange={(e) => setDeclineNote(e.target.value)}
                rows={3}
                data-testid="portal-selection-decline-note"
                style={{
                  width: '100%',
                  padding: '9px 11px',
                  fontSize: '14px',
                  fontFamily: font.sans,
                  borderRadius: '8px',
                  border: `1px solid ${color.inputBorder}`,
                  resize: 'vertical',
                }}
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '9px' }}>
                <button
                  type="button"
                  onClick={() => void decline()}
                  disabled={busy}
                  data-testid="portal-selection-decline-confirm"
                  style={{ ...buttonStyle(!busy), backgroundColor: busy ? color.faintAlt : color.danger }}
                >
                  {busy ? 'Sending…' : 'Send this back'}
                </button>
                <button type="button" onClick={() => setDeclining(false)} style={secondaryButtonStyle}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {/* §6.2 — the signature refuses until at least one option is
                  picked. Refused HERE first, with a sentence, so she is not sent
                  through the pad to be told no at the end. */}
              <button
                type="button"
                onClick={() => setSigning(true)}
                disabled={picked.length === 0 || busy}
                data-testid="portal-selection-sign-open"
                style={buttonStyle(picked.length > 0 && !busy)}
              >
                Approve and sign
              </button>
              <button
                type="button"
                onClick={() => setDeclining(true)}
                disabled={busy}
                data-testid="portal-selection-decline-open"
                style={secondaryButtonStyle}
              >
                None of these
              </button>
              {picked.length === 0 && (
                <span style={{ fontSize: '12.5px', color: color.muted, alignSelf: 'center' }}>
                  Pick {selection.allowMultiple ? 'at least one option' : 'an option'} to sign.
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
