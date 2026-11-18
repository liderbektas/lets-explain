import { l } from "@lets-explain/core/i18n";
import { ADA, createRepo, currentBranch, simulate, status, type GitAction, type Repo } from "../../engine/git";
import { GraphStage } from "../../iso/GraphStage";
import { makeGitScene, type SandboxRow } from "../shared/GitScene";
import { missions } from "./missions";
import { commitsOf, graphLegend, WorkStrip } from "./parts";

export const SLUG = "branches";

const build = (actions: GitAction[]) => {
  const r = simulate(actions, createRepo({ author: ADA }));
  return r.states[r.states.length - 1]!;
};

/** Two commits on main. */
export const START: Repo = build(
  commitsOf([
    ["app.js", "v1", "Proje başladı"],
    ["urunler.js", "ürünler", "Ürün listesi"],
  ]),
);

export const steps: GitAction[][] = [
  [],
  [{ type: "switch", target: "login", create: true }],
  [
    { type: "write", path: "login.js", content: "form" },
    { type: "add", paths: ["login.js"] },
    { type: "commit", message: "Giriş formu" },
  ],
  [{ type: "switch", target: "main" }],
  [
    { type: "write", path: "README.md", content: "Mağaza" },
    { type: "add", paths: ["README.md"] },
    { type: "commit", message: "README eklendi" },
  ],
  [
    { type: "write", path: "notlar.txt", content: "yapılacaklar" },
    { type: "switch", target: "login" },
  ],
  [
    { type: "write", path: "login.js", content: "form + şifre" },
    // Refused: login.js is different on main, so switching would overwrite the change.
    { type: "switch", target: "main" },
  ],
  [
    { type: "commit", all: true, message: "Şifre alanı" },
    { type: "switch", target: "main" },
    // Refused: login has commits main does not have.
    { type: "deleteBranch", name: "login" },
  ],
  [],
  [],
];

/** Steps whose refusal is the point of the step, with the error expected. */
export const EXPECTED_ERRORS: Record<number, string> = { 6: "would-overwrite", 7: "not-merged" };

/** The try-it step: main with two commits, and a login branch at the same place. */
const sandboxStart = (): Repo =>
  build([
    ...commitsOf([
      ["app.js", "v1", "Proje başladı"],
      ["urunler.js", "ürünler", "Ürün listesi"],
    ]),
    { type: "branch", name: "login" },
  ]);

const edits = (history: GitAction[]) => history.filter((a) => a.type === "write").length;

function rows(repo: Repo, lang: "tr" | "en", history: GitAction[]): SandboxRow[] {
  const tr = lang === "tr";
  const st = status(repo);
  const dirty = st.unstaged.length > 0 || st.staged.length > 0;
  const on = currentBranch(repo);
  const menu = Boolean(repo.branches.menu);
  return [
    {
      label: tr ? "Geç" : "Switch",
      buttons: [
        { label: "switch main", action: { type: "switch", target: "main" }, disabled: on === "main" },
        { label: "switch login", action: { type: "switch", target: "login" }, disabled: on === "login" },
        menu
          ? { label: "switch menu", action: { type: "switch", target: "menu" }, disabled: on === "menu" }
          : { label: "switch -c menu", action: { type: "switch", target: "menu", create: true } },
      ],
    },
    {
      label: tr ? "Dosya" : "File",
      buttons: [
        { label: tr ? "app.js'i düzenle" : "Edit app.js", action: { type: "write", path: "app.js", content: `v${edits(history) + 2}` }, tone: "producer" },
        { label: "commit -a", action: { type: "commit", all: true, message: tr ? "Değişiklik" : "Change" }, tone: "ok", disabled: !dirty },
      ],
    },
    {
      label: tr ? "Sil" : "Delete",
      buttons: [
        { label: "branch -d menu", action: { type: "deleteBranch", name: "menu" }, disabled: !menu || on === "menu" },
        { label: "branch -D menu", action: { type: "deleteBranch", name: "menu", force: true }, tone: "danger", disabled: !menu || on === "menu" },
      ],
    },
  ];
}

export const scene = makeGitScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Commit grafiği ve klasördeki commit edilmemiş değişiklikler", "The commit graph and the uncommitted changes in the folder"),
  view: (repo, info) => (
    <g>
      <GraphStage repo={repo} highlight={info.fresh} box={{ x: 0, y: 0, w: 860, h: 384 }} />
      <WorkStrip repo={repo} t={info.t} />
    </g>
  ),
  metrics: (repo, t) => {
    const st = status(repo);
    const unsaved = st.unstaged.length + st.staged.length + st.untracked.length;
    return [
      { label: t(l("Şu an", "On")), value: currentBranch(repo) ?? "detached" },
      { label: t(l("Branch", "Branches")), value: Object.keys(repo.branches).length },
      { label: t(l("Commit", "Commits")), value: Object.keys(repo.commits).length },
      { label: t(l("Kaydedilmemiş", "Unsaved")), value: unsaved, tone: unsaved ? "warn" : "plain" },
    ];
  },
  legend: (t) => graphLegend(t, { ghost: true }),
  sandbox: { start: sandboxStart, rows, missions },
  extraChanges: (step) =>
    step === 6
      ? [{ kind: "bad", text: l("Geçiş reddedildi: login.js'teki değişiklik main'deki haliyle ezilecekti", "Switch refused: the change to login.js would have been overwritten by main's version") }]
      : step === 7
        ? [{ kind: "bad", text: l("`git branch -d login` reddedildi: login'in main'de olmayan commit'leri var", "`git branch -d login` refused: login has commits main does not") }]
        : [],
});
