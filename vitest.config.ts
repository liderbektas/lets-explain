import { defineConfig } from "vitest/config";
import { alias } from "./vite.config";

export default defineConfig({
  resolve: { alias },
  test: {
    include: ["packages/**/*.test.ts", "courses/**/*.test.ts", "site/**/*.test.ts"],
    // Mission tests search every move sequence; under a full parallel run they need room.
    testTimeout: 30_000,
  },
});
