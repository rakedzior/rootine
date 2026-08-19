import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "api/**/*.{test,spec}.ts",
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
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
