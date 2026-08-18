'use client';

import { useState } from 'react';
import type { ContractBoxInput } from '@/lib/services/contracts-client';
import type { ContractValueKey, DocumentKind } from '@/lib/services/contracts-shared';
import {
  cardStyle,
  color,
  font,
  microLabelStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
} from '@/lib/theme';

// 7I §2.1, §2.2 — THE box-placement editor. Stage 1, slice 3.
//
// ⚠️ ONE COMPONENT, MOUNTED TWICE. §2.1's BUILD REQUIREMENT: option B gives 7I
// two template tables keyed on `document_kind`, and "the risk of two
// box-placement UIs drifting apart" is the cost it names. This component is the
// answer — everything that differs between a client contract and a subcontract
// arrives as a PROP (`documentKind`, `catalog`, `onSave`), so there is exactly
// one implementation of what a box is and how it is edited.
//
// ⚠️ AND IT IS PARAMETERISED FURTHER THAN 7I STRICTLY NEEDS, ON PURPOSE. `catalog`
// and `onSave` are props rather than imports so that #1-7i — folding 7F's
// `BoxMapEditor` into this one — stays a re-mount rather than a rewrite. 7F is
// NOT edited here [RULED S150]; #1-7i stays open.
//
// ⚠️ THIS EDITOR LOADS THE EXISTING MAP. `initialBoxes` comes from
// `getContractTemplateBoxes()`, read server-side in the settings page. That is
// #2-7i stated as a requirement instead of a defect: 7F's editor opens with an
// empty array it presents as the current map, so re-opening it and saving
// replaces a placed map with nothing. Do not "simplify" this to `useState([])`.
//
// ⚠️ FRACTIONS, NEVER POINTS. Stored as fractions of page width/height with a
// top-left origin, multiplied by the PDF's point dimensions at render. That is
// what lets a form re-scanned at a different DPI keep its map. The inputs below
// show percentages purely as a human unit and convert on both edges — nothing
// is stored in the units the user types.

// ─────────────────────────────────────────────────────────────────────────────
// §2.2 — the placement-time size floor
// ─────────────────────────────────────────────────────────────────────────────
//
// Josh: "warn user of overflow. we must make all boxes large enough that this is
// a rare occurrence." §2.2 puts a warning at BOTH ends — at render, and here at
// placement, before a too-small box is ever filled.
//
// ⚠️ THIS IS A HEURISTIC AND CANNOT BE ANYTHING ELSE [RULED S150]. The render-time
// check is `fitTextToBox()`, which needs `widthPerChar` — a measurement taken
// from the font embedded in the PDF at generate time. The browser has no such
// measurement while placing boxes, so calling `fitTextToBox()` here would mean
// inventing a font metric and reporting the guess as a calculation. Instead we
// estimate from expected CONTENT LENGTH per key and say plainly that it is an
// estimate.
//
// The warning never blocks. §2.2 gives the user three outs — resize the box,
// edit the value before render, or accept — so refusing the save would remove a
// choice the ruling grants.

/** Typical rendered length of each catalog value, in characters. */
const EXPECTED_CHARS: Record<string, number> = {
  contractor_name: 30,
  contractor_address: 45,
  contractor_license_no: 16,
  counterparty_name: 30,
  counterparty_address: 45,
  owner_entity_block: 40,
  project_name: 32,
  property_address: 45,
  legal_description: 90,
  scope_of_work: 90,
  contract_value: 14, // "$1,234,567.89"
  contract_date: 18, // "September 26, 2026"
  start_date: 18,
  target_end_date: 18,
  // §12.18 — prints spelled-out AND as a numeral from one value:
  // "one hundred twenty (120)".
  substantial_completion_days: 30,
  retainage_percent: 6,
  payment_schedule: 90, // §6.3 — a printed block, not a field
  terms_text: 90,
  signer_name: 30,
  signer_title: 24,
};

const DEFAULT_EXPECTED_CHARS = 24;

/**
 * Fraction of page width one character occupies at a readable size.
 *
 * ~5pt average advance for 10pt Helvetica over a 612pt US Letter page. Any
 * common page size lands close enough for a warning threshold — this decides
 * whether to show a caution, not what gets rendered.
 */
const FRACTION_PER_CHAR = 0.008;

/** The width below which a value box is likely to overflow at render. */
export function minWidthForKey(valueKey: string | null | undefined): number {
  const chars = (valueKey && EXPECTED_CHARS[valueKey]) || DEFAULT_EXPECTED_CHARS;
  return Math.min(0.9, chars * FRACTION_PER_CHAR);
}

/**
 * The boxes that are too small for what they will hold.
 *
 * Only `value` boxes — they are the ones with content whose length is
 * predictable. A signature or initial box holds an image, and a custom box
 * holds whatever the company writes on its own form; neither has an expected
 * character count to reason from.
 */
function undersized(boxes: ContractBoxInput[]): { index: number; box: ContractBoxInput }[] {
  return boxes
    .map((box, index) => ({ index, box }))
    .filter(({ box }) => box.kind === 'value' && box.width < minWidthForKey(box.value_key));
}

const KIND_LABELS: { value: ContractBoxInput['kind']; label: string }[] = [
  { value: 'value', label: 'Value' },
  { value: 'signature', label: 'Signature' },
  { value: 'initial', label: 'Initials' },
  { value: 'custom', label: 'Custom' },
];

export function ContractBoxEditor({
  templateId,
  templateName,
  documentKind,
  catalog,
  initialBoxes,
  onSave,
  onRenameTitle,
  onClose,
  onSaved,
}: {
  templateId: string;
  templateName: string;
  documentKind: DocumentKind;
  /** `catalogForKind(documentKind)` — the keys THIS kind may place. */
  catalog: ContractValueKey[];
  /** From `getContractTemplateBoxes(templateId)`. See #2-7i above. */
  initialBoxes: ContractBoxInput[];
  onSave: (boxes: ContractBoxInput[]) => Promise<{ success: boolean; error?: string }>;
  onRenameTitle: (name: string) => Promise<{ success: boolean; error?: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [boxes, setBoxes] = useState<ContractBoxInput[]>(initialBoxes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The title lives here rather than on the settings list [RULED S150] — it is
  // an explicit act on the screen where you are already working on the form,
  // not something you can change by clicking past a field.
  const [title, setTitle] = useState(templateName);
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(templateName);

  const firstKey = catalog[0]?.key ?? null;
  const tooSmall = undersized(boxes);

  function addBox() {
    setBoxes((b) => [
      ...b,
      { page: 0, x: 0.1, y: 0.1, width: 0.3, height: 0.03, kind: 'value', value_key: firstKey },
    ]);
  }

  const set = (i: number, patch: Partial<ContractBoxInput>) =>
    setBoxes((b) => b.map((box, j) => (j === i ? { ...box, ...patch } : box)));

  /**
   * Switching kind clears the payload columns.
   *
   * `contract_template_boxes_payload_check` refuses a value box with no key, a
   * custom box with no label, and a signature/initial box carrying either — so
   * a leftover `value_key` on a box switched to `signature` is a write the
   * database rejects, not a stray field. Cleared here so the shape is always
   * legal before it is sent.
   */
  function setKind(i: number, kind: ContractBoxInput['kind']) {
    set(i, {
      kind,
      value_key: kind === 'value' ? firstKey : null,
      custom_label: null,
    });
  }

  async function saveTitle() {
    const next = draftTitle.trim();
    if (!next) return setError('A form needs a name.');
    if (next === title) {
      setEditingTitle(false);
      return;
    }
    setBusy(true);
    const result = await onRenameTitle(next);
    setBusy(false);
    if (!result.success) return setError(result.error ?? 'Could not rename.');
    setError(null);
    setTitle(next);
    setEditingTitle(false);
  }

  async function save() {
    // ⚠️ NO KEY-vs-KIND VALIDATION HERE, DELIBERATELY. `saveContractBoxMap`
    // already refuses a client-only key on a subcontract template, with a
    // message naming the key — and it does so BEFORE the write. A second copy
    // of that rule in the UI is the divergence CLAUDE.md's PARITY ruling warns
    // about, written in a form that looks like agreement.
    //
    // The size warning below is NOT a duplicate: it exists only at placement
    // time and the service has no opinion on it.
    if (tooSmall.length > 0) {
      const names = tooSmall
        .map(({ box }) => catalog.find((v) => v.key === box.value_key)?.label ?? box.value_key)
        .join(', ');
      const proceed = confirm(
        `These boxes look too small for what they will hold: ${names}.\n\n` +
          `Nothing will be shrunk or cut short to fit — if a value does not fit at render, ` +
          `you will be warned again then.\n\nSave anyway?`
      );
      if (!proceed) return;
    }

    setBusy(true);
    const result = await onSave(boxes);
    setBusy(false);
    if (!result.success) return setError(result.error ?? 'Could not save the box map.');
    onSaved();
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20,33,61,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: '20px',
        overflowY: 'auto',
      }}
    >
      <div style={{ ...cardStyle, padding: '20px', maxWidth: '820px', width: '100%' }}>
        {/* ── Title ──────────────────────────────────────────────────────── */}
        <p style={{ ...microLabelStyle, marginBottom: '6px' }}>
          Boxes — {documentKind === 'client_contract' ? 'client agreement' : 'subcontract'}
        </p>

        {editingTitle ? (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
            <input
              value={draftTitle}
              autoFocus
              onChange={(e) => setDraftTitle(e.target.value)}
              style={{ ...inputStyle, width: '300px', marginTop: 0 }}
            />
            <button type="button" style={primaryButtonStyle} disabled={busy} onClick={saveTitle}>
              Save title
            </button>
            <button
              type="button"
              style={secondaryButtonStyle}
              disabled={busy}
              onClick={() => {
                setDraftTitle(title);
                setEditingTitle(false);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '16px', fontWeight: 700, color: color.navy }}>{title}</span>
            <button
              type="button"
              style={{ ...secondaryButtonStyle, padding: '3px 9px', fontSize: '12px' }}
              disabled={busy}
              onClick={() => {
                setDraftTitle(title);
                setEditingTitle(true);
              }}
            >
              Edit title
            </button>
          </div>
        )}

        <p style={{ fontSize: '12px', color: color.muted, margin: '0 0 14px', maxWidth: '640px' }}>
          Positions are percentages of the page, measured from the top-left, so they survive the
          form being re-scanned at a different size. Open the form in another tab to read off where
          its blanks fall.
        </p>

        {error && <p style={{ color: color.danger, fontSize: '13px', margin: '0 0 10px' }}>{error}</p>}

        {/* ── The map ────────────────────────────────────────────────────── */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: color.tableHeadBg }}>
                {['Page', 'Kind', 'Field / label', 'X%', 'Y%', 'W%', 'H%', ''].map((h) => (
                  <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: color.muted }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {boxes.map((b, i) => {
                const small = b.kind === 'value' && b.width < minWidthForKey(b.value_key);
                return (
                  <tr key={i} style={{ borderTop: `1px solid ${color.rowDivider}` }}>
                    <td style={cell}>
                      <input
                        type="number"
                        min={0}
                        value={b.page}
                        onChange={(e) => set(i, { page: Math.max(0, Number(e.target.value)) })}
                        style={{ ...inputStyle, width: '54px', marginTop: 0 }}
                      />
                    </td>
                    <td style={cell}>
                      <select
                        value={b.kind}
                        onChange={(e) => setKind(i, e.target.value as ContractBoxInput['kind'])}
                        style={{ ...inputStyle, width: 'auto', marginTop: 0 }}
                      >
                        {KIND_LABELS.map((k) => (
                          <option key={k.value} value={k.value}>
                            {k.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={cell}>
                      {b.kind === 'value' && (
                        <select
                          value={b.value_key ?? ''}
                          onChange={(e) => set(i, { value_key: e.target.value })}
                          style={{ ...inputStyle, width: '210px', marginTop: 0 }}
                        >
                          {catalog.map((v) => (
                            <option key={v.key} value={v.key}>
                              {v.label}
                            </option>
                          ))}
                        </select>
                      )}
                      {b.kind === 'custom' && (
                        <input
                          value={b.custom_label ?? ''}
                          placeholder="e.g. Lender file no."
                          onChange={(e) => set(i, { custom_label: e.target.value })}
                          style={{ ...inputStyle, width: '210px', marginTop: 0 }}
                        />
                      )}
                      {b.kind === 'signature' && (
                        <span style={{ color: color.faint }}>company signature</span>
                      )}
                      {b.kind === 'initial' && (
                        <span style={{ color: color.faint }}>signer&rsquo;s initials</span>
                      )}
                    </td>
                    {(['x', 'y', 'width', 'height'] as const).map((k) => (
                      <td key={k} style={cell}>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          value={Math.round(b[k] * 1000) / 10}
                          onChange={(e) =>
                            set(i, { [k]: Number(e.target.value) / 100 } as Partial<ContractBoxInput>)
                          }
                          style={{
                            ...inputStyle,
                            width: '68px',
                            marginTop: 0,
                            borderColor:
                              small && k === 'width' ? color.warningDeep : color.inputBorder,
                          }}
                        />
                      </td>
                    ))}
                    <td style={cell}>
                      <button
                        type="button"
                        onClick={() => setBoxes((all) => all.filter((_, j) => j !== i))}
                        style={{
                          ...secondaryButtonStyle,
                          padding: '3px 8px',
                          fontSize: '11px',
                          color: color.danger,
                        }}
                        aria-label="Remove this box"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {boxes.length === 0 && (
          <p style={{ fontSize: '12.5px', color: color.faint, margin: '12px 0 0' }}>
            No boxes placed yet.
          </p>
        )}

        {/* §2.2 — named, not counted. "Three boxes are small" tells the user
            nothing about which blank to go fix. */}
        {tooSmall.length > 0 && (
          <p style={{ fontSize: '12px', color: color.warningDeep, margin: '12px 0 0' }}>
            Likely too small for what they will hold:{' '}
            {tooSmall
              .map(({ box }) => catalog.find((v) => v.key === box.value_key)?.label ?? box.value_key)
              .join(', ')}
            . This is an estimate from typical content length — nothing is shrunk or cut short to
            fit, so a value that still does not fit will be flagged again at render.
          </p>
        )}

        <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
          <button type="button" style={secondaryButtonStyle} disabled={busy} onClick={addBox}>
            Add a box
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" style={secondaryButtonStyle} disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" style={primaryButtonStyle} disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save boxes'}
          </button>
        </div>

        <p style={{ fontSize: '11px', color: color.faint, margin: '12px 0 0', fontFamily: font.sans }}>
          Saving replaces the whole map for this form — a box you removed here is gone, not merged
          back in. Template {templateId.slice(0, 8)}.
        </p>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: '3px',
  padding: '5px 8px',
  fontSize: '13px',
  border: `1px solid ${color.inputBorder}`,
  borderRadius: '6px',
  fontFamily: font.sans,
};

const cell: React.CSSProperties = { padding: '6px 8px' };
