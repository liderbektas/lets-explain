import { l } from "@lets-explain/core/i18n";
import type { GitAction } from "../../engine/git";
import { remoteMetrics, TwoRepos } from "../remotes/TwoRepos";
import { makeGitScene } from "../shared/GitScene";
import { scenarios, START } from "./scenarios";

export const SLUG = "collaboration";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const commit = (message: string, all = false): GitAction => ({ type: "commit", message, all });
const teammate = (path: string, content: string, message: string): GitAction => ({ type: "teammate", branch: "main", path, content, message });

export { START };

/** Steps where a push is refused on purpose: the refusal is what the step teaches. */
export const REJECTED_STEPS = [1, 5];

export const steps: GitAction[][] = [
  [write("app.js", "v2"), { type: "add", paths: ["app.js"] }, commit("app.js: yeni başlık"), teammate("team.txt", "not", "Bora: not eklendi")],
  [{ type: "push" }],
  [{ type: "pull" }],
  [{ type: "push" }],
  [
    write("app.js", "v3"),
    { type: "add", paths: ["app.js"] },
    commit("app.js: renkler"),
    teammate("team.txt", "not 2", "Bora: not güncellendi"),
    { type: "pull", rebase: true },
    { type: "push" },
  ],
  [{ type: "commit", amend: true, message: "app.js: renkler ve yazı tipi" }, teammate("README.md", "v3", "Bora: README düzeltildi"), { type: "push", force: "lease" }],
  [{ type: "push", force: "force" }],
  [{ type: "switch", target: "feature", create: true }, write("search.js", "arama"), { type: "add", paths: ["search.js"] }, commit("Arama"), { type: "push", setUpstream: true }],
  [{ type: "switch", target: "main" }, { type: "merge", target: "feature" }, { type: "push" }, { type: "deleteBranch", name: "feature" }],
  [],
  [],
];

export const scene = makeGitScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Solda senin repo'n, sağda takımın paylaştığı origin (GitHub)", "Your repository on the left, the team's shared origin (GitHub) on the right"),
  view: (repo, info) => <TwoRepos repo={repo} fresh={info.fresh} t={info.t} />,
  metrics: (repo, t) => remoteMetrics(repo, t),
  // Free play starts from a fresh clone; each scenario brings its own state.
  sandbox: { start: () => START, scenarios },
});
