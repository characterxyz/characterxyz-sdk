import { defineConfig } from 'tsup';

// React and the two SDK packages stay external: the app brings its own React,
// and the widget registers its element once however many components mount.
export default defineConfig({
  entry: { index: 'src/index.tsx' },
  format: ['esm'],
  dts: true,
  clean: true,
  minify: true,
  sourcemap: true,
  target: 'es2020',
  external: ['react', '@characterxyz/web', '@characterxyz/widget'],
  // Next.js App Router: the component and the hook run only in the browser.
  banner: { js: "'use client';" },
});
