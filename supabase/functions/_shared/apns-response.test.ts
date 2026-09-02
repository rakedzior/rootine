import { describe, expect, it } from "vitest";
import { mapApnsNetworkError, mapApnsResponse } from "./apns-response";

describe("mapApnsResponse", () => {
  it("marks success as delivered", () => {
    expect(mapApnsResponse(200)).toEqual({
      status: "delivered",
      retryable: false,
      revokeDevice: false,
    });
  });

  it("revokes an unregistered token", () => {
    expect(mapApnsResponse(410, "Unregistered")).toEqual({
      status: "unregistered",
      retryable: false,
      revokeDevice: true,
    });
    expect(mapApnsResponse(400, "BadDeviceToken").revokeDevice).toBe(true);
  });

  it("retries throttling and provider failures", () => {
    expect(mapApnsResponse(429).retryable).toBe(true);
    expect(mapApnsResponse(503).retryable).toBe(true);
    expect(mapApnsResponse(400).retryable).toBe(false);
  });

  it("retries network failures", () => {
    expect(mapApnsNetworkError()).toEqual({
      status: "failed",
      retryable: true,
      revokeDevice: false,
    });
  });
});
