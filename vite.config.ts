/// <reference types="vitest/config" />
import { statSync } from "node:fs";
import { createRequire } from "node:module";
import { defineConfig } from "vite";

// Size of the OpenCascade kernel, for the progress bar of the loading screen (see geometry/download.ts).
const wasmBytes = statSync(createRequire(import.meta.url).resolve("replicad-opencascadejs/wasm")).size;

// The editor is bundled into static/js/ and served by Django (no Node server in production).
export default defineConfig(({ mode }) => ({
  base: "/static/js/",
  define: { OC_WASM_BYTES: JSON.stringify(wasmBytes) },
  publicDir: false,
  build: {
    outDir: "static/js",
    emptyOutDir: true,
    sourcemap: mode === "development",
    target: "es2022",
    // Three.js alone is ~630 kB (160 kB compressed), cached in its own chunk: no warning for it.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: { editor: "frontend/src/main.ts" },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        // Libraries change far less often than the editor: in chunks of their own (named after their content),
        // browsers keep them cached across releases of the application.
        manualChunks: (id: string) => (id.includes("node_modules/three/") ? "three" : id.includes("node_modules/") ? "vendor" : undefined),
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  worker: {
    format: "es",
  },
  test: {
    include: ["tests/frontend/**/*.test.ts"],
    environment: "node",
    testTimeout: 60000,
    hookTimeout: 60000,
  },
}));
