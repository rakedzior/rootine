import { describe, expect, it, vi } from "vitest";
import { deliverNotificationJob } from "./notification-worker";

const job = {
  id: "00000000-0000-4000-8000-000000000001",
  user_id: "00000000-0000-4000-8000-000000000002",
  entity_type: "task" as const,
  entity_id: "task-1",
  occurrence_id: "2026-09-02T09:00:00+02:00",
  dedupe_key: "user/task/task-1/2026-09-02T09:00:00+02:00/reminder",
  scheduled_for: "2026-09-02T07:00:00.000Z",
  expires_at: "2099-09-02T08:00:00.000Z",
  payload: { title: "Task", body: "Do the thing" },
  device_id: null,
};

function queryResult<T>(data: T, error: null = null) {
  const query: any = {
    select: () => query,
    eq: () => query,
    is: () => query,
    gte: () => query,
    in: () => query,
    maybeSingle: () => Promise.resolve({ data, error }),
    then: (resolve: (value: { data: T; error: null }) => unknown) =>
      Promise.resolve({ data, error }).then(resolve),
  };
  return query;
}

function adminMock() {
  const rpc = vi.fn(async (name: string) => ({ data: name, error: null }));
  const admin = {
    rpc,
    from(table: string) {
      if (table === "rootine_devices") {
        return queryResult([
          {
            user_id: job.user_id,
            device_id: "device-1",
            push_token: "a".repeat(64),
            apns_environment: "sandbox",
          },
        ]);
      }
      return queryResult([]);
    },
  };
  return { admin, rpc };
}

describe("deliverNotificationJob", () => {
  it("sends with a mock provider and finalizes one delivery", async () => {
    const { admin, rpc } = adminMock();
    const send = vi.fn(async (input: any) => {
      expect(input.environment).toBe("sandbox");
      expect(input.payload.aps.alert).toEqual({ title: "Task", body: "Do the thing" });
      return {
        status: "delivered" as const,
        retryable: false,
        revokeDevice: false,
        responseCode: 200,
        reason: null,
      };
    });

    const result = await deliverNotificationJob(admin as any, { send } as any, job, "worker-1");

    expect(result).toEqual({ outcome: "delivered", deliveryCount: 1 });
    expect(rpc).toHaveBeenCalledWith("rootine_finalize_notification_job", expect.objectContaining({
      p_outcome: "delivered",
      p_lock_owner: "worker-1",
    }));
  });

  it("revokes an unregistered device without retrying it", async () => {
    const { admin, rpc } = adminMock();
    const send = vi.fn(async () => ({
      status: "unregistered" as const,
      retryable: false,
      revokeDevice: true,
      responseCode: 410,
      reason: "Unregistered",
    }));

    const result = await deliverNotificationJob(admin as any, { send } as any, job, "worker-2");

    expect(result.outcome).toBe("failed");
    expect(rpc).toHaveBeenCalledWith("rootine_revoke_notification_device", {
      p_device_id: "device-1",
      p_user_id: job.user_id,
    });
    expect(rpc).toHaveBeenCalledWith("rootine_finalize_notification_job", expect.objectContaining({
      p_outcome: "failed",
    }));
  });

  it("allows only opaque internal deep links and strips arbitrary payload keys", async () => {
    const { admin } = adminMock();
    const send = vi.fn(async (input: any) => {
      expect(input.payload.rootine_deep_link).toBe(
        "rootine://notification/task/task-1?date=2026-09-02",
      );
      expect(input.payload.user_id).toBeUndefined();
      expect(input.payload.aps.alert).toEqual({ title: "Task", body: "Do the thing" });
      return {
        status: "delivered" as const,
        retryable: false,
        revokeDevice: false,
        responseCode: 200,
        reason: null,
      };
    });

    await deliverNotificationJob(admin as any, { send } as any, {
      ...job,
      payload: {
        title: "Task",
        body: "Do the thing",
        user_id: job.user_id,
        rootine_deep_link: "rootine://notification/task/task-1?date=2026-09-02",
      },
    }, "worker-deep-link");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("drops external deep links instead of forwarding them to APNs", async () => {
    const { admin } = adminMock();
    const send = vi.fn(async (input: any) => {
      expect(input.payload.rootine_deep_link).toBeUndefined();
      return {
        status: "delivered" as const,
        retryable: false,
        revokeDevice: false,
        responseCode: 200,
        reason: null,
      };
    });

    await deliverNotificationJob(admin as any, { send } as any, {
      ...job,
      payload: { title: "Task", rootine_deep_link: "https://example.test/user/secret" },
    }, "worker-external-link");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("keeps a retryable provider failure pending", async () => {
    const { admin, rpc } = adminMock();
    const send = vi.fn(async () => ({
      status: "failed" as const,
      retryable: true,
      revokeDevice: false,
      responseCode: 503,
      reason: "ServiceUnavailable",
    }));

    const result = await deliverNotificationJob(admin as any, { send } as any, job, "worker-3");

    expect(result.outcome).toBe("retry");
    expect(rpc).toHaveBeenCalledWith("rootine_finalize_notification_job", expect.objectContaining({
      p_outcome: "retry",
    }));
  });
});
