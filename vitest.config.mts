import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/rls/**/*.test.ts"],
    environment: "node",
    // RLS tests share one database; run files one at a time.
    fileParallelism: false,
    testTimeout: 20000,
  },
});
