import { l } from "@lets-explain/core/i18n";
import { ADA, createRepo, firstParents, headId, short, simulate, type GitAction, type Repo } from "../../engine/git";
import { MetroStage } from "../../iso/MetroStage";
import { lineSwatch, stationSwatch } from "../branches/parts";
import { makeGitScene, timeWords } from "../shared/GitScene";
import { CommitCard, type CardMode } from "./CommitCard";
import { scenarios, SHOP } from "./scenarios";

export const SLUG = "commits-and-history";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const addAll: GitAction = { type: "add", paths: "." };
const commit = (message: string): GitAction => ({ type: "commit", message });

/** One commit already made, so step 0 can look inside it. */
export const START: Repo = simulate([write("README.md", "Merhaba"), addAll, commit("İlk commit")], createRepo({ author: ADA })).states[3]!;

export const steps: GitAction[][] = [
  [],
  [write("app.js", "v1"), addAll, commit("app.js eklendi")],
  [write("README.md", "Merhaba dünya"), addAll, commit("README güncellendi"), write("app.js", "v2"), addAll, commit("app.js v2")],
  [],
  [{ type: "commit", amend: true, message: "app.js: sürüm 2" }],
  [],
  [],
  [],
];

/** Which `git show` / `git log` the terminal prints at each step. */
const CARDS: CardMode[] = [
  { kind: "show", rev: "HEAD" },
  { kind: "show", rev: "HEAD" },
  { kind: "log" },
  { kind: "show", rev: "HEAD~2" },
  { kind: "log" },
  { kind: "show", rev: "HEAD" },
  { kind: "show", rev: "HEAD" },
  { kind: "show", rev: "HEAD" },
];

export const scene = makeGitScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Commit grafiği ve yanında git show / git log çıktısı", "The commit graph with git show / git log output beside it"),
  view: (repo, info) => {
    const mode = info.sandbox ? CARDS[CARDS.length - 1]! : CARDS[info.step] ?? { kind: "show", rev: "HEAD" };
    // On the HEAD~2 step, glow the commit the terminal is talking about.
    const glow = info.step === 3 && !info.sandbox ? new Set(firstParents(repo, headId(repo)).slice(2, 3)) : info.fresh;
    return (
      <g>
        <MetroStage repo={repo} highlight={glow} lanes={2} box={{ x: 0, y: 0, w: 520, h: 470 }} time={timeWords(info.t)} t={info.t} />
        <CommitCard repo={repo} mode={mode} x={528} y={24} w={318} h={420} />
      </g>
    );
  },
  metrics: (repo, t) => {
    const head = headId(repo);
    return [
      { label: t(l("Geçmişteki commit", "Commits in history")), value: firstParents(repo, head).length },
      { label: "HEAD", value: head ? short(head) : "—" },
      {
        label: t(l("Parent", "Parent")),
        value: head && repo.commits[head]!.parents[0] ? short(repo.commits[head]!.parents[0]!) : t(l("yok", "none")),
      },
    ];
  },
  legend: (t) => [
    {
      swatch: stationSwatch(),
      label: t(l("istasyon = commit (üstünde kısa kimlik)", "station = commit (short id on top)")),
    },
    {
      swatch: lineSwatch(),
      label: t(l("hat = parent bağlantısı", "line = parent link")),
    },
    {
      swatch: stationSwatch("var(--paper-2)", "var(--line)", true),
      label: t(l("soluk = artık hiçbir branch'te değil", "faded = on no branch any more")),
    },
  ],
  // Free play starts from a two-commit shop project; each scenario brings its own state.
  sandbox: { start: () => SHOP, scenarios },
});
