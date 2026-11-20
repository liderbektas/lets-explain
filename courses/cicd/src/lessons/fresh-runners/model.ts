import { freshWorld, SHAS, type StepKind, type Workflow, type World } from "../../engine/ci";
import { BUILD, PREP, TEST, step } from "../../engine/presets";

const DEPLOY = step("deploy");

/** Everything on one machine: test, build and deploy in a single job. */
export const ONE_JOB: Workflow = { name: "Deploy", on: { push: { branches: ["main"] } }, jobs: [{ id: "ship", steps: [...PREP, TEST, BUILD, DEPLOY] }] };

/** Two jobs: `build`, then `deploy` with whatever steps come before its deploy step. */
export const split = (pre: StepKind[], upload = false): Workflow => ({
  name: "Deploy",
  on: { push: { branches: ["main"] } },
  jobs: [
    { id: "build", steps: [...PREP, TEST, BUILD, ...(upload ? [step("upload")] : [])] },
    { id: "deploy", needs: ["build"], steps: [...pre.map((k) => step(k)), DEPLOY] },
  ],
});

/** Staging runs the first commit; the deploy token is a repo secret. */
export const fresh = (workflows: Workflow[] = []): World => freshWorld({ workflows, envs: [{ name: "staging", sha: SHAS[0] }], secrets: { DEPLOY_TOKEN: "dpl_live" } });
