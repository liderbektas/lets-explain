import type { Workflow, World } from "../../engine/ci";
import { ciJob } from "../../engine/presets";

export interface On {
  mainOnly?: boolean;
  pr?: boolean;
  schedule?: boolean;
  dispatch?: boolean;
  ignoreDocs?: boolean;
}

/** The CI workflow with the triggers switched on. */
export const trig = (o: On): Workflow => ({
  name: "CI",
  on: {
    push: { ...(o.mainOnly ? { branches: ["main"] } : {}), ...(o.ignoreDocs ? { pathsIgnore: ["docs/**", "**/*.md"] } : {}) },
    ...(o.pr ? { pull_request: { branches: ["main"] } } : {}),
    ...(o.schedule ? { schedule: "0 3 * * *" } : {}),
    ...(o.dispatch ? { dispatch: [] } : {}),
  },
  jobs: [ciJob()],
});

/** Reads the switches back from the current workflow. */
export const onOf = (w: World): On => {
  const on = w.workflows[0]?.on ?? {};
  return { mainOnly: Boolean(on.push?.branches), pr: Boolean(on.pull_request), schedule: Boolean(on.schedule), dispatch: Boolean(on.dispatch), ignoreDocs: Boolean(on.push?.pathsIgnore) };
};
