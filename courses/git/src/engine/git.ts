import { hashCommit, hashTree, type Files } from "./objects";

export type { Files } from "./objects";

/**
 * A small, deterministic Git for teaching. The same actions always give the same result,
 * and object ids are real Git ids for the same content, author and time.
 *
 * Simplifications (lessons that rely on one say so in a "Gerçekte" note):
 * - Each file merges as a single unit: two sides changing the same file conflict, even
 *   when real Git would merge different lines on its own.
 * - Merging, rebasing and pulling need a clean working tree.
 * - One remote, called origin. Tags are lightweight.
 * - Every commit's author and committer are the same, one tick of the clock apart.
 */

export interface Commit {
  id: string;
  tree: string;
  parents: string[];
  message: string;
  author: string;
  time: number;
  files: Files;
}

export type Head = { kind: "branch"; name: string } | { kind: "detached"; id: string };

export interface ReflogEntry {
  from: string | null;
  to: string;
  message: string;
}

export interface StashEntry {
  base: string;
  /** Tracked files as they were in the working tree, only those that differed from base. */
  work: Files;
  removed: string[];
  /** Files that were new and staged. */
  added: string[];
  message: string;
}

export interface Remote {
  branches: Record<string, string>;
  commits: Record<string, Commit>;
  tags: Record<string, string>;
}

export type Op =
  | { kind: "merge"; theirs: string; theirsName: string; conflicts: string[] }
  | {
      kind: "rebase";
      branch: string;
      original: string;
      onto: string;
      todo: string[];
      applying: string;
      conflicts: string[];
    }
  | { kind: "cherry-pick" | "revert"; target: string; conflicts: string[] };

export interface Bisect {
  /** First-parent chain from the known bad commit down to just above the good one, newest first. */
  range: string[];
  lo: number;
  hi: number;
  testing: string;
  returnTo: Head;
  found: string | null;
}

export interface Repo {
  time: number;
  author: string;
  commits: Record<string, Commit>;
  branches: Record<string, string>;
  tags: Record<string, string>;
  head: Head;
  index: Files;
  work: Files;
  reflog: ReflogEntry[];
  stash: StashEntry[];
  remote: Remote | null;
  /** Remote-tracking branches: "origin/main" → commit id, as of the last fetch or push. */
  tracking: Record<string, string>;
  upstream: Record<string, string>;
  op: Op | null;
  bisect: Bisect | null;
}

export const ADA = "Ada <ada@example.com>";
export const BORA = "Bora <bora@example.com>";
export const START_TIME = 1700000000;

export function createRepo(opts: { author?: string; branch?: string } = {}): Repo {
  return {
    time: START_TIME,
    author: opts.author ?? ADA,
    commits: {},
    branches: {},
    tags: {},
    head: { kind: "branch", name: opts.branch ?? "main" },
    index: {},
    work: {},
    reflog: [],
    stash: [],
    remote: null,
    tracking: {},
    upstream: {},
    op: null,
    bisect: null,
  };
}

/* ----------------------------------------------------------------- actions */

export type ResetMode = "soft" | "mixed" | "hard";

export type GitAction =
  | { type: "write"; path: string; content: string }
  | { type: "remove"; path: string }
  | { type: "add"; paths: string[] | "." }
  | { type: "rmCached"; path: string }
  | { type: "restore"; path: string }
  | { type: "unstage"; path: string }
  | { type: "commit"; message?: string; amend?: boolean; all?: boolean }
  | { type: "branch"; name: string; at?: string }
  | { type: "deleteBranch"; name: string; force?: boolean }
  | { type: "switch"; target: string; create?: boolean }
  | { type: "checkout"; target: string }
  | { type: "merge"; target: string; noFf?: boolean; ffOnly?: boolean }
  | { type: "resolve"; path: string; take: "ours" | "theirs" | "both" }
  | { type: "abort" }
  | { type: "continue" }
  | { type: "rebase"; onto: string }
  | { type: "rebaseInteractive"; base: string; plan: PlanItem[] }
  | { type: "cherryPick"; target: string }
  | { type: "revert"; target: string }
  | { type: "reset"; target: string; mode: ResetMode }
  | { type: "stash"; message?: string }
  | { type: "stashPop" }
  | { type: "stashDrop" }
  | { type: "tag"; name: string; target?: string }
  | { type: "fetch" }
  | { type: "pull"; rebase?: boolean }
  | { type: "push"; branch?: string; force?: "force" | "lease"; setUpstream?: boolean }
  | { type: "teammate"; branch: string; path: string; content: string | null; message: string }
  | { type: "bisectStart"; bad: string; good: string }
  | { type: "bisectMark"; verdict: "good" | "bad" }
  | { type: "bisectReset" };

export interface PlanItem {
  id: string;
  action: "pick" | "reword" | "squash" | "fixup" | "drop";
  message?: string;
}

export type GitEvent =
  | { type: "wrote"; path: string; created: boolean }
  | { type: "removed"; path: string }
  | { type: "staged"; paths: string[] }
  | { type: "unstaged"; paths: string[] }
  | { type: "restored"; path: string }
  | { type: "untracked"; path: string }
  | { type: "committed"; id: string; branch: string | null; message: string; amend: boolean; merge: boolean; files: number }
  | { type: "branchCreated"; name: string; at: string }
  | { type: "branchDeleted"; name: string; at: string }
  | { type: "switched"; from: string; to: string; detached: boolean }
  | { type: "fastForward"; branch: string; from: string; to: string }
  | { type: "upToDate" }
  | { type: "conflict"; paths: string[]; during: Op["kind"] }
  | { type: "resolved"; path: string; take: "ours" | "theirs" | "both" }
  | { type: "aborted"; kind: Op["kind"] }
  | { type: "rebased"; branch: string; replayed: number; skipped: number; onto: string }
  | { type: "picked"; from: string; id: string }
  | { type: "reverted"; target: string; id: string }
  | { type: "reset"; mode: ResetMode; from: string; to: string; left: string[] }
  | { type: "stashed"; files: number }
  | { type: "stashApplied"; files: number }
  | { type: "stashDropped" }
  | { type: "tagged"; name: string; at: string }
  | { type: "fetched"; updates: { ref: string; from: string | null; to: string }[] }
  | { type: "pushed"; branch: string; from: string | null; to: string; forced: boolean }
  | { type: "pushRejected"; branch: string; reason: "non-fast-forward" | "stale" | "no-upstream" }
  | { type: "teammatePushed"; branch: string; id: string; message: string }
  | { type: "bisectTesting"; id: string; left: number }
  | { type: "bisectFound"; id: string }
  | { type: "bisectDone"; back: string }
  | { type: "error"; message: string; code: ErrorCode };

export type ErrorCode =
  | "nothing-to-commit"
  | "no-such-ref"
  | "branch-exists"
  | "dirty"
  | "would-overwrite"
  | "conflicts-left"
  | "no-op"
  | "op-in-progress"
  | "not-merged"
  | "current-branch"
  | "ignored"
  | "no-stash"
  | "no-remote"
  | "unborn"
  | "not-ancestor"
  | "bisect";

export interface StepResult {
  state: Repo;
  events: GitEvent[];
}

/* ----------------------------------------------------------------- reading */

export function headId(s: Repo): string | null {
  return s.head.kind === "detached" ? s.head.id : (s.branches[s.head.name] ?? null);
}

export function currentBranch(s: Repo): string | null {
  return s.head.kind === "branch" ? s.head.name : null;
}

export function headFiles(s: Repo): Files {
  const id = headId(s);
  return id ? s.commits[id]!.files : {};
}

/** Resolves a revision: a branch, tag, HEAD, HEAD~n / HEAD^, origin/x, or an id (7+ characters). */
export function resolve(s: Repo, rev: string): string | null {
  const m = /^(.+?)((?:[~^]\d*)*)$/.exec(rev);
  if (!m) return null;
  let id = base(s, m[1]!);
  for (const part of m[2]!.match(/[~^]\d*/g) ?? []) {
    if (!id) return null;
    const n = part.length > 1 ? Number(part.slice(1)) : 1;
    if (part[0] === "~") {
      for (let i = 0; i < n && id; i++) id = s.commits[id]!.parents[0] ?? null;
    } else {
      id = n === 0 ? id : (s.commits[id]!.parents[n - 1] ?? null);
    }
  }
  return id;
}

function base(s: Repo, name: string): string | null {
  if (name === "HEAD") return headId(s);
  if (s.branches[name]) return s.branches[name]!;
  if (s.tags[name]) return s.tags[name]!;
  if (s.tracking[name]) return s.tracking[name]!;
  if (/^[0-9a-f]{4,40}$/.test(name)) {
    const hits = Object.keys(s.commits).filter((id) => id.startsWith(name));
    if (hits.length === 1) return hits[0]!;
  }
  return null;
}

export const short = (id: string) => id.slice(0, 7);

export function ancestors(s: Repo, id: string): Set<string> {
  const seen = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const c = stack.pop()!;
    if (seen.has(c)) continue;
    seen.add(c);
    for (const p of s.commits[c]?.parents ?? []) stack.push(p);
  }
  return seen;
}

export const isAncestor = (s: Repo, maybe: string, of: string) => ancestors(s, of).has(maybe);

/** The best common ancestor of two commits: a shared ancestor no other shared ancestor descends from. */
export function mergeBase(s: Repo, a: string, b: string): string | null {
  const ofA = ancestors(s, a);
  const common = [...ancestors(s, b)].filter((c) => ofA.has(c));
  const best = common.filter((c) => !common.some((o) => o !== c && isAncestor(s, c, o)));
  return best.sort((x, y) => s.commits[y]!.time - s.commits[x]!.time)[0] ?? null;
}

/** Commits on a first-parent walk from `id`, newest first. */
export function firstParents(s: Repo, id: string | null): string[] {
  const out: string[] = [];
  for (let c = id; c; c = s.commits[c]!.parents[0] ?? null) out.push(c);
  return out;
}

/** Everything any branch, tag, HEAD, remote-tracking ref or stash can still reach. */
export function reachable(s: Repo): Set<string> {
  const tips = [headId(s), ...Object.values(s.branches), ...Object.values(s.tags), ...Object.values(s.tracking), ...s.stash.map((e) => e.base)];
  const all = new Set<string>();
  for (const t of tips) if (t) for (const c of ancestors(s, t)) all.add(c);
  return all;
}

export function aheadBehind(s: Repo, local: string, other: string) {
  const a = ancestors(s, local);
  const b = ancestors(s, other);
  return { ahead: [...a].filter((c) => !b.has(c)).length, behind: [...b].filter((c) => !a.has(c)).length };
}

/* ------------------------------------------------------------------ status */

export function ignorePatterns(s: Repo): string[] {
  const text = s.work[".gitignore"] ?? s.index[".gitignore"] ?? "";
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

export function isIgnored(patterns: string[], path: string): boolean {
  const name = path.split("/").pop()!;
  return patterns.some((p) => {
    if (p.endsWith("/")) return path.startsWith(p) || path.includes(`/${p}`);
    if (p.startsWith("*.")) return name.endsWith(p.slice(1));
    return p.includes("/") ? path === p : name === p;
  });
}

export type Change = "added" | "modified" | "deleted";

export interface Status {
  staged: { path: string; change: Change }[];
  unstaged: { path: string; change: Change }[];
  untracked: string[];
  ignored: string[];
  conflicted: string[];
  clean: boolean;
}

function diff(from: Files, to: Files): { path: string; change: Change }[] {
  const paths = [...new Set([...Object.keys(from), ...Object.keys(to)])].sort();
  return paths.flatMap((path) => {
    if (from[path] === to[path]) return [];
    const change: Change = from[path] === undefined ? "added" : to[path] === undefined ? "deleted" : "modified";
    return [{ path, change }];
  });
}

export function status(s: Repo): Status {
  const conflicted = s.op?.conflicts ?? [];
  const patterns = ignorePatterns(s);
  const staged = diff(headFiles(s), s.index).filter((c) => !conflicted.includes(c.path));
  const unstaged: { path: string; change: Change }[] = [];
  for (const path of Object.keys(s.index).sort()) {
    if (conflicted.includes(path)) continue;
    if (!(path in s.work)) unstaged.push({ path, change: "deleted" });
    else if (s.work[path] !== s.index[path]) unstaged.push({ path, change: "modified" });
  }
  const loose = Object.keys(s.work).filter((p) => !(p in s.index)).sort();
  const untracked = loose.filter((p) => !isIgnored(patterns, p));
  const ignored = loose.filter((p) => isIgnored(patterns, p));
  return {
    staged,
    unstaged,
    untracked,
    ignored,
    conflicted,
    clean: staged.length === 0 && unstaged.length === 0 && conflicted.length === 0,
  };
}

/** Tracked changes, staged or not: what merge, switch and stash care about. */
function trackedDirty(s: Repo): string[] {
  const head = headFiles(s);
  const paths = new Set([...Object.keys(head), ...Object.keys(s.index)]);
  return [...paths].filter((p) => s.index[p] !== head[p] || (p in s.index && s.work[p] !== s.index[p]));
}

/* ------------------------------------------------------------------- apply */

export function apply(prev: Repo, action: GitAction): StepResult {
  const s = structuredClone(prev);
  const events: GitEvent[] = [];
  const fail = (code: ErrorCode, message: string): StepResult => ({ state: prev, events: [{ type: "error", code, message }] });

  // During a merge, rebase or pick, only finishing or giving up is allowed (plus editing files).
  const allowedDuringOp: GitAction["type"][] = ["write", "remove", "add", "resolve", "abort", "continue", "commit", "restore"];
  if (s.op && !allowedDuringOp.includes(action.type)) {
    return fail("op-in-progress", `A ${s.op.kind} is in progress: resolve and continue, or abort`);
  }
  if (s.bisect && !["bisectMark", "bisectReset", "write", "restore"].includes(action.type)) {
    return fail("bisect", "Bisect is running: mark good or bad, or reset");
  }

  switch (action.type) {
    case "write": {
      const created = !(action.path in s.work);
      s.work[action.path] = action.content;
      events.push({ type: "wrote", path: action.path, created });
      break;
    }

    case "remove": {
      if (!(action.path in s.work)) return fail("no-such-ref", `${action.path} does not exist`);
      delete s.work[action.path];
      events.push({ type: "removed", path: action.path });
      break;
    }

    case "add": {
      const patterns = ignorePatterns(s);
      // `git add .` stages everything, whether "." comes alone or in a list.
      const all = action.paths === "." || action.paths.includes(".");
      const candidates =
        all
          ? [...new Set([...Object.keys(s.work), ...Object.keys(s.index)])]
          : action.paths;
      const staged: string[] = [];
      for (const p of candidates) {
        const tracked = p in s.index;
        if (!tracked && !(p in s.work)) {
          if (!all) return fail("no-such-ref", `pathspec '${p}' did not match any files`);
          continue;
        }
        if (!tracked && isIgnored(patterns, p)) {
          if (!all) return fail("ignored", `${p} is ignored by .gitignore`);
          continue;
        }
        const before = s.index[p];
        if (p in s.work) s.index[p] = s.work[p]!;
        else delete s.index[p];
        if (s.op) s.op.conflicts = s.op.conflicts.filter((c) => c !== p);
        if (before !== s.index[p] || prev.op?.conflicts.includes(p)) staged.push(p);
      }
      if (staged.length === 0) return fail("no-op", "Nothing to stage");
      events.push({ type: "staged", paths: staged.sort() });
      break;
    }

    case "rmCached": {
      if (!(action.path in s.index)) return fail("no-such-ref", `${action.path} is not tracked`);
      delete s.index[action.path];
      events.push({ type: "untracked", path: action.path });
      break;
    }

    case "restore": {
      const from = s.index[action.path];
      if (from === undefined) return fail("no-such-ref", `${action.path} is not tracked`);
      if (s.work[action.path] === from) return fail("no-op", `${action.path} has no changes to throw away`);
      s.work[action.path] = from;
      events.push({ type: "restored", path: action.path });
      break;
    }

    case "unstage": {
      const head = headFiles(s);
      if (s.index[action.path] === head[action.path]) return fail("no-op", `${action.path} is not staged`);
      if (head[action.path] === undefined) delete s.index[action.path];
      else s.index[action.path] = head[action.path]!;
      events.push({ type: "unstaged", paths: [action.path] });
      break;
    }

    case "commit":
      return commit(prev, s, action, events, fail);

    case "branch": {
      if (s.branches[action.name]) return fail("branch-exists", `A branch named '${action.name}' already exists`);
      const at = resolve(s, action.at ?? "HEAD");
      if (!at) return fail("unborn", "There is no commit to start a branch from yet");
      s.branches[action.name] = at;
      events.push({ type: "branchCreated", name: action.name, at });
      break;
    }

    case "deleteBranch": {
      const at = s.branches[action.name];
      if (!at) return fail("no-such-ref", `branch '${action.name}' not found`);
      if (currentBranch(s) === action.name) return fail("current-branch", `Cannot delete the branch you are on`);
      const head = headId(s);
      if (!action.force && head && !isAncestor(s, at, head)) {
        return fail("not-merged", `The branch '${action.name}' is not fully merged`);
      }
      delete s.branches[action.name];
      delete s.upstream[action.name];
      events.push({ type: "branchDeleted", name: action.name, at });
      break;
    }

    case "switch": {
      if (action.create) {
        if (s.branches[action.target]) return fail("branch-exists", `A branch named '${action.target}' already exists`);
        const at = headId(s);
        if (!at) return fail("unborn", "There is no commit to start a branch from yet");
        s.branches[action.target] = at;
        events.push({ type: "branchCreated", name: action.target, at });
        moveHead(s, { kind: "branch", name: action.target }, `checkout: moving from ${headName(prev)} to ${action.target}`);
        events.push({ type: "switched", from: headName(prev), to: action.target, detached: false });
        break;
      }
      let target = s.branches[action.target];
      if (!target && s.tracking[`origin/${action.target}`]) {
        // Like `git switch feature` when only origin/feature exists: make a tracking branch.
        target = s.tracking[`origin/${action.target}`]!;
        s.branches[action.target] = target;
        s.upstream[action.target] = `origin/${action.target}`;
        events.push({ type: "branchCreated", name: action.target, at: target });
      }
      if (!target) return fail("no-such-ref", `invalid reference: ${action.target}`);
      if (currentBranch(s) === action.target) return fail("no-op", `Already on '${action.target}'`);
      const moved = checkoutTree(s, s.commits[target]!.files);
      if (moved) return fail("would-overwrite", `Your local changes to ${moved} would be overwritten`);
      moveHead(s, { kind: "branch", name: action.target }, `checkout: moving from ${headName(prev)} to ${action.target}`);
      events.push({ type: "switched", from: headName(prev), to: action.target, detached: false });
      break;
    }

    case "checkout": {
      const id = resolve(s, action.target);
      if (!id) return fail("no-such-ref", `unknown revision '${action.target}'`);
      const moved = checkoutTree(s, s.commits[id]!.files);
      if (moved) return fail("would-overwrite", `Your local changes to ${moved} would be overwritten`);
      moveHead(s, { kind: "detached", id }, `checkout: moving from ${headName(prev)} to ${short(id)}`);
      events.push({ type: "switched", from: headName(prev), to: short(id), detached: true });
      break;
    }

    case "merge":
      return merge(prev, s, action, events, fail);

    case "resolve": {
      if (!s.op || !s.op.conflicts.includes(action.path)) return fail("no-op", `${action.path} has no conflict`);
      const sides = conflictSides(s, action.path);
      const content =
        action.take === "ours"
          ? sides.ours
          : action.take === "theirs"
            ? sides.theirs
            : [sides.ours, sides.theirs].filter((x) => x !== undefined).join("\n");
      if (content === undefined) delete s.work[action.path];
      else s.work[action.path] = content;
      events.push({ type: "resolved", path: action.path, take: action.take });
      break;
    }

    case "abort": {
      if (!s.op) return fail("no-op", "Nothing to abort");
      const kind = s.op.kind;
      const back = s.op.kind === "rebase" ? s.op.original : headId(s)!;
      if (s.op.kind === "rebase") {
        s.head = { kind: "branch", name: s.op.branch };
        s.branches[s.op.branch] = s.op.original;
      }
      const files = s.commits[back]!.files;
      s.index = { ...files };
      s.work = { ...files, ...untrackedOf(prev) };
      if (s.op.kind === "rebase") s.reflog.push({ from: headId(prev), to: back, message: `rebase (abort): returning to refs/heads/${s.op.branch}` });
      s.op = null;
      events.push({ type: "aborted", kind });
      break;
    }

    case "continue":
      return continueOp(prev, s, events, fail);

    case "rebase":
      return rebase(prev, s, action, events, fail);

    case "rebaseInteractive":
      return rebaseInteractive(prev, s, action, events, fail);

    case "cherryPick":
    case "revert": {
      const target = resolve(s, action.target);
      const head = headId(s);
      if (!target) return fail("no-such-ref", `bad revision '${action.target}'`);
      if (!head) return fail("unborn", "Nothing to apply onto yet");
      if (trackedDirty(s).length) return fail("dirty", "Commit or stash your changes first");
      const c = s.commits[target]!;
      const parent = c.parents[0] ? s.commits[c.parents[0]]!.files : {};
      const [baseFiles, theirs] = action.type === "cherryPick" ? [parent, c.files] : [c.files, parent];
      const result = threeWay(baseFiles, s.commits[head]!.files, theirs);
      if (result.conflicts.length) {
        writeConflicts(s, result, action.type === "cherryPick" ? short(target) : `parent of ${short(target)}`);
        s.op = { kind: action.type === "cherryPick" ? "cherry-pick" : "revert", target, conflicts: result.conflicts };
        events.push({ type: "conflict", paths: result.conflicts, during: s.op.kind });
        break;
      }
      const message = action.type === "cherryPick" ? c.message : `Revert "${c.message}"\n\nThis reverts commit ${c.id}.`;
      if (sameFiles(result.files, s.commits[head]!.files)) return fail("no-op", "The change is already there: nothing to commit");
      const id = makeCommit(s, result.files, [head], message);
      s.index = { ...result.files };
      s.work = { ...result.files, ...untrackedOf(prev) };
      advance(s, id, action.type === "cherryPick" ? `cherry-pick: ${c.message}` : `revert: ${message.split("\n")[0]}`);
      events.push(action.type === "cherryPick" ? { type: "picked", from: target, id } : { type: "reverted", target, id });
      break;
    }

    case "reset": {
      const to = resolve(s, action.target);
      const from = headId(s);
      if (!to || !from) return fail("no-such-ref", `unknown revision '${action.target}'`);
      const files = s.commits[to]!.files;
      if (s.head.kind === "branch") s.branches[s.head.name] = to;
      else s.head = { kind: "detached", id: to };
      if (action.mode !== "soft") s.index = { ...files };
      if (action.mode === "hard") s.work = { ...files, ...untrackedOf(prev) };
      s.reflog.push({ from, to, message: `reset: moving to ${action.target}` });
      const left = [...ancestors(s, from)].filter((c) => !ancestors(s, to).has(c));
      events.push({ type: "reset", mode: action.mode, from, to, left });
      break;
    }

    case "stash": {
      const head = headId(s);
      if (!head) return fail("unborn", "You do not have the initial commit yet");
      const dirty = trackedDirty(s);
      if (dirty.length === 0) return fail("no-op", "No local changes to save");
      const baseFiles = s.commits[head]!.files;
      const work: Files = {};
      const removed: string[] = [];
      const added: string[] = [];
      for (const p of dirty) {
        const now = p in s.index ? (s.work[p] ?? undefined) : undefined;
        if (now === undefined) removed.push(p);
        else work[p] = now;
        if (!(p in baseFiles) && p in s.index) added.push(p);
      }
      s.stash.unshift({ base: head, work, removed, added, message: action.message ?? `WIP on ${headName(s)}: ${short(head)} ${s.commits[head]!.message.split("\n")[0]}` });
      s.index = { ...baseFiles };
      s.work = { ...baseFiles, ...untrackedOf(prev) };
      events.push({ type: "stashed", files: dirty.length });
      break;
    }

    case "stashPop": {
      const entry = s.stash[0];
      if (!entry) return fail("no-stash", "No stash entries found");
      const head = headId(s)!;
      const changed: Files = { ...s.commits[entry.base]!.files, ...entry.work };
      for (const p of entry.removed) delete changed[p];
      const result = threeWay(s.commits[entry.base]!.files, s.commits[head]!.files, changed);
      if (result.conflicts.length) return fail("would-overwrite", `The stash conflicts with ${result.conflicts.join(", ")}: commit or undo first`);
      const untracked = untrackedOf(s);
      for (const p of Object.keys(untracked)) if (p in entry.work) return fail("would-overwrite", `${p} already exists, no checkout`);
      s.work = { ...result.files, ...untracked };
      for (const p of entry.added) s.index[p] = result.files[p]!;
      s.stash.shift();
      events.push({ type: "stashApplied", files: Object.keys(entry.work).length + entry.removed.length });
      break;
    }

    case "stashDrop": {
      if (!s.stash.length) return fail("no-stash", "No stash entries found");
      s.stash.shift();
      events.push({ type: "stashDropped" });
      break;
    }

    case "tag": {
      if (s.tags[action.name]) return fail("branch-exists", `tag '${action.name}' already exists`);
      const at = resolve(s, action.target ?? "HEAD");
      if (!at) return fail("no-such-ref", "Nothing to tag yet");
      s.tags[action.name] = at;
      events.push({ type: "tagged", name: action.name, at });
      break;
    }

    case "fetch": {
      if (!s.remote) return fail("no-remote", "No remote named origin");
      events.push(fetchInto(s));
      break;
    }

    case "pull": {
      if (!s.remote) return fail("no-remote", "No remote named origin");
      const branch = currentBranch(s);
      if (!branch) return fail("no-such-ref", "You are not on a branch");
      events.push(fetchInto(s));
      const up = s.upstream[branch] ?? `origin/${branch}`;
      if (!s.tracking[up]) return fail("no-such-ref", `There is no tracking information for '${branch}'`);
      const mid = { state: s, events };
      const r = action.rebase
        ? rebase(prev, s, { type: "rebase", onto: up }, events, fail)
        : merge(prev, s, { type: "merge", target: up }, events, fail);
      return r.state === prev ? { state: prev, events: [...mid.events.filter((e) => e.type !== "fetched"), ...r.events] } : r;
    }

    case "push": {
      if (!s.remote) return fail("no-remote", "No remote named origin");
      const branch = action.branch ?? currentBranch(s);
      if (!branch || !s.branches[branch]) return fail("no-such-ref", "Nothing to push");
      const local = s.branches[branch]!;
      const remoteId = s.remote.branches[branch] ?? null;
      if (remoteId === null && !s.upstream[branch] && !action.setUpstream) {
        events.push({ type: "pushRejected", branch, reason: "no-upstream" });
        return { state: prev, events };
      }
      if (remoteId && remoteId !== local) {
        const known = s.commits[remoteId] !== undefined && isAncestor(s, remoteId, local);
        if (!known) {
          if (action.force === "lease" && s.tracking[`origin/${branch}`] !== remoteId) {
            events.push({ type: "pushRejected", branch, reason: "stale" });
            return { state: prev, events };
          }
          if (!action.force) {
            events.push({ type: "pushRejected", branch, reason: "non-fast-forward" });
            return { state: prev, events };
          }
        }
      }
      if (remoteId === local) return fail("no-op", "Everything up-to-date");
      for (const c of ancestors(s, local)) s.remote.commits[c] = s.commits[c]!;
      s.remote.branches[branch] = local;
      s.tracking[`origin/${branch}`] = local;
      if (action.setUpstream || remoteId === null) s.upstream[branch] = `origin/${branch}`;
      events.push({ type: "pushed", branch, from: remoteId, to: local, forced: Boolean(remoteId && !isAncestor(s, remoteId, local)) });
      break;
    }

    case "teammate": {
      if (!s.remote) return fail("no-remote", "No remote named origin");
      const parent = s.remote.branches[action.branch];
      const files: Files = { ...(parent ? s.remote.commits[parent]!.files : {}) };
      if (action.content === null) delete files[action.path];
      else files[action.path] = action.content;
      const c = buildCommit(files, parent ? [parent] : [], action.message, BORA, s.time);
      s.time += 60;
      s.remote.commits[c.id] = c;
      s.remote.branches[action.branch] = c.id;
      events.push({ type: "teammatePushed", branch: action.branch, id: c.id, message: action.message });
      break;
    }

    case "bisectStart": {
      const bad = resolve(s, action.bad);
      const good = resolve(s, action.good);
      if (!bad || !good) return fail("no-such-ref", "bad or good revision not found");
      if (!isAncestor(s, good, bad)) return fail("not-ancestor", "The good commit must be an ancestor of the bad one");
      const chain = firstParents(s, bad);
      const range = chain.slice(0, chain.indexOf(good));
      const returnTo = s.head;
      s.bisect = { range, lo: 0, hi: range.length - 1, testing: bad, returnTo, found: null };
      // The bad end is known; the first bad commit is somewhere in range[lo..hi], oldest at hi.
      return bisectNext(prev, s, events);
    }

    case "bisectMark": {
      const b = s.bisect;
      if (!b || b.found) return fail("bisect", "Bisect is not waiting for an answer");
      const at = b.range.indexOf(b.testing);
      if (action.verdict === "bad") b.lo = at;
      else b.hi = at - 1;
      return bisectNext(prev, s, events);
    }

    case "bisectReset": {
      const b = s.bisect;
      if (!b) return fail("bisect", "No bisect running");
      const to = b.returnTo.kind === "branch" ? s.branches[b.returnTo.name]! : b.returnTo.id;
      s.index = { ...s.commits[to]!.files };
      s.work = { ...s.commits[to]!.files, ...untrackedOf(prev) };
      moveHead(s, b.returnTo, `checkout: moving from ${short(b.testing)} to ${b.returnTo.kind === "branch" ? b.returnTo.name : short(to)}`);
      s.bisect = null;
      events.push({ type: "bisectDone", back: b.returnTo.kind === "branch" ? b.returnTo.name : short(to) });
      break;
    }
  }

  return { state: s, events };
}

/** Replays actions in order and keeps every state, so a lesson can rewind. */
export function simulate(actions: GitAction[], start: Repo = createRepo()): { states: Repo[]; events: GitEvent[][] } {
  const states = [start];
  const events: GitEvent[][] = [];
  let current = start;
  for (const a of actions) {
    const r = apply(current, a);
    current = r.state;
    states.push(current);
    events.push(r.events);
  }
  return { states, events };
}

/* ------------------------------------------------------------- internals */

type Fail = (code: ErrorCode, message: string) => StepResult;

function headName(s: Repo): string {
  return s.head.kind === "branch" ? s.head.name : short(s.head.id);
}

function untrackedOf(s: Repo): Files {
  const out: Files = {};
  for (const [p, v] of Object.entries(s.work)) if (!(p in s.index)) out[p] = v;
  return out;
}

function sameFiles(a: Files, b: Files) {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

export function buildCommit(files: Files, parents: string[], message: string, author: string, time: number): Commit {
  const tree = hashTree(files);
  const id = hashCommit({ tree, parents, author, time, message });
  return { id, tree, parents, message, author, time, files: { ...files } };
}

function makeCommit(s: Repo, files: Files, parents: string[], message: string): string {
  const c = buildCommit(files, parents, message, s.author, s.time);
  s.time += 60;
  s.commits[c.id] = c;
  return c.id;
}

/** Moves HEAD (and the current branch, if any) to a new commit, with a reflog line. */
function advance(s: Repo, id: string, message: string) {
  const from = headId(s);
  if (s.head.kind === "branch") s.branches[s.head.name] = id;
  else s.head = { kind: "detached", id };
  s.reflog.push({ from, to: id, message });
}

function moveHead(s: Repo, to: Head, message: string) {
  const from = headId(s);
  s.head = to;
  const id = headId(s)!;
  s.reflog.push({ from, to: id, message });
}

/**
 * Updates index and working tree to another commit's files, carrying local changes along
 * like Git does. Returns the first path that would be overwritten, or null when it worked.
 */
function checkoutTree(s: Repo, target: Files): string | null {
  const head = headFiles(s);
  const dirty = new Set([...trackedDirty(s), ...Object.keys(untrackedOf(s))]);
  for (const p of dirty) {
    const untracked = !(p in s.index) && !(p in head);
    if (untracked ? p in target : target[p] !== head[p]) return p;
  }
  const index: Files = { ...target };
  const work: Files = { ...target };
  for (const p of dirty) {
    if (s.index[p] !== head[p]) {
      if (p in s.index) index[p] = s.index[p]!;
      else delete index[p];
    }
    if (p in s.work) work[p] = s.work[p]!;
    else delete work[p];
  }
  s.index = index;
  s.work = work;
  return null;
}

interface ThreeWay {
  files: Files;
  conflicts: string[];
  ours: Files;
  theirs: Files;
}

/** Merges two sides file by file against their common base. */
export function threeWay(baseFiles: Files, ours: Files, theirs: Files): ThreeWay {
  const files: Files = {};
  const conflicts: string[] = [];
  const paths = [...new Set([...Object.keys(baseFiles), ...Object.keys(ours), ...Object.keys(theirs)])].sort();
  for (const p of paths) {
    const b = baseFiles[p];
    const o = ours[p];
    const t = theirs[p];
    let v: string | undefined;
    if (o === t) v = o;
    else if (b === o) v = t;
    else if (b === t) v = o;
    else {
      conflicts.push(p);
      continue;
    }
    if (v !== undefined) files[p] = v;
  }
  return { files, conflicts, ours, theirs };
}

export function conflictMarkers(ours: string | undefined, theirs: string | undefined, theirsName: string) {
  return `<<<<<<< HEAD\n${ours ?? ""}\n=======\n${theirs ?? ""}\n>>>>>>> ${theirsName}`;
}

function writeConflicts(s: Repo, r: ThreeWay, theirsName: string) {
  const untracked = untrackedOf(s);
  s.index = { ...r.files };
  s.work = { ...r.files, ...untracked };
  for (const p of r.conflicts) {
    s.work[p] = conflictMarkers(r.ours[p], r.theirs[p], theirsName);
    // The index keeps our side until the conflict is resolved and added.
    if (r.ours[p] !== undefined) s.index[p] = r.ours[p]!;
  }
}

/** Our and their version of a conflicted file, read back from its conflict markers. */
export function conflictSides(s: Repo, path: string): { ours?: string; theirs?: string } {
  const text = s.work[path] ?? "";
  const m = /^<<<<<<< [^\n]*\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> [^\n]*$/.exec(text);
  if (!m) return { ours: text, theirs: text };
  return { ours: m[1] === "" ? undefined : m[1], theirs: m[2] === "" ? undefined : m[2] };
}

function defaultMergeMessage(s: Repo, theirsName: string) {
  const into = currentBranch(s);
  const what = theirsName.startsWith("origin/") ? `remote-tracking branch '${theirsName}'` : `branch '${theirsName}'`;
  return into === "main" || into === "master" || !into ? `Merge ${what}` : `Merge ${what} into ${into}`;
}

function commit(prev: Repo, s: Repo, a: Extract<GitAction, { type: "commit" }>, events: GitEvent[], fail: Fail): StepResult {
  if (s.op && s.op.kind !== "merge") return fail("op-in-progress", `Use continue to finish the ${s.op.kind}`);
  if (s.op && s.op.conflicts.length) return fail("conflicts-left", `Fix the conflicts first: ${s.op.conflicts.join(", ")}`);
  if (a.all) for (const p of Object.keys(s.index)) {
    if (p in s.work) s.index[p] = s.work[p]!;
    else delete s.index[p];
  }
  const head = headId(s);
  const headFilesNow = head ? s.commits[head]!.files : {};
  if (a.amend) {
    if (!head) return fail("unborn", "You have nothing to amend");
    const old = s.commits[head]!;
    const message = a.message ?? old.message;
    if (sameFiles(s.index, old.files) && message === old.message) return fail("nothing-to-commit", "Nothing changed: the amend would be the same commit");
    const id = makeCommit(s, s.index, old.parents, message);
    advance(s, id, `commit (amend): ${message.split("\n")[0]}`);
    events.push({ type: "committed", id, branch: currentBranch(s), message, amend: true, merge: false, files: Object.keys(s.index).length });
    return { state: s, events };
  }
  if (!s.op && sameFiles(s.index, headFilesNow)) return fail("nothing-to-commit", "nothing to commit, working tree clean");
  const parents = head ? [head] : [];
  let message = a.message ?? "";
  if (s.op?.kind === "merge") {
    parents.push(s.op.theirs);
    if (!a.message) message = defaultMergeMessage(s, s.op.theirsName);
  }
  if (!message) return fail("nothing-to-commit", "Aborting commit due to empty commit message");
  const merging = s.op?.kind === "merge";
  const id = makeCommit(s, s.index, parents, message);
  advance(s, id, `${head ? "commit" : "commit (initial)"}${merging ? " (merge)" : ""}: ${message.split("\n")[0]}`);
  s.op = null;
  const changed = diff(headFilesNow, s.index).length;
  events.push({ type: "committed", id, branch: currentBranch(s), message, amend: false, merge: merging, files: changed });
  void prev;
  return { state: s, events };
}

function merge(prev: Repo, s: Repo, a: Extract<GitAction, { type: "merge" }>, events: GitEvent[], fail: Fail): StepResult {
  const theirs = resolve(s, a.target);
  const head = headId(s);
  if (!theirs) return fail("no-such-ref", `merge: ${a.target} - not something we can merge`);
  if (!head) return fail("unborn", "Nothing to merge into yet");
  if (trackedDirty(s).length) return fail("dirty", "Commit or stash your changes before merging");
  if (isAncestor(s, theirs, head)) {
    events.push({ type: "upToDate" });
    return { state: s, events };
  }
  if (isAncestor(s, head, theirs) && !a.noFf) {
    const moved = checkoutTree(s, s.commits[theirs]!.files);
    if (moved) return fail("would-overwrite", `Untracked ${moved} would be overwritten by merge`);
    advance(s, theirs, `merge ${a.target}: Fast-forward`);
    events.push({ type: "fastForward", branch: currentBranch(s) ?? "HEAD", from: head, to: theirs });
    return { state: s, events };
  }
  if (a.ffOnly) return fail("not-ancestor", "Not possible to fast-forward, aborting");
  const mb = mergeBase(s, head, theirs);
  const r = threeWay(mb ? s.commits[mb]!.files : {}, s.commits[head]!.files, s.commits[theirs]!.files);
  if (r.conflicts.length) {
    writeConflicts(s, r, a.target);
    s.op = { kind: "merge", theirs, theirsName: a.target, conflicts: r.conflicts };
    events.push({ type: "conflict", paths: r.conflicts, during: "merge" });
    return { state: s, events };
  }
  const message = defaultMergeMessage(s, a.target);
  const id = makeCommit(s, r.files, [head, theirs], message);
  s.index = { ...r.files };
  s.work = { ...r.files, ...untrackedOf(prev) };
  advance(s, id, `merge ${a.target}: Merge made by the 'ort' strategy.`);
  events.push({ type: "committed", id, branch: currentBranch(s), message, amend: false, merge: true, files: diff(s.commits[head]!.files, r.files).length });
  return { state: s, events };
}

/** Commits that `rebase onto` would replay: on HEAD but not on onto, oldest first, merges dropped. */
export function toReplay(s: Repo, head: string, onto: string): string[] {
  const upstream = ancestors(s, onto);
  const mine = [...ancestors(s, head)].filter((c) => !upstream.has(c) && s.commits[c]!.parents.length <= 1);
  return mine.sort((a, b) => (isAncestor(s, a, b) ? -1 : isAncestor(s, b, a) ? 1 : s.commits[a]!.time - s.commits[b]!.time));
}

function rebase(prev: Repo, s: Repo, a: Extract<GitAction, { type: "rebase" }>, events: GitEvent[], fail: Fail): StepResult {
  const onto = resolve(s, a.onto);
  const head = headId(s);
  const branch = currentBranch(s);
  if (!onto) return fail("no-such-ref", `invalid upstream '${a.onto}'`);
  if (!head || !branch) return fail("no-such-ref", "Rebase needs a branch to be on");
  if (trackedDirty(s).length) return fail("dirty", "cannot rebase: You have unstaged changes");
  if (isAncestor(s, onto, head)) {
    events.push({ type: "upToDate" });
    return { state: s, events };
  }
  if (isAncestor(s, head, onto)) {
    checkoutTree(s, s.commits[onto]!.files);
    advance(s, onto, `rebase (finish): refs/heads/${branch} onto ${short(onto)}`);
    events.push({ type: "fastForward", branch, from: head, to: onto });
    return { state: s, events };
  }
  const todo = toReplay(s, head, onto);
  s.reflog.push({ from: head, to: onto, message: `rebase (start): checkout ${a.onto}` });
  s.head = { kind: "detached", id: onto };
  s.index = { ...s.commits[onto]!.files };
  s.work = { ...s.commits[onto]!.files, ...untrackedOf(prev) };
  s.op = { kind: "rebase", branch, original: head, onto, todo, applying: todo[0]!, conflicts: [] };
  return replayRest(prev, s, events, 0, 0);
}

/** Applies the rebase's remaining commits one by one, stopping at the first conflict. */
function replayRest(prev: Repo, s: Repo, events: GitEvent[], replayed: number, skipped: number): StepResult {
  const op = s.op as Extract<Op, { kind: "rebase" }>;
  while (op.todo.length) {
    const id = op.todo[0]!;
    op.applying = id;
    const c = s.commits[id]!;
    const cur = headId(s)!;
    const parent = c.parents[0] ? s.commits[c.parents[0]]!.files : {};
    const r = threeWay(parent, s.commits[cur]!.files, c.files);
    if (r.conflicts.length) {
      writeConflicts(s, r, `${short(id)} (${c.message.split("\n")[0]})`);
      op.conflicts = r.conflicts;
      events.push({ type: "conflict", paths: r.conflicts, during: "rebase" });
      return { state: s, events };
    }
    op.todo.shift();
    if (sameFiles(r.files, s.commits[cur]!.files)) {
      skipped += 1;
      continue;
    }
    const nid = makeCommit(s, r.files, [cur], c.message);
    s.head = { kind: "detached", id: nid };
    s.index = { ...r.files };
    s.work = { ...r.files, ...untrackedOf(s) };
    s.reflog.push({ from: cur, to: nid, message: `rebase (pick): ${c.message.split("\n")[0]}` });
    replayed += 1;
  }
  const end = headId(s)!;
  s.branches[op.branch] = end;
  s.head = { kind: "branch", name: op.branch };
  s.reflog.push({ from: end, to: end, message: `rebase (finish): returning to refs/heads/${op.branch}` });
  events.push({ type: "rebased", branch: op.branch, replayed, skipped, onto: op.onto });
  s.op = null;
  void prev;
  return { state: s, events };
}

function continueOp(prev: Repo, s: Repo, events: GitEvent[], fail: Fail): StepResult {
  const op = s.op;
  if (!op) return fail("no-op", "Nothing to continue");
  if (op.conflicts.length) return fail("conflicts-left", `Fix the conflicts first: ${op.conflicts.join(", ")}`);
  if (op.kind === "merge") return commit(prev, s, { type: "commit" }, events, fail);
  const cur = headId(s)!;
  if (op.kind === "rebase") {
    const c = s.commits[op.applying]!;
    op.todo.shift();
    if (!sameFiles(s.index, s.commits[cur]!.files)) {
      const nid = makeCommit(s, s.index, [cur], c.message);
      s.head = { kind: "detached", id: nid };
      s.reflog.push({ from: cur, to: nid, message: `rebase (continue): ${c.message.split("\n")[0]}` });
    }
    return replayRest(prev, s, events, 1, 0);
  }
  const c = s.commits[op.target]!;
  const message = op.kind === "cherry-pick" ? c.message : `Revert "${c.message}"\n\nThis reverts commit ${c.id}.`;
  const id = makeCommit(s, s.index, [cur], message);
  advance(s, id, `${op.kind}: ${message.split("\n")[0]}`);
  events.push(op.kind === "cherry-pick" ? { type: "picked", from: op.target, id } : { type: "reverted", target: op.target, id });
  s.op = null;
  return { state: s, events };
}

function rebaseInteractive(prev: Repo, s: Repo, a: Extract<GitAction, { type: "rebaseInteractive" }>, events: GitEvent[], fail: Fail): StepResult {
  const baseId = resolve(s, a.base);
  const head = headId(s);
  const branch = currentBranch(s);
  if (!baseId || !head || !branch) return fail("no-such-ref", `invalid base '${a.base}'`);
  if (trackedDirty(s).length) return fail("dirty", "cannot rebase: You have unstaged changes");
  let cur = baseId;
  let replayed = 0;
  for (const item of a.plan) {
    if (item.action === "drop") continue;
    const c = s.commits[item.id];
    if (!c) return fail("no-such-ref", `unknown commit ${item.id}`);
    const parent = c.parents[0] ? s.commits[c.parents[0]]!.files : {};
    const r = threeWay(parent, s.commits[cur]!.files, c.files);
    if (r.conflicts.length) return fail("would-overwrite", `This plan would conflict at ${short(c.id)}; try another order`);
    if (item.action === "squash" || item.action === "fixup") {
      const prevCommit = s.commits[cur]!;
      if (cur === baseId) return fail("no-op", "Cannot squash without a previous commit");
      const message = item.action === "squash" ? item.message ?? `${prevCommit.message}\n\n${c.message}` : prevCommit.message;
      cur = makeCommit(s, r.files, prevCommit.parents, message);
    } else {
      cur = makeCommit(s, r.files, [cur], item.action === "reword" ? (item.message ?? c.message) : c.message);
      replayed += 1;
    }
  }
  s.branches[branch] = cur;
  s.index = { ...s.commits[cur]!.files };
  s.work = { ...s.commits[cur]!.files, ...untrackedOf(prev) };
  s.reflog.push({ from: head, to: cur, message: `rebase -i (finish): returning to refs/heads/${branch}` });
  // Folded commits (squash, fixup) are not skipped; only dropped ones are.
  const dropped = a.plan.filter((p) => p.action === "drop").length;
  events.push({ type: "rebased", branch, replayed, skipped: dropped, onto: baseId });
  return { state: s, events };
}

function fetchInto(s: Repo): GitEvent {
  const remote = s.remote!;
  const updates: { ref: string; from: string | null; to: string }[] = [];
  for (const [id, c] of Object.entries(remote.commits)) if (!s.commits[id]) s.commits[id] = c;
  for (const [name, id] of Object.entries(remote.branches)) {
    const ref = `origin/${name}`;
    if (s.tracking[ref] !== id) {
      updates.push({ ref, from: s.tracking[ref] ?? null, to: id });
      s.tracking[ref] = id;
    }
  }
  for (const [name, id] of Object.entries(remote.tags)) if (!s.tags[name]) s.tags[name] = id;
  return { type: "fetched", updates };
}

function bisectNext(prev: Repo, s: Repo, events: GitEvent[]): StepResult {
  const b = s.bisect!;
  if (b.lo >= b.hi) {
    b.found = b.range[b.lo]!;
    events.push({ type: "bisectFound", id: b.found });
    return { state: s, events };
  }
  const mid = Math.floor((b.lo + b.hi + 1) / 2);
  const id = b.range[mid]!;
  b.testing = id;
  s.index = { ...s.commits[id]!.files };
  s.work = { ...s.commits[id]!.files, ...untrackedOf(prev) };
  s.reflog.push({ from: headId(s), to: id, message: `checkout: moving to ${short(id)}` });
  s.head = { kind: "detached", id };
  events.push({ type: "bisectTesting", id, left: b.hi - b.lo + 1 });
  return { state: s, events };
}

/* ------------------------------------------------------------- set-ups */

/** A repo already cloned from origin: the starting point for lessons about remotes. */
export function cloned(origin: Remote, opts: { author?: string; branch?: string; time?: number } = {}): Repo {
  const s = createRepo({ author: opts.author ?? ADA, branch: opts.branch ?? "main" });
  s.time = opts.time ?? START_TIME + 60 * 100;
  s.remote = structuredClone(origin);
  s.commits = { ...origin.commits };
  for (const [name, id] of Object.entries(origin.branches)) s.tracking[`origin/${name}`] = id;
  s.tags = { ...origin.tags };
  const branch = opts.branch ?? "main";
  const tip = origin.branches[branch];
  if (tip) {
    s.branches[branch] = tip;
    s.upstream[branch] = `origin/${branch}`;
    s.index = { ...s.commits[tip]!.files };
    s.work = { ...s.commits[tip]!.files };
    s.reflog.push({ from: null, to: tip, message: `clone: from origin` });
  }
  return s;
}

/** Builds a remote from a repo's branches and commits, as if the repo had been pushed there. */
export function asRemote(s: Repo): Remote {
  return { branches: { ...s.branches }, commits: { ...s.commits }, tags: { ...s.tags } };
}
