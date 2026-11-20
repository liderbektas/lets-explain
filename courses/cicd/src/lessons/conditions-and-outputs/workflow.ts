import type { Workflow } from "../../engine/ci";
import { BUILD, CHECKOUT, INSTALL, SETUP, TEST, step } from "../../engine/presets";

export interface Opts {
  /** deploy: `if: github.ref == 'refs/heads/main' ...` */
  mainOnly: boolean;
  /** Is there a notify job, and does it use `if: failure()`? */
  notify: "none" | "plain" | "failure";
  /** lint: `continue-on-error: true` */
  softLint: boolean;
}

export const VERSION_EXPR = "${{ needs.build.outputs.version }}";

export function condWf(o: Opts): Workflow {
  const jobs: Workflow["jobs"] = [
    {
      id: "build",
      steps: [
        CHECKOUT,
        SETUP,
        INSTALL,
        step("lint", o.softLint ? { continueOnError: true } : {}),
        TEST,
        BUILD,
        step("output", { with: { name: "version" } }),
        step("summary", { if: "always", with: { text: "### Build finished" } }),
        step("upload"),
      ],
    },
    {
      id: "deploy",
      needs: ["build"],
      ...(o.mainOnly ? { if: "main" as const } : {}),
      steps: [step("download"), step("deploy"), step("summary", { with: { text: `Deployed ${VERSION_EXPR} to staging` } })],
    },
  ];
  if (o.notify !== "none") jobs.push({ id: "notify", needs: ["build", "deploy"], ...(o.notify === "failure" ? { if: "failure" as const } : {}), steps: [step("notify")] });
  return { name: "CI/CD", on: { push: {} }, jobs };
}
