import { spawnSync } from "node:child_process";
import path from "node:path";

const viteCommand = path.join(process.cwd(), "node_modules", "vite", "bin", "vite.js");
const result = spawnSync(process.execPath, [viteCommand, "build", "--mode", "e2e"], {
  cwd: process.cwd(),
  env: { ...process.env, VITE_ROOTINE_QA_AUTH: "1" },
  stdio: "inherit",
  windowsHide: true,
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
