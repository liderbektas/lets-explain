import { useMemo } from "react";
import { useTicker } from "@lets-explain/core/lib/playback";
import { simulate, type GitAction } from "./engine/git";
import { GIT_STAGE, GraphStage } from "./iso/GraphStage";

const edit = (path: string, content: string, message: string): GitAction[] => [
  { type: "write", path, content },
  { type: "add", paths: [path] },
  { type: "commit", message },
];

/** The story the hero loops through: a few commits, a feature branch, a merge. */
const story: GitAction[] = [
  ...edit("README.md", "Merhaba", "Proje başladı"),
  ...edit("app.js", "v1", "İlk sürüm"),
  { type: "switch", target: "feature", create: true },
  ...edit("login.js", "giriş", "Giriş ekranı"),
  { type: "switch", target: "main" },
  ...edit("README.md", "Merhaba dünya", "README"),
  { type: "switch", target: "feature" },
  ...edit("login.js", "giriş v2", "Şifre kontrolü"),
  { type: "switch", target: "main" },
  { type: "merge", target: "feature" },
];

/** Moments worth showing: after each commit, switch and merge (file edits are skipped). */
const frames = (() => {
  const run = simulate(story);
  return run.states.filter((_, i) => i === 0 || ["commit", "switch", "merge"].includes(story[i - 1]!.type));
})();

export function GitHero() {
  const tick = useTicker(true, false, 1300);
  const i = tick % (frames.length + 2);
  const state = frames[Math.min(i, frames.length - 1)]!;
  const highlight = useMemo(() => new Set<string>(), []);
  return (
    <svg className="stage-svg" viewBox={`0 0 ${GIT_STAGE.width} ${GIT_STAGE.height}`} aria-hidden="true">
      <GraphStage repo={state} highlight={highlight} />
    </svg>
  );
}
