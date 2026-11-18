import { l, type L } from "@lets-explain/core/i18n";
import { ADA, createRepo, simulate, status, type GitAction, type Repo } from "../../engine/git";
import { AreasStage, type AreaFlow, type AreasLabels } from "../../iso/AreasStage";
import { makeGitScene, type SandboxRow } from "../shared/GitScene";
import { missions } from "./missions";

export const SLUG = "three-areas";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const add = (...paths: string[]): GitAction => ({ type: "add", paths });
const commit = (message: string): GitAction => ({ type: "commit", message });

/** The lesson starts in a fresh repository with one file in the folder, not yet tracked. */
export const START: Repo = simulate([write("README.md", "Merhaba")], createRepo({ author: ADA })).states[1]!;

export const steps: GitAction[][] = [
  [],
  [add("README.md")],
  [commit("İlk commit")],
  [write("README.md", "Merhaba dünya"), write("app.js", "console.log(1)")],
  [add("app.js"), commit("app.js eklendi")],
  [{ type: "restore", path: "README.md" }],
  [write("README.md", "Merhaba!"), add("README.md"), { type: "unstage", path: "README.md" }],
  [],
  [],
];

const labels = (t: (x: L) => string): AreasLabels => ({
  work: t(l("Klasör", "Folder")),
  index: t(l("Staging", "Staging")),
  repo: t(l("Repo", "Repo")),
  workSub: "working tree",
  indexSub: "index",
  repoSub: ".git (commit'ler)",
  empty: t(l("boş", "empty")),
  untracked: t(l("yeni", "new")),
  modified: t(l("değişti", "changed")),
  deleted: t(l("silindi", "deleted")),
  staged: t(l("hazır", "staged")),
  ignored: t(l("yok sayılıyor", "ignored")),
  noCommits: t(l("Henüz commit yok", "No commits yet")),
});

function flowOf(last: { type: string }[]): AreaFlow {
  const e = last[last.length - 1];
  if (!e) return null;
  if (e.type === "staged") return "add";
  if (e.type === "committed") return "commit";
  if (e.type === "restored") return "restore";
  if (e.type === "unstaged") return "unstage";
  return null;
}

/** The sandbox starts from one commit with two files, so every button has something to do. */
const sandboxStart = (end: Repo): Repo => {
  void end;
  return simulate(
    [write("README.md", "Merhaba"), write("app.js", "v1"), add("README.md", "app.js"), commit("Başlangıç")],
    createRepo({ author: ADA }),
  ).states[4]!;
};

const FILES = ["README.md", "app.js", "notes.txt"];

/** How many times a file has been edited in the sandbox so far: each edit writes a new version. */
const edits = (history: GitAction[], path: string) => history.filter((a) => a.type === "write" && a.path === path).length;

function rows(repo: Repo, lang: "tr" | "en", history: GitAction[]): SandboxRow[] {
  const tr = lang === "tr";
  const st = status(repo);
  const out: SandboxRow[] = FILES.map((path) => {
    const exists = path in repo.work;
    const staged = st.staged.some((c) => c.path === path);
    const changed = st.unstaged.some((c) => c.path === path) || st.untracked.includes(path);
    const n = edits(history, path) + 2;
    return {
      label: path,
      buttons: [
        {
          label: exists ? (tr ? "Düzenle" : "Edit") : tr ? "Oluştur" : "Create",
          action: write(path, path === "notes.txt" ? `not ${n - 1}` : `${path === "app.js" ? "v" : "Merhaba v"}${n}`),
          tone: "producer",
        },
        { label: "add", action: add(path), disabled: !changed },
        { label: "restore", action: { type: "restore", path }, disabled: !st.unstaged.some((c) => c.path === path) },
        { label: "restore --staged", action: { type: "unstage", path }, disabled: !staged },
      ],
    };
  });
  out.push({
    label: tr ? "Hepsi" : "All",
    buttons: [
      { label: "add .", action: { type: "add", paths: "." }, disabled: st.unstaged.length === 0 && st.untracked.length === 0 },
      { label: "commit", action: commit(tr ? "Değişiklikler" : "Changes"), tone: "ok", disabled: st.staged.length === 0 },
    ],
  });
  return out;
}

export const scene = makeGitScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Git'in üç alanı: klasör, staging ve repo", "Git's three areas: folder, staging and repo"),
  view: (repo, info) => <AreasStage repo={repo} labels={labels(info.t)} flow={flowOf(info.last)} />,
  metrics: (repo, t) => {
    const st = status(repo);
    return [
      { label: t(l("Klasörde değişen", "Changed in folder")), value: st.unstaged.length + st.untracked.length, tone: st.unstaged.length + st.untracked.length ? "warn" : "plain" },
      { label: t(l("Staging'de", "Staged")), value: st.staged.length, tone: st.staged.length ? "ok" : "plain" },
      { label: t(l("Commit", "Commits")), value: Object.keys(repo.commits).length },
    ];
  },
  sandbox: { start: sandboxStart, rows, missions },
});
