import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const projectRoot = resolve("ios/Rootine");
const sourceRoot = join(projectRoot, "Rootine");
const testsRoot = join(projectRoot, "RootineTests");
const projectFile = join(projectRoot, "Rootine.xcodeproj/project.pbxproj");
const sharedConfig = join(projectRoot, "Config/Shared.xcconfig");
const infoPlist = join(sourceRoot, "Resources/Info.plist");
const entitlements = join(sourceRoot, "Resources/Rootine.entitlements");
const failures = [];

function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

for (const path of [projectFile, sharedConfig, infoPlist, entitlements, sourceRoot, testsRoot]) {
  if (!existsSync(path)) failures.push(`Missing required iOS path: ${path}`);
}

if (failures.length === 0) {
  const project = readFileSync(projectFile, "utf8");
  const config = readFileSync(sharedConfig, "utf8");
  const plist = readFileSync(infoPlist, "utf8");
  const capabilities = readFileSync(entitlements, "utf8");
  const swiftFiles = [...walk(sourceRoot), ...walk(testsRoot)].filter((path) => path.endsWith(".swift"));
  for (const swiftFile of swiftFiles) {
    if (!project.includes(basename(swiftFile))) {
      failures.push(`Swift file is not referenced by the Xcode project: ${swiftFile}`);
    }
  }

  for (const fixture of [
    "task-workspace-v2.json",
    "nutrition-workspace-v6.json",
    "notes-workspace-v1.json",
    "nutrition-product.json",
  ]) {
    const path = resolve("contracts/fixtures", fixture);
    try { JSON.parse(readFileSync(path, "utf8")); }
    catch { failures.push(`Contract fixture is missing or invalid JSON: ${path}`); }
    if (!project.includes(fixture)) failures.push(`Contract fixture is not bundled in RootineTests: ${fixture}`);
  }

  if (!config.includes("IPHONEOS_DEPLOYMENT_TARGET = 26.0")) failures.push("iOS deployment target must stay at 26.0 for the Xcode 26.3 toolchain");
  if (!config.includes("SWIFT_VERSION = 6.2")) failures.push("Swift language mode must stay at 6.2 for Xcode 26.3");
  if (!project.includes("objectVersion = 77")) failures.push("Xcode project format must use the Xcode 26 project format");
  if (!project.includes("LastUpgradeCheck = 2630")) failures.push("Xcode project metadata is not aligned with Xcode 26.3");
  if (!plist.includes("$(ROOTINE_AUTH_CALLBACK_SCHEME)")) failures.push("Info.plist is missing the configurable native auth URL scheme");
  if (!config.includes("ROOTINE_AUTH_CALLBACK_SCHEME = rootine")) failures.push("Native auth callback scheme must remain aligned with Supabase setup");
  if (!capabilities.includes("com.apple.developer.applesignin")) failures.push("Sign in with Apple entitlement is missing");

  const source = walk(sourceRoot)
    .filter((path) => path.endsWith(".swift"))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  for (const banned of ["SwiftData", "@Observable", "Observation", "NavigationSplitViewColumn"]) {
    if (source.includes(banned)) failures.push(`API outside the approved Rootine iOS architecture found in source: ${banned}`);
  }
  for (const required of [
    "Codzienność nie mieści się w jednej liście",
    "Rootine łączy zadania, cele, rutyny i ważne sprawy w jeden osobisty system.",
    "SignInWithAppleButton",
    "ASWebAuthenticationSession",
  ]) {
    if (!source.includes(required)) failures.push(`Approved authentication contract is missing: ${required}`);
  }
}

if (failures.length > 0) {
  console.error("iOS project audit failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("iOS project audit passed: Xcode 26.3 metadata, Swift 6.2 sources, shared contract fixtures, and iOS 26 target are aligned.");
