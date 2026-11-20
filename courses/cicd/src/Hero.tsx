import { useMemo } from "react";
import { useTicker } from "@lets-explain/core/lib/playback";
import { freshWorld, simulate, type CiAction, type Workflow } from "./engine/ci";
import { BUILD, PREP, LINT, TEST, step } from "./engine/presets";
import { EnvStrip } from "./iso/panels";
import { RunStage } from "./iso/RunStage";
import { HOLD_MS } from "./iso/replay";

const WF: Workflow = {
  name: "CI/CD",
  on: { push: { branches: ["main"] } },
  jobs: [
    { id: "lint", steps: [...PREP, LINT] },
    { id: "test", steps: [...PREP, TEST] },
    { id: "build", needs: ["lint", "test"], steps: [...PREP, BUILD, step("upload")] },
    { id: "deploy", needs: ["build"], steps: [step("download"), step("deploy"), step("smoke")] },
  ],
};

const story: CiAction[] = [{ type: "push", add: ["test"], message: "add VAT to cart total" }, { type: "push", fix: ["test"] }, { type: "push" }];

/** The course home loop: commits go through the pipeline; the red one never reaches staging. */
export function CicdHero() {
  // Each push is held long enough for its run to play out on the line.
  const tick = useTicker(true, false, HOLD_MS + 600) % (story.length + 1);
  const states = useMemo(() => simulate(story, freshWorld({ workflows: [WF], secrets: { DEPLOY_TOKEN: "x" }, envs: [{ name: "staging", sha: "3f2a1c9" }] })).states, []);
  const w = states[Math.min(tick, states.length - 1)]!;
  const run = w.runs[w.runs.length - 1];
  return (
    <svg className="stage-svg" viewBox="0 0 860 470" aria-hidden="true">
      <RunStage run={run} box={{ x: 20, y: 14, w: 820, h: 330 }} />
      <EnvStrip world={w} box={{ x: 260, y: 350, w: 340, h: 100 }} />
    </svg>
  );
}
