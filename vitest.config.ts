import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "api/**/*.{test,spec}.ts",
      "supabase/functions/**/*.test.ts",
    ],
    // These suites use Deno's jsr:@std/assert runtime and are executed by
    // the Edge contract gate. Keeping them out of Vitest avoids trying to
    // resolve Deno-only imports in the browser/jsdom runner.
    exclude: [
      "supabase/functions/delete-account/index.test.ts",
      "supabase/functions/mobile-sync/index.test.ts",
    ],
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "http://localhost/",
      },
    },
    setupFiles: ["src/test/setup.ts"],
    css: true,
    restoreMocks: true,
    clearMocks: true,
    // The jsdom suites create many portal/event-loop resources. An unbounded
    // worker count makes short interaction tests exceed their real 5s budget
    // on smaller CI/dev machines, while four workers retain useful parallelism
    // and keep the check reproducible.
    maxWorkers: 4,
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
