import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const assetsDirectory = resolve("dist", "assets");
const stylesheets = readdirSync(assetsDirectory)
  .filter((file) => file.endsWith(".css"))
  .map((file) => join("dist", "assets", file));

if (stylesheets.length === 0) {
  console.error("Nie znaleziono pliku CSS w dist/assets. Najpierw uruchom npm run build.");
  process.exit(1);
}

const wallace = resolve("node_modules", "wallace-cli", "dist", "bin.mjs");
const forwardedArguments = process.argv.slice(2);

for (const stylesheet of stylesheets) {
  const result = spawnSync(process.execPath, [wallace, stylesheet, ...forwardedArguments], {
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
