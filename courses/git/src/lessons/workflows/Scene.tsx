import { l } from "@lets-explain/core/i18n";
import { createRepo, currentBranch, type GitAction, type Repo } from "../../engine/git";
import { GraphStage } from "../../iso/GraphStage";
import { placeIn } from "../remotes/TwoRepos";
import { makeGitScene } from "../shared/GitScene";
import { SANDBOX, scenarios, START } from "./scenarios";

export const SLUG = "workflows";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });

export { SANDBOX, START };

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
  const remote = remoteView(repo);
  const mine = { x: 0, y: 0, w: 450, h: 470 };
  const theirs = { x: 454, y: 0, w: 406, h: 470 };
  return (
    <g>
      {/* No ghosts or messages here: two graphs share the stage, and the lesson is about where commits are. */}
      <GraphStage repo={repo} box={mine} highlight={fresh} title={you} showGhosts={false} messages={false} arrivals={placeIn(remote, theirs, { showGhosts: false, messages: false })} />
      <line x1={452} y1={24} x2={452} y2={446} stroke="var(--line)" strokeWidth={2} strokeDasharray="6 6" />
      <GraphStage repo={remote} box={theirs} highlight={fresh} title={origin} hideHead showGhosts={false} messages={false} arrivals={placeIn(repo, mine, { showGhosts: false, messages: false })} />
    </g>
  );
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
  // Free play: a fresh clone with Bora's unseen push; each scenario brings its own state.
  sandbox: { start: () => SANDBOX, scenarios },
});
