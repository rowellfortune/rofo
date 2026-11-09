import { defineConfig, devices } from '@playwright/test';

/**
 * End to end tests in a real browser against the production build.
 *   demo: the app on mock data (no backend).
 *   api:  the app wired to e2e/fake/server.ts, which runs the real GraphQL and upload handlers
 *         against in-memory DynamoDB and a fake Cognito. Tests share that backend and reset it,
 *         so this project runs one test at a time.
 * Run: npm run e2e
 */
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e/.results',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'e2e/.report' }]] : 'list',
  use: {
    trace: 'off',
    screenshot: 'only-on-failure',
    // WebGL in headless Chromium comes from SwiftShader, so the real map renders.
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  projects: [
    { name: 'demo', testMatch: 'demo/**/*.spec.ts', use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4173' } },
    { name: 'api', testMatch: 'api/**/*.spec.ts', workers: 1, use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4174' } },
  ],
  webServer: [
    { command: 'npx tsx e2e/fake/server.ts', url: 'http://127.0.0.1:4600/__test/health', reuseExistingServer: !process.env.CI, timeout: 60_000 },
    { command: 'npx tsx e2e/serve.ts demo', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI, timeout: 120_000 },
    { command: 'npx tsx e2e/serve.ts api', url: 'http://127.0.0.1:4174', reuseExistingServer: !process.env.CI, timeout: 120_000 },
  ],
});
