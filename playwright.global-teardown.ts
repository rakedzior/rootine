import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { SERVER_PID_FILE } from "./playwright.global-setup";

async function isRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function stopServer(pid: number) {
  if (!(await isRunning(pid))) return;

  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const taskkill = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      taskkill.once("error", () => resolve());
      taskkill.once("exit", () => resolve());
    });
  } else {
    process.kill(-pid, "SIGTERM");
  }

  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (!(await isRunning(pid))) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  if (process.platform !== "win32") {
    process.kill(-pid, "SIGKILL");
  }
}

export default async function globalTeardown() {
  try {
    let raw: string;
    try {
      raw = await fs.readFile(SERVER_PID_FILE, "utf8");
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
      throw error;
    }
    const { pid } = JSON.parse(raw) as { pid?: number };
    if (typeof pid === "number") {
      await stopServer(pid);
    }
  } finally {
    await fs.rm(SERVER_PID_FILE, { force: true });
  }
}
