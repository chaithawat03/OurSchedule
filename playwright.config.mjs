import { defineConfig, devices } from '@playwright/test';

// No physical cloud resources, credentials or production websites.
// The Firebase emulator launcher wraps Playwright in test:e2e.
const demoEnv = {
  VITE_E2E_EMULATORS: '1',
  VITE_FIREBASE_API_KEY: 'fake-demo-e2e-only',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-ourschedule-e2e.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-ourschedule-e2e',
  VITE_FIREBASE_APP_ID: '1:000000000000:web:local-emulator',
};
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['**/*.spec.mjs'],
  timeout: 110_000,
  expect: { timeout: 14_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 90_000,
    env: demoEnv,
  },
  outputDir: 'test-results/e2e',
});
