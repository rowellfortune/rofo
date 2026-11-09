import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Component and page tests. Runs in jsdom, a browser stand-in, with the same React plugin as the app.
 * The older node:test suites (backend and pure logic) keep their own runner: see "npm test".
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    restoreMocks: true,
    // Every test file starts in demo mode unless it mocks src/api/config itself.
    env: { VITE_USER_POOL_ID: '', VITE_USER_POOL_CLIENT_ID: '', VITE_IDENTITY_POOL_ID: '', VITE_GRAPHQL_URL: '' },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/vite-env.d.ts', 'src/types.ts', 'src/data/**'],
      reporter: ['text-summary', 'text'],
    },
  },
});
