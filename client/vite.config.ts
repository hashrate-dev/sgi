import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 2000, // evita el aviso de chunks > 500 KB (React, jspdf, etc.)
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8080", changeOrigin: true }
    },
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate"
    }
  }
})
