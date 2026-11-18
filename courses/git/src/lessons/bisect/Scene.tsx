import { l } from "@lets-explain/core/i18n";
import { ADA, createRepo, currentBranch, resolve, short, simulate, type GitAction, type Repo } from "../../engine/git";
import { GraphStage } from "../../iso/GraphStage";
import { makeGitScene, type SandboxRow } from "../shared/GitScene";
import { missions } from "./missions";

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

/**
 * The try-it history is different, so the answer is not known in advance: the date format
 * broke in one of these commits.
 */
export const SANDBOX = build([
  ...save("format.js", "tarih: GG.AA.YYYY", "Tarih biçimi"),
  { type: "tag", name: "v1.0" },
  ...save("api.js", "istek", "API"),
  ...save("format.js", "tarih: AA/GG/YYYY", "format düzeni"),
  ...save("README.md", "Takvim", "README"),
  ...save("api.js", "istek v2", "API v2"),
  ...save("logo.svg", "logo", "Logo"),
  ...save("README.md", "Takvim v2", "README v2"),
  ...save("api.js", "istek v3", "Önbellek"),
]);

export const SANDBOX_CULPRIT = resolve(SANDBOX, "HEAD~5")!;
export const SANDBOX_TEST = { path: "format.js", good: "GG.AA" };

/** Does the checked-out code pass the test? */
export const passes = (repo: Repo, test: { path: string; good: string }) => (repo.work[test.path] ?? "").includes(test.good);

/** The commit bisect found during these moves, if it found one. */
export function foundIn(history: GitAction[]): string | null {
  const r = simulate(history, SANDBOX);
  let found: string | null = null;
  for (const e of r.events.flat()) if (e.type === "bisectFound") found = e.id;
  return found;
}

function rows(repo: Repo, lang: "tr" | "en", history: GitAction[]): SandboxRow[] {
  const tr = lang === "tr";
  const b = repo.bisect;
  const found = foundIn(history);
  const reverted = history.some((a) => a.type === "revert");
  return [
    {
      label: "bisect",
      buttons: [
        { label: "start", action: { type: "bisectStart", bad: "HEAD", good: "v1.0" }, tone: "go", disabled: Boolean(b) || reverted },
        { label: tr ? "good (geçti)" : "good (passes)", action: { type: "bisectMark", verdict: "good" }, tone: "ok", disabled: !b || Boolean(b.found) },
        { label: tr ? "bad (kaldı)" : "bad (fails)", action: { type: "bisectMark", verdict: "bad" }, tone: "danger", disabled: !b || Boolean(b.found) },
        { label: "reset", action: { type: "bisectReset" }, disabled: !b },
      ],
    },
    {
      label: tr ? "Düzelt" : "Fix",
      buttons: [
        {
          label: found ? `revert ${short(found)}` : "revert",
          action: { type: "revert", target: found ?? "HEAD" },
          tone: "producer",
          disabled: !found || Boolean(b) || reverted || currentBranch(repo) !== "main",
        },
      ],
    },
  ];
}

const metrics = (repo: Repo, t: (x: { tr: string; en: string }) => string, test: { path: string; good: string }) => {
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
  metrics: (repo, t, info) => metrics(repo, t, info.sandbox ? SANDBOX_TEST : LESSON_TEST),
  sandbox: { start: () => SANDBOX, rows, missions },
});
