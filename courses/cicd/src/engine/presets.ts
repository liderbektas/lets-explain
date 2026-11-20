import type { JobDef, StepDef, StepKind, Workflow } from "./ci";

/** Building blocks lessons share, so every lesson's workflow looks like the others. */

export const step = (kind: StepKind, extra: Omit<StepDef, "kind"> = {}): StepDef => ({ kind, ...extra });

export const CHECKOUT = step("checkout");
export const SETUP = step("setup-node");
export const INSTALL = step("install");
export const LINT = step("lint");
export const TYPECHECK = step("typecheck");
export const TEST = step("test");
export const BUILD = step("build");

/** checkout → setup-node → npm ci: what almost every Node job starts with. */
export const PREP: StepDef[] = [CHECKOUT, SETUP, INSTALL];

/** The classic one-job CI: lint, test, build. */
export const ciJob = (extra: Partial<JobDef> = {}): JobDef => ({ id: "ci", steps: [...PREP, LINT, TEST, BUILD], ...extra });

export const ciWorkflow = (extra: Partial<Workflow> = {}): Workflow => ({
  name: "CI",
  on: { push: { branches: ["main"] }, pull_request: {} },
  jobs: [ciJob()],
  ...extra,
});

/** Replace one job of a workflow by id, leaving the rest. */
export const withJob = (wf: Workflow, id: string, patch: (j: JobDef) => JobDef): Workflow => ({ ...wf, jobs: wf.jobs.map((j) => (j.id === id ? patch(j) : j)) });
