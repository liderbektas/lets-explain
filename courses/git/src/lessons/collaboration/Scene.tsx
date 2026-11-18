import { l } from "@lets-explain/core/i18n";
import { cloned, currentBranch, headId, status, type GitAction, type Repo } from "../../engine/git";
import { ORIGIN } from "../remotes/Scene";
import { remoteMetrics, TwoRepos } from "../remotes/TwoRepos";
import { makeGitScene, type SandboxRow } from "../shared/GitScene";
import { missions } from "./missions";

export const SLUG = "collaboration";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const commit = (message: string, all = false): GitAction => ({ type: "commit", message, all });
const teammate = (path: string, content: string, message: string): GitAction => ({ type: "teammate", branch: "main", path, content, message });

export const START: Repo = cloned(ORIGIN);

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

const edits = (history: GitAction[]) => history.filter((a) => a.type === "write").length;
const teammates = (history: GitAction[]) => history.filter((a) => a.type === "teammate").length;

function rows(repo: Repo, lang: "tr" | "en", history: GitAction[]): SandboxRow[] {
  const tr = lang === "tr";
  const st = status(repo);
  const branch = currentBranch(repo);
  const hasUpstream = Boolean(branch && repo.upstream[branch]);
  const head = headId(repo);
  return [
    {
      label: tr ? "Sen" : "You",
      buttons: [
        { label: tr ? "app.js düzenle" : "Edit app.js", action: write("app.js", `v${edits(history) + 3}`), tone: "producer" },
        { label: "commit -a", action: commit(tr ? "Değişiklik" : "Change", true), tone: "ok", disabled: st.unstaged.length === 0 },
        {
          label: "commit --amend",
          action: { type: "commit", amend: true, message: tr ? "Düzeltilmiş mesaj" : "Fixed message" },
          disabled: !head || (head ? repo.commits[head]!.message === (tr ? "Düzeltilmiş mesaj" : "Fixed message") : true),
        },
      ],
    },
    {
      label: "origin",
      buttons: [
        { label: "fetch", action: { type: "fetch" } },
        { label: "pull", action: { type: "pull" }, disabled: !hasUpstream },
        { label: "pull --rebase", action: { type: "pull", rebase: true }, disabled: !hasUpstream },
        { label: "push", action: { type: "push" }, tone: "go" },
        { label: "--force-with-lease", action: { type: "push", force: "lease" } },
        { label: "--force", action: { type: "push", force: "force" }, tone: "danger" },
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
  label: l("Solda senin repo'n, sağda takımın paylaştığı origin (GitHub)", "Your repository on the left, the team's shared origin (GitHub) on the right"),
  view: (repo, info) => <TwoRepos repo={repo} fresh={info.fresh} t={info.t} />,
  metrics: (repo, t) => remoteMetrics(repo, t),
  sandbox: { start: () => START, rows, missions },
});
