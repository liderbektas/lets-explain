import { l } from "@lets-explain/core/i18n";
import { ADA, createRepo, firstParents, headId, reachable, resolve, simulate, status, type GitAction, type Repo } from "../../engine/git";
import { GraphStage } from "../../iso/GraphStage";
import { makeGitScene, type SandboxRow } from "../shared/GitScene";
import { missions } from "./missions";
import { WherePanel } from "./WherePanel";

export const SLUG = "reset-and-revert";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const add = (...paths: string[]): GitAction => ({ type: "add", paths });
const commit = (message: string): GitAction => ({ type: "commit", message });

/** main: Başlangıç — Menü eklendi — Renkler değişti — Hatalı deneme. */
export const START: Repo = simulate(
  [
    write("README.md", "Merhaba"),
    write("app.js", "v1"),
    add("README.md", "app.js"),
    commit("Başlangıç"),
    write("menu.js", "menü"),
    add("menu.js"),
    commit("Menü eklendi"),
    write("style.css", "mavi"),
    add("style.css"),
    commit("Renkler değişti"),
    write("app.js", "bozuk"),
    add("app.js"),
    commit("Hatalı deneme"),
  ],
  createRepo({ author: ADA }),
).states[13]!;

export const steps: GitAction[][] = [
  [],
  [{ type: "reset", target: "HEAD~1", mode: "soft" }],
  [write("app.js", "düzgün"), add("app.js"), commit("Deneme, düzgün")],
  [{ type: "reset", target: "HEAD~1", mode: "mixed" }],
  [{ type: "reset", target: "HEAD", mode: "hard" }],
  [{ type: "revert", target: "HEAD" }],
  [],
  [],
  [],
];

function rows(repo: Repo, lang: "tr" | "en"): SandboxRow[] {
  const tr = lang === "tr";
  const st = status(repo);
  const hasParent = Boolean(resolve(repo, "HEAD~1"));
  return [
    {
      label: "reset",
      buttons: [
        { label: "--soft HEAD~1", action: { type: "reset", target: "HEAD~1", mode: "soft" }, disabled: !hasParent },
        { label: "--mixed HEAD~1", action: { type: "reset", target: "HEAD~1", mode: "mixed" }, disabled: !hasParent },
        { label: "--hard HEAD~1", action: { type: "reset", target: "HEAD~1", mode: "hard" }, tone: "danger", disabled: !hasParent },
      ],
    },
    {
      label: "revert",
      buttons: ["HEAD", "HEAD~1", "HEAD~2"].map((target) => ({
        label: target,
        action: { type: "revert", target } as GitAction,
        tone: "ok" as const,
        disabled: !st.clean || !resolve(repo, target) || !repo.commits[resolve(repo, target)!]!.parents.length,
      })),
    },
    {
      label: tr ? "Çalışma" : "Work",
      buttons: [
        { label: tr ? "app.js'i düzelt" : "Fix app.js", action: write("app.js", "düzgün"), tone: "producer", disabled: repo.work["app.js"] === "düzgün" },
        { label: "add .", action: { type: "add", paths: "." }, disabled: st.unstaged.length === 0 && st.untracked.length === 0 },
        { label: "commit", action: commit("Düzeltme"), tone: "ok", disabled: st.staged.length === 0 },
      ],
    },
  ];
}

export const scene = makeGitScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("reset branch'i geri taşır, revert geri alan yeni bir commit ekler", "reset moves the branch back; revert adds a new undo commit"),
  view: (repo, info) => (
    <g>
      <GraphStage repo={repo} highlight={info.fresh} box={{ x: 0, y: 0, w: 860, h: 398 }} />
      <WherePanel
        repo={repo}
        y={398}
        labels={{
          title: info.t(l("Değişiklikler nerede?", "Where are the changes?")),
          work: info.t(l("Klasörde (add edilmemiş)", "In the folder (not added)")),
          index: info.t(l("Staging'de", "Staged")),
          clean: info.t(l("boş", "empty")),
        }}
      />
    </g>
  ),
  metrics: (repo, t) => {
    const ghosts = Object.keys(repo.commits).filter((c) => !reachable(repo).has(c)).length;
    return [
      { label: t(l("main'deki commit", "Commits on main")), value: firstParents(repo, headId(repo)).length },
      { label: "app.js", value: repo.work["app.js"] ?? "—", tone: repo.work["app.js"] === "bozuk" ? "danger" : "plain" },
      { label: t(l("Hiçbir branch'te değil", "On no branch")), value: ghosts, tone: ghosts ? "warn" : "plain" },
    ];
  },
  sandbox: { start: () => START, rows, missions },
});
