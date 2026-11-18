import { l } from "@lets-explain/core/i18n";
import { ADA, createRepo, firstParents, headId, reachable, simulate, status, type GitAction, type Repo } from "../../engine/git";
import { AreasStage, type AreaFlow } from "../../iso/AreasStage";
import { GraphStage } from "../../iso/GraphStage";
import { makeGitScene, type SandboxRow } from "../shared/GitScene";
import { areasLabels } from "./labels";
import { missions } from "./missions";

export const SLUG = "undo-local";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const add = (...paths: string[]): GitAction => ({ type: "add", paths });
const commit = (message: string): GitAction => ({ type: "commit", message });

/** One commit with two files; the lesson makes mistakes in each area and undoes them. */
export const START: Repo = simulate(
  [write("README.md", "Merhaba"), write("app.js", "v1"), add("README.md", "app.js"), commit("Başlangıç")],
  createRepo({ author: ADA }),
).states[4]!;

export const TYPO = "app.js gncellendi";
export const FIXED = "app.js güncellendi";

export const steps: GitAction[][] = [
  [],
  [write("app.js", "v1 + yanlış satır")],
  [{ type: "restore", path: "app.js" }],
  [write("README.md", "Merhaba!!!"), add("README.md")],
  [{ type: "unstage", path: "README.md" }],
  [{ type: "restore", path: "README.md" }, write("app.js", "v2"), add("app.js"), commit(TYPO)],
  [{ type: "commit", amend: true, message: FIXED }],
  [write("notes.txt", "yapılacaklar"), add("notes.txt"), { type: "commit", amend: true }],
  [],
  [],
];

/** Steps 5 to 8 are about commits, so they show the graph; the rest show the three areas. */
const GRAPH_STEPS = new Set([5, 6, 7, 8]);

function flowOf(last: { type: string }[]): AreaFlow {
  const e = last[last.length - 1];
  if (!e) return null;
  if (e.type === "staged") return "add";
  if (e.type === "committed") return "commit";
  if (e.type === "restored") return "restore";
  if (e.type === "unstaged") return "unstage";
  return null;
}

/**
 * The try-it step: the last commit has a typo in its message, a wrong change to app.js is
 * already staged, and a README change you meant to commit sits in the folder.
 */
export const sandboxStart = (): Repo =>
  simulate(
    [
      write("app.js", "v2"),
      add("app.js"),
      commit(TYPO),
      write("app.js", "v2 + hata"),
      add("app.js"),
      write("README.md", "Merhaba, hoş geldin"),
    ],
    START,
  ).states[6]!;

const FILES = ["README.md", "app.js"];

const edits = (history: GitAction[], path: string) => history.filter((a) => a.type === "write" && a.path === path).length;

function rows(repo: Repo, lang: "tr" | "en", history: GitAction[]): SandboxRow[] {
  const tr = lang === "tr";
  const st = status(repo);
  const head = repo.commits[headId(repo)!]!;
  const out: SandboxRow[] = FILES.map((path) => {
    const staged = st.staged.some((c) => c.path === path);
    const changed = st.unstaged.some((c) => c.path === path);
    return {
      label: path,
      buttons: [
        { label: tr ? "Düzenle" : "Edit", action: write(path, `${path === "app.js" ? "v" : "Merhaba v"}${edits(history, path) + 3}`), tone: "producer" },
        { label: "add", action: add(path), disabled: !changed },
        { label: "restore", action: { type: "restore", path }, disabled: !changed },
        { label: "restore --staged", action: { type: "unstage", path }, disabled: !staged },
      ],
    };
  });
  out.push({
    label: "commit",
    buttons: [
      { label: "commit", action: commit("Yeni commit"), tone: "ok", disabled: st.staged.length === 0 },
      { label: `--amend -m "${FIXED}"`, action: { type: "commit", amend: true, message: FIXED }, tone: "go", disabled: head.message === FIXED && st.staged.length === 0 },
      { label: "--amend --no-edit", action: { type: "commit", amend: true }, tone: "go", disabled: st.staged.length === 0 },
    ],
  });
  return out;
}

export const scene = makeGitScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Hatanın olduğu yere göre geri alma: klasör, staging ve son commit", "Undoing by where the mistake is: folder, staging and the last commit"),
  view: (repo, info) =>
    GRAPH_STEPS.has(info.step) ? (
      <GraphStage repo={repo} highlight={info.fresh} />
    ) : (
      <AreasStage repo={repo} labels={areasLabels(info.t)} flow={flowOf(info.last)} />
    ),
  metrics: (repo, t, info) => {
    if (GRAPH_STEPS.has(info.step)) {
      const ghosts = Object.keys(repo.commits).filter((c) => !reachable(repo).has(c)).length;
      return [
        { label: t(l("main'deki commit", "Commits on main")), value: firstParents(repo, headId(repo)).length },
        { label: t(l("Son commit", "Last commit")), value: `"${repo.commits[headId(repo)!]!.message}"` },
        { label: t(l("Hiçbir branch'te değil", "On no branch")), value: ghosts, tone: ghosts ? "warn" : "plain" },
      ];
    }
    const st = status(repo);
    return [
      { label: t(l("Klasörde değişen", "Changed in folder")), value: st.unstaged.length + st.untracked.length, tone: st.unstaged.length ? "warn" : "plain" },
      { label: t(l("Staging'de", "Staged")), value: st.staged.length, tone: st.staged.length ? "ok" : "plain" },
      { label: t(l("Commit", "Commits")), value: firstParents(repo, headId(repo)).length },
    ];
  },
  sandbox: { start: sandboxStart, rows, missions },
});
