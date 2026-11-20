import type { Scenario } from "@lets-explain/core/course/types";
import { typeLines } from "@lets-explain/core/components/TypedSandbox";
import { out, type TermLine } from "@lets-explain/core/lib/terminal";
import { parse } from "yaml";
import { fail, miniShell, repoOf, say, type MiniRepo, type Step } from "../shared/miniRepo";
import type { TypedSim } from "../shared/SimScene";
import { applyLp, BAD_SHA, freshLp, GOOD_SHA, lpYaml, type LP, type LpAction, type LpEvent, type Perms } from "./model";

/**
 * The least-privilege lesson typed: the workflow is a real file, `permissions:` blocks and the
 * action's `@ref` are read from it when it is pushed, and each push runs it against the lesson's
 * model (which code the lint action runs, what the token lets that code do).
 */

export const CI = ".github/workflows/ci.yml";
export const DEPENDABOT = ".github/dependabot.yml";

export interface LpDesk {
  lp: LP;
  repo: MiniRepo;
  /** Why GitHub refused the last pushed workflow, if it did. */
  invalid: string | null;
}

export type LpDeskAction = { type: "repo"; repo: MiniRepo } | { type: "lp"; action: LpAction } | { type: "invalid"; why: string | null };

export interface LpDeskCtx {
  start: LpDesk;
  state: LpDesk;
  actions: LpDeskAction[];
  events: LpEvent[][];
  states: LpDesk[];
}

export type LpScenario = Scenario<LpDeskCtx, LpDesk>;

export function applyLpDesk(d: LpDesk, a: LpDeskAction): { state: LpDesk; events: LpEvent[] } {
  if (a.type === "repo") return { state: { ...d, repo: a.repo }, events: [] };
  if (a.type === "invalid") return { state: { ...d, invalid: a.why }, events: [] };
  const r = applyLp(d.lp, a.action);
  return { state: { ...d, lp: r.state }, events: r.events };
}

export function replayLp(start: LpDesk, actions: LpDeskAction[]) {
  const states = [start];
  const events: LpEvent[][] = [];
  let d = start;
  for (const a of actions) {
    const r = applyLpDesk(d, a);
    d = r.state;
    states.push(d);
    events.push(r.events);
  }
  return { states, events };
}

/** A desk whose workflow file says what the model's settings say. `extra` adds files. */
export function lpDesk(lp: LP, extra: Record<string, string> = {}): LpDesk {
  return { lp, repo: repoOf({ [CI]: lpYaml(lp, true), "src/app.ts": 'export const hello = () => "shop";', ...extra }), invalid: null };
}

/* ------------------------------------------------------------- reading */

type Scope = { contents: string; packages: string };

function scopeOf(p: unknown): Scope {
  if (p === undefined || p === null) return { contents: "write", packages: "write" };
  if (p === "write-all") return { contents: "write", packages: "write" };
  if (p === "read-all") return { contents: "read", packages: "read" };
  if (typeof p === "object") {
    const m = p as Record<string, string>;
    return { contents: m.contents ?? "none", packages: m.packages ?? "none" };
  }
  return { contents: "none", packages: "none" };
}

/** The settings a workflow file asks for, as the model knows them; a string when it cannot be read. */
export function readLpWorkflow(text: string): { perms: Perms; pinned: boolean } | string {
  let js: Record<string, unknown>;
  try {
    js = parse(text) as Record<string, unknown>;
  } catch (e) {
    const line = /line (\d+)/.exec(String(e))?.[1] ?? "1";
    return `Invalid workflow file: ${CI}#L${line}\nYou have an error in your yaml syntax on line ${line}`;
  }
  const jobs = (js?.jobs ?? {}) as Record<string, Record<string, unknown>>;
  if (!jobs.lint || !jobs.publish) return `${CI}: this sandbox runs the lesson's two jobs, \`lint\` and \`publish\`; keep both`;
  for (const p of [js.permissions, jobs.lint.permissions, jobs.publish.permissions]) {
    if (typeof p === "string" && !["write-all", "read-all"].includes(p)) return `Invalid workflow file: ${CI}\nThe workflow is not valid. Unexpected value '${p}'`;
  }
  const lint = scopeOf(jobs.lint.permissions ?? js.permissions);
  const publish = scopeOf(jobs.publish.permissions ?? js.permissions);
  const steps = (jobs.lint.steps ?? []) as { uses?: string }[];
  const uses = steps.map((s) => s?.uses ?? "").find((u) => u.startsWith("acme/lint-action"));
  if (!uses) return `${CI}: this sandbox expects the lint job to use acme/lint-action`;
  const ref = uses.split("@")[1] ?? "";
  if (ref !== "v1" && ref !== GOOD_SHA) {
    if (/^[0-9a-f]{7,39}$/.test(ref)) return `Error: Unable to resolve action \`${uses}\`, unable to find version \`${ref}\`\n(GitHub needs the full 40-character SHA to pin an action)`;
    if (ref === BAD_SHA) return `${CI}: (in this sandbox, pin to the reviewed v1.4.2 commit)`;
    return `${CI}: (in this sandbox the action is used as @v1 or pinned to a full commit SHA)`;
  }
  const lintWrites = lint.contents === "write" || lint.packages === "write";
  const publishes = publish.packages === "write";
  if (lintWrites && !publishes) return `${CI}: (this sandbox cannot run a lint job that writes while publish cannot)`;
  const perms: Perms = lintWrites ? "write-all" : publishes ? "per-job" : "read-all";
  return { perms, pinned: ref === GOOD_SHA };
}

/* ------------------------------------------------------------- the shell */

const runLines = (lp: LP): TermLine[] => {
  const r = lp.runs.at(-1);
  if (!r) return [];
  const bad = r.attack && (r.attack.repo || r.attack.registry);
  return [out(`→ GitHub Actions: CI #${r.id} ran (gh run view ${r.id} for details)`, bad ? "del" : r.publish === "denied" ? "hl" : "dim")];
};

function runView(lp: LP, id: number | undefined, log: boolean): Step<LpDeskAction, LpDesk> {
  const r = id === undefined ? lp.runs.at(-1) : lp.runs.find((x) => x.id === id);
  if (!r) return fail(id === undefined ? "no runs found" : `could not find any workflow run with ID ${id}`);
  const ref = r.pinned ? GOOD_SHA : "v1";
  const lintOk = !(r.attack && (r.attack.repo || r.attack.registry));
  const o: TermLine[] = [out(`${r.publish === "pushed" && lintOk ? "✓" : "X"} main CI · ${r.id}`, r.publish === "pushed" && lintOk ? "add" : "del"), out("Triggered via push"), out(""), out("JOBS")];
  o.push(out(`✓ lint`, "add"), out(`${r.publish === "pushed" ? "✓" : "X"} publish`, r.publish === "pushed" ? "add" : "del"));
  if (log) {
    o.push(out(""), out(`lint\tRun acme/lint-action@${ref}`), out("lint\tLinting 42 files… no problems found"));
    if (r.attack) {
      o.push(out(`lint\t$ git push https://x-access-token:***@github.com/ada/shop HEAD:main`, "dim"));
      o.push(r.attack.repo ? out("lint\t   9c1e2f0..6e6f7a8  HEAD -> main", "del") : out("lint\tremote: Permission to ada/shop.git denied to github-actions[bot].  (403)", "add"));
      o.push(out(`lint\t$ docker push ghcr.io/ada/shop:latest`, "dim"));
      o.push(r.attack.registry ? out("lint\tlatest: digest: sha256:6e6f… size: 1570", "del") : out("lint\tdenied: installation not allowed to Write organization package", "add"));
    }
    o.push(r.publish === "pushed" ? out("publish\tpushing ghcr.io/ada/shop:sha-…  done", "add") : out("publish\tERROR: failed to push ghcr.io/ada/shop: denied: installation not allowed to Write organization package", "err"));
  }
  return { actions: [], output: o };
}

function extra(d: LpDesk, words: string[]): Step<LpDeskAction, LpDesk> | null {
  const [cmd, sub, ...rest] = words;
  if (cmd === "git" && sub === "ls-remote") {
    const url = rest.find((a) => !a.startsWith("-"));
    if (!url || !/acme\/lint-action(\.git)?$/.test(url)) return say("(in this sandbox: git ls-remote https://github.com/acme/lint-action [refs/tags/<tag>])", "dim");
    const tags: [string, string][] = [
      [d.lp.tagMoved ? BAD_SHA : GOOD_SHA, "refs/tags/v1"],
      [GOOD_SHA, "refs/tags/v1.4.2"],
    ];
    const want = rest.filter((a) => a.startsWith("refs/"));
    const shown = want.length ? tags.filter(([, r]) => want.includes(r)) : tags;
    return say(shown.map(([sha, r]) => `${sha}\t${r}`).join("\n"));
  }
  if (cmd === "gh") {
    if (sub === "run" && rest[0] === "list") {
      if (!d.lp.runs.length) return say("no runs found");
      return {
        actions: [],
        output: [
          out("STATUS  TITLE         WORKFLOW  BRANCH  EVENT  ID", "dim"),
          ...[...d.lp.runs].reverse().map((r) => {
            const ok = r.publish === "pushed" && !(r.attack && (r.attack.repo || r.attack.registry));
            return out(`${ok ? "✓" : "X"}       push          CI        main    push   ${r.id}`, ok ? "add" : "del");
          }),
        ],
      };
    }
    if (sub === "run" && rest[0] === "view") {
      const id = rest.slice(1).find((a) => /^\d+$/.test(a));
      return runView(d.lp, id ? Number(id) : undefined, rest.includes("--log") || rest.includes("--log-failed"));
    }
    return say(`(gh ${sub ?? ""} ${rest[0] ?? ""} is not in this lesson's sandbox: gh run list, gh run view [--log])`.replace(/\s+\)/, ")"), "dim");
  }
  return null;
}

export const lpShell = miniShell<LpDeskAction, LpDesk>({
  repo: (d) => d.repo,
  setRepo: (repo) => ({ type: "repo", repo }),
  apply: (d, a) => applyLpDesk(d, a).state,
  extra,
  words: ["gh", "--log", CI, "https://github.com/acme/lint-action", "refs/tags/v1.4.2"],
  help: `This sandbox understands:
  nano ${CI}     edit the workflow
  cat, ls, echo > f, rm               read and write files
  git status/add/commit/push/diff     a push runs the workflow on GitHub
  git ls-remote https://github.com/acme/lint-action refs/tags/v1.4.2
  gh run list, gh run view [<id>] [--log]
  clear`,
  push: (d, pushed, paths) => {
    const actions: LpDeskAction[] = [];
    const output: TermLine[] = [];
    void paths;
    const read = readLpWorkflow(pushed.remote[CI] ?? "");
    if (typeof read === "string") {
      actions.push({ type: "invalid", why: read });
      output.push(...read.split("\n").map((t) => out(t, "err")));
      return { actions, output };
    }
    if (d.invalid) actions.push({ type: "invalid", why: null });
    if (read.perms !== d.lp.perms) actions.push({ type: "lp", action: { type: "setPerms", perms: read.perms } });
    if (read.pinned !== d.lp.pinned) actions.push({ type: "lp", action: { type: "pin", pinned: read.pinned } });
    actions.push({ type: "lp", action: { type: "push" } });
    let lp = d.lp;
    for (const a of actions) if (a.type === "lp") lp = applyLp(lp, a.action).state;
    output.push(...runLines(lp));
    return { actions, output };
  },
});

/** Types lines into a least-privilege scenario, saving editors with `edits`. */
export function typeIntoLp(start: LpDesk, typed: string[], edits: ((t: string) => string)[] = []) {
  const r = typeLines(lpShell, (d, as) => replayLp(d, as).states.at(-1)!, start, typed, edits);
  const run = replayLp(start, r.actions);
  const ctx: LpDeskCtx = { start, state: run.states.at(-1)!, actions: r.actions, events: run.events, states: run.states };
  return { ctx, moves: r.moves, output: r.output };
}

/** The typed try-it step for the scene. */
export function lpTyped(scenarios: LpScenario[]): TypedSim<LP, LpEvent, LpDesk, LpDeskAction, LpDeskCtx> {
  return {
    scenarios,
    freeStart: () => lpDesk(freshLp({ tagMoved: true })),
    shell: lpShell,
    replay: replayLp,
    project: (d) => d.lp,
    context: (start, actions, r) => ({ start, state: r.states.at(-1)!, actions, events: r.events, states: r.states }),
  };
}
