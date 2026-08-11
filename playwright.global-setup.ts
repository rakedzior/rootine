import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const ROOT_DIR = process.cwd();
const HOST = "127.0.0.1";
const PORT = 4174;
const STARTUP_TIMEOUT_MS = 120_000;
export const SERVER_PID_FILE = path.join(os.tmpdir(), "rootine-playwright-vite.json");

function probeServer() {
  return new Promise<boolean>((resolve) => {
    const request = http.get({ host: HOST, port: PORT, path: "/" }, (response) => {
      response.resume();
      response.once("end", () => resolve((response.statusCode ?? 0) < 500));
    });
    request.once("error", () => resolve(false));
    request.setTimeout(1_000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForServer() {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await probeServer()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Playwright web server did not become available at http://${HOST}:${PORT}`);
}

export default async function globalSetup() {
  await fs.rm(SERVER_PID_FILE, { force: true });

  const server = spawn(
    process.execPath,
    [path.join(ROOT_DIR, "node_modules/vite/bin/vite.js"), "--host", HOST, "--port", String(PORT)],
    {
      cwd: ROOT_DIR,
      env: { ...process.env, VITE_ROOTINE_QA_AUTH: "1" },
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    },
  );

  let stderr = "";
  server.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  if (!server.pid) {
    throw new Error("Unable to start the Playwright web server");
  }

  await fs.writeFile(SERVER_PID_FILE, JSON.stringify({ pid: server.pid }), "utf8");

  try {
    await waitForServer();
  } catch (error) {
    try {
      process.kill(server.pid);
    } catch {
      // The process may have exited while the server was starting.
    }
    throw new Error(`${error instanceof Error ? error.message : String(error)}${stderr ? `\n${stderr}` : ""}`, { cause: error });
  }
}
