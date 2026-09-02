import { assertEquals } from "jsr:@std/assert@1";
import { handleDeleteAccount } from "./index.ts";

function request(options: RequestInit = {}) {
  return new Request("https://rootine.example/functions/v1/delete-account", options);
}

Deno.test("delete-account rejects methods other than POST", async () => {
  const response = await handleDeleteAccount(request({ method: "GET" }));

  assertEquals(response.status, 405);
  assertEquals(response.headers.get("allow"), "POST");
  assertEquals(await response.json(), { error: "Method not allowed" });
});

Deno.test("delete-account requires a bearer token", async () => {
  const response = await handleDeleteAccount(request({
    method: "POST",
    body: JSON.stringify({ confirmation: "DELETE" }),
    headers: { "content-type": "application/json" },
  }));

  assertEquals(response.status, 401);
  assertEquals(await response.json(), { error: "Authentication is required" });
});

Deno.test("delete-account rejects malformed JSON", async () => {
  const response = await handleDeleteAccount(request({
    method: "POST",
    body: "not-json",
    headers: { authorization: "Bearer synthetic-token" },
  }));

  assertEquals(response.status, 400);
  assertEquals(await response.json(), { error: "A JSON confirmation is required" });
});

Deno.test("delete-account requires the exact destructive confirmation", async () => {
  const response = await handleDeleteAccount(request({
    method: "POST",
    body: JSON.stringify({ confirmation: "delete" }),
    headers: { authorization: "Bearer synthetic-token" },
  }));

  assertEquals(response.status, 400);
  assertEquals(await response.json(), { error: "Account deletion must be explicitly confirmed" });
});

Deno.test("delete-account reports missing server configuration without leaking secrets", async () => {
  const previousUrl = Deno.env.get("SUPABASE_URL");
  const previousKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  try {
    Deno.env.delete("SUPABASE_URL");
    Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
    const response = await handleDeleteAccount(request({
      method: "POST",
      body: JSON.stringify({ confirmation: "DELETE" }),
      headers: { authorization: "Bearer synthetic-token" },
    }));

    assertEquals(response.status, 503);
    const body = await response.text();
    assertEquals(body.includes("Account service is not configured"), true);
    if (body.includes("synthetic-token")) throw new Error("access token leaked in error response");
  } finally {
    if (previousUrl) Deno.env.set("SUPABASE_URL", previousUrl);
    if (previousKey) Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", previousKey);
  }
});
