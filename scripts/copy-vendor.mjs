// Copies what two libraries load on demand next to the app (public/vendor
// is generated, not committed). Runs on install.
//
//  - LibreDWG's WebAssembly, for DWG import.
//  - pdf.js's data files, for PDF import: the decoders for scanned pages
//    (JBIG2, JPEG 2000) and colour profiles, the standard fonts a PDF may
//    use without embedding them, and the character maps for CJK text.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const copies = [
  ['node_modules/@mlightcad/libredwg-web/wasm/libredwg-web.wasm', 'public/vendor/libredwg/libredwg-web.wasm'],
  ['node_modules/pdfjs-dist/wasm', 'public/vendor/pdfjs/wasm'],
  ['node_modules/pdfjs-dist/iccs', 'public/vendor/pdfjs/iccs'],
  ['node_modules/pdfjs-dist/standard_fonts', 'public/vendor/pdfjs/standard_fonts'],
  ['node_modules/pdfjs-dist/cmaps', 'public/vendor/pdfjs/cmaps'],
];
for (const [source, target] of copies) {
  const from = join(root, source);
  const to = join(root, target);
  if (!existsSync(from)) continue;
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
}
