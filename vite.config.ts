import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** Shared aliases: the site, the shared core and every course import each other by name. */
export const alias = {
  "@lets-explain/core": here("./packages/core/src"),
  "@lets-explain/kafka": here("./courses/kafka/src/index.ts"),
};

export default defineConfig({
  root: here("./site"),
  base: "./",
  plugins: [react()],
  resolve: { alias },
  build: { outDir: here("./dist"), emptyOutDir: true },
  server: { fs: { allow: [here(".")] } },
});
