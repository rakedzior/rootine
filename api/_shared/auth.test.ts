// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizeRootineRequest } from "./auth";

const options = {
  supabaseUrl: "https://project.supabase.co",
  publishableKey: "publishable-test-key",
};

function request(token?: string) {
  return new Request("https://rootine.example/api/test", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe("Rootine API authorization", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects a request without a bearer token before contacting Supabase", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const result = await authorizeRootineRequest(request(), options);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("validates the access token with the configured Supabase project", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: "user-123" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await authorizeRootineRequest(request("access-token"), options);

    expect(result).toEqual({ ok: true, userId: "user-123" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://project.supabase.co/auth/v1/user",
      expect.objectContaining({
        headers: expect.objectContaining({
          apikey: "publishable-test-key",
          authorization: "Bearer access-token",
        }),
      }),
    );
  });

  it("does not reveal the upstream error for an invalid token", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ message: "sensitive upstream detail" }, { status: 403 }),
    ));

    const result = await authorizeRootineRequest(request("bad-token"), options);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      expect(await result.response.json()).toEqual({ error: "Invalid or expired access token" });
    }
  });
});
