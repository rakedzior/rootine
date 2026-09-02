import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { cwd as currentWorkingDirectory } from "node:process";

export function hasFlag(name) {
  return process.argv.slice(2).includes(name);
}

export function nowISO() {
  return new Date().toISOString();
}

export function gitMetadata() {
  const value = (args, fallback = "unknown") => {
    try {
      return execFileSync("git", args, {
        cwd: currentWorkingDirectory(),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() || fallback;
    } catch {
      return fallback;
    }
  };

  return {
    commit: value(["rev-parse", "HEAD"]),
    branch: value(["branch", "--show-current"]),
  };
}

export function redact(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]")
    .replace(/(authorization|apikey|api_key|service_role|access_token|refresh_token|password|token)[=:]\s*[^\s,}"']+/gi, "$1=[REDACTED]")
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi, "$1[REDACTED]:[REDACTED]@")
    .replace(/[A-Za-z0-9._-]{32,}/g, "[REDACTED]");
}

export function safeError(error) {
  if (error instanceof Error) return redact(error.message);
  return redact(String(error));
}

export function commandExists(command) {
  try {
    execFileSync("sh", ["-c", `command -v ${command}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? currentWorkingDirectory(),
    env: options.env ?? process.env,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = redact(result.stdout ?? "");
  const stderr = redact(result.stderr ?? "");
  if (result.error) throw result.error;
  return {
    command: redact([command, ...args].join(" ")),
    code: result.status ?? 1,
    stdout,
    stderr,
    ok: result.status === 0,
  };
}

export async function writeEvidence(evidence, defaultName) {
  const directory = process.env.ROOTINE_EVIDENCE_DIR?.trim()
    || `${currentWorkingDirectory()}/.tmp-release-gate`;
  await mkdir(directory, { recursive: true });
  const path = `${directory}/${defaultName}`;
  await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  return path;
}

export function baseEvidence(kind, extra = {}) {
  return {
    schema_version: 1,
    kind,
    started_at: nowISO(),
    ...gitMetadata(),
    environment: process.env.ROOTINE_ENVIRONMENT?.trim() || "ci",
    migration_version: process.env.ROOTINE_MIGRATION_VERSION?.trim() || "from-repository",
    contract_version: Number(process.env.ROOTINE_CONTRACT_VERSION || 1),
    feature_flags: {
      normalized_sync_enabled: process.env.ROOTINE_FLAG_NORMALIZED_SYNC ?? "unknown",
      normalized_read_enabled: process.env.ROOTINE_FLAG_NORMALIZED_READ ?? "unknown",
      notifications_enabled: process.env.ROOTINE_FLAG_NOTIFICATIONS ?? "unknown",
    },
    ...extra,
  };
}

export function finishEvidence(evidence, passed, extra = {}) {
  return {
    ...evidence,
    finished_at: nowISO(),
    passed,
    ...extra,
  };
}
