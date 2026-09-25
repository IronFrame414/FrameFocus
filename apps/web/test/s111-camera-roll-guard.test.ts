import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// ============================================================================
// S111 Part Two, RULED Q17 — EVERY CAMERA-ONLY IMAGE INPUT HAS A LIBRARY BESIDE IT.
// ============================================================================
// Two rulings meet here, and this guard is written so neither loses:
//
//   M6M §6 D-8 (docs/specs/M6M-mobile-pwa-spec.md): "Tapping it opens the camera
//   immediately (`<input type="file" accept="image/*" capture="environment">`),
//   with a small secondary control to switch to the photo library." A-20/A-20b
//   make every field image input camera-first, the gallery secondary.
//
//   S111 RULED 6 [Josh, 2026-09-24]: "Every place a user can attach an image must
//   offer the camera roll, not the camera alone."
//
// _The guard first proposed in the S111 spec, quoted:_ "A guard that fails if a
// `capture` attribute is reintroduced on an image input". Josh, Q17: "The version
// in the spec was mine and it was wrong; it would have fought M6M D-8/A-20." So
// `capture` stays legal. What fails is a `capture` input with NO sibling input
// that lacks it — the shape that shipped on punch completion
// (punch-actions.tsx), the one camera-only image input FILL-10 found among 36.
//
// The unit is the FILE: every existing pair (tab bar, capture screen, log,
// safety, delivery damage, punch) renders both inputs from one component.
// ============================================================================

const ROOT = join(__dirname, '..');
const SCAN_DIRS = ['app', 'components'];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue;
      walk(p, out);
    } else if (p.endsWith('.tsx')) {
      out.push(p);
    }
  }
  return out;
}

/** Every `<input …>` element in a source, as its opening-tag text. */
export function inputTags(src: string): string[] {
  return src.match(/<input\b[\s\S]*?\/?>/g) ?? [];
}

const isFile = (tag: string) => /type=["']file["']/.test(tag);
const isImage = (tag: string) => /accept=["'][^"']*image/.test(tag);
const hasCapture = (tag: string) => /\bcapture=/.test(tag);

/** A camera-only image input with no library sibling in the same source. */
export function unpairedCameraInputs(src: string): string[] {
  const images = inputTags(src).filter((t) => isFile(t) && isImage(t));
  const cameras = images.filter(hasCapture);
  const libraries = images.filter((t) => !hasCapture(t));
  return libraries.length > 0 ? [] : cameras;
}

const FILES = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));
const WITH_CAPTURE = FILES.filter((f) => inputTags(readFileSync(f, 'utf8')).some(hasCapture));

describe('S111 Q17 — no camera-only image input', () => {
  it('the scan reached the tree, and found the known capture inputs (a guard that scans nothing passes)', () => {
    expect(FILES.length).toBeGreaterThan(300);
    const rel = WITH_CAPTURE.map((f) => relative(ROOT, f));
    // FILL-10: exactly six `capture` inputs at S111. A new one is fine — it
    // just has to pass the test below.
    for (const known of [
      'app/m/mobile-shell.tsx',
      'app/m/capture/capture-screen.tsx',
      'app/m/logs/new/log-form.tsx',
      'app/m/p/[projectId]/punch/[itemId]/punch-actions.tsx',
      'app/m/p/[projectId]/safety/new/incident-form.tsx',
      'app/m/p/[projectId]/deliveries/check-in/check-in-form.tsx',
    ]) {
      expect(rel).toContain(known);
    }
  });

  it('CONTROL — the rule fires on a camera-only input and not on a pair', () => {
    const cameraOnly = `<label><input type="file" accept="image/*" capture="environment" className="hidden" /></label>`;
    const pair = `${cameraOnly}<label><input type="file" accept="image/*" className="hidden" /></label>`;
    expect(unpairedCameraInputs(cameraOnly)).toHaveLength(1);
    expect(unpairedCameraInputs(pair)).toHaveLength(0);
    // The shape punch completion had before S111, verbatim in the parts that matter.
    const punchBefore = `<input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    data-testid="m-punch-photo-input"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                    }}
                  />`;
    expect(unpairedCameraInputs(punchBefore)).toHaveLength(1);
  });

  it.each(WITH_CAPTURE.map((f) => [relative(ROOT, f)]))(
    '%s offers the photo library beside its camera',
    (file) => {
      const found = unpairedCameraInputs(readFileSync(join(ROOT, file), 'utf8'));
      expect(
        found,
        `${file}: a camera-only image input (capture=…) with no library input beside it. ` +
          `Add the same input WITHOUT capture (M6M §6 D-8 / A-20b; S111 RULED 6).`
      ).toEqual([]);
    }
  );
});
