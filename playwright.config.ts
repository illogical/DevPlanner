import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for DevPlanner E2E tests.
 *
 * The tests target the full stack running locally. Use `bun run test:e2e`
 * which starts a separate backend and frontend with a temporary git-init'd
 * vault, so tests never touch the production workspace.
 *
 * To run against an already-running dev server:
 *   PLAYWRIGHT_REUSE_SERVER=1 bun run test:e2e
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false, // git state is sequential by nature
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],

  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
      // Backend — started with the test vault env file
      command: 'bun --env-file=.env.test src/server.ts',
      port: 17103,
      reuseExistingServer: true,
      timeout: 15_000,
    },
    {
      // Frontend Vite dev server
      command: 'cd frontend && bun run dev --host',
      port: 5173,
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
