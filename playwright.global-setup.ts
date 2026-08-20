import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const ROOT_DIR = process.cwd();
const HOST = "127.0.0.1";
const PORT = 4174;
const STARTUP_TIMEOUT_MS = 30_000;
export const SERVER_PID_FILE = path.join(os.tmpdir(), "rootine-playwright-vite.json");

function runE2eBuild() {
  return new Promise<void>((resolve, reject) => {
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    const build = spawn(npmCommand, ["run", "build:e2e"], {
      cwd: ROOT_DIR,
      env: { ...process.env, VITE_ROOTINE_QA_AUTH: "1" },
      stdio: "inherit",
      windowsHide: true,
    });

    build.once("error", reject);
    build.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`The Playwright E2E build failed${signal ? ` with signal ${signal}` : ` with code ${code ?? "unknown"}`}`));
    });
  });
}

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

async function waitForServer(server: ReturnType<typeof spawn>) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await probeServer()) return;
    if (server.exitCode !== null) {
      throw new Error(`Playwright web server exited during startup with code ${server.exitCode}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Playwright web server did not become available at http://${HOST}:${PORT}`);
}

async function waitForPortRelease() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (!(await probeServer())) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Port ${PORT} is still serving another process after teardown`);
}

export default async function globalSetup() {
  if (process.env.PLAYWRIGHT_EXTERNAL_SERVER === "1") return;

  await runE2eBuild();
  await waitForPortRelease();
  await fs.rm(SERVER_PID_FILE, { force: true });

  const viteArguments = [
    path.join(ROOT_DIR, "node_modules/vite/bin/vite.js"),
    "preview",
    "--host",
    HOST,
    "--port",
    String(PORT),
    "--strictPort",
  ];

  const server = spawn(
    process.execPath,
    viteArguments,
    {
      cwd: ROOT_DIR,
      env: { ...process.env, VITE_ROOTINE_QA_AUTH: "1" },
      detached: process.platform !== "win32",
      stdio: "ignore",
      windowsHide: true,
    },
  );

  if (!server.pid) {
    throw new Error("Unable to start the Playwright web server");
  }

  await fs.writeFile(SERVER_PID_FILE, JSON.stringify({ pid: server.pid }), "utf8");

  try {
    await waitForServer(server);
  } catch (error) {
    try {
      process.kill(process.platform === "win32" ? server.pid : -server.pid);
    } catch {
      // The process may have exited while the server was starting.
    }
    throw error;
  }
}
