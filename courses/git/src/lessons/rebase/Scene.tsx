import { l } from "@lets-explain/core/i18n";
import { ADA, ancestors, createRepo, currentBranch, headId, isAncestor, reachable, simulate, type GitAction, type Repo } from "../../engine/git";
import { GraphStage } from "../../iso/GraphStage";
import { FilePanel } from "../conflicts/FilePanel";
import { panelLabels } from "../conflicts/Scene";
import { makeGitScene, type SandboxRow } from "../shared/GitScene";
import { missions } from "./missions";

export const SLUG = "rebase";
export const STYLE = "style.css";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const add = (...paths: string[]): GitAction => ({ type: "add", paths });
const commit = (message: string): GitAction => ({ type: "commit", message });
const sw = (target: string, create = false): GitAction => ({ type: "switch", target, create });

/** A blog: main gained an About page while feature built a post list and search. */
const blog: GitAction[] = [
  write("README.md", "Blog"),
  add("README.md"),
  commit("Proje başladı"),
  sw("feature", true),
  write("posts.md", "Yazılar"),
  add("posts.md"),
  commit("Yazı listesi"),
  write("search.js", "ara()"),
  add("search.js"),
  commit("Arama"),
  sw("main"),
  write("about.md", "Biz kimiz"),
  add("about.md"),
  commit("Hakkında sayfası"),
  sw("feature"),
];

const last = (actions: GitAction[], from = createRepo({ author: ADA })) => {
  const r = simulate(actions, from);
  return r.states[r.states.length - 1]!;
};

export const START: Repo = last(blog);

export const steps: GitAction[][] = [
  [],
  [{ type: "rebase", onto: "main" }],
  [sw("main"), { type: "merge", target: "feature" }, { type: "deleteBranch", name: "feature" }],
  [],
  [sw("theme", true), write(STYLE, "renk: mavi"), add(STYLE), commit("Mavi tema"), sw("main"), write(STYLE, "renk: kırmızı"), add(STYLE), commit("Kırmızı tema")],
  [sw("theme"), { type: "rebase", onto: "main" }],
  [{ type: "resolve", path: STYLE, take: "theirs" }, add(STYLE), { type: "continue" }],
  [],
  [],
];

/**
 * The try-it step: the same blog, plus a `theme` branch that picked blue while main went
 * red, so one rebase is smooth and the other stops on a conflict.
 */
export const SANDBOX: Repo = last([
  ...blog.slice(0, 3),
  sw("theme", true),
  write(STYLE, "renk: mavi"),
  add(STYLE),
  commit("Mavi tema"),
  sw("main"),
  ...blog.slice(3, 10),
  sw("main"),
  write("about.md", "Biz kimiz"),
  write(STYLE, "renk: kırmızı"),
  add("about.md", STYLE),
  commit("Hakkında ve kırmızı tema"),
  sw("feature"),
]);

function rows(repo: Repo, lang: "tr" | "en"): SandboxRow[] {
  const tr = lang === "tr";
  const here = currentBranch(repo);
  const op = repo.op;
  const rebasing = op?.kind === "rebase";
  const head = headId(repo);
  const mainTip = repo.branches.main!;
  const conflicted = op?.conflicts ?? [];
  const marked = conflicted.includes(STYLE) && (repo.work[STYLE] ?? "").includes("<<<<<<< ");
  const merged = (b: string) => Boolean(head && repo.branches[b] && isAncestor(repo, repo.branches[b]!, head));
  return [
    {
      label: "switch",
      buttons: ["main", "feature", "theme"].map((b) => ({ label: b, action: sw(b), disabled: Boolean(op) || here === b })),
    },
    {
      label: "rebase",
      buttons: [
        { label: "rebase main", action: { type: "rebase", onto: "main" }, tone: "producer", disabled: Boolean(op) || here === "main" || !head || isAncestor(repo, mainTip, head) },
        { label: "--continue", action: { type: "continue" }, tone: "ok", disabled: !rebasing || conflicted.length > 0 },
        { label: "--abort", action: { type: "abort" }, tone: "danger", disabled: !rebasing },
      ],
    },
    {
      label: "merge",
      buttons: ["feature", "theme"].map((b) => ({ label: `merge ${b}`, action: { type: "merge", target: b }, disabled: Boolean(op) || here !== "main" || merged(b) })),
    },
    {
      label: STYLE,
      buttons: [
        { label: tr ? "main'inki" : "main's", action: { type: "resolve", path: STYLE, take: "ours" }, disabled: !marked },
        { label: tr ? "theme'inki" : "theme's", action: { type: "resolve", path: STYLE, take: "theirs" }, disabled: !marked },
        { label: "add", action: add(STYLE), disabled: !conflicted.includes(STYLE) || marked },
      ],
    },
  ];
}

/**
 * Only the ghosts of the latest rebase: older ones would crowd the graph. The latest
 * "rebase (start)" line in the reflog remembers where the branch was before.
 */
export function withLatestRebaseGhosts(repo: Repo): Repo {
  const live = reachable(repo);
  const start = [...repo.reflog].reverse().find((e) => e.message.startsWith("rebase (start)"));
  const keep = new Set(live);
  if (start?.from) for (const c of ancestors(repo, start.from)) keep.add(c);
  return { ...repo, commits: Object.fromEntries(Object.entries(repo.commits).filter(([id]) => keep.has(id))) };
}

/** Merge commits anywhere in the history behind a commit. */
export function mergeCommitsBehind(repo: Repo, id: string | null | undefined): number {
  if (!id) return 0;
  return [...ancestors(repo, id)].filter((c) => repo.commits[c]!.parents.length > 1).length;
}

export const scene = makeGitScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Commit grafiği: rebase commit'lerin kopyalarını yeni bir tabanın üstüne dizer, eskileri yerinde kalır", "The commit graph: rebase lays copies of the commits on a new base; the originals stay where they were"),
  view: (repo, info) =>
    repo.op ? (
      <g>
        <GraphStage repo={withLatestRebaseGhosts(repo)} box={{ x: 0, y: 0, w: 520, h: 470 }} highlight={info.fresh} laneOrder={["main", "feature", "theme"]} />
        <FilePanel repo={repo} paths={[STYLE]} labels={panelLabels(info.t)} box={{ x: 526, y: 30, w: 318, h: 420 }} />
      </g>
    ) : (
      <GraphStage repo={withLatestRebaseGhosts(repo)} highlight={info.fresh} laneOrder={["main", "feature", "theme"]} />
    ),
  metrics: (repo, t) => {
    const ghosts = Object.keys(withLatestRebaseGhosts(repo).commits).length - reachable(repo).size;
    const merges = mergeCommitsBehind(repo, repo.branches.main);
    return [
      { label: t(l("Hayalet commit", "Ghost commits")), value: ghosts, tone: ghosts ? "warn" : "plain" },
      { label: t(l("main'de merge commit", "Merge commits on main")), value: merges },
      { label: t(l("Rebase sürüyor", "Rebase running")), value: repo.op?.kind === "rebase" ? t(l("evet", "yes")) : t(l("hayır", "no")), tone: repo.op ? "danger" : "plain" },
    ];
  },
  sandbox: { start: () => SANDBOX, rows: (repo, lang) => rows(repo, lang), missions },
});
