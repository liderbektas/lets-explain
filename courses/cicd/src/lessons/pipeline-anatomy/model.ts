import type { Workflow } from "../../engine/ci";
import { BUILD, LINT, PREP, TEST } from "../../engine/presets";

/** Everything in one job. */
export const ONE: Workflow = { name: "CI", on: { push: { branches: ["main"] } }, jobs: [{ id: "ci", steps: [...PREP, LINT, TEST, BUILD] }] };

/** Three jobs; `build` waits for whatever is in `needs`. */
export const split = (needs: string[]): Workflow => ({
  name: "CI",
  on: { push: { branches: ["main"] } },
  jobs: [
    { id: "lint", steps: [...PREP, LINT] },
    { id: "test", steps: [...PREP, TEST] },
    { id: "build", ...(needs.length ? { needs } : {}), steps: [...PREP, BUILD] },
  ],
});
