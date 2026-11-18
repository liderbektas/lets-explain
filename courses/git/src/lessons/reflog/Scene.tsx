import { l } from "@lets-explain/core/i18n";
import { ADA, createRepo, headId, reachable, resolve, short, simulate, status, type GitAction, type Repo } from "../../engine/git";
import { GraphStage } from "../../iso/GraphStage";
import { makeGitScene, type SandboxRow } from "../shared/GitScene";
import { missions } from "./missions";
import { ReflogPanel, reflogEntries } from "./ReflogPanel";

export const SLUG = "reflog";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const add = (...paths: string[]): GitAction => ({ type: "add", paths });
const commit = (message: string): GitAction => ({ type: "commit", message });

/**
 * main: Başlangıç — Özellik — Önemli iş, and a branch `deneme` off Özellik with one commit.
 * Every move along the way is in HEAD's reflog.
 */
export const START: Repo = simulate(
  [
    write("README.md", "Merhaba"),
    add("README.md"),
    commit("Başlangıç"),
    write("feature.js", "özellik"),
    add("feature.js"),
    commit("Özellik"),
    { type: "switch", target: "deneme", create: true },
    write("deneme.js", "deneme"),
    add("deneme.js"),
    commit("Deneme"),
    { type: "switch", target: "main" },
    write("important.js", "önemli"),
    add("important.js"),
    commit("Önemli iş"),
  ],
  createRepo({ author: ADA }),
).states[14]!;

/** The two commits the lesson loses and finds again. */
export const IMPORTANT = START.branches.main!;
export const EXPERIMENT = START.branches.deneme!;

export const steps: GitAction[][] = [
  [],
  [{ type: "reset", target: "HEAD~1", mode: "hard" }],
  [],
  [{ type: "reset", target: IMPORTANT, mode: "hard" }],
  [{ type: "deleteBranch", name: "deneme", force: true }],
  [{ type: "branch", name: "deneme", at: EXPERIMENT }],
  [write("README.md", "yarım kalmış iş"), { type: "reset", target: "HEAD", mode: "hard" }],
  [],
  [],
];

/** The try-it step starts after both accidents: main reset back one commit and `deneme` deleted. */
export const sandboxStart = (): Repo =>
  simulate([{ type: "reset", target: "HEAD~1", mode: "hard" }, { type: "deleteBranch", name: "deneme", force: true }], START).states[2]!;

export const rescueName = (id: string) => `kurtar-${short(id).slice(0, 4)}`;

function rows(repo: Repo, lang: "tr" | "en"): SandboxRow[] {
  const tr = lang === "tr";
  const head = headId(repo);
  const seen = new Set<string>();
  const entries = reflogEntries(repo, 12).filter((e) => {
    if (e.to === head || seen.has(e.to)) return false;
    seen.add(e.to);
    return true;
  });
  const out: SandboxRow[] = entries.slice(0, 5).map((e) => ({
    label: `HEAD@{${e.n}}`,
    buttons: [
      { label: `reset --hard ${short(e.to)}`, action: { type: "reset", target: e.to, mode: "hard" }, tone: "go" },
      { label: `branch ${rescueName(e.to)}`, action: { type: "branch", name: rescueName(e.to), at: e.to }, tone: "ok", disabled: Boolean(repo.branches[rescueName(e.to)]) },
    ],
  }));
  out.push({
    label: tr ? "Tehlikeli" : "Risky",
    buttons: [{ label: "reset --hard HEAD~1", action: { type: "reset", target: "HEAD~1", mode: "hard" }, tone: "danger", disabled: !resolve(repo, "HEAD~1") }],
  });
  return out;
}

export const scene = makeGitScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Commit grafiği ve HEAD'in günlüğü: git reflog", "The commit graph and HEAD's diary: git reflog"),
  view: (repo, info) => (
    <g>
      <GraphStage repo={repo} highlight={info.fresh} box={{ x: 0, y: 0, w: 570, h: 470 }} />
      <ReflogPanel repo={repo} x={580} w={268} labels={{ title: info.t(l("HEAD'in günlüğü", "HEAD's diary")), lost: info.t(l("kayıp", "lost")) }} />
    </g>
  ),
  metrics: (repo, t) => {
    const ghosts = Object.keys(repo.commits).filter((c) => !reachable(repo).has(c)).length;
    const st = status(repo);
    return [
      { label: t(l("Reflog girişi", "Reflog entries")), value: repo.reflog.length },
      { label: t(l("Hiçbir branch'te değil", "On no branch")), value: ghosts, tone: ghosts ? "danger" : "ok" },
      { label: t(l("Kaydedilmemiş değişiklik", "Unsaved changes")), value: st.unstaged.length + st.staged.length },
    ];
  },
  sandbox: { start: sandboxStart, rows, missions },
});
