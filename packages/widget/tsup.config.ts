import { defineConfig } from 'tsup';

// Two builds: the ES module (Preact bundled in — the widget owns its own
// element, so it never shares a framework with the page) and `cx.js`, one
// self-contained file for a <script> tag.
export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
    clean: true,
    minify: true,
    sourcemap: true,
    target: 'es2020',
    noExternal: ['preact', '@characterxyz/web'],
  },
  {
    entry: { cx: 'src/iife.ts' },
    format: ['iife'],
    globalName: 'CharacterXYZWidget',
    minify: true,
    sourcemap: true,
    target: 'es2020',
    noExternal: [/.*/],
    outExtension: () => ({ js: '.js' }),
  },
]);
