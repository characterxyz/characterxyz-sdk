// What each way of using the SDK costs a page, gzipped, against a budget.
// Fails (exit 1) when anything is over, so a release cannot quietly grow.
// Run after `pnpm build`.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const BUDGET_KB = {
  'Headless core (@characterxyz/web)': ['packages/web/dist/index.js', 9],
  'Server helper (@characterxyz/web/server)': ['packages/web/dist/server.js', 1.5],
  'Widget, ES module (core + Preact included)': ['packages/widget/dist/index.js', 30],
  'Script tag (cx.js, everything)': ['packages/widget/dist/cx.js', 30],
  'React wrapper (excl. React and the widget)': ['packages/react/dist/index.js', 2],
};

let failed = false;
for (const [label, [file, budget]] of Object.entries(BUDGET_KB)) {
  const path = join(root, file);
  if (!existsSync(path)) {
    console.log(`MISSING  ${label}  (${file}) — run pnpm build`);
    failed = true;
    continue;
  }
  const kb = gzipSync(readFileSync(path)).length / 1024;
  const over = kb > budget;
  failed ||= over;
  console.log(`${over ? 'OVER' : 'ok  '}  ${kb.toFixed(1).padStart(5)} / ${budget} KB  ${label}`);
}
process.exit(failed ? 1 : 0);
