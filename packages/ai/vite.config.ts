/// <reference types="vitest" />
import { builtinModules } from "node:module";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "formsAi",
      fileName: "index",
      formats: ["es"],
    },
    rollupOptions: {
      external: [
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
        "@forms/pramaan",
        "@forms/logger",
        "node:crypto",
      ],
    },
    emptyOutDir: false,
  },
  test: {
    environment: "node",
    globals: true,
    coverage: {
      reporter: ["text", "json", "html", "lcov"],
    },
  },
});
