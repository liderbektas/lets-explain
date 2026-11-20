import type { JobDef, StepDef, Workflow } from "../../engine/ci";
import { BUILD, CHECKOUT, INSTALL, SETUP, TEST, step } from "../../engine/presets";

export const PAGES = "github-pages";

export interface Parts {
  test: boolean;
  upload: boolean;
  deploy: boolean;
  onlyMain: boolean;
}

const UPLOAD = step("upload", { name: "Run actions/upload-pages-artifact@v4" });
const FETCH = step("download", { name: "fetch the Pages artifact" });
const DEPLOY_PAGES = step("deploy", { name: "Run actions/deploy-pages@v4", with: { env: PAGES } });

/** This site's own pipeline, built up piece by piece. */
export function pagesWf(p: Parts): Workflow {
  const build: StepDef[] = [CHECKOUT, SETUP, INSTALL, ...(p.test ? [TEST] : []), BUILD, ...(p.upload ? [UPLOAD] : [])];
  const jobs: JobDef[] = [{ id: "build", steps: build }];
  if (p.deploy) jobs.push({ id: "deploy", needs: ["build"], environment: PAGES, ...(p.onlyMain ? { if: "main" as const } : {}), steps: [FETCH, DEPLOY_PAGES] });
  return { name: "Pages", on: { push: { branches: ["main"] }, pull_request: {} }, jobs };
}
