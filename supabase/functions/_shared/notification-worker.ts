import type { ApnsHttpProvider, ApnsSendResult } from "./apns.ts";

export type NotificationJob = {
  id: string;
  user_id: string;
  entity_type: "task" | "habit";
  entity_id: string;
  occurrence_id: string;
  dedupe_key: string;
  scheduled_for: string;
  expires_at: string;
  payload: Record<string, unknown>;
  device_id: string | null;
};

type SupabaseAdmin = {
  from(table: string): any;
  rpc(name: string, args: Record<string, unknown>): Promise<{ data?: any; error?: { message?: string } | null }>;
};

type NotificationDevice = {
  device_id: string;
  push_token: string;
  apns_environment: "sandbox" | "production";
};

export type DeliveryResult = {
  device_id: string;
  status: ApnsSendResult["status"];
  retryable: boolean;
  provider_response_code: number | null;
  provider_reason: string | null;
};

export type NotificationDeliveryObserver = (delivery: Readonly<DeliveryResult>) => void | Promise<void>;

function supabaseError(error: { message?: string } | null | undefined, fallback: string): Error {
  // Provider/database errors may contain request details. The error is kept
  // internal and callers return only a stable public error code.
  void error;
  return new Error(fallback);
}

function apnsPayload(payload: Record<string, unknown>): Record<string, unknown> {
  if (payload.aps && typeof payload.aps === "object") return payload;

  const { title, body, subtitle, sound, badge, ...custom } = payload;
  const alert: Record<string, unknown> = {};
  if (typeof title === "string") alert.title = title;
  if (typeof subtitle === "string") alert.subtitle = subtitle;
  if (typeof body === "string") alert.body = body;
  const aps: Record<string, unknown> = { alert };
  if (typeof sound === "string") aps.sound = sound;
  if (typeof badge === "number") aps.badge = badge;
  return { ...custom, aps };
}

async function activeDevices(
  admin: SupabaseAdmin,
  job: NotificationJob,
): Promise<NotificationDevice[]> {
  let query = admin
    .from("rootine_devices")
    .select("device_id,push_token,apns_environment")
    .eq("user_id", job.user_id)
    .eq("platform", "ios")
    .is("revoked_at", null)
    .in("permission_state", ["authorized", "provisional", "unknown"]);
  if (job.device_id) query = query.eq("device_id", job.device_id);
  const { data, error } = await query;
  if (error) throw supabaseError(error, "Unable to load notification devices");
  return (Array.isArray(data) ? data : []).filter((device): device is NotificationDevice =>
    typeof device?.device_id === "string" &&
    typeof device?.push_token === "string" &&
    (device.apns_environment === "sandbox" || device.apns_environment === "production")
  );
}

async function deliveredDeviceIds(
  admin: SupabaseAdmin,
  jobId: string,
): Promise<Set<string>> {
  const { data, error } = await admin
    .from("rootine_notification_deliveries")
    .select("device_id")
    .eq("job_id", jobId)
    .eq("status", "delivered");
  if (error) throw supabaseError(error, "Unable to load notification deliveries");
  return new Set(
    (Array.isArray(data) ? data : [])
      .map((delivery) => delivery?.device_id)
      .filter((deviceId): deviceId is string => typeof deviceId === "string"),
  );
}

async function revokeDevice(admin: SupabaseAdmin, deviceId: string): Promise<void> {
  const { error } = await admin.rpc("rootine_revoke_notification_device", {
    p_device_id: deviceId,
  });
  // A failed revoke is intentionally not logged with a token. The delivery
  // remains unregistered and the next registry reconciliation can retry it.
  if (error) return;
}

export async function finalizeNotificationJob(
  admin: SupabaseAdmin,
  job: NotificationJob,
  lockOwner: string,
  outcome: "delivered" | "retry" | "failed" | "expired",
  deliveries: DeliveryResult[],
  errorMessage?: string,
): Promise<any> {
  const { data, error } = await admin.rpc("rootine_finalize_notification_job", {
    p_job_id: job.id,
    p_lock_owner: lockOwner,
    p_outcome: outcome,
    p_deliveries: deliveries,
    p_error: errorMessage ?? null,
  });
  if (error) throw supabaseError(error, "Unable to finalize notification job");
  return data;
}

export async function deliverNotificationJob(
  admin: SupabaseAdmin,
  provider: Pick<ApnsHttpProvider, "send">,
  job: NotificationJob,
  lockOwner: string,
  options: { onDelivery?: NotificationDeliveryObserver } = {},
): Promise<{ outcome: "delivered" | "retry" | "failed" | "expired"; deliveryCount: number }> {
  if (Date.parse(job.expires_at) <= Date.now()) {
    await finalizeNotificationJob(admin, job, lockOwner, "expired", [], "Notification occurrence expired");
    return { outcome: "expired", deliveryCount: 0 };
  }

  const devices = await activeDevices(admin, job);
  const delivered = await deliveredDeviceIds(admin, job.id);
  const pendingDevices = devices.filter((device) => !delivered.has(device.device_id));
  const results: DeliveryResult[] = [];

  for (const device of pendingDevices) {
    const result = await provider.send({
      token: device.push_token,
      environment: device.apns_environment,
      payload: apnsPayload(job.payload ?? {}),
    });
    const delivery = {
      device_id: device.device_id,
      status: result.status,
      retryable: result.retryable,
      provider_response_code: result.responseCode,
      provider_reason: result.reason,
    } satisfies DeliveryResult;
    results.push(delivery);
    await options.onDelivery?.(delivery);
    if (result.revokeDevice) await revokeDevice(admin, device.device_id);
  }

  const hasDelivered = results.some((result) => result.status === "delivered") || pendingDevices.length < devices.length;
  const hasRetryable = results.some((result) => result.retryable);
  const hasActiveFailure = results.some((result) => result.status === "failed" && !result.retryable);
  let outcome: "delivered" | "retry" | "failed";
  if (hasRetryable) {
    outcome = "retry";
  } else if (hasDelivered) {
    outcome = "delivered";
  } else if (hasActiveFailure || results.some((result) => result.status === "unregistered")) {
    outcome = "failed";
  } else {
    outcome = "failed";
  }

  await finalizeNotificationJob(
    admin,
    job,
    lockOwner,
    outcome,
    results,
    outcome === "failed" && devices.length === 0 ? "No active APNs device" : undefined,
  );
  return { outcome, deliveryCount: results.length };
}
