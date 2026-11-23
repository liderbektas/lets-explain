import { l } from "@lets-explain/core/i18n";
import type { GitAction } from "../../engine/git";
import { makeGitScene } from "../shared/GitScene";
import { ORIGIN, scenarios, START } from "./scenarios";
import { remoteMetrics, TwoRepos } from "./TwoRepos";

export const SLUG = "remotes";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const commit = (message: string, all = false): GitAction => ({ type: "commit", message, all });
const teammate = (path: string, content: string, message: string): GitAction => ({ type: "teammate", branch: "main", path, content, message });

export { ORIGIN, START };

export const steps: GitAction[][] = [
  [],
  [write("app.js", "v2"), { type: "add", paths: ["app.js"] }, commit("app.js v2")],
  [{ type: "push" }],
  [teammate("team.txt", "Bora'nın notu", "Bora: not eklendi")],
  [{ type: "fetch" }],
  [{ type: "merge", target: "origin/main" }],
  [teammate("team.txt", "Bora'nın notu v2", "Bora: not güncellendi"), { type: "pull" }],
  [{ type: "switch", target: "feature", create: true }, write("search.js", "arama"), { type: "add", paths: ["search.js"] }, commit("Arama"), { type: "push" }],
  [{ type: "push", setUpstream: true }],
  [],
  [],
];

export const scene = makeGitScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Solda senin bilgisayarındaki repo, sağda origin (GitHub)", "Your repository on the left, origin (GitHub) on the right"),
  view: (repo, info) => <TwoRepos repo={repo} fresh={info.fresh} t={info.t} last={info.last} />,
  metrics: (repo, t) => remoteMetrics(repo, t),
  // Free play starts from a fresh clone; each scenario brings its own state.
  sandbox: { start: () => START, scenarios },
});
