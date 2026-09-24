#!/bin/zsh

# Deterministic T5 aggregation benchmark. The explicit SDK is intentional:
# custom Development configurations otherwise let xcodebuild resolve macOS
# when a destination is supplied, producing a non-existent TEST_HOST path.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT="$REPO_ROOT/ios/Rootine/Rootine.xcodeproj"
DESTINATION="${DESTINATION:-platform=iOS Simulator,name=iPhone 16e,OS=26.3}"
TIMEOUT_SECONDS="${BENCHMARK_TIMEOUT_SECONDS:-120}"

if [[ -n "${DERIVED_DATA_PATH:-}" ]]; then
  DERIVED_DATA_PATH="$DERIVED_DATA_PATH"
  mkdir -p "$DERIVED_DATA_PATH"
else
  DERIVED_DATA_PATH="$(mktemp -d "${TMPDIR:-/tmp}/rootine-t5-benchmark.XXXXXX")"
fi
RESULT_BUNDLE_PATH="${RESULT_BUNDLE_PATH:-$DERIVED_DATA_PATH/today-aggregation.xcresult}"
LOG_PATH="${BENCHMARK_LOG_PATH:-$DERIVED_DATA_PATH/today-aggregation.log}"

if [[ -e "$RESULT_BUNDLE_PATH" ]]; then
  echo "Result bundle already exists: $RESULT_BUNDLE_PATH" >&2
  echo "Set RESULT_BUNDLE_PATH to a new path before rerunning." >&2
  exit 2
fi

run_logged() {
  local exit_code
  set +e
  "$@" 2>&1 | tee -a "$LOG_PATH"
  exit_code=${pipestatus[1]}
  set -e
  return "$exit_code"
}

: > "$LOG_PATH"
echo "T5 benchmark destination: $DESTINATION" | tee -a "$LOG_PATH"
echo "T5 benchmark derived data: $DERIVED_DATA_PATH" | tee -a "$LOG_PATH"

run_logged xcodebuild build-for-testing \
  -project "$PROJECT" \
  -scheme Rootine \
  -configuration Development \
  -sdk iphonesimulator \
  -destination "$DESTINATION" \
  -derivedDataPath "$DERIVED_DATA_PATH" \
  CODE_SIGNING_ALLOWED=NO

set +e
perl -e 'alarm shift; exec @ARGV' "$TIMEOUT_SECONDS" xcodebuild test-without-building \
  -project "$PROJECT" \
  -scheme Rootine \
  -configuration Development \
  -sdk iphonesimulator \
  -destination "$DESTINATION" \
  -only-testing:RootineTests/TodayAggregationTests/testLargeAccountAggregationIsMeasured \
  -derivedDataPath "$DERIVED_DATA_PATH" \
  -resultBundlePath "$RESULT_BUNDLE_PATH" 2>&1 | tee -a "$LOG_PATH"
TEST_EXIT_CODE=${pipestatus[1]}
set -e

TEST_REPORT="$(xcrun xcresulttool get test-results tests --path "$RESULT_BUNDLE_PATH" --compact 2>/dev/null || true)"
if [[ -n "$TEST_REPORT" ]]; then
  TEST_DURATION="$(grep -oE '"durationInSeconds":[0-9.]+' <<< "$TEST_REPORT" | head -1 | cut -d: -f2 || true)"
  TEST_OUTCOME="$(grep -oE '"result":"[^"]+"' <<< "$TEST_REPORT" | head -1 | cut -d: -f2- | tr -d '"' || true)"
  echo "T5 XCTest report: durationInSeconds=${TEST_DURATION:-unavailable} outcome=${TEST_OUTCOME:-unavailable}"
else
  echo "T5 XCTest report: unavailable (result bundle was not readable)"
fi
echo "T5 benchmark log: $LOG_PATH"
echo "T5 benchmark result bundle: $RESULT_BUNDLE_PATH"

if [[ "$TEST_EXIT_CODE" -ne 0 ]]; then
  echo "T5 benchmark blocked or failed before XCTest completed (exit $TEST_EXIT_CODE)." >&2
fi
exit "$TEST_EXIT_CODE"
