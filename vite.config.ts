import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") }
  },
  // The WebLLM worker (lib/llm/worker.ts) is a module worker ({ type: "module" }), so it is bundled as an ES module.
  worker: { format: "es" },
  server: {
    // Same single origin as nginx in Docker: the browser calls /api and never needs CORS.
    proxy: { "/api": "http://localhost:8080" }
  }
});
