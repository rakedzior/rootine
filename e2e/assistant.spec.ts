import { test, expect, openRootineRoute } from "./fixtures";

const AVAILABLE_STATUS = {
  status: "ok",
  enabled: true,
  configured: true,
  requiresAccessToken: false,
  model: "gpt-realtime-2.1-mini",
  voice: "marin",
  limits: { idleTimeoutSeconds: 120, maxSessionMinutes: 10 },
};

async function mockAssistantStatus(page: Parameters<typeof openRootineRoute>[0], status = AVAILABLE_STATUS) {
  await page.route("**/api/assistant/realtime-session", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "not_used" }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "cache-control": "no-store" },
      body: JSON.stringify(status),
    });
  });
}

test.describe("Rootine Assistant Stage", { tag: "@shared" }, () => {
  test("opens from its desktop shortcut or mobile entry without touching the microphone and closes cleanly", async ({ rootinePage: page }) => {
    await mockAssistantStatus(page);
    await page.addInitScript(() => {
      Object.defineProperty(window, "__rootineMicRequests", { configurable: true, writable: true, value: 0 });
      const mediaDevices = navigator.mediaDevices ?? {} as MediaDevices;
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          ...mediaDevices,
          getUserMedia: async () => {
            (window as typeof window & { __rootineMicRequests: number }).__rootineMicRequests += 1;
            throw new DOMException("blocked in E2E", "NotAllowedError");
          },
        },
      });
    });
    await openRootineRoute(page, "/dzisiaj");

    const isMobile = (page.viewportSize()?.width ?? 0) <= 760;
    const mobileMoreButton = page.getByRole("button", { name: "Więcej" });
    if (isMobile) {
      await mobileMoreButton.click();
      const mobileEntry = page.getByRole("button", { name: /Asystent.*Assistant Stage/i });
      await expect(mobileEntry).toBeEnabled();
      await mobileEntry.click();
    } else {
      await expect(page.getByRole("button", { name: "Otwórz asystenta" }).first()).toBeEnabled();
      await page.keyboard.press("ControlOrMeta+Space");
    }

    const stage = page.getByRole("dialog", { name: "Rootine Assistant" });
    await expect(stage).toBeVisible();
    await expect(stage.getByRole("textbox", { name: "Wpisz polecenie dla asystenta" })).toBeFocused();
    await expect(page.locator(".rootine-route-transition")).toHaveAttribute("inert", "");
    await expect.poll(() => page.evaluate(
      () => (window as typeof window & { __rootineMicRequests: number }).__rootineMicRequests,
    )).toBe(0);
    await expect.poll(() => page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    )).toBe(true);

    await stage.getByRole("button", { name: "Zakończ sesję asystenta" }).click();
    await expect(stage).toHaveCount(0);
    await expect(page.locator(".rootine-route-transition")).not.toHaveAttribute("inert", "");
    if (isMobile) await expect(mobileMoreButton).toBeFocused();
  });
});

test.describe("Rootine Assistant availability", { tag: "@desktop" }, () => {
  test("fails closed when the server feature flag is disabled", async ({ rootinePage: page }) => {
    await mockAssistantStatus(page, {
      ...AVAILABLE_STATUS,
      enabled: false,
      configured: false,
    });
    await openRootineRoute(page, "/dzisiaj");
    const entry = page.getByRole("button", { name: "Otwórz asystenta" }).first();
    await expect(entry).toBeDisabled();
    await expect(entry).toHaveAttribute("title", /wyłączony po stronie serwera/i);
  });
});
