import 'server-only';
import fs from 'node:fs';
import path from 'node:path';

// Read the reviewed legal documents at BUILD time (the /terms and /privacy pages
// are statically prerendered, so this runs once during the build — where the
// whole repo is present — and the rendered text is baked into the static HTML;
// there is no runtime file read). The .md files at docs/specs/ are the SINGLE
// SOURCE: they are the legally reviewed text (verbatim), and updating a document
// is an edit to the .md + a rebuild, never a component change.
//
// ⚠️ VERBATIM. This module reads and returns the file unchanged. Do not
// transcribe, reformat, or "clean up" the text anywhere in the render path.

export type LegalSlug = 'terms-of-service' | 'privacy-policy';

export function readLegalDoc(slug: LegalSlug): string {
  // process.cwd() during `next build` is apps/web; the reviewed docs live at
  // the repo root under docs/specs/.
  const file = path.join(process.cwd(), '..', '..', 'docs', 'specs', `${slug}.md`);
  return fs.readFileSync(file, 'utf8');
}
