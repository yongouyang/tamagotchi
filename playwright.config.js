import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  webServer: {
    command: 'npx serve . --listen 4321 --no-clipboard',
    url: 'http://localhost:4321',
    reuseExistingServer: false,
    timeout: 15000,
  },
  use: {
    baseURL: 'http://localhost:4321',
    actionTimeout: 5000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
