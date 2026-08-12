import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const sourceRoot = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(sourceRoot),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
