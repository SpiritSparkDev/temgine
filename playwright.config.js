// E2E-Tests (npm run test:e2e). Voraussetzung: einmalig `npx playwright install chromium`.
// Login: E2E_USER / E2E_PASSWORD (Testbenutzer, siehe e2e/helpers.js); bei NEXT_PUBLIC_DEV_MODE=true entfällt der Login.
const { defineConfig } = require('@playwright/test');

const port = process.env.PORT || 3000;
const baseURL = process.env.E2E_BASE_URL || `http://localhost:${port}`;

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  workers: 1,
  use: { baseURL, trace: 'retain-on-failure' },
  // Nutzt das bestehende dev-Script (läuft vorher die Jest-Suite); vorhandenen Server wiederverwenden.
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
