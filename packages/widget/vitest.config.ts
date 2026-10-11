import { defineConfig } from 'vitest/config';

// JSX settings come from tsconfig (preact's automatic runtime).
export default defineConfig({ test: { environment: 'happy-dom' } });
