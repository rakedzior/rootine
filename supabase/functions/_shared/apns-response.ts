export type ApnsDeliveryStatus = "delivered" | "failed" | "unregistered";

export type ApnsResponseMapping = {
  status: ApnsDeliveryStatus;
  retryable: boolean;
  revokeDevice: boolean;
};

/**
 * APNs status/reason mapping kept separate from the HTTP provider so it can be
 * tested without network access or Apple credentials.
 */
export function mapApnsResponse(
  statusCode: number,
  reason?: string | null,
): ApnsResponseMapping {
  const normalizedReason = reason?.trim().toLowerCase() ?? "";
  const unregistered =
    statusCode === 410 ||
    normalizedReason === "unregistered" ||
    normalizedReason === "baddevicetoken";

  if (unregistered) {
    return { status: "unregistered", retryable: false, revokeDevice: true };
  }
  if (statusCode === 200) {
    return { status: "delivered", retryable: false, revokeDevice: false };
  }
  if (statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500) {
    return { status: "failed", retryable: true, revokeDevice: false };
  }
  return { status: "failed", retryable: false, revokeDevice: false };
}

export function mapApnsNetworkError(): ApnsResponseMapping {
  return { status: "failed", retryable: true, revokeDevice: false };
}
