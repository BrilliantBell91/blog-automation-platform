import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    exclude: ["e2e/**/*.spec.ts", "node_modules"],
  },
})
