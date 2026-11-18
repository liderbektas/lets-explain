import { l } from "@lets-explain/core/i18n";
import { ADA, createRepo, firstParents, headId, short, simulate, status, type GitAction, type Repo } from "../../engine/git";
import { GraphStage } from "../../iso/GraphStage";
import { makeGitScene, type SandboxRow } from "../shared/GitScene";
import { CommitCard, type CardMode } from "./CommitCard";
import { missions } from "./missions";

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

/** The sandbox starts from two commits. */
const sandboxStart = (): Repo =>
  simulate(
    [write("README.md", "Merhaba"), write("app.js", "v1"), addAll, commit("Başlangıç"), write("app.js", "v2"), addAll, commit("app.js v2")],
    createRepo({ author: ADA }),
  ).states[7]!;

const edits = (history: GitAction[], path: string) => history.filter((a) => a.type === "write" && a.path === path).length;

function rows(repo: Repo, lang: "tr" | "en", history: GitAction[]): SandboxRow[] {
  const tr = lang === "tr";
  const st = status(repo);
  const pending = st.unstaged.length + st.untracked.length > 0;
  const staged = st.staged.length > 0;
  return [
    {
      label: tr ? "Dosyalar" : "Files",
      buttons: [
        { label: tr ? "README.md'yi düzenle" : "Edit README.md", action: write("README.md", `Merhaba v${edits(history, "README.md") + 2}`), tone: "producer" },
        { label: tr ? "app.js'i düzenle" : "Edit app.js", action: write("app.js", `v${edits(history, "app.js") + 3}`), tone: "producer" },
      ],
    },
    {
      label: tr ? "Kaydet" : "Save",
      buttons: [
        { label: "add .", action: addAll, disabled: !pending },
        { label: "commit", action: commit(`Commit ${Object.keys(repo.commits).length + 1}`), tone: "ok", disabled: !staged },
        { label: "commit --amend", action: { type: "commit", amend: true }, disabled: !staged },
      ],
    },
  ];
}

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
        <GraphStage repo={repo} highlight={glow} box={{ x: 0, y: 0, w: 520, h: 470 }} />
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
      swatch: <rect x={-7} y={-7} width={14} height={12} rx={2} className="ink" style={{ fill: "var(--sun)" }} />,
      label: t(l("commit (üstünde kısa kimlik)", "commit (short id on top)")),
    },
    {
      swatch: <path d="M-10 0h20" stroke="var(--ink)" strokeWidth={3} />,
      label: t(l("çizgi = parent bağlantısı", "line = parent link")),
    },
    {
      swatch: <rect x={-7} y={-7} width={14} height={12} rx={2} style={{ fill: "#f4efe6", stroke: "var(--ink-3)", strokeDasharray: "3 2" }} />,
      label: t(l("soluk = artık hiçbir branch'te değil", "faded = on no branch any more")),
    },
  ],
  sandbox: { start: sandboxStart, rows, missions },
});
