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
  server: {
    proxy: openFoodFactsProxy,
  },
  preview: {
    proxy: openFoodFactsProxy,
  },
});
