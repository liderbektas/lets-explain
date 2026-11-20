import { freshWorld, SHAS, type Workflow, type World } from "../../engine/ci";
import { BUILD, LINT, PREP, TEST, step } from "../../engine/presets";

/** The message of the broken commit the lesson pushes. */
export const BUG_MSG = "add VAT to cart total";

/** Plain CI: every push to main is linted, tested and built. */
export const CI: Workflow = {
  name: "CI",
  on: { push: { branches: ["main"] } },
  jobs: [{ id: "ci", steps: [...PREP, LINT, TEST, BUILD] }],
};

/** CI plus CD: a green build goes to staging by itself. */
export const CICD: Workflow = {
  name: "CI",
  on: { push: { branches: ["main"] } },
  jobs: [
    { id: "ci", steps: [...PREP, LINT, TEST, BUILD, step("upload")] },
    { id: "deploy", needs: ["ci"], steps: [step("download"), step("deploy")] },
  ],
};

/** Staging runs the first commit; someone put it there by hand. */
export const fresh = (workflows: Workflow[] = []): World => freshWorld({ workflows, envs: [{ name: "staging", sha: SHAS[0] }], secrets: { DEPLOY_TOKEN: "dpl_live" } });
