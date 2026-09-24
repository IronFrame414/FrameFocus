import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve as resolvePath, relative } from 'node:path';
import ts from 'typescript';

// S110 H — FIND EVERY HARD-CODED USER-FACING STRING THAT /m CAN RENDER.
//
// Starts at every file under app/m and follows imports (`@/…` and relative)
// transitively, skipping data-layer modules (lib/services, supabase clients),
// so a shared component /m mounts — the chat thread, the file sheet, the
// account forms — is scanned too. In each file it flags:
//   · JSX text containing a letter;
//   · a string literal (or template) given to a user-facing attribute;
//   · a string literal inside a JSX child expression `{…}` (not a comparison
//     operand, not a className);
//   · a string literal passed to a message setter: set…Error / set…Message /
//     set…Notice / set…Announcement.
// Text wrapped in t('key') is a call, not a literal, and is never flagged.

export const WEB_ROOT = fileURLToPathLocal(new URL('../..', import.meta.url));
function fileURLToPathLocal(u: URL): string {
  return decodeURIComponent(u.pathname);
}

const ATTRS = new Set([
  'placeholder',
  'aria-label',
  'title',
  'alt',
  'label',
  'aria-description',
  'emptyText',
  'confirmText',
  'subtitle',
  'heading',
  'description',
  'hint',
  'helperText',
  'sub',
]);
const SETTER = /^set\w*(Error|Message|Notice|Announcement)$/;
const LABEL_PROPS =
  /^(label|title|placeholder|sub|subtitle|description|hint|message|emptyText|heading|body|cta|action)$/;
const LABEL_MAP = /(LABELS?|COPY|TEXTS?|TITLES?|MESSAGES?|Labels?|Copy|Titles?)$/;
// A colour, a CSS length or a hex id is not language.
const hasLetters = (s: string) => /[A-Za-z]/.test(s) && !/^#[0-9a-fA-F]{3,8}$/.test(s.trim());

/** Exact strings allowed through: not language. */
export const ALLOWED = new Set<string>([
  // lib/brand.ts's product tagline — reached through the brand import, shown on
  // the public and sign-in pages, never by an /m screen.
  'The all-in-one platform for residential and commercial contractors.',
  'FrameFocus',
  'PDF',
  'GPS',
  'ft',
  'sq ft',
  'x',
  'OK',
  'PM',
  'AM',
  'CO',
  'PO',
  'ID',
  '#',
  'mm',
  'in',
]);

function walk(d: string, out: string[] = []): string[] {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(f)) out.push(p);
  }
  return out;
}

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(WEB_ROOT, spec.slice(2));
  else if (spec.startsWith('.')) base = resolvePath(dirname(from), spec);
  else return null;
  for (const ext of ['', '.tsx', '.ts', '/index.tsx', '/index.ts']) {
    const p = base + ext;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

export function mReachableFiles(): string[] {
  const seen = new Set<string>();
  const queue = walk(join(WEB_ROOT, 'app/m'));
  while (queue.length) {
    const f = queue.shift()!;
    if (seen.has(f)) continue;
    seen.add(f);
    const src = readFileSync(f, 'utf8');
    const sf = ts.createSourceFile(
      f,
      src,
      ts.ScriptTarget.Latest,
      true,
      f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    for (const s of sf.statements) {
      if (
        (ts.isImportDeclaration(s) || ts.isExportDeclaration(s)) &&
        s.moduleSpecifier &&
        ts.isStringLiteral(s.moduleSpecifier)
      ) {
        if (ts.isImportDeclaration(s) && s.importClause?.isTypeOnly) continue;
        const r = resolveImport(f, s.moduleSpecifier.text);
        if (r && !r.includes('/lib/services/') && !/supabase/.test(r) && !r.includes('/lib/i18n/'))
          queue.push(r);
      }
    }
  }
  return [...seen].map((f) => relative(WEB_ROOT, f).split('\\').join('/')).sort();
}

export interface Finding {
  line: number;
  text: string;
}

export function scanSource(file: string, src: string): Finding[] {
  const sf = ts.createSourceFile(
    file,
    src,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const out: Finding[] = [];
  const add = (node: ts.Node, text: string) => {
    const t = text.replace(/\s+/g, ' ').trim();
    if (!hasLetters(t) || ALLOWED.has(t)) return;
    out.push({ line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, text: t });
  };
  const literalsIn = (x: ts.Node, cb: (n: ts.Node, text: string) => void) => {
    const v = (n: ts.Node): void => {
      if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) return; // visited as JSX
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        /^(t|cn|clsx)$/.test(n.expression.text)
      )
        return;
      if (ts.isBinaryExpression(n) && /^(===|!==|==|!=|in)$/.test(n.operatorToken.getText(sf)))
        return;
      // `(['en', 'es'] as const).map(…)` — a list of codes, not words.
      if (ts.isAsExpression(n) && ts.isArrayLiteralExpression(n.expression)) return;
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) cb(n, n.text);
      else if (ts.isTemplateExpression(n))
        cb(n, n.head.text + n.templateSpans.map((s) => s.literal.text).join(' '));
      ts.forEachChild(n, v);
    };
    v(x);
  };
  const visit = (n: ts.Node): void => {
    if (ts.isJsxText(n)) {
      add(n, n.text);
    } else if (ts.isJsxAttribute(n)) {
      const name = n.name.getText(sf);
      if (name === 'className' || name === 'style' || name.startsWith('data-')) return;
      if (ATTRS.has(name) && n.initializer) {
        if (ts.isStringLiteral(n.initializer)) add(n.initializer, n.initializer.text);
        else if (ts.isJsxExpression(n.initializer) && n.initializer.expression)
          literalsIn(n.initializer.expression, add);
      }
      if (n.initializer && ts.isJsxExpression(n.initializer)) ts.forEachChild(n.initializer, visit);
      return;
    } else if (
      ts.isJsxExpression(n) &&
      n.expression &&
      (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent))
    ) {
      literalsIn(n.expression, add);
    } else if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      SETTER.test(n.expression.text)
    ) {
      for (const a of n.arguments) literalsIn(a, add);
    } else if (
      ts.isPropertyAssignment(n) &&
      LABEL_PROPS.test(n.name.getText(sf).replace(/['"]/g, '')) &&
      (ts.isStringLiteral(n.initializer) || ts.isNoSubstitutionTemplateLiteral(n.initializer))
    ) {
      // `{ href: '/m/logs', label: 'Logs' }` — a label table outside JSX.
      add(n.initializer, n.initializer.text);
    } else if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      LABEL_MAP.test(n.name.text) &&
      n.initializer
    ) {
      // `const STATUS_LABEL = { draft: 'Draft', … }` — every string value is copy.
      literalsIn(n.initializer, add);
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

export function scanFile(rel: string): Finding[] {
  return scanSource(rel, readFileSync(join(WEB_ROOT, rel), 'utf8'));
}
