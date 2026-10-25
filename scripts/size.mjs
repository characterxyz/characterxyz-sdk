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
  'Server helper (@characterxyz/server)': ['packages/server/dist/index.js', 1.5],
  // 33 since 2026-10-14 (was 32): the window's labels became a table so the
  // server can send them in the visitor's language (+0.5 KB). Decided, not drifted.
  // 34 since 2026-10-25 (was 33): the details card gained an authored reason
  // field — a select with the author's options plus free text (+0.4 KB).
  // Decided, not drifted.
  // 35 since 2026-10-25 (was 34): the SDK binding became three layers — context
  // in (`identify`/`setContext`), events in (`track` + schema), actions out
  // (`registerAction` + an awaited page action). Decided, not drifted.
  'Widget, ES module (core + Preact included)': ['packages/widget/dist/index.js', 35],
  'Script tag (cx.js, everything)': ['packages/widget/dist/cx.js', 35],
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
