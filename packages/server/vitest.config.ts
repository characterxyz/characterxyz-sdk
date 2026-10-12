import { defineConfig } from 'vitest/config';

// Node, not a DOM: createSession refuses to run where a `window` exists.
export default defineConfig({ test: { environment: 'node' } });
