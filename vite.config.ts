import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // Relative asset paths so Electron can load dist/ via file://
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "wifi-sync",
      configureServer(server) {
        const relay = spawn(
          process.execPath,
          [fileURLToPath(new URL("./electron/wifiRelay.mjs", import.meta.url))],
          { stdio: "inherit" },
        );
        const stop = () => {
          if (relay.exitCode == null) relay.kill();
        };
        server.httpServer?.once("close", stop);
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Force the CJS wasm build so Vite can synthesize a default export.
      "sql.js": path.resolve(__dirname, "node_modules/sql.js/dist/sql-wasm.js"),
    },
  },
  optimizeDeps: {
    include: ["sql.js"],
  },
  assetsInclude: ["**/*.wasm"],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
