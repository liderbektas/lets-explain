import { freshWorld, SHAS, type CiAction, type JobDef, type Workflow, type World } from "../../engine/ci";
import { BUILD, PREP, TEST, step } from "../../engine/presets";

export const BUILD_JOB: JobDef = { id: "build", steps: [...PREP, TEST, BUILD, step("upload")] };
export const STAGING_JOB: JobDef = { id: "staging", needs: ["build"], steps: [step("download"), step("deploy", { with: { env: "staging" } })] };

/** Only CI: the run ends at a green build. */
export const CI_ONLY: Workflow = { name: "Pipeline", on: { push: { branches: ["main"] } }, jobs: [BUILD_JOB] };

/** The whole pipeline: build, then staging, then production behind its environment. */
export const PIPELINE: Workflow = {
  name: "Pipeline",
  on: { push: { branches: ["main"] } },
  jobs: [
    BUILD_JOB,
    STAGING_JOB,
    { id: "production", needs: ["build", "staging"], environment: "production", steps: [step("download"), step("deploy", { with: { env: "production" } })] },
  ],
};

export const gate = (on: boolean): CiAction => ({ type: "setEnv", name: "production", approval: on });

export const fresh = (workflows: Workflow[] = [], approval = false): World =>
  freshWorld({
    workflows,
    envs: [
      { name: "staging", sha: SHAS[0] },
      { name: "production", sha: SHAS[0], approval },
    ],
    secrets: { DEPLOY_TOKEN: "dpl_live" },
  });
