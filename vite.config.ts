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
      // The editor, and the page of a client link (a viewer only).
      input: { editor: "frontend/src/main.ts", share: "frontend/src/share.ts" },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        // Libraries change far less often than the editor: in chunks of their own (named after their content),
        // browsers keep them cached across releases of the application.
        // The path tracer of the render mode stays out of these chunks: it gets one of its own, loaded only when the
        // mode first opens. (Only libraries may be loaded apart: a chunk of the application would import editor.js
        // without the page's « ?v= » and run it a second time.)
        manualChunks: (id: string) =>
          id.includes("node_modules/three/")
            ? "three"
            : /node_modules\/(three-gpu-pathtracer|three-mesh-bvh|xatlas-web)\//.test(id)
              ? undefined
              : id.includes("node_modules/")
                ? "vendor"
                : undefined,
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
