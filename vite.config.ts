/// <reference types="vitest/config" />
import { defineConfig } from "vite";

// The editor is bundled into static/js/ and served by Django (no Node server in production).
export default defineConfig(({ mode }) => ({
  base: "/static/js/",
  publicDir: false,
  build: {
    outDir: "static/js",
    emptyOutDir: true,
    sourcemap: mode === "development",
    target: "es2022",
    rollupOptions: {
      input: { editor: "frontend/src/main.ts" },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
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
