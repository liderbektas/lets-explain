import { l } from "@lets-explain/core/i18n";
import { ADA, createRepo, currentBranch, headId, isAncestor, mergeBase, short, simulate, type GitAction, type Repo } from "../../engine/git";
import { GraphStage } from "../../iso/GraphStage";
import { commitsOf, graphLegend } from "../branches/parts";
import { makeGitScene, type SandboxRow } from "../shared/GitScene";
import { missions } from "./missions";

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

/** The try-it step: login is one commit ahead of main (fast-forward possible), menu has split off. */
const sandboxStart = (): Repo =>
  build([
    ...commitsOf([
      ["index.html", "<h1>Mağaza</h1>", "Proje başladı"],
      ["urunler.js", "ürünler", "Ürün listesi"],
    ]),
    { type: "switch", target: "menu", create: true },
    ...work("menu.js", "menü", "Menü"),
    { type: "switch", target: "main" },
    ...work("index.html", "<h1>Mağaza</h1><nav>", "Ana sayfa"),
    { type: "switch", target: "login", create: true },
    ...work("login.js", "giriş", "Giriş"),
    { type: "switch", target: "main" },
  ]);

/** Branch names and Git flags read the same in both languages, so the buttons are not translated. */
function rows(repo: Repo): SandboxRow[] {
  const head = headId(repo)!;
  return ["login", "menu"].map((b) => {
    const tip = repo.branches[b];
    const merged = !tip || isAncestor(repo, tip, head);
    return {
      label: b,
      buttons: [
        { label: `merge ${b}`, action: { type: "merge", target: b }, tone: "ok", disabled: merged },
        { label: "--no-ff", action: { type: "merge", target: b, noFf: true }, disabled: merged },
        { label: "--ff-only", action: { type: "merge", target: b, ffOnly: true }, disabled: merged },
        { label: `branch -d ${b}`, action: { type: "deleteBranch", name: b }, tone: "danger", disabled: !tip },
      ],
    };
  });
}

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
  sandbox: { start: sandboxStart, rows, missions },
  extraChanges: (step) =>
    step === 4
      ? [
          { kind: "change", text: l("Parlayan üç commit: iki ebeveyn ve ortak ataları (merge base)", "The three glowing commits: both parents and their common ancestor (merge base)") },
        ]
      : step === 6
        ? [{ kind: "bad", text: l("`--ff-only` reddetti: iki taraf da ilerlemiş, düz bir kaydırma mümkün değil", "`--ff-only` refused: both sides moved, so a straight slide is impossible") }]
        : [],
});
