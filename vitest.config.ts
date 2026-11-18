import { defineConfig } from "vitest/config";
import { alias } from "./vite.config";

export default defineConfig({
  resolve: { alias },
  test: {
    include: ["packages/**/*.test.ts", "courses/**/*.test.ts", "site/**/*.test.ts"],
  },
});
