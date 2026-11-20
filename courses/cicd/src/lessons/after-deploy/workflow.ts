import type { StepDef, Workflow } from "../../engine/ci";
import { BUILD, PREP, TEST, step } from "../../engine/presets";

export interface Checks {
  smoke: boolean;
  rollback: boolean;
  notify: boolean;
}

/** Build and test, then deploy to staging, with whichever after-deploy checks are on. */
export function deployWf(c: Checks): Workflow {
  const after: StepDef[] = [];
  if (c.smoke) after.push(step("smoke", { with: { env: "staging" } }));
  if (c.rollback) after.push(step("rollback", { if: "failure", with: { env: "staging" } }));
  if (c.notify) after.push(step("notify", { if: "failure", with: { text: "Deploy to staging failed and was rolled back" } }));
  return {
    name: "Deploy",
    on: { push: { branches: ["main"] } },
    jobs: [
      { id: "build", steps: [...PREP, TEST, BUILD, step("upload")] },
      { id: "deploy", needs: ["build"], environment: "staging", steps: [step("download"), step("deploy", { with: { env: "staging" } }), ...after] },
    ],
  };
}

export const NONE: Checks = { smoke: false, rollback: false, notify: false };
export const ALL: Checks = { smoke: true, rollback: true, notify: true };
