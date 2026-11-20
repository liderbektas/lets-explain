/**
 * A small, deterministic model of a CI/CD system shaped like GitHub Actions.
 *
 * A repository gets pushes; each push (or pull request, schedule, manual dispatch) is checked
 * against every workflow's triggers and filters. A triggered workflow becomes a run: its jobs
 * are laid out by `needs`, each job starts on a fresh runner with an empty workspace, and each
 * step either works or fails depending on what the workspace holds (no code before checkout,
 * no node before setup-node, no node_modules before install) and on the bugs in the commit.
 *
 * Time is simulated: every step has a fixed duration, jobs that do not need each other run side
 * by side, and a run's length is its slowest path. Billing rounds each job up to whole minutes,
 * like GitHub does. Everything is a pure function of the actions taken, so the same moves
 * always give the same runs, logs and minutes.
 *
 * Simplifications (called out in the lessons): runs finish the moment they are triggered,
 * there are always enough runners, and step durations are round numbers.
 */

/* ------------------------------------------------------------------ repo */

/** Things that can be wrong in a commit. Each one breaks a specific step. */
export type Bug =
  | "lint" // an unused variable: `npm run lint` fails
  | "type" // a type error: `tsc --noEmit` fails
  | "test" // a real bug: `npm test` fails every time
  | "flaky" // a timing-dependent test: fails on odd attempts, passes on a re-run
  | "node20" // uses an API that Node 20 does not have: tests fail only on Node 20
  | "build" // a broken import: `npm run build` fails
  | "crash"; // builds and passes tests, but the server answers 500 once deployed

export interface Commit {
  sha: string;
  message: string;
  branch: string;
  /** Files this commit touched. */
  paths: string[];
  /** Every bug present in the tree after this commit. */
  bugs: Bug[];
  /** Version of package-lock.json: changes when dependencies change. */
  lock: number;
  /** 1-based count of commits so far; the app shows it as its version. */
  n: number;
}

export const SHAS = [
  "3f2a1c9", "8b1d24e", "c41e0a7", "5d9b3f2", "a07c6e1", "e2f81b4", "71c3d9a", "b8e04f6",
  "9a6d21c", "d34f7e8", "16be9a3", "f05c2d7", "4e7a1b9", "c9d36e2", "2b8f0d4", "e61a7c5",
  "0c5e9b8", "7f1d3a6", "a9b2e40", "5e0c8f1", "d7a4b19", "38f6e2c", "b1c9d05", "6a3e7f2",
];

/** The hash `hashFiles('package-lock.json')` would give for each lockfile version. */
export const LOCK_HASHES = ["4b1e9a", "9c2a07", "e7f03d", "2d58c1", "a61f4e", "53b9d2", "f80c6a", "1e47b3"];
export const lockHash = (lock: number) => LOCK_HASHES[lock % LOCK_HASHES.length]!;

/* -------------------------------------------------------------- workflows */

export type StepKind =
  | "checkout" // actions/checkout: puts the code on the runner
  | "setup-node" // actions/setup-node: installs node
  | "cache" // actions/cache: restores a folder by key, saves it after a successful job
  | "install" // npm ci: needs code and node, gives node_modules
  | "lint"
  | "typecheck"
  | "test"
  | "e2e" // slow browser tests
  | "build" // npm run build: gives dist/
  | "upload" // actions/upload-artifact: keeps dist/ for later jobs of the same run
  | "download" // actions/download-artifact: brings dist/ back
  | "changes" // dorny/paths-filter: says which parts of the repo changed
  | "docker-push" // builds an image and pushes it to the registry
  | "deploy" // ./deploy.sh: puts a build on an environment
  | "smoke" // curl --fail on the environment's health URL
  | "rollback" // ./deploy.sh --previous
  | "notify" // posts a message to chat
  | "summary" // writes to $GITHUB_STEP_SUMMARY
  | "output" // writes to $GITHUB_OUTPUT
  | "print-secret" // echoes a secret into the log (it comes out masked)
  | "publish" // npm publish: needs a token
  | "hang"; // a step that never finishes on its own (a stuck e2e run)

/**
 * When a step or job runs. GitHub's default is `success()`: only if nothing before it failed.
 * `changed:<glob>` is true when the run's changes touch a matching path.
 */
export type Cond = "success" | "failure" | "always" | "main" | "push" | "cache-miss" | "not-fork" | `changed:${string}`;

export interface StepDef {
  kind: StepKind;
  /** Shown instead of the default name, e.g. a composite action's steps. */
  name?: string;
  if?: Cond;
  continueOnError?: boolean;
  with?: Record<string, string>;
}

export interface JobDef {
  id: string;
  needs?: string[];
  if?: Cond;
  steps: StepDef[];
  /** Node versions to run the job on: one copy per value. */
  matrix?: number[];
  /** Default true: one failing matrix leg cancels the others. */
  failFast?: boolean;
  /** Minutes before the job is cancelled. GitHub's default is 360. */
  timeout?: number;
  /** The environment the job deploys to; approvals and secrets come from it. */
  environment?: string;
  /** Set when the job's steps come from a reusable workflow (`uses: ./.github/workflows/x.yml`). */
  uses?: string;
  /** Inputs passed to the reusable workflow, shown in the YAML. */
  inputs?: Record<string, string>;
}

export interface Filter {
  branches?: string[];
  paths?: string[];
  pathsIgnore?: string[];
}

export interface Workflow {
  name: string;
  on: { push?: Filter; pull_request?: Filter; schedule?: string; dispatch?: string[] };
  /** `concurrency: { group: wf-ref, cancel-in-progress: true }` */
  concurrency?: boolean;
  /** The GITHUB_TOKEN's permissions. GitHub's old default for many repos is write. */
  permissions?: "read" | "write";
  jobs: JobDef[];
}

/* ------------------------------------------------------------------ runs */

export type Status = "queued" | "waiting" | "success" | "failure" | "skipped" | "cancelled";
export type StepStatus = "success" | "failure" | "skipped" | "cancelled";

export interface StepRun {
  name: string;
  kind: StepKind;
  status: StepStatus;
  seconds: number;
  log: string[];
  exit?: number;
  /** Failed but `continue-on-error` let the job go on. */
  allowed?: boolean;
  /** A deploy or rollback that worked: which commit it left running on which environment. */
  delivered?: { env: string; sha: string };
}

export interface JobRun {
  /** Unique in the run: the job id, plus the node version for matrix legs. */
  key: string;
  id: string;
  /** `test (20)` for a matrix leg, otherwise the id. */
  label: string;
  node?: number;
  status: Status;
  start: number;
  end: number;
  steps: StepRun[];
  failedStep?: string;
  /** Why the job ended the way it did when no step explains it. */
  reason?: "timeout" | "fail-fast" | "concurrency" | "needs" | "if" | "approval";
  environment?: string;
  /** Job ids this job waits for. */
  needs: string[];
  outputs: Record<string, string>;
}

export type Trigger = "push" | "pull_request" | "schedule" | "dispatch";

export interface Run {
  id: number;
  workflow: string;
  event: Trigger;
  branch: string;
  sha: string;
  pr?: number;
  fork: boolean;
  attempt: number;
  start: number;
  end: number;
  status: Status;
  jobs: JobRun[];
  inputs: Record<string, string>;
  /** Environments a reviewer has approved for this run. */
  approved: string[];
  /** Lines written to $GITHUB_STEP_SUMMARY. */
  summary: string[];
  /** Billed minutes: every job rounded up to a whole minute. */
  minutes: number;
  /** Paths this run's changes touched, for path filters. */
  changed: string[];
  /** Started under `concurrency: cancel-in-progress`: it belongs to the group `workflow + branch`. */
  grouped: boolean;
}

/* ----------------------------------------------------------------- world */

export interface Env {
  name: string;
  /** A reviewer must approve before a job deploys here. */
  approval: boolean;
  /** The commit running there now. */
  sha: string | null;
  /** Every commit deployed here, oldest first. */
  history: string[];
}

export interface PullRequest {
  id: number;
  branch: string;
  fork: boolean;
  state: "open" | "merged";
}

export interface World {
  commits: Commit[];
  heads: Record<string, string>;
  workflows: Workflow[];
  runs: Run[];
  /** actions/cache entries: key → what the folder holds. */
  cache: Record<string, { lock: number; path: string }>;
  /** Artifacts by run id. */
  artifacts: Record<number, string[]>;
  envs: Record<string, Env>;
  /** Image tags in the registry → commit. */
  registry: Record<string, string>;
  secrets: Record<string, string>;
  /** Check names that must pass before a PR can merge; null when main is unprotected. */
  protection: string[] | null;
  prs: PullRequest[];
  /** Seconds since the story began. */
  clock: number;
}

export interface WorldInit {
  workflows?: Workflow[];
  /** Bugs already in the first commit. */
  bugs?: Bug[];
  envs?: { name: string; approval?: boolean; sha?: string | null }[];
  secrets?: Record<string, string>;
  protection?: string[] | null;
  /** Extra commits on main before the story starts. */
  history?: number;
}

export function freshWorld(init: WorldInit = {}): World {
  const first: Commit = { sha: SHAS[0]!, message: "first commit", branch: "main", paths: ["package.json", "src/app.ts"], bugs: init.bugs ?? [], lock: 0, n: 1 };
  const commits = [first];
  for (let i = 1; i <= (init.history ?? 0); i++) {
    commits.push({ sha: SHAS[i]!, message: `feature ${i}`, branch: "main", paths: ["src/app.ts"], bugs: init.bugs ?? [], lock: 0, n: i + 1 });
  }
  const head = commits[commits.length - 1]!.sha;
  const envs: Record<string, Env> = {};
  for (const e of init.envs ?? []) {
    const sha = e.sha === undefined ? null : e.sha;
    envs[e.name] = { name: e.name, approval: Boolean(e.approval), sha, history: sha ? [sha] : [] };
  }
  return {
    commits,
    heads: { main: head },
    workflows: init.workflows ?? [],
    runs: [],
    cache: {},
    artifacts: {},
    envs,
    registry: {},
    secrets: init.secrets ?? {},
    protection: init.protection ?? null,
    prs: [],
    clock: 0,
  };
}

/* --------------------------------------------------------------- actions */

export type CiAction =
  /** git commit + git push. A new branch starts from main. */
  | { type: "push"; branch?: string; paths?: string[]; add?: Bug[]; fix?: Bug[]; lock?: boolean; message?: string }
  | { type: "openPr"; branch: string; fork?: boolean }
  | { type: "merge"; pr: number }
  | { type: "dispatch"; workflow: string; inputs?: Record<string, string> }
  | { type: "schedule"; workflow?: string }
  /** Re-runs the latest failed run (or the given one) on the same commit, as a new attempt. */
  | { type: "rerun"; run?: number }
  /** A reviewer approves the environment a run is waiting on. */
  | { type: "approve"; run?: number }
  | { type: "setWorkflow"; workflow: Workflow }
  | { type: "removeWorkflow"; name: string }
  | { type: "setProtection"; required: string[] | null }
  | { type: "setEnv"; name: string; approval: boolean }
  | { type: "setSecret"; name: string; value: string | null }
  | { type: "wait"; seconds: number }
  /** Someone puts the previous build back by hand. */
  | { type: "rollback"; env: string };

export type CiEvent =
  | { type: "pushed"; branch: string; sha: string; message: string }
  | { type: "triggered"; run: number; workflow: string; event: Trigger; branch: string; sha: string; attempt: number }
  | { type: "notTriggered"; workflow: string; reason: "branch" | "paths" | "skip-ci" | "event" }
  | { type: "jobDone"; run: number; job: string; status: Status; seconds: number; failedStep?: string; reason?: JobRun["reason"]; exit?: number }
  | { type: "runDone"; run: number; workflow: string; status: Status; seconds: number; minutes: number }
  | { type: "cancelled"; run: number; by: number }
  | { type: "cache"; run: number; key: string; result: "hit" | "miss" | "saved" }
  | { type: "artifact"; run: number; name: string; action: "uploaded" | "downloaded" | "missing" }
  | { type: "imagePushed"; run: number; tag: string }
  | { type: "deployed"; run: number; env: string; sha: string }
  | { type: "rolledBack"; env: string; sha: string }
  | { type: "waitingApproval"; run: number; env: string }
  | { type: "approved"; run: number; env: string }
  | { type: "prOpened"; pr: number; branch: string; fork: boolean }
  | { type: "merged"; pr: number; sha: string }
  | { type: "mergeBlocked"; pr: number; checks: string[] }
  | { type: "smoke"; run: number; env: string; ok: boolean }
  | { type: "notified"; run: number; text: string }
  | { type: "configChanged"; what: string }
  | { type: "error"; code: string };

export interface Result {
  state: World;
  events: CiEvent[];
}

const refuse = (w: World, code: string): Result => ({ state: w, events: [{ type: "error", code }] });

const clone = (w: World): World => structuredClone(w);

export function commitOf(w: World, sha: string): Commit {
  const c = w.commits.find((x) => x.sha === sha);
  if (!c) throw new Error(`no commit ${sha}`);
  return c;
}
export const headOf = (w: World, branch = "main"): Commit => commitOf(w, w.heads[branch] ?? w.heads.main!);
export const latestRun = (w: World, workflow?: string): Run | undefined => [...w.runs].reverse().find((r) => !workflow || r.workflow === workflow);
export const runById = (w: World, id: number): Run | undefined => w.runs.find((r) => r.id === id);

/** Time between two pushes when nobody waits on purpose. */
export const PUSH_GAP = 30;

export function apply(world: World, action: CiAction): Result {
  switch (action.type) {
    case "push": {
      const branch = action.branch ?? "main";
      const w = clone(world);
      const parent = commitOf(w, w.heads[branch] ?? w.heads.main!);
      const n = w.commits.length + 1;
      const sha = SHAS[(n - 1) % SHAS.length]!;
      const bugs = [...new Set([...parent.bugs.filter((b) => !(action.fix ?? []).includes(b)), ...(action.add ?? [])])];
      const commit: Commit = {
        sha,
        message: action.message ?? (action.fix?.length ? `fix: ${action.fix.join(", ")}` : `change ${n}`),
        branch,
        paths: action.paths ?? ["src/app.ts"],
        bugs,
        lock: action.lock ? parent.lock + 1 : parent.lock,
        n,
      };
      w.commits.push(commit);
      w.heads[branch] = sha;
      w.clock += PUSH_GAP;
      const events: CiEvent[] = [{ type: "pushed", branch, sha, message: commit.message }];
      trigger(w, "push", branch, sha, events, {});
      const pr = w.prs.find((p) => p.branch === branch && p.state === "open");
      if (pr) trigger(w, "pull_request", branch, sha, events, { pr: pr.id, fork: pr.fork });
      return { state: w, events };
    }
    case "openPr": {
      if (!world.heads[action.branch] || action.branch === "main") return refuse(world, "no-branch");
      if (world.prs.some((p) => p.branch === action.branch && p.state === "open")) return refuse(world, "pr-exists");
      const w = clone(world);
      const pr: PullRequest = { id: w.prs.length + 1, branch: action.branch, fork: Boolean(action.fork), state: "open" };
      w.prs.push(pr);
      w.clock += 5;
      const events: CiEvent[] = [{ type: "prOpened", pr: pr.id, branch: pr.branch, fork: pr.fork }];
      trigger(w, "pull_request", pr.branch, w.heads[pr.branch]!, events, { pr: pr.id, fork: pr.fork });
      return { state: w, events };
    }
    case "merge": {
      const pr = world.prs.find((p) => p.id === action.pr);
      if (!pr || pr.state !== "open") return refuse(world, "no-pr");
      const missing = blockingChecks(world, pr.id);
      if (missing.length) return { state: world, events: [{ type: "mergeBlocked", pr: pr.id, checks: missing }] };
      const w = clone(world);
      const head = commitOf(w, w.heads[pr.branch]!);
      w.prs.find((p) => p.id === pr.id)!.state = "merged";
      const n = w.commits.length + 1;
      const sha = SHAS[(n - 1) % SHAS.length]!;
      const merge: Commit = { sha, message: `Merge pull request #${pr.id} from ${pr.branch}`, branch: "main", paths: changedOnBranch(w, pr.branch), bugs: head.bugs, lock: head.lock, n };
      w.commits.push(merge);
      w.heads.main = sha;
      w.clock += PUSH_GAP;
      const events: CiEvent[] = [{ type: "merged", pr: pr.id, sha }];
      trigger(w, "push", "main", sha, events, {});
      return { state: w, events };
    }
    case "dispatch": {
      const wf = world.workflows.find((x) => x.name === action.workflow);
      if (!wf || !wf.on.dispatch) return refuse(world, "no-dispatch");
      const w = clone(world);
      w.clock += 10;
      const events: CiEvent[] = [];
      startRun(w, wf, "dispatch", "main", w.heads.main!, events, { inputs: action.inputs ?? {} });
      return { state: w, events };
    }
    case "schedule": {
      const list = world.workflows.filter((x) => x.on.schedule && (!action.workflow || x.name === action.workflow));
      if (!list.length) return refuse(world, "no-schedule");
      const w = clone(world);
      w.clock += 60 * 60;
      const events: CiEvent[] = [];
      for (const wf of list) startRun(w, wf, "schedule", "main", w.heads.main!, events, {});
      return { state: w, events };
    }
    case "rerun": {
      const target = action.run !== undefined ? runById(world, action.run) : [...world.runs].reverse().find((r) => r.status === "failure" || r.status === "cancelled");
      if (!target) return refuse(world, "nothing-to-rerun");
      const wf = world.workflows.find((x) => x.name === target.workflow);
      if (!wf) return refuse(world, "no-workflow");
      const w = clone(world);
      w.clock += 15;
      const events: CiEvent[] = [];
      startRun(w, wf, target.event, target.branch, target.sha, events, { pr: target.pr, fork: target.fork, inputs: target.inputs, attempt: target.attempt + 1, changed: target.changed });
      return { state: w, events };
    }
    case "approve": {
      const target = action.run !== undefined ? runById(world, action.run) : [...world.runs].reverse().find((r) => r.status === "waiting");
      if (!target || target.status !== "waiting") return refuse(world, "nothing-waiting");
      const w = clone(world);
      w.clock += 20;
      const run = runById(w, target.id)!;
      const job = run.jobs.find((j) => j.status === "waiting")!;
      run.approved.push(job.environment!);
      const events: CiEvent[] = [{ type: "approved", run: run.id, env: job.environment! }];
      const wf = w.workflows.find((x) => x.name === run.workflow)!;
      execute(w, wf, run, events, w.clock);
      return { state: w, events };
    }
    case "setWorkflow": {
      const w = clone(world);
      const i = w.workflows.findIndex((x) => x.name === action.workflow.name);
      if (i >= 0) w.workflows[i] = structuredClone(action.workflow);
      else w.workflows.push(structuredClone(action.workflow));
      return { state: w, events: [{ type: "configChanged", what: action.workflow.name }] };
    }
    case "removeWorkflow": {
      if (!world.workflows.some((x) => x.name === action.name)) return refuse(world, "no-workflow");
      const w = clone(world);
      w.workflows = w.workflows.filter((x) => x.name !== action.name);
      return { state: w, events: [{ type: "configChanged", what: action.name }] };
    }
    case "setProtection": {
      const w = clone(world);
      w.protection = action.required ? [...action.required] : null;
      return { state: w, events: [{ type: "configChanged", what: "protection" }] };
    }
    case "setEnv": {
      const w = clone(world);
      const e = w.envs[action.name] ?? { name: action.name, approval: false, sha: null, history: [] };
      e.approval = action.approval;
      w.envs[action.name] = e;
      return { state: w, events: [{ type: "configChanged", what: `env:${action.name}` }] };
    }
    case "setSecret": {
      const w = clone(world);
      if (action.value === null) delete w.secrets[action.name];
      else w.secrets[action.name] = action.value;
      return { state: w, events: [{ type: "configChanged", what: `secret:${action.name}` }] };
    }
    case "wait": {
      const w = clone(world);
      w.clock += action.seconds;
      return { state: w, events: [] };
    }
    case "rollback": {
      const e = world.envs[action.env];
      if (!e || e.history.length < 2) return refuse(world, "nothing-to-roll-back");
      const w = clone(world);
      const env = w.envs[action.env]!;
      env.history.pop();
      env.sha = env.history[env.history.length - 1]!;
      w.clock += 60;
      return { state: w, events: [{ type: "rolledBack", env: env.name, sha: env.sha }] };
    }
  }
}

export function simulate(actions: CiAction[], start: World = freshWorld()) {
  const states: World[] = [start];
  const events: CiEvent[][] = [];
  let w = start;
  for (const a of actions) {
    const r = apply(w, a);
    w = r.state;
    states.push(w);
    events.push(r.events);
  }
  return { states, events };
}

/* --------------------------------------------------------------- matching */

/** Glob matching as GitHub uses it for paths: `**` crosses folders, `*` does not. */
export function globMatch(pattern: string, path: string): boolean {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === "*" && pattern[i + 1] === "*") {
      re += ".*";
      i++;
      if (pattern[i + 1] === "/") i++;
    } else if (ch === "*") re += "[^/]*";
    else if (ch === "?") re += "[^/]";
    else re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`).test(path);
}

/** Every path changed on a branch since it left main. */
export function changedOnBranch(w: World, branch: string): string[] {
  return [...new Set(w.commits.filter((c) => c.branch === branch).flatMap((c) => c.paths))];
}

function filterReason(f: Filter, branch: string, changed: string[]): "branch" | "paths" | null {
  if (f.branches && !f.branches.some((b) => globMatch(b, branch))) return "branch";
  if (f.paths && !changed.some((p) => f.paths!.some((g) => globMatch(g, p)))) return "paths";
  if (f.pathsIgnore && changed.every((p) => f.pathsIgnore!.some((g) => globMatch(g, p)))) return "paths";
  return null;
}

function trigger(w: World, event: "push" | "pull_request", branch: string, sha: string, events: CiEvent[], extra: { pr?: number; fork?: boolean }) {
  const commit = commitOf(w, sha);
  const changed = event === "pull_request" ? changedOnBranch(w, branch) : commit.paths;
  // For a pull request the filter's `branches` is the base branch, which is always main here.
  const filterBranch = event === "pull_request" ? "main" : branch;
  for (const wf of w.workflows) {
    const f = wf.on[event];
    if (!f) continue;
    if (/\[skip ci\]/.test(commit.message)) {
      events.push({ type: "notTriggered", workflow: wf.name, reason: "skip-ci" });
      continue;
    }
    const why = filterReason(f, filterBranch, changed);
    if (why) {
      events.push({ type: "notTriggered", workflow: wf.name, reason: why });
      continue;
    }
    startRun(w, wf, event, branch, sha, events, { ...extra, changed });
  }
}

/* -------------------------------------------------------------- execution */

function startRun(
  w: World,
  wf: Workflow,
  event: Trigger,
  branch: string,
  sha: string,
  events: CiEvent[],
  opts: { pr?: number; fork?: boolean; inputs?: Record<string, string>; attempt?: number; changed?: string[] },
): Run {
  const run: Run = {
    id: w.runs.length + 1,
    workflow: wf.name,
    event,
    branch,
    sha,
    pr: opts.pr,
    fork: Boolean(opts.fork),
    attempt: opts.attempt ?? 1,
    start: w.clock,
    end: w.clock,
    status: "queued",
    jobs: [],
    inputs: opts.inputs ?? {},
    approved: [],
    summary: [],
    minutes: 0,
    changed: opts.changed ?? commitOf(w, sha).paths,
    grouped: Boolean(wf.concurrency),
  };
  // Concurrency: a newer run in the same group cancels the older one that is still going.
  if (wf.concurrency) {
    for (const old of w.runs) {
      // Only runs in the same group: one started before concurrency was set has no group.
      if (old.grouped && old.workflow === wf.name && old.branch === branch && old.end > w.clock && (old.status === "success" || old.status === "failure" || old.status === "waiting")) {
        cancelRunAt(old, w.clock);
        events.push({ type: "cancelled", run: old.id, by: run.id });
      }
    }
  }
  for (const def of wf.jobs) {
    for (const node of def.matrix ?? [undefined]) {
      run.jobs.push({
        key: node === undefined ? def.id : `${def.id}-${node}`,
        id: def.id,
        label: node === undefined ? def.id : `${def.id} (${node})`,
        node,
        status: "queued",
        start: run.start,
        end: run.start,
        steps: [],
        environment: def.environment,
        needs: def.needs ?? [],
        outputs: {},
      });
    }
  }
  w.runs.push(run);
  events.push({ type: "triggered", run: run.id, workflow: wf.name, event, branch, sha, attempt: run.attempt });
  execute(w, wf, run, events, run.start);
  return run;
}

/** Runs every queued job whose needs are done; stops at a job that waits for approval. */
function execute(w: World, wf: Workflow, run: Run, events: CiEvent[], now: number) {
  const order = topo(wf.jobs);
  for (const def of order) {
    const legs = run.jobs.filter((j) => j.id === def.id && (j.status === "queued" || j.status === "waiting"));
    if (!legs.length) continue;
    const needs = (def.needs ?? []).flatMap((n) => run.jobs.filter((j) => j.id === n));
    if (needs.some((j) => j.status === "queued" || j.status === "waiting")) continue; // still blocked
    const start = Math.max(now, run.start, ...needs.map((j) => j.end));
    const needsFailed = needs.some((j) => j.status === "failure" || j.status === "cancelled");
    const needsOk = needs.every((j) => j.status === "success");
    const cond = def.if ?? "success";
    let go: boolean;
    if (cond === "always") go = true;
    else if (cond === "failure") go = needsFailed;
    else go = needsOk && condHolds(cond, run, { failed: false, cacheHit: false });
    if (!go) {
      for (const leg of legs) {
        leg.status = "skipped";
        leg.start = leg.end = start;
        leg.reason = needsOk ? "if" : "needs";
        events.push({ type: "jobDone", run: run.id, job: leg.label, status: "skipped", seconds: 0, reason: leg.reason });
      }
      continue;
    }
    if (def.environment && w.envs[def.environment]?.approval && !run.approved.includes(def.environment)) {
      for (const leg of legs) {
        if (leg.status !== "waiting") events.push({ type: "waitingApproval", run: run.id, env: def.environment });
        leg.status = "waiting";
        leg.start = leg.end = start;
        leg.reason = "approval";
      }
      continue;
    }
    for (const leg of legs) runJob(w, wf, def, run, leg, start, events);
    // fail-fast: the first failing leg cancels the legs still running.
    if (legs.length > 1 && def.failFast !== false) {
      const failed = legs.filter((j) => j.status === "failure").sort((a, b) => a.end - b.end)[0];
      if (failed) {
        for (const leg of legs) {
          if (leg !== failed && leg.end > failed.end) {
            truncateJob(leg, failed.end, "fail-fast");
            events.push({ type: "jobDone", run: run.id, job: leg.label, status: "cancelled", seconds: leg.end - leg.start, reason: "fail-fast" });
          }
        }
      }
    }
  }
  finishRun(w, run, events);
}

function finishRun(w: World, run: Run, events: CiEvent[]) {
  const was = run.status;
  run.end = Math.max(run.start, ...run.jobs.map((j) => j.end));
  run.minutes = run.jobs.reduce((m, j) => m + billed(j), 0);
  run.status = runStatus(run);
  if (run.status !== "waiting" && was !== run.status) {
    events.push({ type: "runDone", run: run.id, workflow: run.workflow, status: run.status, seconds: run.end - run.start, minutes: run.minutes });
  }
  void w;
}

const billed = (j: JobRun) => (j.status === "skipped" || j.status === "waiting" || j.status === "queued" || j.end <= j.start ? 0 : Math.ceil((j.end - j.start) / 60));

function runStatus(run: Run): Status {
  if (run.jobs.some((j) => j.status === "waiting")) return "waiting";
  if (run.jobs.some((j) => j.status === "cancelled" && j.reason === "concurrency")) return "cancelled";
  if (run.jobs.some((j) => j.status === "failure")) return "failure";
  if (run.jobs.some((j) => j.status === "cancelled")) return "cancelled";
  if (run.jobs.every((j) => j.status === "skipped")) return "skipped";
  return "success";
}

function cancelRunAt(run: Run, t: number) {
  for (const j of run.jobs) {
    if (j.status === "waiting" || j.status === "queued") {
      j.status = "cancelled";
      j.reason = "concurrency";
      j.start = j.end = Math.max(j.start, t);
    } else if (j.end > t && j.status !== "skipped") truncateJob(j, t, "concurrency");
  }
  run.end = Math.min(run.end, Math.max(t, run.start));
  run.minutes = run.jobs.reduce((m, j) => m + billed(j), 0);
  run.status = "cancelled";
}

function truncateJob(j: JobRun, t: number, reason: JobRun["reason"]) {
  let at = j.start;
  for (const s of j.steps) {
    if (at >= t) {
      s.status = "cancelled";
      s.seconds = 0;
    } else if (at + s.seconds > t) {
      s.seconds = t - at;
      s.status = "cancelled";
    }
    at += s.seconds;
  }
  j.end = Math.max(j.start, t);
  j.status = "cancelled";
  j.failedStep = undefined;
  j.reason = reason;
}

function topo(jobs: JobDef[]): JobDef[] {
  const out: JobDef[] = [];
  const seen = new Set<string>();
  const visit = (j: JobDef) => {
    if (seen.has(j.id)) return;
    seen.add(j.id);
    for (const n of j.needs ?? []) {
      const dep = jobs.find((x) => x.id === n);
      if (dep) visit(dep);
    }
    out.push(j);
  };
  jobs.forEach(visit);
  return out;
}

function condHolds(cond: Cond, run: Run, ctx: { failed: boolean; cacheHit: boolean }): boolean {
  switch (cond) {
    case "success":
      return !ctx.failed;
    case "failure":
      return ctx.failed;
    case "always":
      return true;
    case "main":
      return !ctx.failed && run.branch === "main" && run.event !== "pull_request";
    case "push":
      return !ctx.failed && run.event === "push";
    case "cache-miss":
      return !ctx.failed && !ctx.cacheHit;
    case "not-fork":
      return !ctx.failed && !run.fork;
    default: {
      const glob = cond.slice("changed:".length);
      return !ctx.failed && run.changed.some((p) => globMatch(glob, p));
    }
  }
}

/** Default step durations, in seconds. */
export const SECONDS: Record<StepKind, number> = {
  checkout: 3,
  "setup-node": 5,
  cache: 2,
  install: 45,
  lint: 15,
  typecheck: 20,
  test: 70,
  e2e: 150,
  build: 35,
  upload: 4,
  download: 3,
  changes: 3,
  "docker-push": 50,
  deploy: 25,
  smoke: 5,
  rollback: 20,
  notify: 2,
  summary: 1,
  output: 1,
  "print-secret": 1,
  publish: 8,
  hang: 6 * 60 * 60,
};

interface Workspace {
  code: boolean;
  node: number | null;
  modules: number | null; // lock version node_modules was installed for
  dist: number | null; // commit n the build came from
  npmCache: number | null; // lock version ~/.npm holds
  cacheHit: boolean;
  cacheSave: { key: string; path: string } | null;
  image: boolean;
}

function runJob(w: World, wf: Workflow, def: JobDef, run: Run, job: JobRun, start: number, events: CiEvent[]) {
  const commit = commitOf(w, run.sha);
  const ws: Workspace = { code: false, node: null, modules: null, dist: null, npmCache: null, cacheHit: false, cacheSave: null, image: false };
  const limit = (def.timeout ?? 360) * 60;
  job.start = start;
  job.steps = [];
  job.outputs = {};
  let t = 0;
  let failed = false;
  let timedOut = false;
  for (const step of def.steps) {
    const name = stepName(step, job.node);
    if (timedOut) {
      job.steps.push({ name, kind: step.kind, status: "cancelled", seconds: 0, log: [] });
      continue;
    }
    const cond = step.if ?? "success";
    if (!condHolds(cond, run, { failed, cacheHit: ws.cacheHit })) {
      job.steps.push({ name, kind: step.kind, status: "skipped", seconds: 0, log: [] });
      continue;
    }
    const r = runStep(w, wf, def, run, job, step, ws, commit, events);
    let seconds = r.seconds;
    let status: StepStatus = r.ok ? "success" : "failure";
    let log = r.log;
    if (t + seconds > limit) {
      seconds = Math.max(0, limit - t);
      status = "cancelled";
      log = [...log.slice(0, 2), `##[error]The job running on runner GitHub Actions 2 has exceeded the maximum execution time of ${def.timeout ?? 360} minutes.`];
      timedOut = true;
    }
    const sr: StepRun = { name, kind: step.kind, status, seconds, log, exit: r.ok ? undefined : r.exit };
    if (r.delivered && status === "success") sr.delivered = r.delivered;
    if (!r.ok && !timedOut && step.continueOnError) sr.allowed = true;
    job.steps.push(sr);
    t += seconds;
    if (status === "failure" && !step.continueOnError) {
      if (!failed) job.failedStep = name;
      failed = true;
    }
  }
  job.end = start + t;
  if (timedOut) {
    job.status = "failure";
    job.reason = "timeout";
    job.failedStep = job.steps.find((s) => s.status === "cancelled")?.name;
  } else job.status = failed ? "failure" : "success";
  // actions/cache saves in its post step, only when the job succeeded and the key was a miss.
  if (job.status === "success" && ws.cacheSave && !w.cache[ws.cacheSave.key]) {
    w.cache[ws.cacheSave.key] = { lock: ws.cacheSave.path === "node_modules" ? (ws.modules ?? commit.lock) : commit.lock, path: ws.cacheSave.path };
    events.push({ type: "cache", run: run.id, key: ws.cacheSave.key, result: "saved" });
  }
  const failedRun = job.steps.find((s) => s.name === job.failedStep);
  events.push({ type: "jobDone", run: run.id, job: job.label, status: job.status, seconds: job.end - job.start, failedStep: job.failedStep, reason: job.reason, exit: failedRun?.exit });
}

/** The name GitHub shows for a step. */
export function stepName(step: StepDef, node?: number): string {
  if (step.name) return step.name;
  const env = (v: string | undefined) => (v?.startsWith("input:") ? `${"$"}{{ inputs.${v.slice(6)} }}` : (v ?? "staging"));
  switch (step.kind) {
    case "checkout":
      return "Run actions/checkout@v4";
    case "setup-node":
      return `Run actions/setup-node@v4 (node ${node ?? step.with?.node ?? 22})`;
    case "cache":
      return `Run actions/cache@v4 (${step.with?.path === "node_modules" ? "node_modules" : "~/.npm"})`;
    case "install":
      return "Run npm ci";
    case "lint":
      return "Run npm run lint";
    case "typecheck":
      return "Run npx tsc --noEmit";
    case "test":
      return "Run npm test";
    case "e2e":
      return "Run npm run e2e";
    case "build":
      return "Run npm run build";
    case "upload":
      return "Run actions/upload-artifact@v4";
    case "download":
      return "Run actions/download-artifact@v4";
    case "changes":
      return "Run dorny/paths-filter@v3";
    case "docker-push":
      return "Run docker/build-push-action@v6";
    case "deploy":
      return `Run ./deploy.sh ${env(step.with?.env)}`;
    case "smoke":
      return `Run curl --fail ${env(step.with?.env)}/health`;
    case "rollback":
      return `Run ./deploy.sh ${env(step.with?.env)} --previous`;
    case "notify":
      return "Run ./notify.sh";
    case "summary":
      return "Run echo >> $GITHUB_STEP_SUMMARY";
    case "output":
      return "Run echo >> $GITHUB_OUTPUT";
    case "print-secret":
      return `Run echo "token: $${step.with?.secret ?? "NPM_TOKEN"}"`;
    case "publish":
      return "Run npm publish";
    case "hang":
      return "Run npm run e2e";
  }
}

interface StepResult {
  ok: boolean;
  seconds: number;
  log: string[];
  exit?: number;
  delivered?: { env: string; sha: string };
}

const ok = (seconds: number, ...log: string[]): StepResult => ({ ok: true, seconds, log });
const fail = (seconds: number, exit: number, ...log: string[]): StepResult => ({ ok: false, seconds, exit, log });

/** Resolves `input:<name>` to the run's dispatch input. */
const valueOf = (run: Run, v: string | undefined, fallback: string) => (v?.startsWith("input:") ? (run.inputs[v.slice(6)] ?? fallback) : (v ?? fallback));

function needsModules(ws: Workspace, commit: Commit, cmd: string): StepResult | null {
  if (!ws.code) return fail(1, 254, `> ${cmd}`, "npm error code ENOENT", "npm error enoent Could not read package.json: no such file or directory, open '/home/runner/work/shop/shop/package.json'");
  if (ws.node === null) return fail(1, 127, `> ${cmd}`, "/home/runner/work/_temp/run.sh: line 1: npm: command not found");
  if (ws.modules === null) return fail(1, 127, `> ${cmd}`, `sh: 1: ${cmd.includes("lint") ? "eslint" : cmd.includes("tsc") ? "tsc" : cmd.includes("build") ? "vite" : "vitest"}: not found`);
  if (ws.modules !== commit.lock) return fail(4, 1, `> ${cmd}`, "Error: Cannot find module 'dayjs'", "Require stack:", "- /home/runner/work/shop/shop/src/date.ts", "(node_modules came from an old cache: package-lock.json has changed since)");
  return null;
}

function runStep(w: World, wf: Workflow, _def: JobDef, run: Run, job: JobRun, step: StepDef, ws: Workspace, commit: Commit, events: CiEvent[]): StepResult {
  const d = (k: StepKind) => SECONDS[k];
  switch (step.kind) {
    case "checkout":
      ws.code = true;
      return ok(d("checkout"), `Syncing repository: ada/shop`, `HEAD is now at ${commit.sha} ${commit.message}`);
    case "setup-node":
      ws.node = job.node ?? Number(step.with?.node ?? 22);
      return ok(d("setup-node"), `Found in cache @ /opt/hostedtoolcache/node/${ws.node}.x`, `node --version: v${ws.node}.11.0`);
    case "cache": {
      const path = step.with?.path ?? "npm";
      const key = step.with?.key === "static" ? `${path}-deps` : `${path}-${lockHash(commit.lock)}`;
      const hit = w.cache[key];
      if (hit) {
        ws.cacheHit = true;
        if (path === "node_modules") ws.modules = hit.lock;
        else ws.npmCache = hit.lock;
        events.push({ type: "cache", run: run.id, key, result: "hit" });
        return ok(d("cache"), `Cache restored from key: ${key}`);
      }
      ws.cacheSave = { key, path };
      events.push({ type: "cache", run: run.id, key, result: "miss" });
      return ok(d("cache"), `Cache not found for input keys: ${key}`);
    }
    case "install": {
      if (!ws.code) return fail(1, 254, "> npm ci", "npm error code ENOENT", "npm error enoent Could not read package.json");
      if (ws.node === null) return fail(1, 127, "> npm ci", "/home/runner/work/_temp/run.sh: line 1: npm: command not found");
      const secs = ws.npmCache === commit.lock ? 12 : ws.npmCache !== null ? 30 : d("install");
      ws.modules = commit.lock;
      return ok(secs, "> npm ci", `added 412 packages in ${secs}s`);
    }
    case "lint": {
      const miss = needsModules(ws, commit, "npm run lint");
      if (miss) return miss;
      if (commit.bugs.includes("lint")) return fail(d("lint"), 1, "> eslint .", "src/cart.ts", "  12:7  error  'total' is assigned a value but never used  no-unused-vars", "✖ 1 problem (1 error, 0 warnings)");
      return ok(d("lint"), "> eslint .", "No problems found.");
    }
    case "typecheck": {
      const miss = needsModules(ws, commit, "npx tsc --noEmit");
      if (miss) return miss;
      if (commit.bugs.includes("type")) return fail(d("typecheck"), 2, "src/price.ts(8,14): error TS2322: Type 'string' is not assignable to type 'number'.", "Found 1 error in src/price.ts:8");
      return ok(d("typecheck"), "No type errors.");
    }
    case "test": {
      const miss = needsModules(ws, commit, "npm test");
      if (miss) return miss;
      if (commit.bugs.includes("test")) return fail(d("test"), 1, "> vitest run", " FAIL  src/cart.test.ts > total adds VAT", "AssertionError: expected 118 to be 120", " Tests  1 failed | 127 passed (128)");
      if (commit.bugs.includes("node20") && ws.node === 20) return fail(d("test"), 1, "> vitest run", " FAIL  src/list.test.ts > groups orders", "TypeError: Object.groupBy is not a function", " Tests  1 failed | 127 passed (128)");
      if (commit.bugs.includes("flaky") && run.attempt % 2 === 1) return fail(d("test"), 1, "> vitest run", " FAIL  src/checkout.test.ts > confirms the order", "Error: Test timed out in 5000ms.", " Tests  1 failed | 127 passed (128)");
      return ok(d("test"), "> vitest run", " Tests  128 passed (128)");
    }
    case "e2e": {
      const miss = needsModules(ws, commit, "npm run e2e");
      if (miss) return miss;
      return ok(d("e2e"), "> playwright test", "  24 passed (2.5m)");
    }
    case "build": {
      const miss = needsModules(ws, commit, "npm run build");
      if (miss) return miss;
      if (commit.bugs.includes("build")) return fail(12, 1, "> vite build", `[vite]: Rollup failed to resolve import "./utils/money" from "src/cart.ts".`);
      ws.dist = commit.n;
      return ok(d("build"), "> vite build", "dist/index.html   0.46 kB", "dist/assets/index.js  142.31 kB", "✓ built in 3.12s");
    }
    case "upload": {
      if (ws.dist === null) return fail(1, 1, "##[error]No files were found with the provided path: dist/. No artifacts will be uploaded.");
      const list = (w.artifacts[run.id] ??= []);
      if (!list.includes("dist")) list.push("dist");
      events.push({ type: "artifact", run: run.id, name: "dist", action: "uploaded" });
      return ok(d("upload"), "Artifact dist has been successfully uploaded! Final size is 48213 bytes.");
    }
    case "download": {
      if (!(w.artifacts[run.id] ?? []).includes("dist")) {
        events.push({ type: "artifact", run: run.id, name: "dist", action: "missing" });
        return fail(1, 1, "##[error]Unable to download artifact(s): Artifact not found for name: dist");
      }
      ws.dist = commit.n;
      events.push({ type: "artifact", run: run.id, name: "dist", action: "downloaded" });
      return ok(d("download"), "Artifact download completed successfully.");
    }
    case "changes": {
      const filters = (step.with?.filters ?? "src/**").split(",");
      for (const f of filters) job.outputs[f] = String(run.changed.some((p) => globMatch(f, p)));
      return ok(d("changes"), ...filters.map((f) => `Filter ${f} = ${job.outputs[f]}`));
    }
    case "docker-push": {
      if (!ws.code) return fail(2, 1, "ERROR: failed to solve: failed to read dockerfile: open Dockerfile: no such file or directory");
      if (wf.permissions === "read") return fail(20, 1, "ERROR: failed to push ghcr.io/ada/shop: denied: installation not allowed to Write organization package");
      const tag = `sha-${commit.sha}`;
      w.registry[tag] = commit.sha;
      ws.image = true;
      events.push({ type: "imagePushed", run: run.id, tag });
      return ok(d("docker-push"), `pushing ghcr.io/ada/shop:${tag}`, "done");
    }
    case "deploy": {
      const env = valueOf(run, step.with?.env, "staging");
      const from = step.with?.from ?? "artifact";
      let sha = commit.sha;
      if (from === "registry") {
        sha = valueOf(run, step.with?.version, commit.sha);
        if (!w.registry[`sha-${sha}`]) return fail(3, 1, `Error: image ghcr.io/ada/shop:sha-${sha} not found`);
      } else if (ws.dist === null) return fail(1, 1, "./deploy.sh: dist/ not found. Did the build run in this job?");
      if (run.fork || !w.secrets.DEPLOY_TOKEN) return fail(2, 1, "Error: DEPLOY_TOKEN is empty.", run.fork ? "(Secrets are not passed to workflows triggered from a fork.)" : "(Add it under Settings → Secrets and variables → Actions.)");
      const e = (w.envs[env] ??= { name: env, approval: false, sha: null, history: [] });
      e.sha = sha;
      e.history.push(sha);
      events.push({ type: "deployed", run: run.id, env, sha });
      return { ...ok(d("deploy"), `Deploying ${sha} to ${env}…`, `${env}: now running ${sha}`), delivered: { env, sha } };
    }
    case "smoke": {
      const env = valueOf(run, step.with?.env, "staging");
      const e = w.envs[env];
      const healthy = Boolean(e?.sha) && !commitOf(w, e!.sha!).bugs.includes("crash");
      events.push({ type: "smoke", run: run.id, env, ok: healthy });
      if (!healthy) return fail(d("smoke"), 22, `curl: (22) The requested URL returned error: 500`, `${env}/health → 500 Internal Server Error`);
      return ok(d("smoke"), `${env}/health → 200 OK`);
    }
    case "rollback": {
      const env = valueOf(run, step.with?.env, "staging");
      const e = w.envs[env];
      if (!e || e.history.length < 2) return fail(2, 1, "Nothing to roll back to.");
      e.history.pop();
      e.sha = e.history[e.history.length - 1]!;
      events.push({ type: "rolledBack", env, sha: e.sha });
      return { ...ok(d("rollback"), `${env}: back to ${e.sha}`), delivered: { env, sha: e.sha } };
    }
    case "notify": {
      const text = step.with?.text ?? `${wf.name} failed on ${run.branch}`;
      events.push({ type: "notified", run: run.id, text });
      return ok(d("notify"), `Posted to #deploys: ${text}`);
    }
    case "summary": {
      run.summary.push(step.with?.text ?? "### Tests: 128 passed");
      return ok(d("summary"));
    }
    case "output": {
      const name = step.with?.name ?? "version";
      job.outputs[name] = step.with?.value ?? `sha-${commit.sha}`;
      return ok(d("output"), `${name}=${job.outputs[name]}`);
    }
    case "print-secret": {
      const name = step.with?.secret ?? "NPM_TOKEN";
      const value = run.fork ? "" : (w.secrets[name] ?? "");
      return ok(d("print-secret"), `token: ${value ? "***" : ""}`);
    }
    case "publish": {
      const token = run.fork ? "" : (w.secrets.NPM_TOKEN ?? "");
      if (!token) return fail(3, 1, "npm error code ENEEDAUTH", "npm error need auth This command requires you to be logged in.");
      return ok(d("publish"), "+ @ada/shop@1.4.0");
    }
    case "hang":
      return ok(Number(step.with?.minutes ?? 360) * 60 + 60, "> playwright test", "Waiting for http://localhost:3000 …");
  }
}

/* ----------------------------------------------------------------- checks */

/** Check names as GitHub lists them on a PR: `<workflow> / <job>`. */
export const checkName = (workflow: string, job: string) => `${workflow} / ${job}`;

export type CheckState = "success" | "failure" | "pending" | "skipped" | "cancelled" | "expected";

/** Every check reported on a PR's head commit, plus required ones that never reported. */
export function checksFor(w: World, prId: number): { name: string; state: CheckState; required: boolean }[] {
  const pr = w.prs.find((p) => p.id === prId);
  if (!pr) return [];
  const head = w.heads[pr.branch];
  const latest = new Map<string, Run>();
  for (const r of w.runs) if (r.pr === prId && r.sha === head && r.event === "pull_request") latest.set(r.workflow, r);
  const out: { name: string; state: CheckState; required: boolean }[] = [];
  for (const r of latest.values()) {
    for (const j of r.jobs) {
      const name = checkName(r.workflow, j.label);
      const state: CheckState = j.status === "queued" || j.status === "waiting" ? "pending" : j.status;
      out.push({ name, state, required: Boolean(w.protection?.includes(name)) });
    }
  }
  for (const req of w.protection ?? []) if (!out.some((c) => c.name === req)) out.push({ name: req, state: "expected", required: true });
  return out;
}

/** Required checks that keep a PR from merging. GitHub counts a skipped job as passing. */
export function blockingChecks(w: World, prId: number): string[] {
  if (!w.protection) return [];
  return checksFor(w, prId)
    .filter((c) => c.required && c.state !== "success" && c.state !== "skipped")
    .map((c) => c.name);
}

/** Total billed minutes across every run. */
export const totalMinutes = (w: World) => w.runs.reduce((m, r) => m + r.minutes, 0);

/** Format seconds as `1m 25s`. */
export function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return m ? (s ? `${m}m ${s}s` : `${m}m`) : `${s}s`;
}
