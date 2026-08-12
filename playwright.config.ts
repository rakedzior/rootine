import { defineConfig, devices } from "@playwright/test";

const localBrowserChannel = process.env.PLAYWRIGHT_CHANNEL === "chrome"
  ? "chrome"
  : undefined;
const isCI = Boolean(process.env.CI);

const desktopChrome = {
  ...devices["Desktop Chrome"],
  channel: localBrowserChannel,
};

const viewportMatrix = [
  { width: 2560, height: 1440 },
  { width: 1920, height: 1080 },
  { width: 1600, height: 900 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
] as const;

const zoomMatrix = [
  {
    name: "zoom-125",
    zoomPercent: 125,
    scale: 1.25,
    physicalViewport: { width: 1920, height: 1080 },
    viewport: { width: 1536, height: 864 },
  },
  {
    name: "zoom-150",
    zoomPercent: 150,
    scale: 1.5,
    physicalViewport: { width: 1920, height: 1080 },
    viewport: { width: 1280, height: 720 },
  },
  {
    name: "zoom-200",
    zoomPercent: 200,
    scale: 2,
    physicalViewport: { width: 1920, height: 1080 },
    viewport: { width: 960, height: 540 },
  },
] as const;

export default defineConfig({
  testDir: "./e2e",
  timeout: isCI ? 45_000 : 30_000,
  fullyParallel: true,
  forbidOnly: isCI,
  maxFailures: isCI ? 1 : 0,
  // A retry multiplied an unavailable dev server into three minute-long
  // failures. CI now exercises a prebuilt bundle, so fail once and surface the
  // real regression immediately.
  retries: 0,
  // Parallelize CI across isolated GitHub jobs. One browser per small runner
  // avoids CPU/memory starvation that previously made the app entry chunk stop
  // loading under four simultaneous contexts.
  workers: isCI ? 1 : 4,
  reporter: isCI ? "github" : [["list"], ["html", { open: "never" }]],
  globalSetup: "./playwright.global-setup.ts",
  globalTeardown: "./playwright.global-teardown.ts",
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop-1440",
      grep: /@shared|@desktop/,
      use: {
        ...desktopChrome,
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile-390",
      grep: /@shared|@mobile/,
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        channel: localBrowserChannel,
        viewport: { width: 390, height: 844 },
      },
    },
    ...viewportMatrix.map(({ width, height }) => ({
      name: `viewport-${width}x${height}`,
      grep: /@viewport-matrix/,
      use: {
        ...desktopChrome,
        viewport: { width, height },
      },
    })),
    ...zoomMatrix.map((profile) => ({
      name: profile.name,
      grep: /@zoom-matrix/,
      metadata: {
        zoomPercent: profile.zoomPercent,
        scale: profile.scale,
        physicalWidth: profile.physicalViewport.width,
        physicalHeight: profile.physicalViewport.height,
        effectiveWidth: profile.viewport.width,
        effectiveHeight: profile.viewport.height,
      },
      use: {
        ...desktopChrome,
        viewport: profile.viewport,
        deviceScaleFactor: profile.scale,
      },
    })),
  ],
});
