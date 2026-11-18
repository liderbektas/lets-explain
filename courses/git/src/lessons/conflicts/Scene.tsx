import { l, type L } from "@lets-explain/core/i18n";
import { ADA, createRepo, currentBranch, headId, simulate, type GitAction, type Repo } from "../../engine/git";
import { GraphStage } from "../../iso/GraphStage";
import { makeGitScene, type SandboxRow } from "../shared/GitScene";
import { FilePanel, type FilePanelLabels } from "./FilePanel";
import { missions } from "./missions";

export const SLUG = "conflicts";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const add = (...paths: string[]): GitAction => ({ type: "add", paths });
const commit = (message: string): GitAction => ({ type: "commit", message });

export const TITLE = "title.txt";
export const LOG = "CHANGELOG.md";

/**
 * A shop page with a title, and two branches that both changed it: main put a sale in the
 * title, feature renamed the shop. Both also started a CHANGELOG.md with their own line.
 */
const setup: GitAction[] = [
  write(TITLE, "Mağaza"),
  write("README.md", "Mağaza projesi"),
  add(TITLE, "README.md"),
  commit("Proje başladı"),
  { type: "switch", target: "feature", create: true },
  write(TITLE, "Online Mağaza"),
  write(LOG, "Karanlık tema eklendi"),
  add(TITLE, LOG),
  commit("Yeni isim ve karanlık tema"),
  { type: "switch", target: "main" },
  write(TITLE, "Mağaza: Büyük indirim"),
  write(LOG, "Şifre sıfırlama eklendi"),
  add(TITLE, LOG),
  commit("İndirim ve şifre sıfırlama"),
];

export const START: Repo = (() => {
  const r = simulate(setup, createRepo({ author: ADA }));
  return r.states[r.states.length - 1]!;
})();

export const steps: GitAction[][] = [
  [],
  [{ type: "merge", target: "feature" }],
  [],
  [{ type: "abort" }],
  [{ type: "merge", target: "feature" }, { type: "resolve", path: TITLE, take: "theirs" }, add(TITLE)],
  [{ type: "resolve", path: LOG, take: "both" }, add(LOG)],
  [{ type: "commit" }],
  [],
  [],
];

export const panelLabels = (t: (x: L) => string): FilePanelLabels => ({
  title: t(l("Klasördeki dosyalar", "Files in the folder")),
  conflict: "conflict",
  needsAdd: t(l("add bekliyor", "needs add")),
  changed: t(l("değişti", "changed")),
  clean: t(l("temiz", "clean")),
  ours: t(l("bizim (HEAD)", "ours (HEAD)")),
  theirs: t(l("onların", "theirs")),
  missing: t(l("(dosya yok)", "(no file)")),
});

function rows(repo: Repo, lang: "tr" | "en"): SandboxRow[] {
  const tr = lang === "tr";
  const merging = repo.op?.kind === "merge";
  const conflicted = repo.op?.conflicts ?? [];
  const merged = Boolean(repo.branches.feature && headId(repo) && repo.commits[headId(repo)!]!.parents.includes(repo.branches.feature));
  const fileRow = (path: string): SandboxRow => {
    const open = conflicted.includes(path);
    const marked = open && (repo.work[path] ?? "").includes("<<<<<<< ");
    return {
      label: path,
      buttons: [
        { label: tr ? "bizimki" : "ours", action: { type: "resolve", path, take: "ours" }, disabled: !marked },
        { label: tr ? "onlarınki" : "theirs", action: { type: "resolve", path, take: "theirs" }, disabled: !marked },
        { label: tr ? "ikisi de" : "both", action: { type: "resolve", path, take: "both" }, disabled: !marked },
        { label: "add", action: add(path), disabled: !open || marked },
      ],
    };
  };
  return [
    {
      label: "merge",
      buttons: [
        { label: "merge feature", action: { type: "merge", target: "feature" }, tone: "producer", disabled: merging || merged || !repo.branches.feature },
        { label: "merge --abort", action: { type: "abort" }, tone: "danger", disabled: !merging },
      ],
    },
    fileRow(TITLE),
    fileRow(LOG),
    {
      label: tr ? "Bitir" : "Finish",
      buttons: [
        { label: "add .", action: { type: "add", paths: "." }, disabled: !merging || conflicted.every((p) => (repo.work[p] ?? "").includes("<<<<<<< ")) },
        { label: "commit", action: { type: "commit" }, tone: "ok", disabled: !merging || conflicted.length > 0 },
        { label: "branch -d feature", action: { type: "deleteBranch", name: "feature" }, disabled: merging || !repo.branches.feature || currentBranch(repo) === "feature" || !merged },
      ],
    },
  ];
}

export const scene = makeGitScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Commit grafiği ve conflict'li dosyalar", "The commit graph and the conflicted files"),
  view: (repo, info) => (
    <g>
      <GraphStage repo={repo} box={{ x: 0, y: 0, w: 500, h: 470 }} highlight={info.fresh} showGhosts={false} />
      <FilePanel repo={repo} paths={[TITLE, LOG]} labels={panelLabels(info.t)} box={{ x: 506, y: 22, w: 336, h: 430 }} />
    </g>
  ),
  metrics: (repo, t) => {
    const open = repo.op?.conflicts.length ?? 0;
    return [
      { label: t(l("Conflict'li dosya", "Conflicted files")), value: open, tone: open ? "danger" : "plain" },
      { label: t(l("Merge sürüyor", "Merge in progress")), value: repo.op?.kind === "merge" ? t(l("evet", "yes")) : t(l("hayır", "no")), tone: repo.op ? "warn" : "plain" },
      { label: t(l("Commit", "Commits")), value: Object.keys(repo.commits).length },
    ];
  },
  sandbox: { start: () => START, rows: (repo, lang) => rows(repo, lang), missions },
});
