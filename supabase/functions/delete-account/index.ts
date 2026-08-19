import { createClient } from "npm:@supabase/supabase-js@2";

const noStoreHeaders = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

function errorResponse(error: string, status: number) {
  return new Response(JSON.stringify({ error }), { status, headers: noStoreHeaders });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...noStoreHeaders, allow: "POST" },
    });
  }

  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return errorResponse("Authentication is required", 401);
  }

  let body: { confirmation?: unknown };
  try {
    body = await request.json();
  } catch {
    return errorResponse("A JSON confirmation is required", 400);
  }
  if (body.confirmation !== "DELETE") {
    return errorResponse("Account deletion must be explicitly confirmed", 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return errorResponse("Account service is not configured", 503);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const token = authorization.replace(/^Bearer\s+/i, "");
  const { data, error: userError } = await admin.auth.getUser(token);
  if (userError || !data.user) {
    return errorResponse("Invalid or expired access token", 401);
  }

  const { error: deletionError } = await admin.auth.admin.deleteUser(data.user.id);
  if (deletionError) {
    console.error("Rootine account deletion failed", {
      userId: data.user.id,
      code: deletionError.code,
    });
    return errorResponse("Account deletion failed", 502);
  }

  return new Response(null, {
    status: 204,
    headers: { "cache-control": "no-store" },
  });
});
