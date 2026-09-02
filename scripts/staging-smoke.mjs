import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baseEvidence, finishEvidence, hasFlag, redact, safeError, writeEvidence } from "./release-gate-utils.mjs";

const strict = hasFlag("--strict") || process.env.CI === "true";
const expectedContractVersion = Number(process.env.ROOTINE_CONTRACT_VERSION || 3);
const timeoutMs = Number(process.env.ROOTINE_SMOKE_TIMEOUT_MS || 15_000);
const domainMatrix = (process.env.ROOTINE_SMOKE_DOMAINS
  || "tasks,habits,notes,nutrition,sport,goals,work,travel,health,affairs,finance,jdg")
  .split(",")
  .map((domain) => domain.trim())
  .filter(Boolean);

class SmokeFailure extends Error {
  constructor(phase, message) {
    super(message);
    this.phase = phase;
  }
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new SmokeFailure("configuration", `${name} is required`);
  return value;
}

function responseContractVersion(body) {
  const value = body && typeof body === "object"
    ? body.contract_version ?? body.contractVersion
    : undefined;
  return typeof value === "number" ? value : Number(value);
}

function responseCursor(body) {
  if (!body || typeof body !== "object") return 0;
  const candidates = [body.server_cursor, body.next_cursor, body.cursor, body.bootstrap?.cursor];
  return candidates.find((value) => Number.isInteger(value) && value >= 0) ?? 0;
}

function responseResults(body) {
  if (!body || typeof body !== "object") return [];
  if (Array.isArray(body.results)) return body.results;
  if (body.result && typeof body.result === "object") return [body.result];
  return [];
}

function responseChanges(body) {
  if (!body || typeof body !== "object") return [];
  if (Array.isArray(body.changes)) return body.changes;
  if (Array.isArray(body.bootstrap?.changes)) return body.bootstrap.changes;
  return [];
}

function normalizedBase(input) {
  const base = new URL(input);
  if (! ["http:", "https:"].includes(base.protocol)) {
    throw new SmokeFailure("configuration", "ROOTINE_STAGING_URL must use HTTP or HTTPS");
  }
  if (base.username || base.password) {
    throw new SmokeFailure("configuration", "ROOTINE_STAGING_URL must not contain embedded credentials");
  }
  if (base.search || base.hash || (base.pathname !== "/" && base.pathname !== "")) {
    throw new SmokeFailure("configuration", "ROOTINE_STAGING_URL must identify the project origin without a path, query, or fragment");
  }
  return base.toString().replace(/\/$/, "");
}

function jsonBody(value) {
  return JSON.stringify(value);
}

function syncEnvironment() {
  const environment = (process.env.ROOTINE_ENVIRONMENT || "staging").trim().toLowerCase();
  if (!["development", "staging", "production"].includes(environment)) {
    throw new SmokeFailure("configuration", "ROOTINE_ENVIRONMENT must be development, staging, or production");
  }
  return environment;
}

function correlationId(environment) {
  return `rt3_${environment}_${randomUUID()}`;
}

function relativeSmokePath(input, name, fallback) {
  const configured = input?.trim() || fallback;
  if (!configured.startsWith("/") || configured.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(configured) || configured.includes("?") || configured.includes("#")) {
    throw new SmokeFailure("configuration", `${name} must be a relative path on ROOTINE_STAGING_URL without query or fragment`);
  }
  return configured;
}

function syncPath(action) {
  const configured = relativeSmokePath(process.env.ROOTINE_SMOKE_SYNC_PATH, "ROOTINE_SMOKE_SYNC_PATH", "/functions/v1/mobile-sync");
  return configured.includes("{operation}") ? configured.replace("{operation}", action) : configured;
}

async function verifyOfflineRestart(commands) {
  const directory = await mkdtemp(join(tmpdir(), "rootine-b12-offline-"));
  try {
    const path = join(directory, "pending-command.json");
    await writeFile(path, jsonBody({ version: 1, commands }), "utf8");
    const restored = JSON.parse(await readFile(path, "utf8"));
    return restored.commands?.length === commands.length
      && commands.every((command, index) =>
        restored.commands[index]?.operation_id === command.operation_id
        && restored.commands[index]?.entity_id === command.entity_id
      );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function waitForAuthInvalidation(request, accessToken) {
  let latest;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    latest = await request("delete", "/auth/v1/user", { headers: { authorization: `Bearer ${accessToken}` } });
    if ([401, 404].includes(latest.response.status)) return latest;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return latest;
}

function realtimeURL(base, publishableKey) {
  if (process.env.ROOTINE_SMOKE_REALTIME_URL?.trim()) return process.env.ROOTINE_SMOKE_REALTIME_URL.trim();
  if (!publishableKey) return null;
  const url = new URL(base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/realtime/v1/websocket";
  url.search = new URLSearchParams({ apikey: publishableKey, vsn: "1.0.0" }).toString();
  return url.toString();
}

async function openRealtime(base, publishableKey, accessToken, userId, deviceId) {
  const WebSocketClient = globalThis.WebSocket;
  const url = realtimeURL(base, publishableKey);
  if (!WebSocketClient || !url) throw new Error("Realtime WebSocket is not configured in this runner");

  const socket = new WebSocketClient(url);
  let ref = 1;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Realtime join timed out")), timeoutMs);
    const cleanup = () => clearTimeout(timer);
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({
        topic: "realtime:public:rootine_sync_changes",
        event: "phx_join",
        payload: {
          config: {
            broadcast: { self: false },
            presence: { key: deviceId },
            postgres_changes: [{ event: "*", schema: "public", table: "rootine_sync_changes", filter: `user_id=eq.${userId}` }],
          },
          access_token: accessToken,
        },
        ref: String(ref++),
      }));
    });
    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data));
        if (message.event === "phx_reply" && message.payload?.status === "ok") {
          cleanup();
          resolve();
        }
      } catch {
        // Ignore non-JSON heartbeat frames; the timeout remains authoritative.
      }
    });
    socket.addEventListener("error", () => {
      cleanup();
      reject(new Error("Realtime WebSocket connection failed"));
    });
  });

  let signalResolve;
  let signalReject;
  const signal = new Promise((resolve, reject) => {
    signalResolve = resolve;
    signalReject = reject;
  });
  const timer = setTimeout(() => signalReject(new Error("Realtime signal timed out")), timeoutMs);
  socket.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(String(event.data));
      if (["postgres_changes", "broadcast"].includes(message.event)) {
        clearTimeout(timer);
        signalResolve();
      }
    } catch {
      // Ignore heartbeat frames.
    }
  });
  return { socket, signal };
}

async function main() {
  const started = Date.now();
  const evidence = baseEvidence("staging-smoke", {
    mode: strict ? "strict" : "local",
    checks: [],
    domain_matrix: domainMatrix.map((domain) => ({ domain, status: "contract-pending" })),
    metrics: {
      owner: "mobile-platform",
      automated_observations: null,
      evaluation: "manual-required",
      thresholds: {
        pull_push_errors: 0,
        unauthorized_401: 0,
        cursor_lag_seconds: 30,
        outbox_lag_seconds: 60,
        apns_delivery_rate: 0.99,
      },
    },
    known_limitations: [
      "Physical iPhone local-notification delivery remains a manual TestFlight gate unless ROOTINE_SMOKE_APNS_URL points to a sandbox/mock provider.",
      "This runner validates the transport contract with a synthetic account. Native iOS persistence/restart and real web-to-iOS fixtures remain XCTest/TestFlight gates.",
    ],
    manual_gates_pending: ["physical_iPhone_offline_force_quit", "physical_iPhone_apns_delivery", "real_web_to_ios_domain_fixtures"],
  });
  let passed = true;
  let base;
  let token;
  let userId;
  let createdUserId;
  let generatedAccount = false;
  let deletedAccount = false;
  let serviceRoleCleanup = false;
  let realtimeSession;
  let observedApnsDeliveryRate = null;

  const check = (name, status, details = {}) => {
    const automatedPassed = ["passed", "fallback"].includes(status);
    const blocking = status === "failed" || (strict && status === "manual-required");
    const item = { name, status, ...details, passed: automatedPassed, blocking };
    evidence.checks.push(item);
    passed &&= !item.blocking;
    const outcome = status === "manual-required" ? "MANUAL" : item.passed ? "PASS" : "FAIL";
    console.log(`${outcome} ${name}${item.reason ? ` — ${item.reason}` : ""}`);
    return item.passed;
  };

  const request = async (phase, path, options = {}) => {
    const response = await fetch(new URL(path, base), {
      ...options,
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        ...(options.headers || {}),
        ...(process.env.ROOTINE_STAGING_PUBLISHABLE_KEY
          ? { apikey: process.env.ROOTINE_STAGING_PUBLISHABLE_KEY.trim() }
          : {}),
      },
    });
    const text = await response.text();
    let body = null;
    if (text) {
      try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
    }
    return { phase, response, body };
  };

  const sync = async (action, deviceId, body = {}) => {
    const environment = syncEnvironment();
    const requestCorrelationId = correlationId(environment);
    const requestBody = { action, correlation_id: requestCorrelationId, device_id: deviceId, ...body };
    const result = await request(action, syncPath(action), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: jsonBody(requestBody),
    });
    if (result.response.status < 200 || result.response.status >= 300) {
      throw new SmokeFailure(action, `mobile-sync returned HTTP ${result.response.status}`);
    }
    if (responseContractVersion(result.body) !== expectedContractVersion) {
      throw new SmokeFailure(action, "mobile-sync returned an unexpected contract version");
    }
    if (result.body?.correlation_id !== requestCorrelationId) {
      throw new SmokeFailure(action, "mobile-sync did not echo correlation_id");
    }
    return result.body;
  };

  try {
    base = normalizedBase(required("ROOTINE_STAGING_URL"));
    const publishableKey = process.env.ROOTINE_STAGING_PUBLISHABLE_KEY?.trim();
    const providedToken = process.env.ROOTINE_SMOKE_ACCESS_TOKEN?.trim();
    if (!providedToken && !publishableKey) throw new SmokeFailure("configuration", "ROOTINE_STAGING_PUBLISHABLE_KEY is required when the smoke creates its isolated account");

    if (providedToken) {
      token = providedToken;
      if (process.env.ROOTINE_SMOKE_ALLOW_EXISTING_ACCOUNT !== "1") {
        throw new SmokeFailure("configuration", "ROOTINE_SMOKE_ACCESS_TOKEN is destructive; set ROOTINE_SMOKE_ALLOW_EXISTING_ACCOUNT=1 to opt in");
      }
    } else {
      generatedAccount = true;
      const suffix = `${Date.now()}-${process.pid}-${randomUUID().slice(0, 8)}`;
      const email = `rootine-smoke-${suffix}@example.invalid`;
      const password = `${randomUUID()}aA9!`;
      const signup = await request("auth", "/auth/v1/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: jsonBody({ email, password }),
      });
      if (![200, 201].includes(signup.response.status)) throw new SmokeFailure("auth", `staging signup returned HTTP ${signup.response.status}`);
      createdUserId = typeof signup.body?.user?.id === "string" ? signup.body.user.id : undefined;
      userId = createdUserId;
      token = signup.body?.access_token;
      if (!token) {
        const login = await request("auth", "/auth/v1/token?grant_type=password", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: jsonBody({ email, password }),
        });
        if (![200, 201].includes(login.response.status) || !login.body?.access_token) {
          throw new SmokeFailure("auth", "staging account was created but could not obtain an access token; disable email confirmation in disposable staging");
        }
        token = login.body.access_token;
      }
    }

    const auth = await request("auth", "/auth/v1/user", { headers: { authorization: `Bearer ${token}` } });
    if (auth.response.status !== 200 || !auth.body?.id) throw new SmokeFailure("auth", `auth validation returned HTTP ${auth.response.status}`);
    userId = auth.body.id;
    check("Auth", "passed");

    const deviceA = process.env.ROOTINE_SMOKE_DEVICE_A?.trim() || `ios_${randomUUID()}`;
    const deviceB = process.env.ROOTINE_SMOKE_DEVICE_B?.trim() || `ios_${randomUUID()}`;
    const bootstrap = await sync("bootstrap", deviceA);
    check("Bootstrap", "passed", { cursor: responseCursor(bootstrap) });

    const commands = domainMatrix.map((domain) => ({
      operation_id: `op3_${randomUUID()}`,
      entity: domain,
      entity_id: `b12-smoke-${domain}-${randomUUID()}`,
      kind: "upsert",
      base_revision: 0,
      payload: { title: `B12 synthetic ${domain} smoke fixture`, date: "2099-01-01", completed: false },
    }));
    const commandByOperation = new Map(commands.map((command) => [command.operation_id, command]));
    const offlineRestored = await verifyOfflineRestart(commands);
    check("Offline queue serialization scaffold", offlineRestored ? "manual-required" : "failed", {
      automated: true,
      status_detail: "synthetic pending command survives a process-style write/read restart; native force-quit replay remains a TestFlight gate",
    });

    realtimeSession = await openRealtime(base, publishableKey, token, userId, deviceA).catch((error) => {
      check("Realtime signal connection", "fallback", { reason: redact(error.message) });
      return undefined;
    });
    const push = await sync("push", deviceA, { commands });
    const pushResults = responseResults(push);
    const firstResult = pushResults[0];
    if (pushResults.length < commands.length || pushResults.some((result) => !["applied", "already_applied"].includes(result.status))) {
      const keys = push && typeof push === "object" ? Object.keys(push).slice(0, 12).join(",") : "none";
      throw new SmokeFailure("push", `expected an applied result for every domain; response keys: ${keys || "none"}`);
    }
    const revision = Math.max(...pushResults.map((result) => Number(result.revision) || 1));
    check("Push", "passed", { revision, domains: commands.length });

    const duplicate = await sync("push", deviceA, { commands });
    const duplicateResults = responseResults(duplicate);
    check("Push idempotency", duplicateResults.length >= commands.length && duplicateResults.every((result) => result.status === "already_applied") ? "passed" : "failed", {
      reason: duplicateResults.length >= commands.length && duplicateResults.every((result) => result.status === "already_applied") ? undefined : "same operation_ids did not all return already_applied",
    });

    let realtimeSignal = false;
    if (realtimeSession) {
      try {
        await realtimeSession.signal;
        realtimeSignal = true;
        check("Realtime signal", "passed");
      } catch (error) {
        check("Realtime signal", "fallback", { reason: redact(error.message) });
      }
    }
    const pulled = await sync("pull", deviceB, { cursor: responseCursor(bootstrap), limit: 100 });
    const pulledChanges = responseChanges(pulled);
    const receivedIds = new Set(pulledChanges.flatMap((change) => [change.entity_id, change.id].filter(Boolean)));
    const receivedDomains = new Set(pulledChanges.map((change) => {
      const entityId = change.entity_id || change.id;
      return commandByOperation.get(change.operation_id)?.entity || commands.find((command) => command.entity_id === entityId)?.entity;
    }).filter(Boolean));
    const received = commands.every((command) => receivedIds.has(command.entity_id));
    check("Transport pull fallback scaffold", received ? "manual-required" : "failed", {
      automated: true,
      realtime_signal: realtimeSignal,
      status_detail: received ? "second transport client received every synthetic domain fixture; real web-to-iOS fixture remains manual" : undefined,
      domains_received: receivedDomains.size,
      reason: received ? undefined : "second client pull did not contain every synthetic domain fixture",
    });
    if (strict && process.env.ROOTINE_SMOKE_REQUIRE_REALTIME_SIGNAL === "1") {
      check("Realtime signal required by environment", realtimeSignal ? "passed" : "failed", {
        reason: realtimeSignal ? undefined : "ROOTINE_SMOKE_REQUIRE_REALTIME_SIGNAL=1 but no channel signal arrived",
      });
    }

    const reverseCommands = commands.map((command, index) => ({
      ...command,
      operation_id: `op3_${randomUUID()}`,
      base_revision: Number(pushResults[index]?.revision) || revision,
      payload: { ...command.payload, title: `${command.payload.title} web update` },
    }));
    const reverse = await sync("push", deviceB, { commands: reverseCommands });
    const reverseResults = responseResults(reverse);
    const reverseApplied = reverseResults.length >= reverseCommands.length
      && reverseResults.every((result) => ["applied", "already_applied"].includes(result.status));
    check("Reverse push from web client", reverseApplied ? "manual-required" : "failed", {
      automated: true,
      domains: reverseCommands.length,
      reason: reverseApplied ? undefined : "web client did not apply every reverse domain fixture",
    });
    const reversePulled = await sync("pull", deviceA, { cursor: responseCursor(pulled), limit: 100 });
    const reverseIds = new Set(responseChanges(reversePulled).flatMap((change) => [change.entity_id, change.id].filter(Boolean)));
    const reverseReceived = reverseCommands.every((command) => reverseIds.has(command.entity_id));
    check("Two-client domain round-trip", reverseReceived ? "manual-required" : "failed", {
      automated: true,
      status_detail: reverseReceived ? "iOS client received reverse updates from the web client" : undefined,
      reason: reverseReceived ? undefined : "iOS client did not receive every reverse domain fixture",
    });

    const conflict = await sync("push", deviceB, { commands: [{
      ...commands[0],
      operation_id: `op3_${randomUUID()}`,
      base_revision: 0,
      payload: { ...commands[0].payload, title: "B12 synthetic stale write" },
    }] });
    const conflictResult = responseResults(conflict)[0];
    check("Conflict is explicit", conflictResult?.status === "conflict" ? "passed" : "failed", {
      reason: conflictResult?.status === "conflict" ? undefined : "stale base_revision was not rejected as conflict",
    });

    const apnsURL = process.env.ROOTINE_SMOKE_APNS_URL?.trim();
    if (apnsURL) {
      const provider = new URL(apnsURL);
      if (!["http:", "https:"].includes(provider.protocol) || provider.username || provider.password) {
        throw new SmokeFailure("notifications", "ROOTINE_SMOKE_APNS_URL must be an HTTP(S) URL without embedded credentials");
      }
      const notificationResponse = await fetch(provider, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: jsonBody({ type: "b12_synthetic_notification", dedupe_key: `b12-${commands[0].entity_id}` }),
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
      try {
        const notificationBody = await notificationResponse.clone().json();
        const deliveryRate = Number(notificationBody?.delivery_rate);
        if (Number.isFinite(deliveryRate) && deliveryRate >= 0 && deliveryRate <= 1) observedApnsDeliveryRate = deliveryRate;
      } catch {
        // A 2xx probe without a delivery metric is still only a provider reachability check.
      }
      check("APNs/local notification mock", notificationResponse.ok ? "passed" : "failed", {
        reason: notificationResponse.ok ? undefined : `notification provider returned HTTP ${notificationResponse.status}`,
      });
    } else {
      check("APNs/local notification mock", "manual-required", {
        reason: "no mock provider configured; physical iPhone delivery is required by the TestFlight checklist",
      });
      if (strict && process.env.ROOTINE_SMOKE_REQUIRE_APNS === "1") {
        check("APNs provider required by environment", "failed", { reason: "ROOTINE_SMOKE_REQUIRE_APNS=1 but ROOTINE_SMOKE_APNS_URL is not configured" });
      }
    }

    const roundTripDomains = pulled.round_trip_domains || pulled.bootstrap?.round_trip_domains
      || bootstrap.round_trip_domains || bootstrap.bootstrap?.round_trip_domains;
    const metadataDomains = Array.isArray(roundTripDomains)
      ? roundTripDomains.filter((entry) => entry && typeof entry === "object" && entry.client_a_to_b === true && entry.client_b_to_a === true).map((entry) => entry.domain)
      : [];
    const hasDomainMatrix = Array.isArray(roundTripDomains)
      && commands.every((command) => receivedDomains.has(command.entity))
      && reverseCommands.every((command) => reverseReceived && reverseIds.has(command.entity_id))
      && domainMatrix.every((domain) => metadataDomains.includes(domain));
    for (const domain of evidence.domain_matrix) {
      domain.status = hasDomainMatrix ? "passed" : "manual-required";
      domain.passed = hasDomainMatrix;
    }
    if (hasDomainMatrix) {
      check("Two-client domain matrix", "passed", {
        automated: true,
        status_detail: "both transport clients exchanged every configured domain and the server marked both directions",
      });
    } else if (strict) {
      check("Two-client domain matrix", "failed", { reason: "both clients must exchange a fixture for every configured domain; optional round_trip_domains metadata must mark both directions" });
    } else {
      check("Two-client domain matrix", "manual-required", { automated: false, status_detail: "transport fixtures are not evidence of a physical web ↔ iOS round-trip; complete the native matrix manually" });
    }

    const deletion = await request("delete", relativeSmokePath(process.env.ROOTINE_SMOKE_DELETE_PATH, "ROOTINE_SMOKE_DELETE_PATH", "/functions/v1/delete-account"), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: jsonBody({ confirmation: "DELETE" }),
    });
    if (deletion.response.status !== 204) throw new SmokeFailure("delete", `delete-account returned HTTP ${deletion.response.status}`);
    deletedAccount = true;
    check("Delete account", "passed");
    const invalidated = await waitForAuthInvalidation(request, token);
    check("Delete account auth invalidation", [401, 404].includes(invalidated.response.status) ? "passed" : "failed", {
      status_detail: "deleted access token is rejected by Supabase Auth",
      reason: [401, 404].includes(invalidated.response.status) ? undefined : `auth returned HTTP ${invalidated.response.status}`,
    });
  } catch (error) {
    const phase = error instanceof SmokeFailure ? error.phase : "smoke";
    check(phase, "failed", { reason: safeError(error) });
  } finally {
    if (realtimeSession?.socket) realtimeSession.socket.close();
    if (generatedAccount && !deletedAccount) {
      const cleanupUserId = createdUserId || userId;
      const serviceRole = process.env.ROOTINE_STAGING_SERVICE_ROLE_KEY?.trim();
      if (!cleanupUserId) {
        check("Synthetic account cleanup", "failed", { reason: "smoke created an account but did not obtain its user id for cleanup" });
      } else if (serviceRole) {
        try {
          const cleanup = await fetch(new URL(`/auth/v1/admin/users/${encodeURIComponent(cleanupUserId)}`, base), {
            method: "DELETE",
            headers: { apikey: serviceRole, authorization: `Bearer ${serviceRole}` },
            signal: AbortSignal.timeout(timeoutMs),
          });
          serviceRoleCleanup = cleanup.ok;
          check("Synthetic account cleanup", cleanup.ok ? "passed" : "failed", {
            reason: cleanup.ok ? "delete-account gate failed; service-role cleanup was used" : `admin cleanup returned HTTP ${cleanup.status}`,
          });
        } catch (error) {
          check("Synthetic account cleanup", "failed", { reason: safeError(error) });
        }
      } else {
        check("Synthetic account cleanup", "failed", { reason: "delete-account failed and ROOTINE_STAGING_SERVICE_ROLE_KEY is unavailable" });
      }
    }
  }

  evidence.account = {
    isolated: generatedAccount,
    deleted_via_edge_function: deletedAccount,
    service_role_cleanup: serviceRoleCleanup,
  };
  const transportCheckNames = ["Push", "Push idempotency", "Transport pull fallback scaffold", "Reverse push from web client", "Two-client domain round-trip", "Two-client domain matrix"];
  const transportChecks = evidence.checks.filter((item) => transportCheckNames.includes(item.name));
  const failedTransportChecks = transportChecks.filter((item) => item.status === "failed").length;
  const transportEvaluated = transportChecks.length > 0 && transportChecks.every((item) => ["passed", "fallback"].includes(item.status));
  const authEvaluated = evidence.checks.some((item) => item.name === "Auth" && item.status === "passed");
  const conflictEvaluated = evidence.checks.some((item) => item.name === "Conflict is explicit" && ["passed", "failed"].includes(item.status));
  evidence.metrics.automated_observations = {
    pull_push_errors: transportEvaluated ? failedTransportChecks : null,
    unauthorized_401_excluding_delete_invalidation: authEvaluated ? 0 : null,
    explicit_conflicts: conflictEvaluated
      ? evidence.checks.some((item) => item.name === "Conflict is explicit" && item.status === "passed") ? 1 : 0
      : null,
    cursor_lag_seconds: null,
    outbox_lag_seconds: null,
    apns_delivery_rate: observedApnsDeliveryRate,
  };
  evidence.metrics.thresholds_evaluated = {
    pull_push_errors: transportEvaluated,
    unauthorized_401: authEvaluated,
    explicit_conflicts: conflictEvaluated,
    cursor_lag_seconds: false,
    outbox_lag_seconds: false,
    apns_delivery_rate: observedApnsDeliveryRate !== null && observedApnsDeliveryRate >= 0.99,
  };
  evidence.metrics.status = Object.values(evidence.metrics.thresholds_evaluated).every(Boolean)
    ? "automated"
    : "manual-required";
  evidence.automated_gate_passed = passed;
  evidence.release_ready = passed && evidence.manual_gates_pending.length === 0;
  evidence.duration_ms = Date.now() - started;
  const complete = finishEvidence(evidence, passed);
  const path = await writeEvidence(complete, "staging-smoke.json");
  console.log(`Evidence: ${path}`);
  if (!passed) process.exitCode = 1;
}

main().catch(async (error) => {
  const evidence = finishEvidence(baseEvidence("staging-smoke"), false, { error: safeError(error) });
  const path = await writeEvidence(evidence, "staging-smoke.json");
  console.error(`Staging smoke failed: ${safeError(error)}\nEvidence: ${path}`);
  process.exitCode = 1;
});
