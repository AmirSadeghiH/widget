import { defineConfig } from '@playwright/test';
import { browserOptions } from './tests/browser.mjs';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.cjs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  expect: { timeout: 6000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    browserName: 'chromium',
    launchOptions: await browserOptions(),
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1280, height: 900 },
    locale: 'fa-IR',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://127.0.0.1:4173/tests/fixture.html',
    reuseExistingServer: !process.env.CI,
    timeout: 20000
  }
});
