import { l } from "@lets-explain/core/i18n";
import { ADA, createRepo, firstParents, headId, reachable, simulate, type GitAction, type Repo } from "../../engine/git";
import { MetroStage } from "../../iso/MetroStage";
import { makeGitScene, timeWords } from "../shared/GitScene";
import { scenarios } from "./scenarios";
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

export const scene = makeGitScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("reset branch'i geri taşır, revert geri alan yeni bir commit ekler", "reset moves the branch back; revert adds a new undo commit"),
  view: (repo, info) => (
    <g>
      <MetroStage repo={repo} highlight={info.fresh} lanes={3} box={{ x: 0, y: 0, w: 860, h: 398 }} time={timeWords(info.t)} t={info.t} />
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
  // Free play starts from the lesson's four commits; each scenario brings its own state.
  sandbox: { start: () => START, scenarios },
});
