import type { JobDef, Workflow } from "../../engine/ci";
import { CHECKOUT, step } from "../../engine/presets";

const deployTo = (env: string, needs: string[]): JobDef => ({
  id: env,
  needs,
  environment: env,
  steps: [step("deploy", { name: "Deploy", with: { env, from: "registry" } })],
});

/** One image per commit, then dev → staging → production, each job in its own environment. */
export const DEPLOY: Workflow = {
  name: "Deploy",
  on: { push: { branches: ["main"] } },
  permissions: "write",
  jobs: [{ id: "image", steps: [CHECKOUT, step("docker-push")] }, deployTo("dev", ["image"]), deployTo("staging", ["dev"]), deployTo("production", ["staging"])],
};

/** Put any earlier image on staging by hand. */
export const MANUAL: Workflow = {
  name: "Deploy by hand",
  on: { dispatch: ["version"] },
  jobs: [{ id: "staging", environment: "staging", steps: [step("deploy", { name: "Deploy", with: { env: "staging", from: "registry", version: "input:version" } })] }],
};

export const ENVS = ["dev", "staging", "production"];
