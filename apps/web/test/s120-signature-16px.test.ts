/**
 * S120 5-A — BOTH signature name fields are 16px, deliberately. [Josh, 2026-09-29:
 * "make both signatures 16px"]
 *
 * S118 item 11 moved the portal's SignatureCapture to components/signature/ so the
 * material sign-out (/m and desktop) could reuse it, and the /m focus-zoom guard
 * (m6m-field-font-size) forced its two inputs 14px → 16px — which also raised the
 * CLIENT PORTAL's signature fields (reported S118/S119 as a side effect). Ruled:
 * both at 16px is the intended state. 16px is the floor that stops iOS zooming
 * the page on focus, so neither may go below it.
 *
 * "Both" is one component, so the pin is two-sided:
 *   1. the shared component's two text inputs (full name, typed signature) are 16px;
 *   2. the portal and the sign-out render THAT component — the portal wraps it
 *      with its labels only; neither surface carries its own copy of the fields.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');

/** The opening tag of the <input> carrying data-testid `${testId}-${suffix}`. */
function inputTag(src: string, suffix: string): string {
  const at = src.indexOf(`\`\${testId}-${suffix}\``);
  expect(at, `no input with the -${suffix} testid`).toBeGreaterThan(-1);
  const start = src.lastIndexOf('<input', at);
  const end = src.indexOf('/>', at);
  return src.slice(start, end);
}

describe('S120 5-A — the signature name fields', () => {
  const shared = read('components/signature/signature-capture.tsx');

  for (const suffix of ['name', 'typed']) {
    it(`the shared component's "${suffix}" input is 16px`, () => {
      expect(inputTag(shared, suffix)).toMatch(/fontSize:\s*'16px'/);
    });
  }

  it('the client portal renders the SHARED component (labels only — no copy of the fields)', () => {
    const portal = read('app/portal/[projectId]/portal-writes-ui.tsx');
    expect(portal).toMatch(
      /SignatureCapture as BaseSignatureCapture,[\s\S]*from '@\/components\/signature\/signature-capture'/
    );
    expect(portal).toMatch(
      /<BaseSignatureCapture \{\.\.\.props\} labels=\{PORTAL_SIGNATURE_LABELS\} \/>/
    );
  });

  it('the material sign-out renders the SHARED component', () => {
    for (const f of [
      'components/material-signouts/signout-new-form.tsx',
      'components/material-signouts/signout-detail.tsx',
    ]) {
      expect(read(f), f).toMatch(/from '@\/components\/signature\/signature-capture'/);
    }
  });
});
