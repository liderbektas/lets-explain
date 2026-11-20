import type { Workflow } from "../../engine/ci";
import { BUILD, CHECKOUT, INSTALL, SETUP, TEST, step } from "../../engine/presets";

/** The old way: every environment checks out main and builds again. */
export const REBUILD: Workflow = {
  name: "Deploy (rebuild)",
  on: { dispatch: ["environment"] },
  jobs: [{ id: "deploy", steps: [CHECKOUT, SETUP, INSTALL, BUILD, step("deploy", { name: "Deploy", with: { env: "input:environment" } })] }],
};

/** Build once: every push to main is tested and becomes one image tagged with its commit. */
export const CI: Workflow = {
  name: "CI",
  on: { push: { branches: ["main"] } },
  permissions: "write",
  jobs: [{ id: "image", steps: [CHECKOUT, SETUP, INSTALL, TEST, step("docker-push")] }],
};

/** ...and that same image is promoted from environment to environment. */
export const PROMOTE: Workflow = {
  name: "Promote",
  on: { dispatch: ["environment", "version"] },
  jobs: [{ id: "deploy", steps: [step("deploy", { name: "Deploy", with: { env: "input:environment", from: "registry", version: "input:version" } })] }],
};
