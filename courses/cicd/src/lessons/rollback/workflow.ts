import { freshWorld, SHAS, type Workflow, type World } from "../../engine/ci";
import { CHECKOUT, step } from "../../engine/presets";

/** Every push to main: one image, straight to production. */
export const DEPLOY: Workflow = {
  name: "Deploy",
  on: { push: { branches: ["main"] } },
  permissions: "write",
  jobs: [
    { id: "image", steps: [CHECKOUT, step("docker-push")] },
    { id: "production", needs: ["image"], environment: "production", steps: [step("deploy", { name: "Deploy", with: { env: "production", from: "registry" } })] },
  ],
};

/** Put any image from the registry back on production. */
export const REDEPLOY: Workflow = {
  name: "Redeploy",
  on: { dispatch: ["version"] },
  jobs: [{ id: "production", environment: "production", steps: [step("deploy", { name: "Deploy", with: { env: "production", from: "registry", version: "input:version" } })] }],
};

export const freshStart = (): World => {
  const w = freshWorld({ workflows: [DEPLOY, REDEPLOY], envs: [{ name: "production", sha: SHAS[0]! }], secrets: { DEPLOY_TOKEN: "dpl_live" } });
  return { ...w, registry: { [`sha-${SHAS[0]}`]: SHAS[0]! } };
};
