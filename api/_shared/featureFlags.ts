export const ROOTINE_FEATURE_FLAG_NAMES = [
  "normalized_sync_enabled",
  "normalized_read_enabled",
  "notifications_enabled",
] as const;

export type RootineFeatureFlagName = (typeof ROOTINE_FEATURE_FLAG_NAMES)[number];
export type RootineFeatureFlagSource = "account" | "environment" | "default";
export type RootineFeatureFlagEnvironment = "development" | "staging" | "production";

export interface RootineFeatureFlagValue {
  enabled: boolean;
  source: RootineFeatureFlagSource;
}
export type RootineFeatureFlags = Record<RootineFeatureFlagName, RootineFeatureFlagValue>;

export interface FeatureFlagOverrides {
  environment?: Partial<Record<RootineFeatureFlagName, boolean>>;
  account?: Partial<Record<RootineFeatureFlagName, boolean>>;
}

export function defaultFeatureFlags(): RootineFeatureFlags {
  return Object.fromEntries(
    ROOTINE_FEATURE_FLAG_NAMES.map((name) => [name, { enabled: false, source: "default" }]),
  ) as RootineFeatureFlags;
}

/**
 * Account values win over environment values, while an absent value is always
 * false. The user id is deliberately an input to the API boundary rather than
 * a key used in this pure evaluator, making this function straightforward to
 * exercise without a live Supabase account.
 */
export function evaluateFeatureFlags(
  _userId: string,
  _environment: RootineFeatureFlagEnvironment,
  overrides: FeatureFlagOverrides = {},
): RootineFeatureFlags {
  const defaults = defaultFeatureFlags();
  for (const name of ROOTINE_FEATURE_FLAG_NAMES) {
    if (overrides.environment?.[name] !== undefined) {
      defaults[name] = { enabled: overrides.environment[name]!, source: "environment" };
    }
    if (overrides.account?.[name] !== undefined) {
      defaults[name] = { enabled: overrides.account[name]!, source: "account" };
    }
  }
  return defaults;
}
