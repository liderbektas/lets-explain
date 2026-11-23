import { motion } from "motion/react";
import { l, type L } from "@lets-explain/core/i18n";
import { ADA, createRepo, currentBranch, resolve, short, simulate, type GitAction, type Repo } from "../../engine/git";
import { MetroStage, type MetroGeo, type StationMark } from "../../iso/MetroStage";
import { makeGitScene, timeWords } from "../shared/GitScene";
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

/**
 * What bisect knows so far, as plaques on the stations. The first bad commit lies in
 * range[lo..hi] (newest first): everything from range[lo] up is bad, everything below
 * range[hi] is good, down to the good commit bisect started from.
 */
function verdicts(repo: Repo, t: (x: L) => string): Map<string, StationMark> {
  const b = repo.bisect;
  const marks = new Map<string, StationMark>();
  if (!b) return marks;
  const bad: StationMark = { label: t(l("kötü", "bad")), tone: "bad" };
  const good: StationMark = { label: t(l("iyi", "good")), tone: "good" };
  b.range.forEach((c, i) => {
    if (i <= b.lo) marks.set(c, bad);
    else if (i > b.hi) marks.set(c, good);
  });
  const last = b.range[b.range.length - 1];
  const below = last ? repo.commits[last]!.parents[0] : undefined;
  if (below) marks.set(below, good);
  return marks;
}

/** A bracket over the commits still in the running; it closes in as answers come. */
function SearchRange({ repo, geo, t }: { repo: Repo; geo: MetroGeo; t: (x: L) => string }) {
  const b = repo.bisect;
  if (!b) return null;
  const ids = (b.found ? [b.found] : b.range.slice(b.lo, b.hi + 1)).filter((c) => geo.layout.pos.has(c));
  if (!ids.length) return null;
  const xs = ids.map((c) => geo.at(c)[0]);
  const x1 = Math.min(...xs) - geo.rx - 6;
  const x2 = Math.max(...xs) + geo.rx + 6;
  const y = geo.y0 - geo.H - geo.ry - 50;
  const n = b.found ? 1 : b.hi - b.lo + 1;
  const label = b.found ? t(l("ilk kötü commit", "first bad commit")) : t(l(`aday: ${n} commit`, `${n} candidates`));
  const spring = { type: "spring", stiffness: 140, damping: 22 } as const;
  return (
    <g className="bisect-range">
      <motion.path initial={false} animate={{ d: `M${x1} ${y + 12} V${y} H${x2} V${y + 12}` }} transition={spring} className="bisect-bracket" />
      <motion.text initial={false} animate={{ x: (x1 + x2) / 2 }} transition={spring} y={y - 9} textAnchor="middle" className="bisect-label">
        {label}
      </motion.text>
    </g>
  );
}

export const scene = makeGitScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("git bisect: hatayı getiren commit'i ikiye bölerek bul", "git bisect: find the commit that broke things by halving"),
  view: (repo, info) => (
    <MetroStage
      repo={repo}
      highlight={lit(repo, info.fresh)}
      marks={verdicts(repo, info.t)}
      overlay={(geo) => <SearchRange repo={repo} geo={geo} t={info.t} />}
      lanes={1}
      time={timeWords(info.t)}
      t={info.t}
    />
  ),
  metrics: (repo, t) => metrics(repo, t, testFor(repo)),
  // Free play uses the broken-dates history; each scenario brings its own.
  sandbox: { start: () => DATES, scenarios },
});
