import { apply as applyCi, commitOf, freshWorld, type Bug, type CiAction, type CiEvent, type World, type WorldInit } from "./ci";
import { readWorkflow, type YamlProblem } from "./readYaml";
import { workflowFile, workflowYaml } from "./yaml";

/**
 * The reader's laptop next to the GitHub model: a project folder with real files, a tiny git
 * (stage, commit, branch, push, pull) and GitHub on the other side. Workflow files are plain
 * text here; they take effect when they are pushed, as on GitHub, and a commit's bugs come
 * from what its files say (an unused variable, a wrong VAT rate), so fixing a file fixes CI.
 *
 * Simplifications: one workflow set for the whole repo (a workflow change pushed on any branch
 * applies everywhere), merges never conflict, and `git pull` only fast-forwards.
 */

export type Files = Record<string, string>;

export interface LocalCommit {
  message: string;
  paths: string[];
}

export interface Desk {
  world: World;
  branch: string;
  files: Files;
  index: Files;
  /** Each local branch's last commit, as a tree of files. */
  trees: Record<string, Files>;
  /** What GitHub has for each branch now. */
  remote: Record<string, Files>;
  /** What the laptop last saw of GitHub, per branch: when `remote` differs, GitHub moved on. */
  synced: Record<string, Files>;
  /** Commits on a branch that are not pushed yet. */
  ahead: Record<string, LocalCommit[]>;
  /** Branches that track a branch on GitHub. */
  upstream: string[];
  /** Workflow files GitHub refused at the last push, with why. */
  invalid: Record<string, YamlProblem[]>;
}

export type DeskAction =
  | { type: "write"; path: string; content: string }
  | { type: "remove"; path: string }
  | { type: "add"; paths: string[] | "." }
  | { type: "commit"; message: string; all?: boolean }
  | { type: "switch"; branch: string; create?: boolean }
  | { type: "push"; branch?: string; setUpstream?: boolean }
  | { type: "pull" }
  /** Anything on GitHub's side: open or merge a PR, dispatch, re-run, approve, secrets… */
  | { type: "gh"; action: CiAction };

export interface DeskResult {
  state: Desk;
  events: CiEvent[];
  /** Set when the action was refused; the command line prints it. */
  error?: string;
}

/* ------------------------------------------------------------- the code */

/** The shop's source files, with each bug written into the code where CI's logs point. */
export function sourceFiles(bugs: Bug[] = []): Files {
  const has = (b: Bug) => bugs.includes(b);
  return {
    "package.json": `{\n  "name": "shop",\n  "scripts": {\n    "lint": "eslint .",\n    "test": "vitest run",\n    "build": "vite build",\n    "e2e": "playwright test"\n  }\n}`,
    "package-lock.json": `{\n  "name": "shop",\n  "lockfileVersion": 3\n}`,
    "src/app.ts": `import { total } from "./cart";\n\nexport function render(items: number[]) {\n  return \`Total: \${total(items)}\`;\n}`,
    "src/cart.ts": [
      has("build") ? `import { money } from "./utils/money";` : null,
      `import { sum } from "./sum";`,
      ``,
      `export function total(items: number[]) {`,
      `  const subtotal = sum(items);`,
      has("lint") ? `  const total = subtotal;` : null,
      `  return subtotal * ${has("test") ? "1.18" : "1.2"};`,
      `}`,
    ]
      .filter((x) => x !== null)
      .join("\n"),
    "src/sum.ts": `export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);`,
    "src/price.ts": `export const price: number = ${has("type") ? `"19.90"` : "19.9"};`,
    "README.md": "# Shop\n\nA small web shop.",
    "docs/guide.md": "# Guide\n\nHow to run the shop.",
  };
}

/** Bugs the files show. Bugs no file can show (a flaky test, a crash in production) are kept as they were. */
export function bugsIn(files: Files, before: Bug[]): Bug[] {
  const cart = files["src/cart.ts"] ?? "";
  const seen: Partial<Record<Bug, boolean>> = {
    lint: /^\s*const total = /m.test(cart),
    test: /\*\s*1\.18\b/.test(cart),
    type: /:\s*number\s*=\s*["']/.test(files["src/price.ts"] ?? ""),
    build: /from ["']\.\/utils\/money["']/.test(cart) && !files["src/utils/money.ts"],
  };
  // Some lessons put the test or code behind a "kept" bug into the folder; then the file decides.
  const checkout = files["src/checkout.test.ts"];
  if (checkout !== undefined) seen.flaky = racyTest(checkout);
  const list = files["src/list.ts"];
  if (list !== undefined) seen.node20 = /\bObject\.groupBy\(/.test(list);
  const spec = files["e2e/checkout.spec.ts"];
  if (spec !== undefined) seen.hang = /\btimeout:\s*0\b/.test(spec);
  const kept = before.filter((b) => !(b in seen));
  return [...kept, ...(Object.keys(seen) as Bug[]).filter((b) => seen[b])];
}

/**
 * A test that places the order and only then starts listening for its confirmation: when the
 * order is quick, the event is already gone and the test waits until it times out. Skipped
 * tests (`it.skip`) do not run at all.
 */
function racyTest(text: string): boolean {
  if (/\bit\.(skip|todo)\(/.test(text)) return false;
  const place = text.search(/\bplaceOrder\(/);
  const listen = text.search(/\bonce\(/);
  return place >= 0 && listen >= 0 && place < listen;
}

/* ------------------------------------------------------------ the desk */

/**
 * A desk whose folder matches GitHub: main checked out and in sync, the workflows written as
 * files, the source showing the head commit's bugs. `extra` adds or replaces files.
 */
export function deskOf(world: World, extra: Files = {}): Desk {
  const head = commitOf(world, world.heads.main!);
  const files: Files = { ...sourceFiles(head.bugs) };
  for (const wf of world.workflows) files[workflowFile(wf)] = workflowYaml(wf);
  Object.assign(files, extra);
  const remote: Record<string, Files> = {};
  for (const b of Object.keys(world.heads)) remote[b] = { ...files };
  return { world, branch: "main", files: { ...files }, index: { ...files }, trees: { main: { ...files } }, remote, synced: structuredClone(remote), ahead: {}, upstream: ["main"], invalid: {} };
}

/** A fresh shop with these workflows (and init), checked out on main. */
export const freshDesk = (init: WorldInit = {}, extra: Files = {}) => deskOf(freshWorld(init), extra);

const same = (a: Files, b: Files) => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
};

/** Paths that differ between two trees. */
export function changed(a: Files, b: Files): string[] {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((p) => a[p] !== b[p]).sort();
}

export const isWorkflowPath = (p: string) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(p);

export function applyDesk(d: Desk, a: DeskAction): DeskResult {
  const refuse = (error: string): DeskResult => ({ state: d, events: [], error });
  const s: Desk = structuredClone(d);
  const tree = s.trees[s.branch] ?? {};
  switch (a.type) {
    case "write":
      s.files[a.path] = a.content;
      return { state: s, events: [] };
    case "remove":
      if (!(a.path in s.files)) return refuse(`rm: ${a.path}: No such file or directory`);
      delete s.files[a.path];
      return { state: s, events: [] };
    case "add": {
      const all = a.paths === "." || a.paths.includes(".");
      const paths = all ? [...new Set([...Object.keys(s.files), ...Object.keys(s.index)])] : (a.paths as string[]);
      for (const p of paths) {
        if (!(p in s.files) && !(p in s.index)) return refuse(`fatal: pathspec '${p}' did not match any files`);
        if (p in s.files) s.index[p] = s.files[p]!;
        else delete s.index[p];
      }
      return { state: s, events: [] };
    }
    case "commit": {
      if (a.all) for (const p of Object.keys(s.index)) {
        if (p in s.files) s.index[p] = s.files[p]!;
        else delete s.index[p];
      }
      const paths = changed(tree, s.index);
      if (!paths.length) return refuse("nothing to commit, working tree clean");
      s.trees[s.branch] = { ...s.index };
      (s.ahead[s.branch] ??= []).push({ message: a.message, paths });
      return { state: s, events: [] };
    }
    case "switch": {
      if (a.create) {
        if (s.trees[a.branch]) return refuse(`fatal: a branch named '${a.branch}' already exists`);
        s.trees[a.branch] = { ...tree };
        s.ahead[a.branch] = [];
        s.branch = a.branch;
        return { state: s, events: [] };
      }
      if (a.branch === s.branch) return refuse(`Already on '${a.branch}'`);
      let target = s.trees[a.branch];
      if (!target && s.remote[a.branch]) {
        target = s.trees[a.branch] = { ...s.remote[a.branch]! };
        s.synced[a.branch] = { ...s.remote[a.branch]! };
        s.ahead[a.branch] = [];
        s.upstream.push(a.branch);
      }
      if (!target) return refuse(`fatal: invalid reference: ${a.branch}`);
      const dirty = changed(tree, s.index).concat(changed(s.index, pick(s.files, Object.keys(s.index))));
      const clash = dirty.filter((p) => target![p] !== tree[p]);
      if (clash.length) return refuse(`error: Your local changes to the following files would be overwritten by checkout:\n\t${clash.join("\n\t")}\nPlease commit your changes or stash them before you switch branches.\nAborting`);
      // Files that differ between the branches follow the switch; local edits elsewhere stay.
      for (const p of changed(tree, target)) {
        if (p in target) s.files[p] = s.index[p] = target[p]!;
        else {
          delete s.files[p];
          delete s.index[p];
        }
      }
      s.branch = a.branch;
      return { state: s, events: [] };
    }
    case "push": {
      const branch = a.branch ?? s.branch;
      const local = s.trees[branch];
      if (!local) return refuse(`error: src refspec ${branch} does not match any`);
      const known = s.upstream.includes(branch);
      if (!known && !a.setUpstream && !a.branch) return refuse(`fatal: The current branch ${branch} has no upstream branch.\nTo push the current branch and set the remote as upstream, use\n\n    git push --set-upstream origin ${branch}\n`);
      const commits = s.ahead[branch] ?? [];
      if (!commits.length && s.world.heads[branch]) return refuse("Everything up-to-date");
      if (!commits.length) return refuse(`(in this sandbox, commit something on ${branch} before its first push)`);
      if (s.remote[branch] && s.synced[branch] && !same(s.remote[branch]!, s.synced[branch]!))
        return refuse(`To https://github.com/ada/shop.git\n ! [rejected]        ${branch} -> ${branch} (fetch first)\nerror: failed to push some refs to 'https://github.com/ada/shop.git'\nhint: Updates were rejected because the remote contains work that you do not\nhint: have locally. Integrate the remote changes (e.g.\nhint: 'git pull ...') before pushing again.`);
      const events: CiEvent[] = [];
      // Workflow files take effect with the push that carries them; a file GitHub refuses runs nothing.
      let w = s.world;
      s.invalid = {};
      const names = new Set<string>();
      for (const [path, text] of Object.entries(local)) {
        if (!isWorkflowPath(path)) continue;
        const r = readWorkflow(text, path);
        if (!r.ok) {
          s.invalid[path] = r.problems;
          continue;
        }
        names.add(r.workflow.name);
        const old = w.workflows.find((x) => x.name === r.workflow.name);
        if (!old || workflowYaml(old) !== workflowYaml(r.workflow)) {
          const res = applyCi(w, { type: "setWorkflow", workflow: r.workflow });
          w = res.state;
          events.push(...res.events);
        }
      }
      for (const wf of [...w.workflows]) {
        if (names.has(wf.name)) continue;
        const res = applyCi(w, { type: "removeWorkflow", name: wf.name });
        w = res.state;
        events.push(...res.events);
      }
      const paths = [...new Set(commits.flatMap((c) => c.paths))].sort();
      const parent = commitOf(w, w.heads[branch] ?? w.heads.main!);
      const bugs = bugsIn(local, parent.bugs);
      const res = applyCi(w, {
        type: "push",
        branch,
        paths: paths.length ? paths : ["src/app.ts"],
        message: commits.at(-1)?.message ?? "push",
        add: bugs.filter((b) => !parent.bugs.includes(b)),
        fix: parent.bugs.filter((b) => !bugs.includes(b)),
        lock: paths.includes("package-lock.json"),
      });
      s.world = res.state;
      events.push(...res.events);
      s.remote[branch] = { ...local };
      s.synced[branch] = { ...local };
      s.ahead[branch] = [];
      if (!s.upstream.includes(branch) && (a.setUpstream || !a.branch)) s.upstream.push(branch);
      return { state: s, events };
    }
    case "pull": {
      const remote = s.remote[s.branch];
      if (!remote) return refuse(`There is no tracking information for the current branch.`);
      if ((s.ahead[s.branch] ?? []).length) return refuse("fatal: Not possible to fast-forward, aborting.");
      if (same(remote, tree)) return refuse("Already up to date.");
      for (const p of changed(tree, remote)) {
        if (p in remote) s.files[p] = s.index[p] = remote[p]!;
        else {
          delete s.files[p];
          delete s.index[p];
        }
      }
      s.trees[s.branch] = { ...remote };
      s.synced[s.branch] = { ...remote };
      return { state: s, events: [] };
    }
    case "gh": {
      const before = s.world;
      const res = applyCi(before, a.action);
      const err = res.events.find((e) => e.type === "error");
      if (err && err.type === "error") return { state: d, events: res.events, error: err.code };
      s.world = res.state;
      // A merged PR: GitHub's main now has the branch's files.
      for (const e of res.events) {
        if (e.type === "merged") {
          const pr = s.world.prs.find((p) => p.id === e.pr)!;
          s.remote.main = { ...(s.remote.main ?? {}), ...(s.remote[pr.branch] ?? {}) };
        }
      }
      return { state: s, events: res.events };
    }
  }
}

const pick = (f: Files, keys: string[]): Files => Object.fromEntries(keys.filter((k) => k in f).map((k) => [k, f[k]!]));

export function replayDesk(start: Desk, actions: DeskAction[]): { states: Desk[]; events: CiEvent[][] } {
  const states = [start];
  const events: CiEvent[][] = [];
  let d = start;
  for (const a of actions) {
    const r = applyDesk(d, a);
    d = r.state;
    states.push(d);
    events.push(r.events);
  }
  return { states, events };
}
