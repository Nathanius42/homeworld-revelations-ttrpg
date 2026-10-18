import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const server = process.env.HWR_SERVER ?? "http://localhost:8787";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": server,
      "/local": server,
      "/ws": { target: server.replace(/^http/, "ws"), ws: true },
    },
  },
  build: { chunkSizeWarningLimit: 1500 },
});
