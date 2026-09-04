import { afterEach, describe, expect, it } from "vitest";
import { authRedirectUrl, isMobileBrowser, ROOTINE_NATIVE_AUTH_CALLBACK } from "./authRedirect";

describe("auth redirect routing", () => {
  const originalUserAgent = navigator.userAgent;
  const originalTouchPoints = navigator.maxTouchPoints;

  afterEach(() => {
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: originalUserAgent });
    Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: originalTouchPoints });
  });

  it("uses the native callback on an iPhone", () => {
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile" });
    expect(authRedirectUrl()).toBe(ROOTINE_NATIVE_AUTH_CALLBACK);
  });

  it("recognizes an iPad with a desktop user agent through touch input", () => {
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15" });
    expect(isMobileBrowser(navigator.userAgent, 5, 834)).toBe(true);
  });

  it("keeps desktop OAuth on the web route", () => {
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15" });
    Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 0 });
    expect(authRedirectUrl(new URL("https://rootine.test/logowanie") as unknown as Location)).toBe("https://rootine.test/dzisiaj");
  });
});
