import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, join, resolve } from "node:path";

const projectRoot = resolve("ios/Rootine");
const sourceRoot = join(projectRoot, "Rootine");
const testsRoot = join(projectRoot, "RootineTests");
const projectContainer = join(projectRoot, "Rootine.xcodeproj");
const projectFile = join(projectRoot, "Rootine.xcodeproj/project.pbxproj");
const sharedConfig = join(projectRoot, "Config/Shared.xcconfig");
const environmentConfigs = ["Development.xcconfig", "Staging.xcconfig", "Production.xcconfig"]
  .map((name) => join(projectRoot, `Config/${name}`));
const environmentBuildConfigurations = [
  { name: "Development", file: "Development.xcconfig", environment: "development" },
  { name: "Staging", file: "Staging.xcconfig", environment: "staging" },
  { name: "Production", file: "Production.xcconfig", environment: "production" },
];
const rolloutFlags = [
  "ROOTINE_NORMALIZED_SYNC_ENABLED",
  "ROOTINE_NORMALIZED_READ_ENABLED",
  "ROOTINE_NOTIFICATIONS_ENABLED",
];
const infoPlist = join(sourceRoot, "Resources/Info.plist");
const privacyManifest = join(sourceRoot, "Resources/PrivacyInfo.xcprivacy");
const entitlements = join(sourceRoot, "Resources/Rootine.entitlements");
const failures = [];

function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function readEffectiveXcconfig(path, seen = new Set()) {
  if (seen.has(path) || !existsSync(path)) return {};
  seen.add(path);
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const include = line.match(/^\s*#include\??\s+["<]([^">]+)[">]/);
    if (include) Object.assign(values, readEffectiveXcconfig(join(path.slice(0, path.lastIndexOf("/")), include[1]), seen));
    const assignment = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (assignment) values[assignment[1]] = assignment[2];
  }
  return values;
}

function readXcodeBuildSettings(configuration) {
  if (process.platform !== "darwin") return null;
  try {
    const output = execFileSync("xcodebuild", [
      "-project", projectContainer,
      "-scheme", "Rootine",
      "-configuration", configuration,
      "-showBuildSettings",
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return Object.fromEntries([...output.matchAll(/^\s*(ROOTINE_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/gm)]
      .map(([, key, value]) => [key, value]));
  } catch {
    failures.push(`xcodebuild could not resolve effective settings for ${configuration}`);
    return null;
  }
}

for (const path of [projectFile, sharedConfig, ...environmentConfigs, infoPlist, privacyManifest, entitlements, sourceRoot, testsRoot]) {
  if (!existsSync(path)) failures.push(`Missing required iOS path: ${path}`);
}

if (failures.length === 0) {
  const project = readFileSync(projectFile, "utf8");
  const config = readFileSync(sharedConfig, "utf8");
  const plist = readFileSync(infoPlist, "utf8");
  const privacy = readFileSync(privacyManifest, "utf8");
  const capabilities = readFileSync(entitlements, "utf8");
  const environmentConfigContents = environmentConfigs.map((path) => readFileSync(path, "utf8"));
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
  if (!plist.includes("NSCameraUsageDescription")) failures.push("Info.plist is missing the camera usage description");
  if (!plist.includes("BGTaskSchedulerPermittedIdentifiers")) failures.push("Info.plist is missing the background refresh allowlist");
  if (!privacy.includes("NSPrivacyTracking") || !privacy.includes("<false/>")) failures.push("Privacy manifest must explicitly disable tracking");
  if (!privacy.includes("NSPrivacyAccessedAPICategoryUserDefaults") || !privacy.includes("CA92.1")) {
    failures.push("Privacy manifest must declare the UserDefaults access reason");
  }
  if (!project.includes("PrivacyInfo.xcprivacy")) failures.push("Privacy manifest is not bundled in the iOS target");
  if (!config.includes("ROOTINE_AUTH_CALLBACK_SCHEME = rootine")) failures.push("Native auth callback scheme must remain aligned with Supabase setup");
  for (const [index, environment] of ["development", "staging", "production"].entries()) {
    if (!environmentConfigContents[index]?.includes(`ROOTINE_ENVIRONMENT = ${environment}`)) {
      failures.push(`iOS environment config is missing ROOTINE_ENVIRONMENT = ${environment}`);
    }
    for (const flag of rolloutFlags) {
      if (!environmentConfigContents[index]?.includes(`${flag} = NO`)) {
        failures.push(`${environment} iOS config must keep ${flag} disabled by default`);
      }
    }
  }

  for (const { name, file, environment } of environmentBuildConfigurations) {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const blocks = [...project.matchAll(new RegExp(
      `\\n\\t\\t[A-F0-9]+ \\/\\* ${escapedName} \\*\\/ = \\{[\\s\\S]*?\\n\\t\\t\\};`,
      "g",
    ))].map(([block]) => block);
    if (blocks.length < 3) {
      failures.push(`Xcode project must define ${name} for the project, app target, and test target`);
    }
    for (const block of blocks) {
      if (!block.includes(`baseConfigurationReference = `) || !block.includes(`/* ${file} */`)) {
        failures.push(`Xcode ${name} configuration must use ${file}`);
        break;
      }
    }

    const effectiveConfig = readEffectiveXcconfig(join(projectRoot, `Config/${file}`));
    if (effectiveConfig.ROOTINE_ENVIRONMENT !== environment) {
      failures.push(`${name} xcconfig resolves ROOTINE_ENVIRONMENT = ${effectiveConfig.ROOTINE_ENVIRONMENT ?? "<missing>"}, expected ${environment}`);
    }
    for (const flag of rolloutFlags) {
      if (effectiveConfig[flag] !== "NO") failures.push(`${name} xcconfig resolves ${flag} = ${effectiveConfig[flag] ?? "<missing>"}, expected NO`);
    }

    const xcodeSettings = readXcodeBuildSettings(name);
    if (xcodeSettings) {
      if (xcodeSettings.ROOTINE_ENVIRONMENT !== environment) {
        failures.push(`xcodebuild resolves ${name} ROOTINE_ENVIRONMENT = ${xcodeSettings.ROOTINE_ENVIRONMENT ?? "<missing>"}, expected ${environment}`);
      }
      for (const flag of rolloutFlags) {
        if (xcodeSettings[flag] !== "NO") failures.push(`xcodebuild resolves ${name} ${flag} = ${xcodeSettings[flag] ?? "<missing>"}, expected NO`);
      }
    }
  }
  if (!capabilities.includes("com.apple.developer.applesignin")) failures.push("Sign in with Apple entitlement is missing");

  const source = walk(sourceRoot)
    .filter((path) => path.endsWith(".swift"))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  for (const banned of ["SwiftData", "@Observable", "Observation", "NavigationSplitViewColumn"]) {
    if (source.includes(banned)) failures.push(`API outside the approved Rootine iOS architecture found in source: ${banned}`);
  }
  for (const required of [
    ".accessibilityElement",
    ".accessibilityLabel",
    ".accessibilityHint",
    "accessibilityReduceMotion",
  ]) {
    if (!source.includes(required)) failures.push(`Accessibility foundation is missing the expected SwiftUI contract: ${required}`);
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
