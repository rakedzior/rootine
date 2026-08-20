import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const openFoodFactsProxy = {
  "/api/openfoodfacts": {
    target: "https://search.openfoodfacts.org",
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api\/openfoodfacts/, ""),
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    cssCodeSplit: true,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replaceAll("\\", "/");
          if (
            normalizedId.includes("/node_modules/react/")
            || normalizedId.includes("/node_modules/react-dom/")
            || normalizedId.includes("/node_modules/react-router/")
            || normalizedId.includes("/node_modules/@remix-run/router/")
            || normalizedId.includes("/node_modules/scheduler/")
          ) return "vendor-react";
          if (normalizedId.includes("/node_modules/lucide-react/")) return "vendor-icons";
          if (normalizedId.includes("/node_modules/@supabase/")) return "vendor-supabase";
          if (normalizedId.includes("/node_modules/zod/")) return "vendor-zod";
          if (normalizedId.includes("/node_modules/")) return "vendor";
          if (normalizedId.includes("/src/infrastructure/")) return "rootine-infrastructure";
          return undefined;
        },
      },
    },
  },
  server: {
    watch: {
      ignored: [
        "**/playwright-report/**",
        "**/test-results/**",
        "**/coverage/**",
        "**/dist/**",
        "**/.tmp-*/**",
      ],
    },
    proxy: openFoodFactsProxy,
  },
  preview: {
    proxy: openFoodFactsProxy,
  },
});
