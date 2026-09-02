import { createClient } from "npm:@supabase/supabase-js@2";
import { ApnsHttpProvider } from "../_shared/apns.ts";
import { deliverNotificationJob, finalizeNotificationJob } from "../_shared/notification-worker.ts";

const headers = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

function response(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function configuredEnvironment(): Record<string, string | undefined> {
  return Object.fromEntries(Deno.env.entries());
}

function authorized(request: Request, env: Record<string, string | undefined>): boolean {
  const expected = env.NOTIFICATIONS_WORKER_SECRET?.trim();
  const supplied = request.headers.get("x-notifications-worker-secret")?.trim();
  return Boolean(expected && supplied && supplied === expected);
}

function adminClient(env: Record<string, string | undefined>) {
  const url = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Notification service is not configured");
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

const handler = async (request: Request): Promise<Response> => {
  const env = configuredEnvironment();
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...headers, allow: "POST" },
    });
  }
  if (!authorized(request, env)) return response({ error: "Unauthorized" }, 401);
  if (env.NOTIFICATIONS_ENABLED?.toLowerCase() === "false") {
    return response({ error: "Notifications are disabled" }, 503);
  }

  let body: { job_id?: unknown };
  try {
    const raw = await request.text();
    if (raw.length > 64 * 1024) return response({ error: "Request is too large" }, 413);
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return response({ error: "A JSON body is required" }, 400);
  }
  if (!isUuid(body.job_id)) return response({ error: "job_id is required" }, 400);

  try {
    const admin = adminClient(env);
    const provider = new ApnsHttpProvider(env);
    const lockOwner = `apns-${crypto.randomUUID()}`;
    const { data, error } = await admin.rpc("rootine_claim_notification_jobs", {
      p_limit: 1,
      p_lock_owner: lockOwner,
      p_job_id: body.job_id,
    });
    if (error) return response({ error: "Unable to claim notification job" }, 502);
    const job = Array.isArray(data) ? data[0] : data;
    if (!job) return response({ error: "Notification job is unavailable" }, 404);

    try {
      const result = await deliverNotificationJob(admin, provider, job, lockOwner);
      return response({ job_id: job.id, status: result.outcome, deliveries: result.deliveryCount });
    } catch {
      // Do not leave a direct replay stuck in processing until stale-lock
      // reclamation. This writes no request/provider details to the database.
      await finalizeNotificationJob(admin, job, lockOwner, "retry", [], "Notification worker error").catch(() => undefined);
      return response({ error: "Notification delivery failed" }, 502);
    }
  } catch (error) {
    // Never log the exception: provider/database messages can contain tokens,
    // request headers or notification content.
    const code = error instanceof Error && error.message === "APNs provider is not configured"
      ? 503
      : 502;
    return response({ error: code === 503 ? "APNs provider is not configured" : "Notification delivery failed" }, code);
  }
};

Deno.serve(handler);
