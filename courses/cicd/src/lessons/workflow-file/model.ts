import type { StepKind, Workflow } from "../../engine/ci";
import { BUILD, CHECKOUT, INSTALL, LINT, SETUP, TEST, step } from "../../engine/presets";

/** The workflow this lesson grows, one step at a time. */
export const wf = (kinds: StepKind[]): Workflow => ({
  name: "CI",
  on: { push: { branches: ["main"] } },
  jobs: [{ id: "test", steps: kinds.map((k) => step(k)) }],
});

export const FULL: Workflow = { ...wf([]), jobs: [{ id: "test", steps: [CHECKOUT, SETUP, INSTALL, LINT, TEST, BUILD] }] };
