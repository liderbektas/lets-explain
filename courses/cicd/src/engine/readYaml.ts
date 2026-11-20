import { isMap, isPair, isScalar, isSeq, LineCounter, parseDocument, type Document, type Node, type Pair } from "yaml";
import type { Cond, Filter, JobDef, StepDef, StepKind, Workflow } from "./ci";
import { filterName } from "./yaml";

/**
 * Reads a workflow file the way GitHub does, into the course's model. It is the inverse of
 * `workflowYaml`: what the reader types in the terminal's editor becomes the workflow that
 * runs. Mistakes GitHub would reject come back with GitHub's own wording and line numbers;
 * things GitHub accepts but this model cannot run say so plainly instead of being ignored.
 */

export interface YamlProblem {
  line: number;
  col: number;
  message: string;
  /** "github": GitHub rejects the file. "sandbox": valid YAML for GitHub, but not in this model. */
  kind: "github" | "sandbox";
}

export type ReadResult = { ok: true; workflow: Workflow } | { ok: false; problems: YamlProblem[] };

/** GitHub's error, as the Actions page shows it for an invalid workflow file. */
export function problemText(file: string, p: YamlProblem): string {
  if (p.kind === "sandbox") return `${file}#L${p.line}: ${p.message}`;
  if (p.message.startsWith("You have an error in your yaml syntax")) return `Invalid workflow file: ${file}#L${p.line}\n${p.message}`;
  return `Invalid workflow file: ${file}#L${p.line}\nThe workflow is not valid. ${file} (Line: ${p.line}, Col: ${p.col}): ${p.message}`;
}

/** The commands this model can run in a `run:` step, for the "not in this sandbox" message. */
export const KNOWN_RUN = [
  "npm ci",
  "npm run lint",
  "npx tsc --noEmit",
  "npm test",
  "npm run e2e",
  "npm run build",
  "npm publish",
  "./deploy.sh <env> [<version>] [--previous]",
  "curl --fail https://<env>.shop.example/health",
  './notify.sh "<text>"',
  'echo "<text>" >> "$GITHUB_STEP_SUMMARY"',
  'echo "<name>=<value>" >> "$GITHUB_OUTPUT"',
  'echo "token: $SECRET"',
];

const TOP = ["name", "run-name", "on", "permissions", "concurrency", "env", "defaults", "jobs"];
const JOB = ["name", "needs", "if", "runs-on", "environment", "timeout-minutes", "strategy", "steps", "outputs", "uses", "with", "secrets", "permissions", "env", "concurrency", "continue-on-error", "defaults", "container", "services"];
const STEP = ["name", "id", "uses", "run", "with", "env", "if", "continue-on-error", "timeout-minutes", "shell", "working-directory"];
const EVENTS = ["push", "pull_request", "schedule", "workflow_dispatch", "workflow_call"];

export function readWorkflow(text: string, file = ".github/workflows/ci.yml"): ReadResult {
  const counter = new LineCounter();
  const doc = parseDocument(text, { lineCounter: counter, prettyErrors: false });
  const problems: YamlProblem[] = [];
  if (doc.errors.length) {
    const e = doc.errors[0]!;
    const { line, col } = counter.linePos(e.pos[0]);
    return { ok: false, problems: [{ line, col, message: `You have an error in your yaml syntax on line ${line}`, kind: "github" }] };
  }
  const at = (node: Node | Pair | null | undefined) => {
    const range = isPair(node) ? (node.key as Node | undefined)?.range : (node as Node | undefined)?.range;
    return range ? counter.linePos(range[0]) : { line: 1, col: 1 };
  };
  const github = (node: Node | Pair | null | undefined, message: string) => problems.push({ ...at(node), message, kind: "github" });
  const sandbox = (node: Node | Pair | null | undefined, message: string) => problems.push({ ...at(node), message, kind: "sandbox" });

  const root = doc.contents;
  if (!isMap(root)) return { ok: false, problems: [{ line: 1, col: 1, message: "Required property is missing: jobs", kind: "github" }] };
  const pairOf = (map: unknown, key: string): Pair | undefined => (isMap(map) ? (map.items.find((p) => isScalar(p.key) && p.key.value === key) as Pair | undefined) : undefined);
  for (const p of root.items) {
    const k = isScalar(p.key) ? String(p.key.value) : "";
    if (!TOP.includes(k)) github(p, `Unexpected value '${k}'`);
  }

  const js = toJs(doc);
  const wf: Workflow = { name: typeof js.name === "string" ? js.name : file.replace(/^.*\//, ""), on: {}, jobs: [] };

  // on:
  const onPair = pairOf(root, "on");
  if (!onPair) github(root, "Required property is missing: on");
  else {
    const on = js.on;
    const events: Record<string, unknown> = typeof on === "string" ? { [on]: null } : Array.isArray(on) ? Object.fromEntries(on.map((e) => [String(e), null])) : ((on as Record<string, unknown>) ?? {});
    for (const [ev, body] of Object.entries(events)) {
      const evPair = pairOf(onPair.value, ev) ?? onPair;
      if (!EVENTS.includes(ev)) {
        if (["pull_request_target", "release", "issues", "workflow_run", "merge_group", "repository_dispatch"].includes(ev)) sandbox(evPair, `the '${ev}' event is not in this sandbox`);
        else github(evPair, `Unexpected value '${ev}'`);
        continue;
      }
      if (ev === "push" || ev === "pull_request") {
        const f = readFilter(body, evPair, github, sandbox, pairOf);
        if (f) wf.on[ev] = f;
      } else if (ev === "schedule") {
        const cron = Array.isArray(body) ? (body[0] as { cron?: string } | undefined)?.cron : undefined;
        if (!cron) github(evPair, "Required property is missing: cron");
        else wf.on.schedule = cron;
      } else if (ev === "workflow_dispatch") {
        const inputs = (body as { inputs?: Record<string, unknown> } | null)?.inputs;
        wf.on.dispatch = inputs ? Object.keys(inputs) : [];
      } else if (ev === "workflow_call") {
        // A reusable workflow: it only runs when another workflow calls it.
        wf.on = {};
      }
    }
  }

  // permissions:
  if (js.permissions !== undefined) {
    const p = js.permissions;
    const values = typeof p === "string" ? [p] : Object.values((p as Record<string, string>) ?? {});
    wf.permissions = values.some((v) => String(v).includes("write")) ? "write" : "read";
  }

  // concurrency:
  if (js.concurrency !== undefined) {
    const c = js.concurrency as { group?: string; "cancel-in-progress"?: boolean } | string;
    if (typeof c === "object" && c["cancel-in-progress"] === true) wf.concurrency = true;
    else sandbox(pairOf(root, "concurrency"), "this sandbox models concurrency with `cancel-in-progress: true` only");
  }

  // jobs:
  const jobsPair = pairOf(root, "jobs");
  if (!jobsPair) github(root, "Required property is missing: jobs");
  const jobs = (js.jobs ?? {}) as Record<string, Record<string, unknown>>;
  const filterGlobs: Record<string, string> = {};
  for (const [id, body] of Object.entries(jobs)) {
    const jobPair = pairOf(jobsPair?.value, id);
    const jobMap = jobPair?.value;
    if (!body || typeof body !== "object") {
      github(jobPair, "Required property is missing: runs-on");
      continue;
    }
    for (const k of Object.keys(body)) if (!JOB.includes(k)) github(pairOf(jobMap, k), `Unexpected value '${k}'`);
    const job: JobDef = { id, steps: [] };
    const needs = body.needs;
    if (needs !== undefined) job.needs = Array.isArray(needs) ? needs.map(String) : [String(needs)];
    if (typeof body.uses === "string") {
      job.uses = body.uses;
      if (body.with && typeof body.with === "object") job.inputs = Object.fromEntries(Object.entries(body.with as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
    } else {
      if (body["runs-on"] === undefined) github(jobPair, "Required property is missing: runs-on");
      if (!Array.isArray(body.steps)) github(jobPair, "Required property is missing: steps");
    }
    if (body.environment !== undefined) job.environment = typeof body.environment === "string" ? body.environment : String((body.environment as { name?: string }).name);
    if (body["timeout-minutes"] !== undefined) job.timeout = Number(body["timeout-minutes"]);
    const strategy = body.strategy as { matrix?: Record<string, unknown>; "fail-fast"?: boolean } | undefined;
    if (strategy) {
      const m = strategy.matrix ?? {};
      const keys = Object.keys(m);
      const values = keys.length === 1 ? m[keys[0]!] : undefined;
      if (!Array.isArray(values) || values.some((v) => !Number.isFinite(Number(v)))) sandbox(pairOf(jobMap, "strategy"), "this sandbox runs a matrix over node versions only, e.g. `node: [20, 22]`");
      else job.matrix = values.map(Number);
      if (strategy["fail-fast"] === false) job.failFast = false;
    }
    const steps = Array.isArray(body.steps) ? (body.steps as Record<string, unknown>[]) : [];
    const stepsNode = pairOf(jobMap, "steps")?.value;
    steps.forEach((s, i) => {
      const node = isSeq(stepsNode) ? (stepsNode.items[i] as Node) : jobPair;
      if (!s || typeof s !== "object") {
        github(node, "A step must have a 'uses' or a 'run'");
        return;
      }
      for (const k of Object.keys(s)) if (!STEP.includes(k)) github(pairOf(node, k) ?? node, `Unexpected value '${k}'`);
      if (s.uses === undefined && s.run === undefined) {
        github(node, "A step must have a 'uses' or a 'run'");
        return;
      }
      const step = readStep(s, (m) => sandbox(node, m));
      if (!step) return;
      if (step.kind === "publish") readPublishToken(step, s.env, body.env);
      if (step.kind === "changes") for (const g of (step.with?.filters ?? "").split(",")) if (g) filterGlobs[filterName(g)] = g;
      job.steps.push(step);
    });
    wf.jobs.push(job);
  }

  // Conditions are read last: `needs.changes.outputs.src` needs the filters' globs.
  for (const [id, body] of Object.entries(jobs)) {
    const job = wf.jobs.find((j) => j.id === id);
    if (!job || !body) continue;
    const jobPair = pairOf(jobsPair?.value, id);
    if (body.if !== undefined) {
      const c = readCond(String(body.if), filterGlobs);
      if (c) job.if = c;
      else sandbox(pairOf(jobPair?.value, "if"), `this sandbox does not understand the condition \`${body.if}\``);
    }
    const steps = Array.isArray(body.steps) ? (body.steps as Record<string, unknown>[]) : [];
    const kept = steps.filter((s) => s && typeof s === "object" && (s.uses !== undefined || s.run !== undefined));
    kept.forEach((s, i) => {
      const step = job.steps[i];
      if (!step || s.if === undefined) return;
      const c = readCond(String(s.if), filterGlobs);
      if (c) step.if = c;
      else sandbox(jobPair, `this sandbox does not understand the step condition \`${s.if}\``);
    });
    for (const n of job.needs ?? []) if (!jobs[n]) github(pairOf(jobPair?.value, "needs"), `Job '${id}' depends on unknown job '${n}'.`);
  }

  if (problems.length) return { ok: false, problems: problems.sort((a, b) => a.line - b.line || a.col - b.col) };
  return { ok: true, workflow: wf };
}

function toJs(doc: Document): Record<string, unknown> {
  const js = doc.toJS({ maxAliasCount: 10 }) as Record<string, unknown> | null;
  // YAML 1.1 reads a bare `on` key as `true`; GitHub (and this reader) treats it as the word.
  if (js && "true" in js && !("on" in js)) {
    js.on = js.true;
    delete js.true;
  }
  return js ?? {};
}

function readFilter(
  body: unknown,
  pair: Pair,
  github: (n: Node | Pair | null | undefined, m: string) => void,
  sandbox: (n: Node | Pair | null | undefined, m: string) => void,
  pairOf: (map: unknown, key: string) => Pair | undefined,
): Filter | null {
  if (body === null || body === undefined) return {};
  if (typeof body !== "object") {
    github(pair, `Unexpected value '${String(body)}'`);
    return null;
  }
  const f: Filter = {};
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : [String(v)]);
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (k === "branches") f.branches = list(v);
    else if (k === "paths") f.paths = list(v);
    else if (k === "paths-ignore") f.pathsIgnore = list(v);
    else if (["branches-ignore", "tags", "tags-ignore", "types"].includes(k)) sandbox(pairOf(pair.value, k), `\`${k}\` is not in this sandbox`);
    else github(pairOf(pair.value, k), `Unexpected value '${k}'`);
  }
  if (f.paths && f.pathsIgnore) github(pair, "you may only define one of `paths` and `paths-ignore` for a single event");
  return f;
}

const strip = (s: string) =>
  s
    .trim()
    .replace(/^\$\{\{\s*([\s\S]*?)\s*\}\}$/, "$1")
    .replace(/"/g, "'")
    .replace(/\s+/g, " ");

/** An `if:` expression back to the model's condition, or null when the model has no such condition. */
export function readCond(expr: string, filters: Record<string, string> = {}): Cond | null {
  const e = strip(expr);
  const table: Record<string, Cond> = {
    "success()": "success",
    "failure()": "failure",
    "always()": "always",
    "github.ref == 'refs/heads/main' && github.event_name == 'push'": "main",
    "github.event_name == 'push' && github.ref == 'refs/heads/main'": "main",
    "github.ref == 'refs/heads/main'": "main",
    "github.ref_name == 'main'": "main",
    "github.event_name == 'push'": "push",
    "steps.cache.outputs.cache-hit != 'true'": "cache-miss",
    "github.event.pull_request.head.repo.fork != true": "not-fork",
    "github.event.pull_request.head.repo.fork == false": "not-fork",
    "!github.event.pull_request.head.repo.fork": "not-fork",
  };
  if (table[e]) return table[e]!;
  const m = /^(?:needs\.changes|steps\.filter)\.outputs\.([\w-]+) == 'true'$/.exec(e);
  if (m) return `changed:${filters[m[1]!] ?? `${m[1]}/**`}`;
  return null;
}

const runOf = (v: unknown) => String(v ?? "").trim().replace(/\s+/g, " ");
const inputOf = (v: string) => {
  const m = /^\$\{\{\s*inputs\.([\w-]+)\s*\}\}$/.exec(v);
  return m ? `input:${m[1]}` : v;
};

/** One step back to the model; null (with a sandbox note) when the model cannot run it. */
function readStep(s: Record<string, unknown>, note: (m: string) => void): StepDef | null {
  const step = (kind: StepKind, w?: Record<string, string>): StepDef => {
    const out: StepDef = { kind };
    if (typeof s.name === "string") out.name = s.name;
    if (w && Object.keys(w).length) out.with = w;
    if (s["continue-on-error"] === true) out.continueOnError = true;
    return out;
  };
  const w = (s.with ?? {}) as Record<string, unknown>;
  if (typeof s.uses === "string") {
    const action = s.uses.replace(/@.*$/, "");
    switch (action) {
      case "actions/checkout":
        return step("checkout");
      case "actions/setup-node": {
        const v = String(w["node-version"] ?? "22");
        const out: Record<string, string> = /matrix\./.test(v) || v === "22" ? {} : { node: v };
        if (w.cache !== undefined) {
          if (String(w.cache) === "npm") out.cache = "npm";
          else note(`setup-node's \`cache: ${String(w.cache)}\` is not in this sandbox; it uses npm (\`cache: npm\`)`);
        }
        return step("setup-node", Object.keys(out).length ? out : undefined);
      }
      case "actions/cache": {
        const path = String(w.path ?? "~/.npm");
        const key = String(w.key ?? "");
        const out: Record<string, string> = {};
        if (path === "node_modules") out.path = "node_modules";
        if (/github\.(sha|run_id|run_number)/.test(key)) out.key = "sha";
        else if (!key.includes("hashFiles")) out.key = "static";
        return step("cache", out);
      }
      case "actions/upload-artifact":
        return step("upload");
      case "actions/download-artifact":
        return step("download");
      // GitHub Pages: the build's site goes up as the Pages artifact for the deploy job.
      case "actions/upload-pages-artifact":
        return step("upload");
      case "dorny/paths-filter": {
        const globs = String(w.filters ?? "")
          .split("\n")
          .map((l) => /^\s*-\s*['"]?([^'"]+)['"]?\s*$/.exec(l)?.[1])
          .filter((x): x is string => Boolean(x));
        return step("changes", globs.length && globs.join(",") !== "src/**" ? { filters: globs.join(",") } : undefined);
      }
      case "docker/build-push-action":
        return step("docker-push");
      default:
        note(`the action \`${s.uses}\` is not in this sandbox`);
        return null;
    }
  }
  const cmd = runOf(s.run);
  if (cmd === "npm ci" || cmd === "npm install" || cmd === "npm i") return step("install");
  if (cmd === "npm run lint") return step("lint");
  if (cmd === "npx tsc --noEmit" || cmd === "npm run typecheck") return step("typecheck");
  if (cmd === "npm test" || cmd === "npm run test" || cmd === "npm t") return step("test");
  if (cmd === "npm run e2e") return step("e2e");
  if (cmd === "npm run build") return step("build");
  if (cmd === "npm publish") return step("publish");
  let m = /^\.\/deploy\.sh (\$\{\{ inputs\.[\w-]+ \}\}|\S+) --previous$/.exec(cmd);
  if (m) return step("rollback", envWith(m[1]!));
  m = /^\.\/deploy\.sh (\$\{\{ inputs\.[\w-]+ \}\}|\S+)(?: (\$\{\{ inputs\.[\w-]+ \}\}|sha-\$\{\{ github\.sha \}\}|\S+))?$/.exec(cmd);
  if (m) {
    const out = envWith(m[1]!);
    if (m[2]) {
      out.from = "registry";
      if (m[2].startsWith("${{ inputs.")) out.version = inputOf(m[2]);
    }
    return step("deploy", out);
  }
  m = /^curl (?:--fail|-f)\b.*https?:\/\/(\$\{\{ inputs\.[\w-]+ \}\}|[\w-]+)\.shop\.example\/health$/.exec(cmd);
  if (m) return step("smoke", envWith(m[1]!));
  m = /^\.\/notify\.sh "(.*)"$/.exec(cmd);
  if (m) return step("notify", m[1] === "${{ github.workflow }} failed on ${{ github.ref_name }}" ? undefined : { text: m[1]! });
  m = /^echo "(.*)" >> "?\$GITHUB_STEP_SUMMARY"?$/.exec(cmd);
  if (m) return step("summary", m[1] === "### Tests: 128 passed" ? undefined : { text: m[1]! });
  m = /^echo "([\w-]+)=(.*)" >> "?\$GITHUB_OUTPUT"?$/.exec(cmd);
  if (m) {
    const out: Record<string, string> = {};
    if (m[1] !== "version") out.name = m[1]!;
    if (m[2] !== "sha-${GITHUB_SHA::7}") out.value = m[2]!;
    return step("output", out);
  }
  m = /^echo "token: \$([A-Z_][A-Z0-9_]*)"$/.exec(cmd);
  if (m) return step("print-secret", m[1] === "NPM_TOKEN" ? undefined : { secret: m[1]! });
  note(`this sandbox cannot run \`${cmd}\`. It runs: ${KNOWN_RUN.join(", ")}`);
  return null;
}

/**
 * Where `npm publish` gets NODE_AUTH_TOKEN: the step's env, else the job's. A secret keeps the
 * model's default (NPM_TOKEN) or names another; a value typed into the file is kept as it is
 * (it works, and it leaks); no env at all leaves npm without a token.
 */
function readPublishToken(step: StepDef, stepEnv: unknown, jobEnv: unknown) {
  const pick = (env: unknown) => (env && typeof env === "object" ? (env as Record<string, unknown>).NODE_AUTH_TOKEN : undefined);
  const raw = pick(stepEnv) ?? pick(jobEnv);
  const put = (k: string, v: string) => (step.with = { ...(step.with ?? {}), [k]: v });
  if (raw === undefined || raw === null) return put("token", "");
  const m = /^\$\{\{\s*secrets\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}$/.exec(String(raw).trim());
  if (!m) return put("token", String(raw));
  if (m[1] !== "NPM_TOKEN") put("secret", m[1]!);
}

function envWith(raw: string): Record<string, string> {
  const env = inputOf(raw);
  return env === "staging" ? {} : { env };
}
