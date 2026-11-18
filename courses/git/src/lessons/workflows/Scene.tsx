import { l } from "@lets-explain/core/i18n";
import { ADA, apply, asRemote, cloned, createRepo, currentBranch, simulate, status, type GitAction, type Repo } from "../../engine/git";
import { GraphStage } from "../../iso/GraphStage";
import { makeGitScene, type SandboxRow } from "../shared/GitScene";
import { missions } from "./missions";

export const SLUG = "workflows";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });

/** The team's shared repo on GitHub: two commits on main. */
const ORIGIN = asRemote(
  simulate(
    [
      write("README.md", "Takvim uygulaması"),
      write("app.js", "v1"),
      { type: "add", paths: "." },
      { type: "commit", message: "Proje başladı" },
      write("app.js", "v1.1"),
      { type: "commit", all: true, message: "Ekran" },
    ],
    createRepo({ author: ADA }),
  ).states[6]!,
);

/** You, Ada, have just cloned it. */
export const START: Repo = cloned(ORIGIN);

const FEATURE = "feature/login";

export const steps: GitAction[][] = [
  [],
  [{ type: "switch", target: FEATURE, create: true }],
  [
    write("login.js", "form"),
    { type: "add", paths: ["login.js"] },
    { type: "commit", message: "Giriş formu" },
    write("login.js", "form + şifre"),
    { type: "commit", all: true, message: "Şifre kontrolü" },
  ],
  [{ type: "push", setUpstream: true }],
  [{ type: "teammate", branch: "main", path: "README.md", content: "Takvim uygulaması (kurulum)", message: "Kurulum notları" }],
  [{ type: "fetch" }, { type: "rebase", onto: "origin/main" }, { type: "push", force: "lease" }],
  [
    { type: "switch", target: "main" },
    { type: "pull" },
    { type: "merge", target: FEATURE, noFf: true },
    { type: "push" },
    { type: "deleteBranch", name: FEATURE },
  ],
  [
    write("app.js", "v1.2"),
    { type: "commit", all: true, message: "Tarih biçimi" },
    { type: "teammate", branch: "main", path: "README.md", content: "Takvim uygulaması (kurulum, SSS)", message: "SSS" },
    { type: "pull", rebase: true },
    { type: "push" },
  ],
  [],
  [],
  [],
];

/** The remote's branches drawn as a repo of their own, for the right-hand graph. */
export function remoteView(repo: Repo): Repo {
  const r = repo.remote!;
  return { ...createRepo(), commits: r.commits, branches: r.branches, tags: r.tags, head: { kind: "branch", name: "main" } };
}

/** Both sides: your clone on the left, the shared repo on GitHub on the right. */
function TwoSides({ repo, fresh, you, origin }: { repo: Repo; fresh: Set<string>; you: string; origin: string }) {
  return (
    <g>
      {/* No ghosts or messages here: two graphs share the stage, and the lesson is about where commits are. */}
      <GraphStage repo={repo} box={{ x: 0, y: 0, w: 450, h: 470 }} highlight={fresh} title={you} showGhosts={false} messages={false} />
      <line x1={452} y1={24} x2={452} y2={446} stroke="var(--line)" strokeWidth={2} strokeDasharray="6 6" />
      <GraphStage repo={remoteView(repo)} box={{ x: 454, y: 0, w: 406, h: 470 }} highlight={fresh} title={origin} hideHead showGhosts={false} messages={false} />
    </g>
  );
}

/** The try-it step: a fresh clone, and a teammate has already pushed something you have not fetched. */
export const SANDBOX: Repo = apply(START, {
  type: "teammate",
  branch: "main",
  path: "README.md",
  content: "Takvim uygulaması (kurulum)",
  message: "Kurulum notları",
}).state;

const edits = (history: GitAction[]) => history.filter((a) => a.type === "write").length;

function rows(repo: Repo, lang: "tr" | "en", history: GitAction[]): SandboxRow[] {
  const tr = lang === "tr";
  const branch = currentBranch(repo);
  const hasFeature = Boolean(repo.branches.feature);
  const st = status(repo);
  const upstream = branch ? (repo.upstream[branch] ?? `origin/${branch}`) : null;
  return [
    {
      label: "branch",
      buttons: [
        { label: "switch -c feature", action: { type: "switch", target: "feature", create: true }, tone: "go", disabled: hasFeature },
        { label: "branch feature", action: { type: "branch", name: "feature" }, disabled: hasFeature },
        { label: "switch main", action: { type: "switch", target: "main" }, disabled: branch === "main" },
      ],
    },
    {
      label: tr ? "Değişiklik" : "Change",
      buttons: [
        { label: tr ? "app.js'i düzenle" : "Edit app.js", action: write("app.js", `v${edits(history) + 2}`), tone: "producer" },
        { label: "commit -a", action: { type: "commit", all: true, message: tr ? "Küçük değişiklik" : "Small change" }, tone: "ok", disabled: st.unstaged.length === 0 },
      ],
    },
    {
      label: "origin",
      buttons: [
        { label: "pull --rebase", action: { type: "pull", rebase: true }, disabled: !upstream || !repo.tracking[upstream] },
        { label: "push", action: { type: "push" } },
        { label: "push -u", action: { type: "push", setUpstream: true }, disabled: Boolean(branch && repo.upstream[branch]) },
      ],
    },
    {
      label: tr ? "Düzelt" : "Fix",
      buttons: [{ label: "reset --hard origin/main", action: { type: "reset", target: "origin/main", mode: "hard" }, tone: "danger", disabled: branch !== "main" }],
    },
  ];
}

export const scene = makeGitScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Ekip çalışma düzeni: yerel repo ve GitHub'daki origin yan yana", "A team workflow: your local repo next to origin on GitHub"),
  view: (repo, info) => (
    <TwoSides repo={repo} fresh={info.fresh} you={info.t(l("Senin bilgisayarın", "Your computer"))} origin={info.t(l("origin (GitHub)", "origin (GitHub)"))} />
  ),
  metrics: (repo, t) => {
    const branch = currentBranch(repo);
    const local = branch ? repo.branches[branch] : undefined;
    const remote = branch ? repo.remote?.branches[branch] : undefined;
    return [
      { label: "HEAD", value: branch ?? "—" },
      {
        label: t(l("Uzakla aynı mı?", "Same as remote?")),
        value: !remote ? t(l("uzakta yok", "not on remote")) : remote === local ? t(l("evet", "yes")) : t(l("hayır", "no")),
        tone: remote && remote === local ? "ok" : "warn",
      },
      { label: t(l("Branch", "Branches")), value: Object.keys(repo.branches).length },
    ];
  },
  sandbox: { start: () => SANDBOX, rows, missions },
});
