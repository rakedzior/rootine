import { beforeEach, describe, expect, it } from "vitest";
import {
  DEV_ROUTE_FAILURE_KEY,
  ROUTE_LOADERS,
  resetRoutePrefetchForTests,
} from "./routePrefetch";

describe("route prefetch failure seam", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    resetRoutePrefetchForTests();
  });

  it("fails deterministically after the real module has already been warmed", async () => {
    const warmedModule = await ROUTE_LOADERS["/praca"]();
    expect(warmedModule.default).toBeTypeOf("function");

    window.sessionStorage.setItem(DEV_ROUTE_FAILURE_KEY, "/praca");

    await expect(ROUTE_LOADERS["/praca"]()).rejects.toThrow(
      "Controlled route load failure: /praca",
    );

    window.sessionStorage.removeItem(DEV_ROUTE_FAILURE_KEY);
    await expect(ROUTE_LOADERS["/praca"]()).resolves.toBe(warmedModule);
  });
});
