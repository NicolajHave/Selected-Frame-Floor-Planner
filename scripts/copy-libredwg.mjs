// Copies LibreDWG's WebAssembly next to the app so DWG import can load it
// on demand (public/vendor is generated, not committed). Runs on install.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules/@mlightcad/libredwg-web/wasm/libredwg-web.wasm');
const to = join(root, 'public/vendor/libredwg/libredwg-web.wasm');
if (existsSync(from)) {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}
