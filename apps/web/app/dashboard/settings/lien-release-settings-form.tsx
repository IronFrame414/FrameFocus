'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createTemplate,
  saveBoxMap,
  softDeleteTemplate,
  updateTemplate,
  uploadTemplatePdf,
  type BoxInput,
} from '@/lib/services/lien-releases-client';
import { updateCompany } from '@/lib/services/company-client';
import { brand } from '@/lib/brand';
import { getFileSignedUrlClient } from '@/lib/services/files-client';
import { VALUE_CATALOG, type ReleaseType } from '@/lib/services/lien-releases-shared';
import {
  cardStyle,
  color,
  font,
  microLabelStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
} from '@/lib/theme';

// 7F §3, §4, §10.2 — Company Settings: the signatory, and the release forms.
//
// On-screen product name comes from lib/brand.ts, never a literal (S136).
//
// ⚠️ THE PRODUCT AUTHORS NO LEGAL TEXT. Not the body wording, not the notary
// block, not the printed title. The company uploads its own counsel- or
// lender-approved PDF and places boxes over the blanks. The decider was legal,
// not cost: Fla. Stat. §713.20 prescribes a statutory form and bars requiring a
// lienor to furnish a different one, and lender forms must be reproduced
// exactly. A generated approximation risks rejection at a closing.
//
// So there is no template EDITOR here in the document sense — only an upload,
// a name, two selection tags, and a box map.

export interface TemplateRow {
  id: string;
  name: string;
  type: ReleaseType;
  is_final: boolean;
  jurisdiction_state: string | null;
  pdf_file_id: string | null;
  is_default: boolean;
}

export function LienReleaseSettingsForm({
  companyId,
  templates,
  signatoryName,
  signatoryTitle,
  hasSignature,
}: {
  companyId: string;
  templates: TemplateRow[];
  signatoryName: string | null;
  signatoryTitle: string | null;
  hasSignature: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [placing, setPlacing] = useState<TemplateRow | null>(null);

  const [name, setName] = useState(signatoryName ?? '');
  const [title, setTitle] = useState(signatoryTitle ?? '');
  const [savedSignatory, setSavedSignatory] = useState(false);

  const refresh = () => startTransition(() => router.refresh());

  async function saveSignatory() {
    setBusy(true);
    const result = await updateCompany(companyId, {
      signatory_name: name,
      signatory_title: title,
    });
    setBusy(false);
    if (!result.success) return setError(result.error ?? 'Could not save.');
    setError(null);
    setSavedSignatory(true);
    refresh();
  }

  async function addTemplate() {
    const n = prompt('Name this form (it is a label in the picker, never printed on the page):');
    if (!n?.trim()) return;
    setBusy(true);
    const result = await createTemplate({ name: n.trim(), type: 'conditional', is_final: false });
    setBusy(false);
    if (!result.success) return setError(result.error ?? 'Could not add.');
    setError(null);
    refresh();
  }

  async function upload(template: TemplateRow, file: File) {
    setBusy(true);
    const result = await uploadTemplatePdf(file, template.id);
    setBusy(false);
    if (!result.success) return setError(result.error ?? 'Upload failed.');
    setError(null);
    refresh();
  }

  async function patch(template: TemplateRow, updates: Partial<TemplateRow>) {
    setBusy(true);
    const result = await updateTemplate(template.id, updates);
    setBusy(false);
    if (!result.success) return setError(result.error ?? 'Could not save.');
    setError(null);
    refresh();
  }

  async function remove(template: TemplateRow) {
    if (!confirm(`Remove "${template.name}"? Releases already issued from it are kept.`)) return;
    setBusy(true);
    const result = await softDeleteTemplate(template.id);
    setBusy(false);
    if (!result.success) return setError(result.error ?? 'Could not remove.');
    setError(null);
    refresh();
  }

  return (
    <div style={{ ...cardStyle, padding: '20px', marginTop: '20px' }}>
      <p style={{ ...microLabelStyle, marginBottom: '6px' }}>Lien releases</p>
      <p style={{ fontSize: '12.5px', color: color.muted, margin: '0 0 18px', maxWidth: '640px' }}>
        {brand.name} does not supply release wording. Upload the form your company or your lender
        requires, place boxes over its blanks, and {brand.shortName} fills those boxes when you
        issue a release. The uploaded PDF is the legal instrument.
      </p>

      {error && <p style={{ color: color.danger, fontSize: '13px' }}>{error}</p>}

      {/* ── The signatory ────────────────────────────────────────────────── */}
      <div style={{ marginBottom: '22px', maxWidth: '480px' }}>
        <p style={{ ...microLabelStyle, marginBottom: '8px' }}>Who signs</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <label style={{ fontSize: '12px', color: color.muted }}>
            Printed name
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSavedSignatory(false);
              }}
              style={inputStyle}
            />
          </label>
          <label style={{ fontSize: '12px', color: color.muted }}>
            Title (&ldquo;Its&rdquo;)
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setSavedSignatory(false);
              }}
              style={inputStyle}
            />
          </label>
        </div>
        <p style={{ fontSize: '11px', color: color.faint, margin: '6px 0 0' }}>
          One signatory per company. The signature <em>image</em> is the one already captured
          above — {hasSignature ? 'it is on file' : 'none is on file yet'}. Only the printed name
          and title are set here.
        </p>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px' }}>
          <button type="button" style={primaryButtonStyle} disabled={busy} onClick={saveSignatory}>
            Save signatory
          </button>
          {savedSignatory && (
            <span style={{ color: color.success, fontSize: '12px' }}>Saved</span>
          )}
        </div>
      </div>

      {/* ── The forms ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ ...microLabelStyle, margin: 0 }}>Release forms</p>
        <button type="button" style={secondaryButtonStyle} disabled={busy} onClick={addTemplate}>
          Add a form
        </button>
      </div>

      {templates.map((t) => (
        <div
          key={t.id}
          style={{
            borderTop: `1px solid ${color.rowDivider}`,
            padding: '12px 0',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '13px',
            flexWrap: 'wrap',
          }}
        >
          <input
            defaultValue={t.name}
            onBlur={(e) => e.target.value !== t.name && patch(t, { name: e.target.value })}
            style={{ ...inputStyle, width: '220px', marginTop: 0 }}
          />
          <select
            defaultValue={t.type}
            onChange={(e) => patch(t, { type: e.target.value as ReleaseType })}
            style={{ ...inputStyle, width: 'auto', marginTop: 0 }}
          >
            <option value="conditional">Conditional</option>
            <option value="unconditional">Unconditional</option>
          </select>
          <label style={{ fontSize: '12px', display: 'flex', gap: '5px', alignItems: 'center' }}>
            <input
              type="checkbox"
              defaultChecked={t.is_final}
              onChange={(e) => patch(t, { is_final: e.target.checked })}
            />
            Final payment
          </label>
          <input
            defaultValue={t.jurisdiction_state ?? ''}
            placeholder="State"
            maxLength={2}
            onBlur={(e) =>
              e.target.value !== (t.jurisdiction_state ?? '') &&
              patch(t, { jurisdiction_state: e.target.value || null })
            }
            style={{ ...inputStyle, width: '64px', marginTop: 0 }}
            title="A label only — it does not affect which form is selected."
          />

          <span style={{ flex: 1 }} />

          {t.pdf_file_id ? (
            <>
              <button
                type="button"
                style={{ ...secondaryButtonStyle, padding: '4px 10px', fontSize: '12px' }}
                onClick={async () => {
                  const url = await getFileSignedUrlClient(t.pdf_file_id as string);
                  if (url) window.open(url, '_blank', 'noopener');
                }}
              >
                View form
              </button>
              <button
                type="button"
                style={{ ...secondaryButtonStyle, padding: '4px 10px', fontSize: '12px' }}
                onClick={() => setPlacing(t)}
              >
                Place boxes
              </button>
            </>
          ) : (
            <span style={{ color: color.warningDeep, fontSize: '11.5px' }}>No form uploaded</span>
          )}

          <label
            style={{
              ...secondaryButtonStyle,
              padding: '4px 10px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            {t.pdf_file_id ? 'Replace' : 'Upload PDF'}
            <input
              type="file"
              accept="application/pdf"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(t, f);
              }}
            />
          </label>

          <button
            type="button"
            disabled={busy}
            style={{
              ...secondaryButtonStyle,
              padding: '4px 10px',
              fontSize: '12px',
              color: color.danger,
            }}
            onClick={() => remove(t)}
          >
            Remove
          </button>
        </div>
      ))}

      {placing && (
        <BoxMapEditor
          template={placing}
          onClose={() => setPlacing(null)}
          onSaved={() => {
            setPlacing(null);
            refresh();
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

/**
 * §3 — the box map.
 *
 * Boxes are stored as FRACTIONS of page width/height with a TOP-LEFT origin,
 * so a form re-scanned at a different DPI keeps its map. This editor works in
 * percentages for the same reason — nothing here is in points.
 *
 * ⚠️ Three kinds, and the third is not optional. A CUSTOM box is a blank on the
 * company's own form that the product has no source for — a bank name, a lender
 * file number, a DISPUTED line. Without it the user would have to leave those
 * blank or, worse, the product would be tempted to invent a value for them.
 */
function BoxMapEditor({
  template,
  onClose,
  onSaved,
  onError,
}: {
  template: TemplateRow;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [boxes, setBoxes] = useState<BoxInput[]>([]);
  const [busy, setBusy] = useState(false);

  function addBox() {
    setBoxes((b) => [
      ...b,
      { page: 0, x: 0.1, y: 0.1, width: 0.3, height: 0.03, kind: 'value', value_key: 'claimant_name' },
    ]);
  }

  async function save() {
    for (const b of boxes) {
      if (b.kind === 'value' && !b.value_key) return onError('Every value box needs a field.');
      if (b.kind === 'custom' && !b.custom_label?.trim()) {
        return onError('Every custom box needs a label.');
      }
    }
    setBusy(true);
    const result = await saveBoxMap(template.id, boxes);
    setBusy(false);
    if (!result.success) return onError(result.error ?? 'Could not save the box map.');
    onSaved();
  }

  const set = (i: number, patch: Partial<BoxInput>) =>
    setBoxes((b) => b.map((box, j) => (j === i ? { ...box, ...patch } : box)));

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
      <div style={{ ...cardStyle, padding: '20px', maxWidth: '760px', width: '100%' }}>
        <p style={{ ...microLabelStyle, marginBottom: '4px' }}>Boxes — {template.name}</p>
        <p style={{ fontSize: '12px', color: color.muted, margin: '0 0 14px' }}>
          Positions are percentages of the page, measured from the top-left, so they survive the
          form being re-scanned at a different size.
        </p>

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
              {boxes.map((b, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${color.rowDivider}` }}>
                  <td style={cell}>
                    <input
                      type="number"
                      min={0}
                      value={b.page}
                      onChange={(e) => set(i, { page: Number(e.target.value) })}
                      style={{ ...inputStyle, width: '54px', marginTop: 0 }}
                    />
                  </td>
                  <td style={cell}>
                    <select
                      value={b.kind}
                      onChange={(e) =>
                        set(i, {
                          kind: e.target.value as BoxInput['kind'],
                          value_key: null,
                          custom_label: null,
                        })
                      }
                      style={{ ...inputStyle, width: 'auto', marginTop: 0 }}
                    >
                      <option value="value">Value</option>
                      <option value="signature">Signature</option>
                      <option value="custom">Custom</option>
                    </select>
                  </td>
                  <td style={cell}>
                    {b.kind === 'value' && (
                      <select
                        value={b.value_key ?? ''}
                        onChange={(e) => set(i, { value_key: e.target.value })}
                        style={{ ...inputStyle, width: '200px', marginTop: 0 }}
                      >
                        {VALUE_CATALOG.map((v) => (
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
                        style={{ ...inputStyle, width: '200px', marginTop: 0 }}
                      />
                    )}
                    {b.kind === 'signature' && (
                      <span style={{ color: color.faint }}>company signature</span>
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
                        onChange={(e) => set(i, { [k]: Number(e.target.value) / 100 } as Partial<BoxInput>)}
                        style={{ ...inputStyle, width: '68px', marginTop: 0 }}
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
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
          <button type="button" style={secondaryButtonStyle} onClick={addBox}>
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
          back in.
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
