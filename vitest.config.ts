import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    // Pinned here (not in a test file) because imports are hoisted above any process.env assignment.
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://csc:csc_dev@localhost:5432/csc_test" },
    environment: "node", include: ["tests/**/*.test.ts"], testTimeout: 30000, fileParallelism: false },
});
