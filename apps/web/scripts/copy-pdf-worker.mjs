// Copy pdf.js's worker out of node_modules and into `public/` so the browser
// can fetch it at a stable URL.
//
// 7I R6 [S150] — the visual box-placement editor rasterises the company's own
// contract PDF. pdf.js does that work in a Web Worker, and the worker has to be
// served as a real file: it is loaded by URL at runtime, not imported, so
// webpack never sees it and never emits it.
//
// ⚠️ THE `legacy` BUILD, NOT THE DEFAULT ONE. pdf.js v4's modern build uses
// `Promise.withResolvers()`, which is Chrome 119+ / Safari 17.4+ / Node 22+.
// Node 20 is this repo's LTS (CLAUDE.md, devcontainer), so the modern build can
// break at BUILD time rather than in a browser — a failure that looks like a
// bundler bug and is not. The legacy build is transpiled and has neither
// problem. The editor imports the matching legacy entry point; the two must
// stay in step or pdf.js refuses to run with an API/worker version mismatch.
//
// Runs as `prebuild` (and can be run by hand), so a fresh clone or a Vercel
// build has the worker without anyone remembering this step. The copy is
// gitignored — it is a build artifact, and committing a ~1 MB vendored file
// that must match an installed version is how the two drift apart.

import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');

// Resolved through node's resolver rather than a hardcoded `../../node_modules`
// path, so it works hoisted (this monorepo) or not.
const pkgJson = require.resolve('pdfjs-dist/package.json');
const source = join(dirname(pkgJson), 'legacy', 'build', 'pdf.worker.min.mjs');

if (!existsSync(source)) {
  console.error(`!! pdf.js worker not found at ${source}`);
  console.error('!! Is pdfjs-dist installed? The box editor cannot rasterise without it.');
  process.exit(1);
}

mkdirSync(publicDir, { recursive: true });
const target = join(publicDir, 'pdf.worker.min.mjs');
copyFileSync(source, target);

const { version } = require('pdfjs-dist/package.json');
console.log(`==> pdf.js worker ${version} -> public/pdf.worker.min.mjs`);
