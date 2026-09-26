import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ============================================================================
// S112 R3 — EVERY TEXT FIELD REACHABLE FROM /m IS AT LEAST 16px. RULED [Josh].
// ============================================================================
//
// iOS Safari zooms the page when focus lands on an <input>, <textarea> or
// <select> whose computed font-size is below 16px, and does not zoom back out.
// On a phone that reads as the layout breaking every time a field is tapped.
//
// The fix is the font size, NEVER `maximum-scale=1` / `user-scalable=no` on
// the viewport: that disables pinch-zoom for everyone, which is an
// accessibility regression (WCAG 1.4.4), and the ruling forbids it. The second
// assertion below pins that half.
//
// SCOPE: every .tsx under app/m, plus every file under components/ reached from
// it by import, transitively. A shared component /m renders (the chat composer,
// the site-visit record) zooms the phone exactly as much as one under app/m.
//
// WHAT COUNTS AS A SIZE: `text-[Npx]`, Tailwind's named `text-xs`/`text-sm`,
// and `fontSize` in a style object — found in the opening tag itself, or in a
// same-file `const` the tag references by name (`className={selectClass}`).
// Non-text inputs (file, checkbox, radio, range, hidden, color) do not take a
// caret and are skipped.

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SKIP_TYPES = /\btype=["'](file|checkbox|radio|range|hidden|color)["']/;

/** Sizes, in px, that an opening tag (or a const it references) declares. */
function sizesIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(?:^|[\s"'`{:])text-\[(\d+(?:\.\d+)?)px\]/g))
    out.push(Number(m[1]));
  for (const m of text.matchAll(/(?:^|[\s"'`{])text-(xs|sm)(?=[\s"'`}]|$)/g))
    out.push(m[1] === 'xs' ? 12 : 14);
  for (const m of text.matchAll(/fontSize:\s*['"]?(\d+(?:\.\d+)?)/g)) out.push(Number(m[1]));
  return out;
}

/** Opening tags of <input>/<textarea>/<select>, balanced over `{…}`. */
function fieldTags(src: string): { tag: string; line: number; el: string }[] {
  const out: { tag: string; line: number; el: string }[] = [];
  const re = /<(input|textarea|select)(?=[\s/>])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 0;
    let i = m.index + 1;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    out.push({
      tag: src.slice(m.index, i + 1),
      line: src.slice(0, m.index).split('\n').length,
      el: m[1],
    });
  }
  return out;
}

/** Violations in one source text: field tags declaring any size below 16px. */
export function smallFields(src: string): { line: number; el: string; px: number }[] {
  const consts = new Map<string, string>();
  for (const m of src.matchAll(/const\s+(\w+)\s*=\s*(['"`])([\s\S]*?)\2/g)) consts.set(m[1], m[3]);
  const out: { line: number; el: string; px: number }[] = [];
  for (const { tag, line, el } of fieldTags(src)) {
    if (SKIP_TYPES.test(tag)) continue;
    let text = tag;
    for (const [name, value] of consts) {
      if (new RegExp(`[{$]\\{?\\s*${name}\\b`).test(tag)) text += ` ${value}`;
    }
    const small = sizesIn(text).filter((px) => px < 16);
    if (small.length) out.push({ line, el, px: Math.min(...small) });
  }
  return out;
}

function walk(dir: string, acc: string[]) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(name)) acc.push(p);
  }
}

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(WEB_ROOT, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(from), spec);
  else return null;
  for (const cand of [
    `${base}.tsx`,
    `${base}.ts`,
    join(base, 'index.tsx'),
    join(base, 'index.ts'),
  ]) {
    if (existsSync(cand)) return cand;
  }
  return null;
}

/** app/m, plus every components/ file reached from it by import. */
function scope(): string[] {
  const seeds: string[] = [];
  walk(join(WEB_ROOT, 'app', 'm'), seeds);
  const seen = new Set<string>(seeds);
  const queue = [...seeds];
  const componentsDir = join(WEB_ROOT, 'components') + '/';
  while (queue.length) {
    const file = queue.pop()!;
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const target = resolveImport(file, m[1]);
      if (!target || seen.has(target)) continue;
      if (!target.startsWith(componentsDir)) continue;
      seen.add(target);
      queue.push(target);
    }
  }
  return [...seen].filter((f) => f.endsWith('.tsx')).sort();
}

describe('S112 R3 — /m text fields are at least 16px (iOS focus zoom)', () => {
  it('control: the guard fires on a synthetic 15px field, a 14px const, and a 13px style', () => {
    const synthetic = [
      "const selectClass = 'h-[48px] text-[15px]';",
      '<input className="w-full text-[15px]" />',
      '<select className={selectClass}>',
      "<textarea style={{ fontSize: '13px' }} />",
      '<input type="checkbox" className="text-[12px]" />',
      '<input className="w-full text-[16px]" />',
    ].join('\n');
    const hits = smallFields(synthetic);
    expect(hits.map((h) => `${h.el}:${h.px}`)).toEqual(['input:15', 'select:15', 'textarea:13']);
  });

  it('the scope reaches the shared components /m renders, not just app/m', () => {
    const files = scope().map((f) => relative(WEB_ROOT, f));
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain('components/chat/chat-composer.tsx');
    expect(files).toContain('components/site-visits/site-visit-record.tsx');
  });

  it('no input/textarea/select in scope declares a font size below 16px', () => {
    const violations: string[] = [];
    let fields = 0;
    for (const file of scope()) {
      const src = readFileSync(file, 'utf8');
      fields += fieldTags(src).length;
      for (const v of smallFields(src)) {
        violations.push(`${relative(WEB_ROOT, file)}:${v.line} <${v.el}> ${v.px}px`);
      }
    }
    // Not a probe that cannot fail: there are dozens of fields in scope.
    expect(fields).toBeGreaterThan(40);
    expect(violations).toEqual([]);
  });

  it('the viewport never disables zoom — the ruled fix is the font size, not maximum-scale', () => {
    const files: string[] = [];
    walk(join(WEB_ROOT, 'app'), files);
    const offenders = files
      .filter((f) =>
        /maximum-?scale|maximumScale|user-?scalable|userScalable/.test(readFileSync(f, 'utf8'))
      )
      .map((f) => relative(WEB_ROOT, f));
    expect(offenders).toEqual([]);
  });
});
