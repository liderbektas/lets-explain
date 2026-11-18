import { l } from "@lets-explain/core/i18n";
import { ADA, asRemote, cloned, createRepo, currentBranch, simulate, status, type GitAction, type Repo } from "../../engine/git";
import { makeGitScene, type SandboxRow } from "../shared/GitScene";
import { missions } from "./missions";
import { remoteMetrics, TwoRepos } from "./TwoRepos";

export const SLUG = "remotes";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const commit = (message: string, all = false): GitAction => ({ type: "commit", message, all });
const teammate = (path: string, content: string, message: string): GitAction => ({ type: "teammate", branch: "main", path, content, message });

/** origin on GitHub: two commits on main. Every lesson in this chapter starts from a clone of it. */
export const ORIGIN = asRemote(
  simulate(
    [
      write("README.md", "v1"),
      write("app.js", "v1"),
      { type: "add", paths: "." },
      commit("İlk commit"),
      write("README.md", "v2"),
      commit("README güncellendi", true),
    ],
    createRepo({ author: ADA }),
  ).states[6]!,
);

export const START: Repo = cloned(ORIGIN);

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

const edits = (history: GitAction[]) => history.filter((a) => a.type === "write").length;
const teammates = (history: GitAction[]) => history.filter((a) => a.type === "teammate").length;

function rows(repo: Repo, lang: "tr" | "en", history: GitAction[]): SandboxRow[] {
  const tr = lang === "tr";
  const st = status(repo);
  const branch = currentBranch(repo);
  const hasUpstream = Boolean(branch && repo.upstream[branch]);
  return [
    {
      label: tr ? "Sen" : "You",
      buttons: [
        { label: tr ? "app.js düzenle" : "Edit app.js", action: write("app.js", `v${edits(history) + 3}`), tone: "producer" },
        { label: "commit -a", action: commit(tr ? "Değişiklik" : "Change", true), tone: "ok", disabled: st.unstaged.length === 0 },
      ],
    },
    {
      label: "origin",
      buttons: [
        { label: "fetch", action: { type: "fetch" } },
        { label: "pull", action: { type: "pull" }, disabled: !hasUpstream },
        { label: "push", action: { type: "push" }, tone: "go" },
        { label: "push -u", action: { type: "push", setUpstream: true }, disabled: hasUpstream },
      ],
    },
    {
      label: tr ? "Takım" : "Team",
      buttons: [
        {
          label: tr ? "Bora push etsin" : "Bora pushes",
          action: teammate(`bora${teammates(history) + 1}.txt`, "not", `Bora ${teammates(history) + 1}`),
          tone: "producer",
        },
      ],
    },
    {
      label: "Branch",
      buttons: [
        { label: "switch -c feature", action: { type: "switch", target: "feature", create: true }, disabled: Boolean(repo.branches.feature) },
        { label: "switch main", action: { type: "switch", target: "main" }, disabled: branch === "main" },
      ],
    },
  ];
}

export const scene = makeGitScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Solda senin bilgisayarındaki repo, sağda origin (GitHub)", "Your repository on the left, origin (GitHub) on the right"),
  view: (repo, info) => <TwoRepos repo={repo} fresh={info.fresh} t={info.t} />,
  metrics: (repo, t) => remoteMetrics(repo, t),
  sandbox: { start: () => START, rows, missions },
});
