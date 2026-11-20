import { l } from "@lets-explain/core/i18n";
import { ADA, createRepo, currentBranch, headId, mergeBase, short, simulate, type GitAction, type Repo } from "../../engine/git";
import { GraphStage } from "../../iso/GraphStage";
import { commitsOf, graphLegend } from "../branches/parts";
import { makeGitScene } from "../shared/GitScene";
import { scenarios, TWO_BRANCHES } from "./scenarios";

export const SLUG = "merging";

const build = (actions: GitAction[]) => {
  const r = simulate(actions, createRepo({ author: ADA }));
  return r.states[r.states.length - 1]!;
};

const work = (path: string, content: string, message: string): GitAction[] => [
  { type: "write", path, content },
  { type: "add", paths: [path] },
  { type: "commit", message },
];

/** main with two commits, and a feature branch two commits ahead of it. */
export const START: Repo = build([
  ...commitsOf([
    ["index.html", "<h1>Mağaza</h1>", "Proje başladı"],
    ["urunler.js", "ürünler", "Ürün listesi"],
  ]),
  { type: "switch", target: "feature", create: true },
  ...work("arama.js", "arama kutusu", "Arama kutusu"),
  ...work("arama.js", "arama + sonuçlar", "Arama sonuçları"),
  { type: "switch", target: "main" },
]);

export const steps: GitAction[][] = [
  [],
  [{ type: "merge", target: "feature" }],
  [
    { type: "switch", target: "sepet", create: true },
    ...work("sepet.js", "sepet", "Sepet"),
    { type: "switch", target: "main" },
    ...work("README.md", "Mağaza projesi", "README"),
  ],
  [{ type: "merge", target: "sepet" }],
  [],
  [
    { type: "switch", target: "menu", create: true },
    ...work("menu.js", "menü", "Menü"),
    { type: "switch", target: "main" },
    { type: "merge", target: "menu", noFf: true },
  ],
  [
    { type: "switch", target: "odeme", create: true },
    ...work("odeme.js", "ödeme", "Ödeme"),
    { type: "switch", target: "main" },
    ...work("index.html", "<h1>Mağaza</h1><nav>", "Ana sayfa menüsü"),
    // Refused: main and odeme have both moved, so a fast-forward is impossible.
    { type: "merge", target: "odeme", ffOnly: true },
  ],
  [
    { type: "merge", target: "odeme" },
    { type: "deleteBranch", name: "feature" },
    { type: "deleteBranch", name: "sepet" },
    { type: "deleteBranch", name: "menu" },
    { type: "deleteBranch", name: "odeme" },
  ],
  [],
  [],
];

export const EXPECTED_ERRORS: Record<number, string> = { 6: "not-ancestor" };

export const scene = makeGitScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Commit grafiği: branch'lerin birleşmesi", "The commit graph: branches coming together"),
  view: (repo, info) => {
    let marks = info.fresh;
    if (info.step === 4) {
      // Show the three commits a three-way merge looks at: both parents and their merge base.
      const merge = repo.commits[headId(repo)!]!;
      const [ours, theirs] = merge.parents as [string, string];
      marks = new Set([ours, theirs, mergeBase(repo, ours, theirs)!]);
    }
    return <GraphStage repo={repo} highlight={marks} />;
  },
  metrics: (repo, t) => {
    const merges = Object.values(repo.commits).filter((c) => c.parents.length > 1).length;
    return [
      { label: t(l("Şu an", "On")), value: currentBranch(repo) ?? "detached" },
      { label: "main →", value: short(repo.branches.main!) },
      { label: t(l("Branch", "Branches")), value: Object.keys(repo.branches).length },
      { label: t(l("Merge commit", "Merge commits")), value: merges },
    ];
  },
  legend: (t) => graphLegend(t, { merge: true }),
  // Free play starts with login (can fast-forward) and menu (cannot); each scenario brings its own state.
  sandbox: { start: () => TWO_BRANCHES, scenarios },
  extraChanges: (step) =>
    step === 4
      ? [
          { kind: "change", text: l("Parlayan üç commit: iki ebeveyn ve ortak ataları (merge base)", "The three glowing commits: both parents and their common ancestor (merge base)") },
        ]
      : step === 6
        ? [{ kind: "bad", text: l("`--ff-only` reddetti: iki taraf da ilerlemiş, düz bir kaydırma mümkün değil", "`--ff-only` refused: both sides moved, so a straight slide is impossible") }]
        : [],
});
