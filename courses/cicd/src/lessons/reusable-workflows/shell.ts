import type { Scenario } from "@lets-explain/core/course/types";
import { typeLines } from "@lets-explain/core/components/TypedSandbox";
import { out, type TermLine } from "@lets-explain/core/lib/terminal";
import { parse } from "yaml";
import { changedPaths, fail, miniShell, repoOf, say, type Files, type MiniRepo, type Step } from "../shared/miniRepo";
import type { TypedSim } from "../shared/SimScene";
import { compositeYaml, FILE, freshRw, nodeOf, PLACES, testYaml, wfYaml, WFS, type Block, type RW, type RwEvent, type Wf } from "./model";

/**
 * The reusable-workflows lesson typed: the three workflows, `test.yml` and the composite
 * action are real files. When they are pushed, GitHub's view of them (which setup each workflow
 * really uses, which Node, who calls test.yml) is read back into the lesson's model; a push to
 * main runs ci.yml, `gh workflow run` runs the others.
 */

export interface RwDesk {
  rw: RW;
  repo: MiniRepo;
  /** Why GitHub refused the last push's workflows, if it did. */
  invalid: string | null;
}

export type RwDeskAction = { type: "repo"; repo: MiniRepo } | { type: "rw"; rw: RW; events: RwEvent[] } | { type: "invalid"; why: string | null };

export interface RwDeskCtx {
  start: RwDesk;
  state: RwDesk;
  actions: RwDeskAction[];
  events: RwEvent[][];
  states: RwDesk[];
}

export type RwScenario = Scenario<RwDeskCtx, RwDesk>;

export function applyRwDesk(d: RwDesk, a: RwDeskAction): { state: RwDesk; events: RwEvent[] } {
  if (a.type === "repo") return { state: { ...d, repo: a.repo }, events: [] };
  if (a.type === "invalid") return { state: { ...d, invalid: a.why }, events: [] };
  return { state: { ...d, rw: a.rw }, events: a.events };
}

export function replayRw(start: RwDesk, actions: RwDeskAction[]) {
  const states = [start];
  const events: RwEvent[][] = [];
  let d = start;
  for (const a of actions) {
    const r = applyRwDesk(d, a);
    d = r.state;
    states.push(d);
    events.push(r.events);
  }
  return { states, events };
}

/* ------------------------------------------------------------- files */

const HEAD: Record<Wf, string> = {
  ci: "name: CI\non:\n  push:\n    branches: [main]\n  pull_request:\n  workflow_dispatch:\n\n",
  release: "name: Release\non:\n  push:\n    tags: ['v*']\n  workflow_dispatch:\n\n",
  nightly: "name: Nightly\non:\n  schedule:\n    - cron: '0 3 * * *'\n  workflow_dispatch:\n\n",
};

/** A workflow's whole file, as it would sit in the repo for this model state. */
export function wfFile(s: RW, wf: Wf): string {
  return HEAD[wf] + wfYaml(s, wf).replace("    # npm publish ...", "    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm publish");
}

/** Every file the model state implies. */
export function filesOf(s: RW): Files {
  const f: Files = { "package.json": '{ "name": "shop", "scripts": { "lint": "eslint .", "test": "vitest run", "e2e": "playwright test" } }' };
  for (const wf of WFS) f[FILE[wf]] = wfFile(s, wf);
  if (s.places.test.exists) f[FILE.test] = `name: Test\n${testYaml(s)}`;
  if (s.composite.exists) f[FILE.composite] = compositeYaml(s);
  return f;
}

export const rwDesk = (rw: RW, files: Files = filesOf(rw), invalid: string | null = null): RwDesk => ({ rw, repo: repoOf(files), invalid });

/* ------------------------------------------------------------- reading */

const load = (text: string): Record<string, unknown> | string => {
  try {
    const js = (parse(text) ?? {}) as Record<string, unknown>;
    if ("true" in js && !("on" in js)) js.on = js.true;
    return js;
  } catch (e) {
    return String(/line (\d+)/.exec(String(e))?.[1] ?? "1");
  }
};

const lineOf = (text: string, needle: string) => Math.max(1, text.split("\n").findIndex((l) => l.includes(needle)) + 1);
const LOCAL_ACTION = "./.github/actions/setup";
const LOCAL_TEST = "./.github/workflows/test.yml";

/** How a job's steps set Node up: through the composite action, or inline with this version. */
function setupOf(file: string, text: string, steps: unknown): Block | string {
  const list = (Array.isArray(steps) ? steps : []) as { uses?: string; with?: Record<string, unknown> }[];
  const local = list.find((x) => typeof x?.uses === "string" && x.uses.replace(/\/$/, "") === LOCAL_ACTION);
  if (local) {
    if (local.with && "node-version" in local.with) return `${file}#L${lineOf(text, "node-version")}: (this sandbox reads the Node version from action.yml's default; leave out \`with: node-version\`)`;
    return { exists: true, setup: "composite", node: 20 };
  }
  const node = list.find((x) => typeof x?.uses === "string" && x.uses.startsWith("actions/setup-node"));
  // Without setup-node a job gets the runner's own Node, 20 on ubuntu-latest.
  const v = Number(String(node?.with?.["node-version"] ?? "20").replace(/\.x$/, ""));
  if (!Number.isFinite(v)) return `${file}#L${lineOf(text, "node-version")}: (this sandbox reads a plain version number, e.g. node-version: 22)`;
  return { exists: true, setup: "inline", node: v };
}

/** GitHub's view of the pushed files, as the lesson's model; a string when GitHub refuses them. */
export function readRw(files: Files, prev: RW): RW | string {
  const rw: RW = freshRw();
  rw.edits = prev.edits;
  // The composite action.
  const actionText = files[FILE.composite];
  if (actionText !== undefined) {
    const js = load(actionText);
    if (typeof js === "string") return `Error: ${FILE.composite}: You have an error in your yaml syntax on line ${js}`;
    const runs = js.runs as { using?: string; steps?: { uses?: string; with?: Record<string, unknown> }[] } | undefined;
    if (runs?.using !== "composite") return `Error: ${FILE.composite}: this sandbox's local action is a composite action (runs: using: composite)`;
    const setup = (runs.steps ?? []).find((x) => String(x?.uses ?? "").startsWith("actions/setup-node"));
    const raw = String(setup?.with?.["node-version"] ?? "20");
    const input = /^\$\{\{\s*inputs\.([\w-]+)\s*\}\}$/.exec(raw);
    const value = input ? String(((js.inputs as Record<string, { default?: unknown }> | undefined)?.[input[1]!]?.default) ?? "") : raw;
    const node = Number(value);
    if (!Number.isFinite(node) || !value) return `Error: ${FILE.composite}: (this sandbox reads the Node version from setup-node's node-version or the input's default)`;
    rw.composite = { exists: true, node };
  }
  // test.yml, the reusable workflow.
  const testText = files[FILE.test];
  let callable = false;
  if (testText !== undefined) {
    const js = load(testText);
    if (typeof js === "string") return `Invalid workflow file: ${FILE.test}#L${js}\nYou have an error in your yaml syntax on line ${js}`;
    const on = js.on;
    callable = typeof on === "string" ? on === "workflow_call" : Array.isArray(on) ? on.includes("workflow_call") : Boolean(on && typeof on === "object" && "workflow_call" in (on as object));
    const job = (js.jobs as Record<string, { steps?: unknown }> | undefined)?.test;
    if (!job) return `${FILE.test}: (this sandbox expects the shared job to be called \`test\`)`;
    const b = setupOf(FILE.test, testText, job.steps);
    if (typeof b === "string") return b;
    rw.places.test = b;
  }
  // The three workflows.
  for (const wf of WFS) {
    const text = files[FILE[wf]];
    if (text === undefined) return `${FILE[wf]}: (this lesson keeps its three workflows; don't delete ${FILE[wf]})`;
    const js = load(text);
    if (typeof js === "string") return `Invalid workflow file: ${FILE[wf]}#L${js}\nYou have an error in your yaml syntax on line ${js}`;
    const id = wf === "nightly" ? "e2e" : "test";
    const job = (js.jobs as Record<string, { uses?: string; steps?: unknown; "runs-on"?: unknown }> | undefined)?.[id];
    if (!job) return `${FILE[wf]}: (this sandbox expects the \`${id}\` job)`;
    if (typeof job.uses === "string") {
      const line = lineOf(text, "uses: ./.github/workflows");
      if (job.uses !== LOCAL_TEST) return `Invalid workflow file: ${FILE[wf]}#L${line}\nerror parsing called workflow "${FILE[wf]}" -> "${job.uses}" : failed to fetch workflow: workflow was not found.`;
      if (wf === "nightly") return `${FILE[wf]}: (in this lesson nightly keeps its own e2e job)`;
      if (testText === undefined) return `Invalid workflow file: ${FILE[wf]}#L${line}\nerror parsing called workflow "${FILE[wf]}" -> "${LOCAL_TEST}" : failed to fetch workflow: workflow was not found.`;
      if (!callable) return `Invalid workflow file: ${FILE[wf]}#L${line}\nerror parsing called workflow "${FILE[wf]}" -> "${LOCAL_TEST}" (source branch with sha:a41c2e9) : workflow is not reusable as it is missing a \`on.workflow_call\` trigger`;
      rw.calls[wf] = true;
      rw.places[wf] = { exists: false, setup: "inline", node: 20 };
      continue;
    }
    if (job["runs-on"] === undefined) return `Invalid workflow file: ${FILE[wf]}#L${lineOf(text, `${id}:`)}\nThe workflow is not valid. ${FILE[wf]} (Line: ${lineOf(text, `${id}:`)}, Col: 3): Required property is missing: runs-on`;
    const b = setupOf(FILE[wf], text, job.steps);
    if (typeof b === "string") return b;
    rw.places[wf] = b;
  }
  // A workflow that uses the local action needs action.yml to be there.
  for (const p of PLACES) {
    if (rw.places[p].exists && rw.places[p].setup === "composite" && !rw.composite.exists)
      return `Error: Can't find 'action.yml', 'action.yaml' or 'Dockerfile' under '/home/runner/work/shop/shop/.github/actions/setup'. Did you forget to run actions/checkout before running your local action?`;
  }
  return rw;
}

/** What changed between two model states, as the lesson's events. */
function eventsBetween(a: RW, b: RW): RwEvent[] {
  const ev: RwEvent[] = [];
  if (!a.composite.exists && b.composite.exists) ev.push({ type: "created", file: FILE.composite });
  if (!a.places.test.exists && b.places.test.exists) ev.push({ type: "created", file: FILE.test });
  for (const p of PLACES) {
    const x = a.places[p];
    const y = b.places[p];
    if (x.exists && y.exists && x.setup !== y.setup && y.setup === "composite") ev.push({ type: "edited", file: FILE[p], what: "composite" });
    if (y.exists && y.setup === "inline" && (x.node !== y.node || x.setup !== "inline")) ev.push({ type: "edited", file: FILE[p], what: "node", node: y.node });
  }
  if (a.composite.exists && b.composite.exists && a.composite.node !== b.composite.node) ev.push({ type: "edited", file: FILE.composite, what: "node", node: b.composite.node });
  for (const wf of ["ci", "release"] as const) if (!a.calls[wf] && b.calls[wf]) ev.push({ type: "edited", file: FILE[wf], what: "call" });
  return ev;
}

const ran = (rw: RW, wf: Wf): RwEvent => ({ type: "ran", wf, node: nodeOf(rw, wf), via: wf !== "nightly" && rw.calls[wf] ? "test.yml" : undefined });

/* ------------------------------------------------------------- the shell */

function extra(d: RwDesk, words: string[]): Step<RwDeskAction, RwDesk> | null {
  const [cmd, sub, ...rest] = words;
  if (cmd !== "gh") return null;
  if (sub === "workflow" && rest[0] === "run") {
    const id = rest[1];
    const wf = WFS.find((w) => id === w || id === `${w}.yml` || id === FILE[w] || id?.toLowerCase() === w);
    if (!id) return fail("workflow ID, name, or filename required");
    if (id === "test.yml" || id === FILE.test) return fail(`could not create workflow dispatch event: HTTP 422: Workflow does not have 'workflow_dispatch' trigger`);
    if (!wf) return fail(`could not find any workflows named ${id}`);
    if (d.invalid) return fail(`could not create workflow dispatch event: HTTP 422: the workflow file on GitHub is invalid (see the last git push)`);
    return { actions: [{ type: "rw", rw: d.rw, events: [ran(d.rw, wf)] }], output: [out(`✓ Created workflow_dispatch event for ${wf}.yml at main`, "add")] };
  }
  if (sub === "workflow" && rest[0] === "list") return say(WFS.map((wf) => `${wf === "ci" ? "CI     " : wf === "release" ? "Release" : "Nightly"}  active  ${FILE[wf]}`).join("\n"));
  return say("(in this lesson's sandbox: gh workflow run <file>, gh workflow list)", "dim");
}

export const rwShell = miniShell<RwDeskAction, RwDesk>({
  repo: (d) => d.repo,
  setRepo: (repo) => ({ type: "repo", repo }),
  apply: (d, a) => applyRwDesk(d, a).state,
  extra,
  words: ["gh", ...Object.values(FILE)],
  help: `This sandbox understands:
  nano <file>                          edit a workflow or the composite action
  cat, ls, echo > f, rm, mkdir -p     read and write files
  git status/add/commit/push/diff     a push to main runs ci.yml
  gh workflow run release.yml          run another workflow by hand
  clear`,
  push: (d, pushed, paths) => {
    const read = readRw(pushed.remote, d.rw);
    if (typeof read === "string") return { actions: [{ type: "invalid", why: read }], output: read.split("\n").map((t) => out(t, "err")) };
    read.edits = d.rw.edits + paths.filter((p) => p.startsWith(".github/")).length;
    const events = [...eventsBetween(d.rw, read), ran(read, "ci")];
    const actions: RwDeskAction[] = [];
    if (d.invalid) actions.push({ type: "invalid", why: null });
    actions.push({ type: "rw", rw: read, events });
    const lines: TermLine[] = [out(`→ GitHub Actions: CI ran on Node ${nodeOf(read, "ci")}${read.calls.ci ? " (its test job from test.yml)" : ""}`, "dim")];
    return { actions, output: lines };
  },
});

/** Types lines into a reusable-workflows scenario, saving editors with `edits`. */
export function typeIntoRw(start: RwDesk, typed: string[], edits: ((t: string) => string)[] = []) {
  const r = typeLines(rwShell, (d, as) => replayRw(d, as).states.at(-1)!, start, typed, edits);
  const run = replayRw(start, r.actions);
  const ctx: RwDeskCtx = { start, state: run.states.at(-1)!, actions: r.actions, events: run.events, states: run.states };
  return { ctx, moves: r.moves, output: r.output };
}

export function rwTyped(scenarios: RwScenario[]): TypedSim<RW, RwEvent, RwDesk, RwDeskAction, RwDeskCtx> {
  return {
    scenarios,
    freeStart: () => rwDesk(freshRw()),
    shell: rwShell,
    replay: replayRw,
    project: (d) => d.rw,
    context: (start, actions, r) => ({ start, state: r.states.at(-1)!, actions, events: r.events, states: r.states }),
  };
}

/** Files that changed on GitHub since the start. */
export const pushedChanges = (ctx: RwDeskCtx) => changedPaths(ctx.start.repo.remote, ctx.state.repo.remote);
