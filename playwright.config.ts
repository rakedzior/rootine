import { defineConfig, devices } from "@playwright/test";

const localBrowserChannel = process.env.PLAYWRIGHT_CHANNEL === "chrome"
  ? "chrome"
  : undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      grep: /@shared|@desktop/,
      use: {
        ...devices["Desktop Chrome"],
        channel: localBrowserChannel,
      },
    },
    {
      name: "mobile",
      grep: /@shared|@mobile/,
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        channel: localBrowserChannel,
      },
    },
  ],
  webServer: {
    command: "node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4174",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
