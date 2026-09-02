import { importPKCS8, SignJWT } from "npm:jose@6.1.0";
import { mapApnsNetworkError, mapApnsResponse, type ApnsDeliveryStatus } from "./apns-response.ts";

export type ApnsEnvironment = "sandbox" | "production";

export type ApnsCredentials = {
  keyId: string;
  teamId: string;
  bundleId: string;
  privateKey: string;
};

export type ApnsSendInput = {
  token: string;
  environment: ApnsEnvironment;
  payload: Record<string, unknown>;
  topic?: string;
};

export type ApnsSendResult = {
  status: ApnsDeliveryStatus;
  retryable: boolean;
  revokeDevice: boolean;
  responseCode: number | null;
  reason: string | null;
};

export function loadApnsCredentials(
  env: Record<string, string | undefined>,
): ApnsCredentials {
  const keyId = env.APNS_KEY_ID?.trim();
  const teamId = env.APNS_TEAM_ID?.trim();
  const bundleId = (env.APNS_BUNDLE_ID ?? env.APNS_TOPIC)?.trim();
  const privateKey = env.APNS_PRIVATE_KEY?.trim();
  if (!keyId || !teamId || !bundleId || !privateKey) {
    throw new Error("APNs provider is not configured");
  }
  return {
    keyId,
    teamId,
    bundleId,
    privateKey: privateKey.replaceAll("\\n", "\n"),
  };
}
function apnsUrl(environment: ApnsEnvironment, token: string): string {
  const host = environment === "sandbox"
    ? "https://api.sandbox.push.apple.com"
    : "https://api.push.apple.com";
  // APNs device tokens are hexadecimal. Rejecting other characters avoids
  // treating an arbitrary value as a URL path; the token itself is never
  // written to logs or returned in a response.
  if (!/^[a-fA-F0-9]{32,512}$/.test(token)) {
    throw new Error("Invalid APNs device token");
  }
  return `${host}/3/device/${encodeURIComponent(token)}`;
}

export class ApnsConfigurationError extends Error {
  readonly code = "APNS_NOT_CONFIGURED";
}

export class ApnsHttpProvider {
  #credentials: ApnsCredentials;
  #fetch: typeof fetch;
  #jwt: { value: string; expiresAt: number } | null = null;
  #signingKey: CryptoKey | null = null;

  constructor(
    env: Record<string, string | undefined>,
    fetchImplementation: typeof fetch = fetch,
  ) {
    try {
      this.#credentials = loadApnsCredentials(env);
    } catch {
      throw new ApnsConfigurationError("APNs provider is not configured");
    }
    this.#fetch = fetchImplementation;
  }

  async #authorizationToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.#jwt && this.#jwt.expiresAt > now + 60) return this.#jwt.value;
    this.#signingKey ??= await importPKCS8(this.#credentials.privateKey, "ES256");
    const value = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: this.#credentials.keyId })
      .setIssuedAt(now)
      .setIssuer(this.#credentials.teamId)
      .setExpirationTime(now + 3600)
      .sign(this.#signingKey);
    this.#jwt = { value, expiresAt: now + 3600 };
    return value;
  }

  async send(input: ApnsSendInput): Promise<ApnsSendResult> {
    let url: string;
    try {
      url = apnsUrl(input.environment, input.token);
    } catch {
      return {
        status: "failed",
        retryable: false,
        revokeDevice: false,
        responseCode: 400,
        reason: "InvalidProviderToken",
      };
    }

    try {
      const response = await this.#fetch(url, {
        method: "POST",
        headers: {
          authorization: `bearer ${await this.#authorizationToken()}`,
          "apns-topic": input.topic ?? this.#credentials.bundleId,
          "apns-push-type": "alert",
          "apns-priority": "10",
          "content-type": "application/json",
        },
        body: JSON.stringify(input.payload),
        signal: AbortSignal.timeout(10_000),
      });
      let reason: string | null = null;
      try {
        const body = await response.json() as { reason?: unknown };
        if (typeof body.reason === "string") reason = body.reason.slice(0, 255);
      } catch {
        // A successful APNs response has no JSON body. Keep the provider
        // response redacted when an intermediary returns malformed data.
      }
      const mapping = mapApnsResponse(response.status, reason);
      return {
        ...mapping,
        responseCode: response.status,
        reason,
      };
    } catch {
      const mapping = mapApnsNetworkError();
      return {
        ...mapping,
        responseCode: null,
        reason: "APNs request failed",
      };
    }
  }
}
