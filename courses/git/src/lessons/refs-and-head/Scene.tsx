import { l } from "@lets-explain/core/i18n";
import { ADA, createRepo, currentBranch, headId, reachable, resolve, short, simulate, type GitAction, type Repo } from "../../engine/git";
import { MetroStage } from "../../iso/MetroStage";
import { commitsOf, metroLegend } from "../branches/parts";
import { makeGitScene, timeWords } from "../shared/GitScene";
import { BASE, scenarios } from "./scenarios";

export const SLUG = "refs-and-head";

const build = (actions: GitAction[]) => {
  const r = simulate(actions, createRepo({ author: ADA }));
  return r.states[r.states.length - 1]!;
};

/** Four commits on main. */
export const START: Repo = build(
  commitsOf([
    ["index.html", "<h1>Mağaza</h1>", "Proje başladı"],
    ["menu.js", "menü", "Menü eklendi"],
    ["sepet.js", "sepet", "Sepet eklendi"],
  ]),
);

const before: GitAction[][] = [
  [],
  [],
  [
    { type: "write", path: "odeme.js", content: "ödeme" },
    { type: "add", paths: ["odeme.js"] },
    { type: "commit", message: "Ödeme eklendi" },
  ],
  [],
  [{ type: "checkout", target: "HEAD~2" }],
  [
    { type: "write", path: "deneme.js", content: "deneme" },
    { type: "add", paths: ["deneme.js"] },
    { type: "commit", message: "Deneme" },
  ],
  [{ type: "switch", target: "main" }],
];

/** The commit made on a detached HEAD in step 5, found by replaying up to there. */
const lostId = (() => {
  const r = simulate(before.slice(0, 6).flat(), START);
  return headId(r.states[r.states.length - 1]!)!;
})();

export const steps: GitAction[][] = [
  ...before,
  [
    { type: "checkout", target: lostId },
    { type: "switch", target: "deneme", create: true },
  ],
  [],
  [],
];

export const scene = makeGitScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Commit grafiği: branch'ler commit'leri gösteren isimler, HEAD şu anki yer", "The commit graph: branches are names pointing at commits, HEAD is where you are"),
  view: (repo, info) => {
    // Step 3 points at HEAD~2 and main^ so the relative names have something to show.
    const marks = info.step === 3 ? new Set([resolve(repo, "HEAD~2")!, resolve(repo, "main^")!]) : info.fresh;
    return <MetroStage repo={repo} highlight={marks} lanes={2} time={timeWords(info.t)} t={info.t} />;
  },
  metrics: (repo, t) => {
    const branch = currentBranch(repo);
    const live = reachable(repo);
    const ghosts = Object.keys(repo.commits).filter((c) => !live.has(c)).length;
    return [
      { label: "HEAD →", value: branch ?? t(l(`${short(headId(repo)!)} (detached)`, `${short(headId(repo)!)} (detached)`)), tone: branch ? "plain" : "warn" },
      { label: "main →", value: short(repo.branches.main!) },
      { label: t(l("Branch'siz commit", "Commits on no branch")), value: ghosts, tone: ghosts ? "danger" : "plain" },
    ];
  },
  legend: (t) => metroLegend(t),
  // Free play starts from four commits on main; each scenario brings its own state.
  sandbox: { start: () => BASE, scenarios },
  extraChanges: (step) =>
    step === 3
      ? [{ kind: "change", text: l("Parlayan commit'ler: `HEAD~2` ve `main^`", "The glowing commits: `HEAD~2` and `main^`") }]
      : [],
});
