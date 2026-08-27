'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createContractTemplate,
  saveContractBoxMap,
  setClientContractsEnabled,
  softDeleteContractTemplate,
  updateContractTemplate,
  uploadContractTemplatePdf,
  type ContractBoxInput,
} from '@/lib/services/contracts-client';
import { getFileSignedUrlClient } from '@/lib/services/files-client';
import {
  catalogForKind,
  minWidthForContractKey,
  partyOptionsFor,
  type ContractParty,
  type DocumentKind,
} from '@/lib/services/contracts-shared';
import { BoxMapEditor, type EditorBox } from '@/components/box-map/box-map-editor';
import { useConfirm } from '@/components/confirm/confirm-provider';

// 7I's configuration of the SHARED box editor (#1-7i, extracted at S150). The
// four kinds and the party are 7I's; 7F passes three kinds and no party.
const CONTRACT_BOX_KINDS = [
  { value: 'value', label: 'Value' },
  { value: 'signature', label: 'Signature' },
  { value: 'initial', label: 'Initials' },
  { value: 'custom', label: 'Custom' },
];

/** Kinds that must name a signer — R5 puts `initial` here alongside `signature`. */
const CONTRACT_PARTY_KINDS = ['signature', 'initial'];

/**
 * Narrow the editor's structural boxes back to 7I's union.
 *
 * ⚠️ THE ONE PLACE THE CAST LIVES, deliberately. The editor is shared, so its
 * `kind` and `party` are plain strings — their legal values are a per-module
 * fact. This boundary knows the union because it is the same module that
 * supplied `kinds` and `parties`, so the values cannot be anything else. The
 * database refuses them anyway if this is ever wrong.
 */
function toContractBoxes(boxes: EditorBox[]): ContractBoxInput[] {
  return boxes.map((b) => ({
    ...b,
    kind: b.kind as ContractBoxInput['kind'],
    party: (b.party ?? null) as ContractParty | null,
  }));
}
import { brand } from '@/lib/brand';
import {
  cardStyle,
  color,
  font,
  microLabelStyle,
  secondaryButtonStyle,
} from '@/lib/theme';

// 7I §5.2, §5.2a, §12.1 — Company Settings: the master client-contract toggle
// (slice 1) and the contract form sets (slice 2).
//
// On-screen product name comes from lib/brand.ts, never a literal (S136).
//
// ⚠️ THE PRODUCT AUTHORS NO LEGAL TEXT — the same rule 7F ships under, and for
// a stronger reason here. A contract is the instrument that binds the parties;
// a generated approximation of one is a liability, not a feature. The company
// uploads its own counsel-approved PDF and places boxes over its blanks. There
// is no template EDITOR in the document sense: a name, an upload, and (slice 3)
// a box map.
//
// ⚠️ TWO SETS, NOT ONE LIST WITH A FILTER. §5.2/§10.2 option B keys templates on
// `document_kind`, and the two kinds are selected by different code at different
// stages — a client contract off an ESTIMATE, a subcontract off a PROJECT. They
// render as two sets so a form can never be authored into the wrong half by
// leaving a dropdown where it was.
//
// ⚠️ THE FORM SETS ARE NOT GATED ON THE TOGGLE [§5.2a — RESOLVED]. They render
// identically whether it is on or off, which is why they sit in their OWN card
// below rather than inside the toggle's. Only the SEND flow is gated. This lets
// a company set its forms up before going live, and it makes turning the master
// off reversible rather than destructive. Do not "tidy" this by wrapping the
// second card in `{on && ...}`.

export interface ContractTemplateRow {
  id: string;
  name: string;
  pdf_file_id: string | null;
  /**
   * The template's CURRENT box map, read server-side by
   * `getContractTemplateBoxes()` and handed to the editor as its starting
   * state.
   *
   * ⚠️ THIS PROP IS THE FIX FOR #2-7i AND IS NOT OPTIONAL. 7F's editor opens
   * with an empty array and presents it as the current map, so re-opening it
   * and saving replaces a placed map with nothing — silently, on a legal form.
   * Reads live server-side because `getContractTemplateBoxes` is in
   * `contracts.ts`, which imports `next/headers` and cannot be called from a
   * client component.
   */
  boxes: ContractBoxInput[];
  /**
   * R8 [S150] — the form used when one is not chosen explicitly.
   *
   * ⚠️ THIS REVERSES THE S150 SLICE-2 RULING that `is_default` gets no control.
   * It gets one now, and the invariant is DATABASE-enforced: a partial unique
   * index allows one default per (company_id, document_kind), and a BEFORE
   * trigger clears the previous one in the SAME transaction — so this is a
   * radio, not a checkbox, and the UI never sends two writes.
   */
  is_default: boolean;
}

export function ContractSettingsForm({
  companyId,
  enabled,
  clientTemplates,
  subTemplates,
}: {
  companyId: string;
  enabled: boolean;
  clientTemplates: ContractTemplateRow[];
  subTemplates: ContractTemplateRow[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [on, setOn] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => startTransition(() => router.refresh());

  async function toggle(next: boolean) {
    // Optimistic, then reverted on failure. A switch that stays where the user
    // put it while the write was refused is a switch that lies about the state
    // of a legal document flow.
    const previous = on;
    setOn(next);
    setBusy(true);
    setSaved(false);
    setError(null);

    const result = await setClientContractsEnabled(companyId, next);
    setBusy(false);

    if (!result.success) {
      setOn(previous);
      setError(result.error ?? 'Could not save.');
      return;
    }
    setSaved(true);
    refresh();
  }

  return (
    <>
      {/* ── The master toggle (§5.2) ──────────────────────────────────────── */}
      <div style={{ ...cardStyle, padding: '20px', marginTop: '20px' }}>
        <p style={{ ...microLabelStyle, marginBottom: '6px' }}>Client contracts</p>
        <p
          style={{
            fontSize: '12.5px',
            color: color.muted,
            margin: '0 0 16px',
            maxWidth: '640px',
          }}
        >
          Turn this on if your company sends a written contract alongside its proposals.{' '}
          {brand.shortName} does not supply contract wording — you upload your own
          counsel-approved form and place boxes over its blanks, the same way release forms work.
        </p>

        {error && (
          <p style={{ color: color.danger, fontSize: '13px', margin: '0 0 12px' }}>{error}</p>
        )}

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13.5px',
            color: color.body,
          }}
        >
          <input
            type="checkbox"
            checked={on}
            disabled={busy}
            onChange={(e) => void toggle(e.target.checked)}
          />
          Use client contracts
          {saved && (
            <span style={{ color: color.success, fontSize: '12px', marginLeft: '4px' }}>Saved</span>
          )}
        </label>

        <p
          style={{
            fontSize: '11.5px',
            color: color.faint,
            margin: '8px 0 0',
            maxWidth: '640px',
          }}
        >
          {on
            ? 'Each proposal still decides for itself whether to include a contract — this only makes the option available.'
            : 'While this is off, proposals send exactly as they do today. Nothing about contracts appears anywhere else in the app.'}
        </p>
      </div>

      {/* ── The form sets (§5.2a — NOT gated on the toggle) ───────────────── */}
      <div style={{ ...cardStyle, padding: '20px', marginTop: '20px' }}>
        <p style={{ ...microLabelStyle, marginBottom: '6px' }}>Contract forms</p>
        <p
          style={{
            fontSize: '12.5px',
            color: color.muted,
            margin: '0 0 4px',
            maxWidth: '640px',
          }}
        >
          Upload the agreements your company uses. The uploaded PDF is the legal instrument —{' '}
          {brand.shortName} fills the blanks you mark on it and never rewrites the wording.
        </p>
        <p
          style={{
            fontSize: '11.5px',
            color: color.faint,
            margin: '0 0 18px',
            maxWidth: '640px',
          }}
        >
          You can set these up whether or not client contracts are switched on above. Only sending
          a contract is affected by that switch.
        </p>

        <TemplateSet
          kind="client_contract"
          heading="Client agreements"
          blurb="Sent to the homeowner or client with a proposal."
          templates={clientTemplates}
          busy={busy}
          setBusy={setBusy}
          onError={setError}
          onDone={refresh}
        />

        <div style={{ height: '26px' }} />

        <TemplateSet
          kind="sub_contract"
          heading="Subcontractor agreements"
          blurb="Issued to a subcontractor once the job is set up. These are authored here now; sending them arrives in a later stage."
          templates={subTemplates}
          busy={busy}
          setBusy={setBusy}
          onError={setError}
          onDone={refresh}
        />
      </div>
    </>
  );
}

/**
 * One `document_kind`'s forms.
 *
 * Both sets are THIS component, mounted twice — the same rule §2.1 lays down
 * for the box editor, applied a level up. The two kinds differ in exactly one
 * value (`document_kind`), so a second copy of this markup would be a fork
 * waiting to drift, not a variation.
 */
function TemplateSet({
  kind,
  heading,
  blurb,
  templates,
  busy,
  setBusy,
  onError,
  onDone,
}: {
  kind: DocumentKind;
  heading: string;
  blurb: string;
  templates: ContractTemplateRow[];
  busy: boolean;
  setBusy: (b: boolean) => void;
  onError: (message: string | null) => void;
  onDone: () => void;
}) {
  const [placing, setPlacing] = useState<ContractTemplateRow | null>(null);
  const confirm = useConfirm();

  async function run(action: () => Promise<{ success: boolean; error?: string }>, fallback: string) {
    setBusy(true);
    const result = await action();
    setBusy(false);
    if (!result.success) return onError(result.error ?? fallback);
    onError(null);
    onDone();
  }

  async function addTemplate() {
    const name = prompt('Name this form (a label in the picker — it is never printed on the page):');
    if (!name?.trim()) return;
    await run(
      () => createContractTemplate({ name: name.trim(), document_kind: kind }),
      'Could not add.'
    );
  }

  // R8 — no dedicated service: `updateContractTemplate` already writes this
  // column, and the "clear the other one" half is the database's job, not a
  // second client write. Two sequential writes were refused by the ruling.
  async function makeDefault(template: ContractTemplateRow) {
    if (template.is_default) return;
    await run(
      () => updateContractTemplate(template.id, { is_default: true }),
      'Could not set the default.'
    );
  }

  async function upload(template: ContractTemplateRow, file: File) {
    await run(() => uploadContractTemplatePdf(file, template.id), 'Upload failed.');
  }

  async function remove(template: ContractTemplateRow) {
    // Soft delete. Contracts already issued from this form keep working —
    // `contract_documents.template_id` still resolves, and the executed PDF is
    // a stored artifact that does not re-render from the template.
    if (!(await confirm(`Remove "${template.name}"? Contracts already issued from it are kept.`))) return;
    await run(() => softDeleteContractTemplate(template.id), 'Could not remove.');
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ ...microLabelStyle, margin: 0, color: color.mutedAlt }}>{heading}</p>
          <p style={{ fontSize: '11.5px', color: color.faint, margin: '3px 0 0', maxWidth: '520px' }}>
            {blurb}
          </p>
        </div>
        <button type="button" style={secondaryButtonStyle} disabled={busy} onClick={addTemplate}>
          Add a form
        </button>
      </div>

      {templates.length === 0 && (
        <p
          style={{
            fontSize: '12.5px',
            color: color.faint,
            margin: '14px 0 0',
            borderTop: `1px solid ${color.rowDivider}`,
            paddingTop: '12px',
          }}
        >
          No forms yet.
        </p>
      )}

      {templates.map((t) => (
        <div
          key={t.id}
          style={{
            borderTop: `1px solid ${color.rowDivider}`,
            marginTop: '10px',
            padding: '12px 0 0',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '13px',
            flexWrap: 'wrap',
          }}
        >
          {/* R8 — one default per kind. A RADIO, because the database allows
              exactly one: setting this clears the previous default in the same
              transaction, so there is nothing to un-tick and no second write. */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '11.5px',
              color: t.is_default ? color.body : color.faint,
            }}
            title="The form used unless another is chosen when sending."
          >
            <input
              type="radio"
              name={`default-${kind}`}
              checked={t.is_default}
              disabled={busy}
              onChange={() => void makeDefault(t)}
            />
            Default
          </label>

          {/* READ-ONLY [RULED S150]. Renaming lives on the box-placement
              screen, as an explicit "Edit title" act on the screen where you
              are already working on the form — not something changed by
              clicking past a field on a list. */}
          <span style={{ fontSize: '13px', color: color.body, fontWeight: 600 }}>{t.name}</span>

          <span style={{ flex: 1 }} />

          {t.pdf_file_id ? (
            <>
              <button
                type="button"
                style={{ ...secondaryButtonStyle, padding: '4px 10px', fontSize: '12px' }}
                onClick={async () => {
                  const url = await getFileSignedUrlClient(t.pdf_file_id as string);
                  if (url) window.open(url, '_blank', 'noopener');
                  else onError('Could not open that form.');
                }}
              >
                View form
              </button>
              {/* Only with a PDF present: a box map describes positions on a
                  form, so placing boxes before there is a form to place them
                  on has nothing to mean. */}
              <button
                type="button"
                style={{ ...secondaryButtonStyle, padding: '4px 10px', fontSize: '12px' }}
                disabled={busy}
                onClick={() => setPlacing(t)}
              >
                Place boxes{t.boxes.length > 0 ? ` (${t.boxes.length})` : ''}
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
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            {t.pdf_file_id ? 'Replace' : 'Upload PDF'}
            <input
              type="file"
              accept="application/pdf"
              style={{ display: 'none' }}
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                // Cleared so re-picking the SAME file after a failed upload
                // still fires a change event.
                e.target.value = '';
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

      {/* ⚠️ §2.1 — ONE editor, mounted from BOTH sets. `TemplateSet` renders
          twice, so this single mount point serves `client_contract` and
          `sub_contract` alike; everything kind-specific arrives as a prop.
          `key` forces a remount per template so the editor's initial state is
          re-read rather than carried over from the last form opened. */}
      {placing && (
        <BoxMapEditor
          key={placing.id}
          templateName={placing.name}
          subtitle={kind === 'client_contract' ? 'client agreement' : 'subcontract'}
          catalog={catalogForKind(kind)}
          kinds={CONTRACT_BOX_KINDS}
          parties={partyOptionsFor(kind)}
          partyKinds={CONTRACT_PARTY_KINDS}
          minWidthFor={minWidthForContractKey}
          pdfFileId={placing.pdf_file_id}
          initialBoxes={placing.boxes}
          footnote={`Template ${placing.id.slice(0, 8)}.`}
          onSave={(boxes) => saveContractBoxMap(placing.id, kind, toContractBoxes(boxes))}
          onRenameTitle={async (name) => {
            const result = await updateContractTemplate(placing.id, { name });
            if (result.success) onDone();
            return result;
          }}
          onClose={() => setPlacing(null)}
          onSaved={() => {
            setPlacing(null);
            onError(null);
            onDone();
          }}
        />
      )}
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
