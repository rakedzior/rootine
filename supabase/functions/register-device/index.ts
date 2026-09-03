import { createClient } from "npm:@supabase/supabase-js@2";

const jsonHeaders = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

function errorResponse(error: string, status: number) {
  return new Response(JSON.stringify({ error }), { status, headers: jsonHeaders });
}

type RegisterDeviceBody = {
  device_id?: unknown;
  platform?: unknown;
  app_version?: unknown;
  apns_environment?: unknown;
  push_token?: unknown;
  /** Deprecated alias kept for clients of the pre-B03 bridge. */
  apns_token?: unknown;
  permission_state?: unknown;
};

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...jsonHeaders, allow: "POST" },
    });
  }

  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return errorResponse("Authentication is required", 401);
  }

  let body: RegisterDeviceBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("A JSON device registration is required", 400);
  }

  const deviceID = typeof body.device_id === "string" ? body.device_id : "";
  const platform = typeof body.platform === "string" ? body.platform : "";
  const appVersion = typeof body.app_version === "string" ? body.app_version : "";
  const hasEnvironment = Object.prototype.hasOwnProperty.call(body, "apns_environment");
  const hasPushToken = Object.prototype.hasOwnProperty.call(body, "push_token")
    || Object.prototype.hasOwnProperty.call(body, "apns_token");
  const rawEnvironment = body.apns_environment;
  const apnsEnvironment = rawEnvironment === null || rawEnvironment === undefined
    ? null
    : typeof rawEnvironment === "string" ? rawEnvironment.trim() : "";
  const rawPushToken = Object.prototype.hasOwnProperty.call(body, "push_token")
    ? body.push_token
    : body.apns_token;
  const pushToken = rawPushToken === null || rawPushToken === undefined
    ? null
    : typeof rawPushToken === "string" ? rawPushToken.trim() : "";
  const explicitPermission = typeof body.permission_state === "string"
    ? body.permission_state.trim().toLowerCase()
    : null;
  // Preserve the pre-B03 endpoint's pair-based clients while making the
  // permission state explicit for new clients. A callback may still be
  // pending after authorization, so an authorized state can omit the pair.
  const hasApnsValues = apnsEnvironment !== null || pushToken !== null;
  const permissionState = explicitPermission ?? (hasApnsValues ? "authorized" : "not_determined");

  if (!/^ios_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(deviceID)
    || platform !== "ios" || appVersion.trim().length < 1 || appVersion.trim().length > 64
    || !["not_determined", "denied", "authorized", "provisional", "ephemeral", "unknown"].includes(permissionState)
    || (hasEnvironment !== hasPushToken)
    || (hasEnvironment && rawEnvironment !== null
      && (!apnsEnvironment || !["sandbox", "production"].includes(apnsEnvironment)))
    || (hasPushToken && rawPushToken !== null && (!pushToken || pushToken.length > 512))
    || (hasApnsValues && (!apnsEnvironment || !pushToken))
    || (["not_determined", "denied", "unknown"].includes(permissionState)
      && hasApnsValues)) {
    return errorResponse("Invalid device registration", 400);
  }

  const supabaseURL = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY")
    ?? Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseURL || !publishableKey) {
    return errorResponse("Device service is not configured", 503);
  }

  // Use the caller's bearer token for the RPC. No service-role credential is
  // needed here, which preserves auth.uid() and the cross-user boundary.
  const supabase = createClient(supabaseURL, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await supabase.rpc("rootine_register_device", {
    p_device_id: deviceID,
    p_platform: platform,
    p_app_version: appVersion,
    p_apns_environment: apnsEnvironment,
    p_push_token: pushToken,
    p_permission_state: permissionState,
  });

  if (error) {
    if (error.code === "42501" || /authentication|required|jwt|token/i.test(error.message)) {
      return errorResponse("Invalid or expired access token", 401);
    }
    if (error.code === "22023") {
      return errorResponse("Invalid device registration", 400);
    }
    console.error("Rootine device registration failed", { code: error.code });
    return errorResponse("Device registration failed", 502);
  }

  return new Response(JSON.stringify(data ?? []), { status: 200, headers: jsonHeaders });
});
