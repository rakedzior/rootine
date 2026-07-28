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
      name: "desktop-1440",
      grep: /@shared|@desktop|@viewport/,
      use: {
        ...devices["Desktop Chrome"],
        channel: localBrowserChannel,
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "tablet-1024",
      grep: /@viewport/,
      use: {
        ...devices["Desktop Chrome"],
        channel: localBrowserChannel,
        viewport: { width: 1024, height: 768 },
      },
    },
    {
      name: "tablet-768",
      grep: /@viewport/,
      use: {
        ...devices["Desktop Chrome"],
        channel: localBrowserChannel,
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: "mobile-390",
      grep: /@shared|@mobile|@viewport/,
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        channel: localBrowserChannel,
        viewport: { width: 390, height: 844 },
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
