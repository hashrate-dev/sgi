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
    // Evita fallos en Windows con `localhost` (IPv6 vs 127.0.0.1) y deja la URL estable
    host: "127.0.0.1",
    port: 5173,
    strictPort: false,
    /** El front en dev llama a la API en el mismo host:puerto (ver `getApiBase` en api.ts); este proxy queda por si algo pide `/api` al origen de Vite. */
    proxy: {
      "/api": { target: "http://127.0.0.1:8080", changeOrigin: true },
    },
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate"
    }
  }
})
