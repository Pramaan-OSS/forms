/// <reference types="vitest" />
import { isBuiltin } from "node:module";
import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "formsStorage",
      fileName: "index",
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      external: (id) => isBuiltin(id) || ["@forms/pramaan", "@forms/logger"].includes(id),
    },
  },
  test: {
    environment: "node",
    globals: true,
    coverage: {
      reporter: ["text", "json", "html", "lcov"],
      exclude: ["src/types/**"],
      include: ["src/**/*.ts"],
    },
  },
});
