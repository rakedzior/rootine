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

function environment(): Record<string, string | undefined> {
  return Object.fromEntries(Deno.env.entries());
}

function authorized(request: Request, env: Record<string, string | undefined>): boolean {
  const expected = env.NOTIFICATIONS_WORKER_SECRET?.trim();
  const supplied = request.headers.get("x-notifications-worker-secret")?.trim();
  return Boolean(expected && supplied && supplied === expected);
}

function adminClient(env: Record<string, string | undefined>) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Notification service is not configured");
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const handler = async (request: Request): Promise<Response> => {
  const env = environment();
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

  let limit = 50;
  try {
    const raw = await request.text();
    if (raw.length > 16 * 1024) return response({ error: "Request is too large" }, 413);
    if (raw) {
      const body = JSON.parse(raw) as { limit?: unknown };
      if (body.limit !== undefined) {
        if (typeof body.limit !== "number" || !Number.isInteger(body.limit)) {
          return response({ error: "limit must be an integer" }, 400);
        }
        limit = Math.min(100, Math.max(1, body.limit));
      }
    }
  } catch {
    return response({ error: "A JSON body is required" }, 400);
  }

  try {
    const admin = adminClient(env);
    const provider = new ApnsHttpProvider(env);
    const lockOwner = `scheduler-${crypto.randomUUID()}`;
    const { data, error } = await admin.rpc("rootine_claim_notification_jobs", {
      p_limit: limit,
      p_lock_owner: lockOwner,
      p_job_id: null,
    });
    if (error) return response({ error: "Unable to claim notification jobs" }, 502);
    const jobs = Array.isArray(data) ? data : data ? [data] : [];
    let delivered = 0;
    let retried = 0;
    let failed = 0;
    let expired = 0;

    for (const job of jobs) {
      try {
        const result = await deliverNotificationJob(admin, provider, job, lockOwner);
        if (result.outcome === "delivered") delivered += 1;
        if (result.outcome === "retry") retried += 1;
        if (result.outcome === "failed") failed += 1;
        if (result.outcome === "expired") expired += 1;
      } catch {
        // A timeout while loading a device or building a provider request must
        // not leave a claimed job stuck until the stale-lock timeout.
        try {
          await finalizeNotificationJob(
            admin,
            job,
            lockOwner,
            "retry",
            [],
            "Notification worker error",
          );
          retried += 1;
        } catch {
          failed += 1;
        }
      }
    }

    // Delivery retention is cheap on the indexed table and can safely run
    // every minute. The function itself is service-role-only and bounded by
    // the configured retention floor.
    await admin.rpc("rootine_notification_retention", { p_retention: "90 days" });

    const { data: health } = await admin
      .from("rootine_notification_health")
      .select("queued_jobs,failed_last_24h,expired_last_24h,oldest_pending_lag_seconds")
      .maybeSingle();
    const lagThreshold = Number(env.NOTIFICATIONS_LAG_ALERT_SECONDS ?? 300);
    if (
      health &&
      (Number(health.oldest_pending_lag_seconds ?? 0) >= lagThreshold ||
        Number(health.failed_last_24h ?? 0) > 0 ||
        Number(health.expired_last_24h ?? 0) > 0)
    ) {
      await admin.rpc("rootine_record_notification_health_alert", {
        p_queued_jobs: Number(health.queued_jobs ?? 0),
        p_failed_last_24h: Number(health.failed_last_24h ?? 0),
        p_expired_last_24h: Number(health.expired_last_24h ?? 0),
        p_oldest_pending_lag_seconds: Number(health.oldest_pending_lag_seconds ?? 0),
        p_lag_threshold_seconds: lagThreshold,
      });
      // Aggregate metrics only: never include a user id, dedupe key, payload or
      // device token in operational logs.
      console.warn("Rootine notification health alert", {
        queuedJobs: Number(health.queued_jobs ?? 0),
        failedLast24h: Number(health.failed_last_24h ?? 0),
        expiredLast24h: Number(health.expired_last_24h ?? 0),
        oldestPendingLagSeconds: Number(health.oldest_pending_lag_seconds ?? 0),
      });
    }

    return response({ claimed: jobs.length, delivered, retried, failed, expired });
  } catch (error) {
    const configured = error instanceof Error && error.message === "APNs provider is not configured";
    return response({ error: configured ? "APNs provider is not configured" : "Notification scheduler failed" }, configured ? 503 : 502);
  }
};

Deno.serve(handler);
