/**
 * End-to-end tests of the editor in a real browser (npm run test:e2e). They start their own Django server on
 * port 8799 with a database of their own (.e2e/db.sqlite3, recreated each run): the development data is never
 * touched. Locally Google Chrome is used; in CI, Playwright's Chromium.
 */
import { defineConfig } from "@playwright/test";

const PORT = 8799;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1400, height: 900 },
    locale: "fr-FR",
    trace: "retain-on-failure",
    ...(process.env.CI ? {} : { channel: "chrome" }),
  },
  webServer: {
    command: `sh tests/e2e/server.sh ${PORT}`,
    url: `http://127.0.0.1:${PORT}/healthz`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
