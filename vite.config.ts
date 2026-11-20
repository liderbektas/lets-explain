import { copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** Shared aliases: the site, the shared core and every course import each other by name. */
export const alias = {
  "@lets-explain/core": here("./packages/core/src"),
  "@lets-explain/kafka": here("./courses/kafka/src/index.ts"),
  "@lets-explain/git": here("./courses/git/src/index.ts"),
  "@lets-explain/rabbitmq": here("./courses/rabbitmq/src/index.ts"),
  "@lets-explain/docker": here("./courses/docker/src/index.ts"),
  "@lets-explain/cicd": here("./courses/cicd/src/index.ts"),
};

/**
 * URLs are paths (/kafka/replication/2), so a static host has to answer every path with the app.
 * Hosts such as GitHub Pages serve 404.html for a path they don't know: make it the app too.
 */
const spaFallback = (): Plugin => ({
  name: "spa-fallback",
  apply: "build",
  closeBundle() {
    copyFileSync(here("./dist/index.html"), here("./dist/404.html"));
  },
});

export default defineConfig({
  root: here("./site"),
  base: "/",
  plugins: [react(), spaFallback()],
  resolve: { alias },
  build: { outDir: here("./dist"), emptyOutDir: true },
  server: { fs: { allow: [here(".")] } },
});
