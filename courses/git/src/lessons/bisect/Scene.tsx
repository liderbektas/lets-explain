import { l } from "@lets-explain/core/i18n";
import { ADA, createRepo, currentBranch, resolve, short, simulate, type GitAction, type Repo } from "../../engine/git";
import { GraphStage } from "../../iso/GraphStage";
import { makeGitScene } from "../shared/GitScene";
import { DATES, HISTORIES, passes, scenarios, type BugTest } from "./scenarios";

export { passes };

export const SLUG = "bisect";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const save = (path: string, content: string, message: string): GitAction[] => [write(path, content), { type: "add", paths: [path] }, { type: "commit", message }];

function build(actions: GitAction[]): Repo {
  const r = simulate(actions, createRepo({ author: ADA }));
  return r.states[r.states.length - 1]!;
}

/**
 * Eight commits since the last good release (tag v1.0). The fifth one quietly turned
 * `a + b` into `a - b`; nobody noticed until much later.
 */
export const START = build([
  ...save("math.js", "return a + b", "Toplama"),
  { type: "tag", name: "v1.0" },
  ...save("README.md", "Hesap makinesi", "README"),
  ...save("app.js", "ekran", "Ekran"),
  ...save("style.css", "renkler", "Renkler"),
  ...save("math.js", "return a - b", "math sadeleşti"),
  ...save("app.js", "ekran v2", "Ekran düzeni"),
  ...save("docs.md", "kullanım", "Belgeler"),
  ...save("style.css", "koyu tema", "Koyu tema"),
]);

/** The commit that introduced the bug, as a full id. */
export const CULPRIT = resolve(START, "HEAD~3")!;

/** The test the reader runs at each step: does math.js still add? */
export const LESSON_TEST = { path: "math.js", good: "a + b" };

export const steps: GitAction[][] = [
  [],
  [],
  [{ type: "bisectStart", bad: "HEAD", good: "v1.0" }],
  [{ type: "bisectMark", verdict: "bad" }],
  [{ type: "bisectMark", verdict: "good" }],
  [{ type: "bisectMark", verdict: "good" }],
  [{ type: "bisectReset" }],
  [{ type: "revert", target: CULPRIT }],
  [],
  [],
];

/** The test that goes with a history: the lesson's, or the scenario whose history it is (matched by the first commit). */
function testFor(repo: Repo): BugTest {
  const root = (r: Repo) => Object.values(r.commits).find((c) => c.parents.length === 0)?.id;
  const mine = root(repo);
  return HISTORIES.find((h) => root(h.repo) === mine)?.test ?? LESSON_TEST;
}

const metrics = (repo: Repo, t: (x: { tr: string; en: string }) => string, test: BugTest) => {
  const b = repo.bisect;
  const ok = passes(repo, test);
  return [
    { label: t(l(`Test (${test.path})`, `Test (${test.path})`)), value: ok ? t(l("geçti", "passes")) : t(l("kaldı", "fails")), tone: ok ? ("ok" as const) : ("danger" as const) },
    {
      label: t(l("Aday", "Candidates")),
      value: b ? (b.found ? t(l(`bulundu: ${short(b.found)}`, `found: ${short(b.found)}`)) : b.hi - b.lo + 1) : "—",
      tone: b?.found ? ("ok" as const) : ("plain" as const),
    },
    { label: "HEAD", value: currentBranch(repo) ?? short(repo.head.kind === "detached" ? repo.head.id : "") },
  ];
};

/** While bisecting, the commits still in the running glow; afterwards, whatever is new. */
function lit(repo: Repo, fresh: Set<string>): Set<string> {
  const b = repo.bisect;
  if (!b) return fresh;
  if (b.found) return new Set([b.found]);
  return new Set(b.range.slice(b.lo, b.hi + 1));
}

export const scene = makeGitScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("git bisect: hatayı getiren commit'i ikiye bölerek bul", "git bisect: find the commit that broke things by halving"),
  view: (repo, info) => <GraphStage repo={repo} highlight={lit(repo, info.fresh)} />,
  metrics: (repo, t) => metrics(repo, t, testFor(repo)),
  // Free play uses the broken-dates history; each scenario brings its own.
  sandbox: { start: () => DATES, scenarios },
});
