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
import {
  VALUE_CATALOG,
  minWidthForReleaseKey,
  type ReleaseType,
} from '@/lib/services/lien-releases-shared';
import { BoxMapEditor, type EditorBox } from '@/components/box-map/box-map-editor';
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
  /**
   * The template's CURRENT box map.
   *
   * ⚠️ THIS PROP IS THE FIX FOR #2-7i. Until S150 this editor opened on
   * `useState([])` and presented it as the current map, so re-opening it and
   * saving replaced a placed map with NOTHING — silently, on a legal
   * instrument. `getTemplateBoxes` existed and had exactly one caller, the
   * generate route; no settings surface read it.
   */
  boxes: BoxInput[];
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

      {/* #1-7i CLOSED [S150] — the SHARED editor, the same component 7I mounts.
          7F passes three kinds and no party; 7I passes four and a party. The
          local copy this replaces is gone, along with its empty-map defect. */}
      {placing && (
        <BoxMapEditor
          key={placing.id}
          templateName={placing.name}
          subtitle="release form"
          catalog={VALUE_CATALOG}
          kinds={RELEASE_BOX_KINDS}
          minWidthFor={minWidthForReleaseKey}
          pdfFileId={placing.pdf_file_id}
          initialBoxes={placing.boxes}
          footnote={`Form ${placing.id.slice(0, 8)}.`}
          onSave={(boxes) => saveBoxMap(placing.id, toReleaseBoxes(boxes))}
          onClose={() => setPlacing(null)}
          onSaved={() => {
            setPlacing(null);
            setError(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

// 7F's configuration of the shared editor. No `initial` kind and no party: a
// release carries the company's signature only, where a contract is executed by
// two parties (7I R4/R5).
const RELEASE_BOX_KINDS = [
  { value: 'value', label: 'Value' },
  { value: 'signature', label: 'Signature' },
  { value: 'custom', label: 'Custom' },
];

/**
 * Narrow the editor's structural boxes back to 7F's union.
 *
 * The shared editor's `kind` is a plain string — its legal values are a
 * per-module fact. This boundary knows the union because it is the same module
 * that supplied `kinds`.
 */
function toReleaseBoxes(boxes: EditorBox[]): BoxInput[] {
  return boxes.map((b) => ({
    page: b.page,
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    kind: b.kind as BoxInput['kind'],
    value_key: b.value_key ?? null,
    custom_label: b.custom_label ?? null,
  }));
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

