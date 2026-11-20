import { complete as completeWord, lines, out, shellWords, splitCommands, type TermLine } from "@lets-explain/core/lib/terminal";
import {
  aheadBehind,
  ancestors,
  apply,
  currentBranch,
  firstParents,
  headFiles,
  headId,
  isAncestor,
  isIgnored,
  ignorePatterns,
  mergeBase,
  resolve,
  short,
  status,
  type Commit,
  type Files,
  type GitAction,
  type GitEvent,
  type PlanItem,
  type Repo,
  type ResetMode,
} from "./git";
import { buildTrees, commitText, hashBlob } from "./objects";

/**
 * A command line on top of the model: it reads what a reader types (`git commit -m "…"`,
 * `echo hi > notes.txt`, `nano app.js`), turns it into the same actions the lessons play, and
 * prints what real Git and a real shell would print. Commands it does not know say so plainly
 * instead of pretending.
 */

export interface GitEditor {
  file: string;
  text: string;
  /** Runs with the saved text, on the repository as it was when the editor opened. */
  save: (repo: Repo, text: string) => CliResult;
}

export interface CliResult {
  /** Actions that ran without an error, in order. Replaying them on the old state gives the new one. */
  actions: GitAction[];
  output: TermLine[];
  /** Commands that changed something (an edit, a commit, a switch): a mission counts these. */
  moves: number;
  editor?: GitEditor;
  clear?: boolean;
}

export const PROJECT = "shop";
const REMOTE_URL = "https://github.com/team/shop.git";

/* ------------------------------------------------------------------ entry */

export function runLine(start: Repo, line: string): CliResult {
  const result: CliResult = { actions: [], output: [], moves: 0 };
  let repo = start;
  for (const words of splitCommands(shellWords(line))) {
    const r = runCommand(repo, words);
    result.actions.push(...r.actions);
    result.output.push(...r.output);
    if (r.clear) {
      result.clear = true;
      result.output = [];
    }
    if (r.actions.length) result.moves++;
    for (const a of r.actions) repo = apply(repo, a).state;
    if (r.editor) {
      result.editor = r.editor;
      break;
    }
    if (r.failed) break;
  }
  return result;
}

/** The prompt, the way git's shell prompt shows it: branch, and what is in progress. */
export function promptFor(s: Repo): string {
  let where: string;
  if (s.op?.kind === "rebase") where = s.op.branch;
  else if (s.head.kind === "branch") where = s.head.name;
  else where = `(${short(s.head.id)})`;
  const state =
    s.op?.kind === "merge" ? "|MERGING" : s.op?.kind === "rebase" ? "|REBASE" : s.op?.kind === "cherry-pick" ? "|CHERRY-PICKING" : s.op?.kind === "revert" ? "|REVERTING" : s.bisect ? "|BISECTING" : "";
  return `~/${PROJECT} (${where}${state})$`;
}

const SUBCOMMANDS = [
  "add", "bisect", "branch", "cat-file", "checkout", "cherry-pick", "commit", "diff", "fetch", "help", "log", "ls-files", "merge",
  "pull", "push", "rebase", "reflog", "remote", "reset", "restore", "rev-parse", "revert", "rm", "show", "stash", "status", "switch", "tag",
];
const SHELL = ["git", "ls", "cat", "echo", "touch", "rm", "nano", "clear", "help"];
const FLAGS = ["--staged", "--hard", "--soft", "--mixed", "--oneline", "--all", "--amend", "--no-edit", "--continue", "--abort", "--no-ff", "--ff-only", "--rebase", "--force-with-lease", "--set-upstream", "--graph", "--cached"];

/** Tab completion: subcommands after `git`, otherwise files, branches, tags and common flags. */
export function completeLine(s: Repo, input: string) {
  const words = input.trimStart().split(/\s+/);
  let candidates: string[];
  if (words.length <= 1) candidates = SHELL;
  else if (words[0] === "git" && words.length === 2) candidates = SUBCOMMANDS;
  else {
    const files = new Set([...Object.keys(s.work), ...Object.keys(s.index)]);
    candidates = [...files, ...Object.keys(s.branches), ...Object.keys(s.tags), ...Object.keys(s.tracking), "origin", "HEAD", ...FLAGS];
  }
  return completeWord(input, candidates);
}

/* ------------------------------------------------------------- commands */

interface Run {
  actions: GitAction[];
  output: TermLine[];
  failed?: boolean;
  editor?: GitEditor;
  clear?: boolean;
}

const say = (text: string, tone: TermLine["tone"] = "out"): Run => ({ actions: [], output: lines(text, tone) });
const fail = (text: string): Run => ({ actions: [], output: lines(text, "err"), failed: true });

function runCommand(s: Repo, words: string[]): Run {
  const [cmd, ...args] = words;
  switch (cmd) {
    case "git":
      return git(s, args);
    case "clear":
      return { actions: [], output: [], clear: true };
    case "help":
      return say(HELP);
    case "ls":
      return say(Object.keys(s.work).sort().join("  ") || "");
    case "pwd":
      return say(`/home/you/${PROJECT}`);
    case "cd":
      return say("cd: this sandbox stays in the project folder", "dim");
    case "cat": {
      if (!args.length) return fail("cat: missing file operand");
      const output: TermLine[] = [];
      for (const p of args) {
        const inside = dotGit(s, p);
        if (inside !== null) output.push(...lines(inside));
        else if (p in s.work) output.push(...lines(s.work[p]!));
        else return { actions: [], output: [...output, out(`cat: ${p}: No such file or directory`, "err")], failed: true };
      }
      return { actions: [], output };
    }
    case "echo":
      return echo(s, args);
    case "mv":
    case "cp": {
      const [from, to] = args.filter((a) => !a.startsWith("-"));
      if (!from || !to) return fail(`${cmd}: missing destination file operand after '${from ?? ""}'`);
      if (!(from in s.work)) return fail(`${cmd}: ${from}: No such file or directory`);
      const actions: GitAction[] = [{ type: "write", path: to, content: s.work[from]! }];
      if (cmd === "mv") actions.push({ type: "remove", path: from });
      return { actions, output: [] };
    }
    case "printf":
      return echo(s, args.map((a) => a.replace(/\\n$/, "")));
    case "touch": {
      const actions: GitAction[] = args.filter((p) => !(p in s.work)).map((p) => ({ type: "write", path: p, content: "" }));
      return { actions, output: [] };
    }
    case "rm": {
      const paths = args.filter((a) => !a.startsWith("-"));
      if (!paths.length) return fail("rm: missing operand");
      for (const p of paths) if (!(p in s.work)) return fail(`rm: ${p}: No such file or directory`);
      return { actions: paths.map((p) => ({ type: "remove", path: p })), output: [] };
    }
    case "nano":
    case "vim":
    case "vi":
    case "code": {
      const path = args.find((a) => !a.startsWith("-"));
      if (!path) return fail(`${cmd}: give the file to open, e.g. ${cmd} app.js`);
      return {
        actions: [],
        output: [],
        editor: {
          file: path,
          text: s.work[path] ?? "",
          save: (repo, text) => {
            const content = text.replace(/\n+$/, "");
            if (repo.work[path] === content) return { actions: [], output: [], moves: 0 };
            return { actions: [{ type: "write", path, content }], output: [], moves: 1 };
          },
        },
      };
    }
    default:
      return fail(`bash: ${cmd}: command not found`);
  }
}

function echo(s: Repo, args: string[]): Run {
  const at = args.findIndex((a) => a === ">" || a === ">>");
  if (at === -1) return say(args.join(" "));
  const text = args.slice(0, at).join(" ");
  const path = args[at + 1];
  if (!path) return fail("bash: syntax error near unexpected token `newline'");
  const old = s.work[path];
  const content = args[at] === ">>" && old ? `${old}\n${text}` : text;
  return { actions: [{ type: "write", path, content }], output: [] };
}

/* ------------------------------------------------------------- flag parsing */

interface Parsed {
  flags: Map<string, string | true>;
  /** Every value given for a repeatable flag such as -m. */
  all: Map<string, string[]>;
  rest: string[];
  /** Words after a bare `--`. */
  paths: string[];
}

/**
 * Reads flags against a list of known ones. `"-m="` takes a value; aliases map to one name.
 * Short flags combine (`-am "msg"`). An unknown flag is an error, as in Git.
 */
function parse(args: string[], known: Record<string, string>): Parsed | string {
  const p: Parsed = { flags: new Map(), all: new Map(), rest: [], paths: [] };
  const takes = (name: string) => known[name]?.endsWith("=") ?? false;
  const nameOf = (flag: string) => (known[flag] ?? "").replace(/=$/, "") || flag;
  const set = (flag: string, value: string | true) => {
    const name = nameOf(flag);
    p.flags.set(name, value);
    if (typeof value === "string") p.all.set(name, [...(p.all.get(name) ?? []), value]);
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--") {
      p.paths = args.slice(i + 1);
      break;
    }
    if (a.startsWith("--")) {
      const [flag, inline] = a.includes("=") ? [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)] : [a, undefined];
      if (!(flag in known)) return `error: unknown option \`${flag.slice(2)}'`;
      if (takes(flag)) {
        const v = inline ?? args[++i];
        if (v === undefined) return `error: option \`${flag.slice(2)}' requires a value`;
        set(flag, v);
      } else set(flag, true);
    } else if (/^-[a-zA-Z]/.test(a) && !/^-\d+$/.test(a)) {
      const letters = a.slice(1);
      for (let j = 0; j < letters.length; j++) {
        const flag = `-${letters[j]}`;
        if (!(flag in known)) return `error: unknown switch \`${letters[j]}'`;
        if (takes(flag)) {
          const v = letters.slice(j + 1) || args[++i];
          if (v === undefined) return `error: switch \`${letters[j]}' requires a value`;
          set(flag, v);
          break;
        }
        set(flag, true);
      }
    } else p.rest.push(a);
  }
  return p;
}

/* -------------------------------------------------------------------- git */

/** Runs actions in order and prints what Git prints; stops at the first error. */
function run(s: Repo, actions: GitAction[], ctx: OutCtx = {}): Run {
  let repo = s;
  const done: GitAction[] = [];
  const output: TermLine[] = [];
  for (const a of actions) {
    const r = apply(repo, a);
    output.push(...r.events.flatMap((e) => eventLines(e, repo, r.state, ctx)));
    // A no-op ("nothing to stage", "already up to date") is not a failure: a chain goes on.
    const bad = r.events.some((e) => (e.type === "error" && e.code !== "no-op") || e.type === "pushRejected");
    if (r.state === repo || bad) return { actions: done, output, failed: bad };
    done.push(a);
    repo = r.state;
  }
  return { actions: done, output };
}

function git(s: Repo, args: string[]): Run {
  const [sub, ...rest] = args;
  if (!sub || sub === "--help" || sub === "help") return say(GIT_HELP);
  if (sub === "--version" || sub === "version") return say("git version 2.47.0");
  const handler = GIT[sub];
  if (!handler) return fail(`git: '${sub}' is not a git command. See 'git --help'.`);
  return handler(s, rest);
}

type Handler = (s: Repo, args: string[]) => Run;

const GIT: Record<string, Handler> = {
  status(s, args) {
    const p = parse(args, { "-s": "-s", "--short": "-s", "-b": "-b", "--branch": "-b", "--ignored": "--ignored" });
    if (typeof p === "string") return fail(p);
    const ignored = p.flags.has("--ignored") ? status(s).ignored : [];
    if (p.flags.has("-s")) return { actions: [], output: [...shortStatus(s), ...ignored.map((x) => out(`!! ${x}`, "dim"))] };
    const long = longStatus(s);
    if (!ignored.length) return { actions: [], output: long };
    const tail = long.pop()!;
    return { actions: [], output: [...long, out("Ignored files:"), out('  (use "git add -f <file>..." to include in what will be committed)', "dim"), ...ignored.map((x) => out(`\t${x}`, "dim")), out(""), tail] };
  },

  add(s, args) {
    const p = parse(args, { "-A": "-A", "--all": "-A", "-u": "-A", "-v": "-v" });
    if (typeof p === "string") return fail(p);
    const paths = [...p.rest, ...p.paths];
    if (p.flags.has("-A") || paths.includes(".")) return quiet(run(s, [{ type: "add", paths: "." }]));
    if (!paths.length) return say('Nothing specified, nothing added.\nhint: Maybe you wanted to say \'git add .\'?', "dim");
    return quiet(run(s, [{ type: "add", paths }]));
  },

  rm(s, args) {
    const p = parse(args, { "--cached": "--cached", "-r": "-r", "-f": "-f" });
    if (typeof p === "string") return fail(p);
    const paths = [...p.rest, ...p.paths];
    if (!paths.length) return fail("usage: git rm [--cached] <file>...");
    const actions: GitAction[] = paths.flatMap((path): GitAction[] =>
      p.flags.has("--cached") ? [{ type: "rmCached", path }] : [{ type: "remove", path }, { type: "add", paths: [path] }],
    );
    for (const path of paths) if (!(path in s.index)) return fail(`fatal: pathspec '${path}' did not match any files`);
    const r = run(s, actions);
    return { ...r, output: r.failed ? r.output : paths.map((path) => out(`rm '${path}'`)) };
  },

  mv(s, args) {
    const [from, to] = args.filter((a) => !a.startsWith("-"));
    if (!from || !to) return fail("usage: git mv <source> <destination>");
    if (!(from in s.index)) return fail(`fatal: not under version control, source=${from}, destination=${to}`);
    return quiet(run(s, [{ type: "write", path: to, content: s.work[from] ?? s.index[from]! }, { type: "remove", path: from }, { type: "add", paths: [from, to] }]));
  },

  "check-ignore": (s, args) => {
    const patterns = ignorePatterns(s);
    const hits = args.filter((a) => !a.startsWith("-") && isIgnored(patterns, a));
    return hits.length ? say(hits.join("\n")) : { actions: [], output: [], failed: true };
  },

  "merge-base": (s, args) => {
    const [a, b] = args.filter((x) => !x.startsWith("-"));
    const ia = a && resolve(s, a);
    const ib = b && resolve(s, b);
    if (!ia || !ib) return fail("usage: git merge-base <commit> <commit>");
    const m = mergeBase(s, ia, ib);
    return m ? say(m) : { actions: [], output: [], failed: true };
  },

  "ls-tree": (s, args) => {
    const recursive = args.includes("-r");
    const ref = args.find((a) => !a.startsWith("-")) ?? "HEAD";
    const id = resolve(s, ref.replace(/\^\{tree\}$/, ""));
    if (!id) return fail(`fatal: Not a valid object name ${ref}`);
    const files = s.commits[id]!.files;
    if (recursive) return say(Object.keys(files).sort().map((p) => `100644 blob ${hashBlob(files[p]!)}\t${p}`).join("\n"));
    const root = buildTrees(files)[0]!;
    return say(root.entries.map((e) => `${e.mode === "40000" ? "040000" : e.mode} ${e.type} ${e.id}\t${e.name}`).join("\n"));
  },

  "show-ref": (s) =>
    say(
      [
        ...Object.keys(s.branches).sort().map((b) => `${s.branches[b]} refs/heads/${b}`),
        ...Object.keys(s.tracking).sort().map((r) => `${s.tracking[r]} refs/remotes/${r}`),
        ...Object.keys(s.tags).sort().map((t) => `${s.tags[t]} refs/tags/${t}`),
      ].join("\n"),
    ),

  restore(s, args) {
    const p = parse(args, { "--staged": "--staged", "-S": "--staged", "--worktree": "-W", "-W": "-W", "--ours": "--ours", "--theirs": "--theirs" });
    if (typeof p === "string") return fail(p);
    let paths = [...p.rest, ...p.paths];
    if (!paths.length) return fail("fatal: you must specify path(s) to restore");
    if (p.flags.has("--ours") || p.flags.has("--theirs")) {
      const take = p.flags.has("--ours") ? "ours" : "theirs";
      return quiet(run(s, paths.map((path) => ({ type: "resolve", path, take }) as GitAction)));
    }
    const st = status(s);
    if (p.flags.has("--staged")) {
      if (paths.includes(".")) paths = st.staged.map((c) => c.path);
      const staged = new Set(st.staged.map((c) => c.path));
      for (const path of paths) if (!(path in s.index) && !(path in headFiles(s))) return fail(`error: pathspec '${path}' did not match any file(s) known to git`);
      return quiet(run(s, paths.filter((x) => staged.has(x)).map((path) => ({ type: "unstage", path }) as GitAction)));
    }
    if (paths.includes(".")) paths = st.unstaged.map((c) => c.path);
    for (const path of paths) if (!(path in s.index)) return fail(`error: pathspec '${path}' did not match any file(s) known to git`);
    return quiet(run(s, paths.filter((x) => s.work[x] !== s.index[x]).map((path) => ({ type: "restore", path }) as GitAction)));
  },

  commit(s, args) {
    const p = parse(args, { "-m": "-m=", "--message": "-m=", "-a": "-a", "--all": "-a", "--amend": "--amend", "--no-edit": "--no-edit", "-v": "-v", "-q": "-q", "--fixup": "--fixup=" });
    if (typeof p === "string") return fail(p);
    const fixup = p.flags.get("--fixup");
    if (typeof fixup === "string") {
      const target = resolve(s, fixup);
      if (!target) return fail(`fatal: could not lookup commit '${fixup}'`);
      return run(s, [{ type: "commit", message: `fixup! ${firstLine(s.commits[target]!.message)}`, all: p.flags.has("-a") || undefined }]);
    }
    const amend = p.flags.has("--amend");
    const all = p.flags.has("-a");
    const messages = p.all.get("-m");
    const commitWith = (repo: Repo, message: string | undefined): Run => run(repo, [{ type: "commit", message, amend: amend || undefined, all: all || undefined }]);
    if (messages) return commitWith(s, messages.join("\n\n"));
    if (amend && p.flags.has("--no-edit")) return commitWith(s, undefined);
    // During a merge, a plain `git commit` keeps the prepared message.
    if (s.op?.kind === "merge" && !amend) return commitWith(s, undefined);
    const head = headId(s);
    if (!amend && !all && status(s).staged.length === 0 && !s.op) return commitWith(s, "x");
    const old = amend && head ? s.commits[head]!.message : "";
    return {
      actions: [],
      output: [],
      editor: {
        file: ".git/COMMIT_EDITMSG",
        text: `${old}\n\n${COMMIT_TEMPLATE}`,
        save: (repo, text) => {
          const message = stripComments(text);
          if (!message) return finish(fail("Aborting commit due to empty commit message."));
          return finish(commitWith(repo, message));
        },
      },
    };
  },

  log(s, args) {
    const p = parse(args, {
      "--oneline": "--oneline", "--all": "--all", "--graph": "--graph", "--decorate": "--decorate", "-n": "-n=", "--max-count": "-n=",
      "-p": "-p", "--patch": "-p", "--stat": "--stat", "--merges": "--merges", "--no-merges": "--no-merges", "--format": "--format=", "--pretty": "--format=", "--reverse": "--reverse",
    });
    if (typeof p === "string") return fail(p);
    const limitArg = args.find((a) => /^-\d+$/.test(a));
    const limit = limitArg ? Number(limitArg.slice(1)) : p.flags.has("-n") ? Number(p.flags.get("-n")) : Infinity;
    const words = p.rest.filter((a) => !/^-\d+$/.test(a));
    // A word that is a file and not a revision filters by path, as do words after `--`.
    const paths = [...p.paths, ...words.filter((w) => !resolveRange(s, w) && (w in s.work || Object.values(s.commits).some((c) => w in c.files)))];
    const revs = words.filter((w) => !paths.includes(w));
    let tips: (string | null)[];
    const hidden = new Set<string>();
    if (p.flags.has("--all")) tips = [headId(s), ...Object.values(s.branches), ...Object.values(s.tags), ...Object.values(s.tracking)];
    else if (revs.length) {
      tips = [];
      for (const r of revs) {
        const range = resolveRange(s, r);
        if (!range) return fail(`fatal: ambiguous argument '${r}': unknown revision or path not in the working tree.\nUse '--' to separate paths from revisions, like this:\n'git <command> [<revision>...] -- [<file>...]'`);
        tips.push(range.to);
        if (range.from) for (const c of ancestors(s, range.from)) hidden.add(c);
      }
    } else tips = [headId(s)];
    if (!tips.some(Boolean)) return fail(`fatal: your current branch '${currentBranch(s) ?? "main"}' does not have any commits yet`);
    const seen = new Set<string>();
    for (const t of tips) if (t) for (const c of ancestors(s, t)) if (!hidden.has(c)) seen.add(c);
    const touches = (id: string) => {
      const c = s.commits[id]!;
      const parent = c.parents[0] ? s.commits[c.parents[0]]!.files : {};
      return paths.some((x) => parent[x] !== c.files[x]);
    };
    let ids = [...seen]
      .filter((id) => !p.flags.has("--merges") || s.commits[id]!.parents.length > 1)
      .filter((id) => !p.flags.has("--no-merges") || s.commits[id]!.parents.length < 2)
      .filter((id) => !paths.length || touches(id))
      .sort((a, b) => s.commits[b]!.time - s.commits[a]!.time)
      .slice(0, limit);
    if (p.flags.has("--reverse")) ids = ids.reverse();
    const format = p.flags.get("--format");
    if (typeof format === "string") {
      if (format === "oneline") p.flags.set("--oneline", true);
      else return { actions: [], output: ids.map((id) => out(formatCommit(s, id, format.replace(/^format:|^tformat:/, "")))) };
    }
    const output: TermLine[] = [];
    if (p.flags.has("--graph")) output.push(out("(no --graph here: the picture above is the graph)", "dim"));
    for (const id of ids) {
      const c = s.commits[id]!;
      const deco = decorations(s, id);
      if (p.flags.has("--oneline")) output.push(out(`${short(id)}${deco ? ` (${deco})` : ""} ${firstLine(c.message)}`, "hl"));
      else {
        output.push(out(`commit ${id}${deco ? ` (${deco})` : ""}`, "hl"));
        if (c.parents.length > 1) output.push(out(`Merge: ${c.parents.map(short).join(" ")}`));
        output.push(out(`Author: ${c.author}`), out(`Date:   ${gitDate(c.time)}`), out(""));
        output.push(...c.message.split("\n").map((m) => out(`    ${m}`)), out(""));
      }
      const parent = c.parents[0] ? s.commits[c.parents[0]]!.files : {};
      if (p.flags.has("--stat")) output.push(...statLines(parent, c.files));
      if (p.flags.has("-p")) output.push(...diffLines(parent, c.files), out(""));
    }
    return { actions: [], output };
  },

  show(s, args) {
    const target = args.find((a) => !a.startsWith("-")) ?? "HEAD";
    const colon = target.indexOf(":");
    if (colon > 0) {
      const id = resolve(s, target.slice(0, colon));
      const path = target.slice(colon + 1);
      if (!id) return fail(`fatal: invalid object name '${target.slice(0, colon)}'.`);
      const content = s.commits[id]!.files[path];
      if (content === undefined) return fail(`fatal: path '${path}' does not exist in '${target.slice(0, colon)}'`);
      return say(content);
    }
    const id = resolve(s, target);
    if (!id) return fail(`fatal: ambiguous argument '${target}': unknown revision or path not in the working tree.`);
    const c = s.commits[id]!;
    const deco = decorations(s, id);
    const output = [out(`commit ${id}${deco ? ` (${deco})` : ""}`, "hl"), out(`Author: ${c.author}`), out(`Date:   ${gitDate(c.time)}`), out(""), ...c.message.split("\n").map((m) => out(`    ${m}`)), out("")];
    const parent = c.parents[0] ? s.commits[c.parents[0]]!.files : {};
    return { actions: [], output: [...output, ...diffLines(parent, c.files)] };
  },

  diff(s, args) {
    const p = parse(args, { "--staged": "--staged", "--cached": "--staged", "--stat": "--stat", "--name-only": "--name-only" });
    if (typeof p === "string") return fail(p);
    const revs: string[] = [];
    const paths = [...p.paths];
    for (const a of p.rest) {
      const three = /^(.+)\.\.\.(.+)$/.exec(a);
      const two = /^(.+)\.\.(.+)$/.exec(a);
      if (three && resolve(s, three[1]!) && resolve(s, three[2]!)) {
        revs.push(mergeBase(s, resolve(s, three[1]!)!, resolve(s, three[2]!)!)!, three[2]!);
      } else if (two && resolve(s, two[1]!) && resolve(s, two[2]!)) revs.push(two[1]!, two[2]!);
      else if (resolve(s, a) && !(a in s.work)) revs.push(a);
      else paths.push(a);
    }
    let from: Files;
    let to: Files;
    if (revs.length >= 2) {
      from = s.commits[resolve(s, revs[0]!)!]!.files;
      to = s.commits[resolve(s, revs[1]!)!]!.files;
    } else if (revs.length === 1) {
      from = s.commits[resolve(s, revs[0]!)!]!.files;
      to = p.flags.has("--staged") ? s.index : trackedWork(s);
    } else if (p.flags.has("--staged")) {
      from = headFiles(s);
      to = s.index;
    } else {
      from = s.index;
      to = trackedWork(s);
    }
    const only = (f: Files) => (paths.length ? Object.fromEntries(Object.entries(f).filter(([k]) => paths.includes(k))) : f);
    const d = diffLines(only(from), only(to));
    if (p.flags.has("--stat")) return { actions: [], output: statLines(only(from), only(to)) };
    if (p.flags.has("--name-only")) return { actions: [], output: d.filter((x) => x.text.startsWith("diff --git")).map((x) => out(x.text.split(" b/")[1]!)) };
    return { actions: [], output: d };
  },

  branch(s, args) {
    const p = parse(args, {
      "-d": "-d", "--delete": "-d", "-D": "-D", "-a": "-a", "--all": "-a", "-r": "-r", "--remotes": "-r", "-v": "-v", "--list": "--list",
      "-m": "-m", "--move": "-m", "-M": "-m", "--merged": "--merged", "--no-merged": "--no-merged", "--show-current": "--show-current",
    });
    if (typeof p === "string") return fail(p);
    if (p.flags.has("--show-current")) return say(currentBranch(s) ?? "");
    if (p.flags.has("-m")) {
      const [a, b] = p.rest;
      const from = b ? a : currentBranch(s);
      const to = b ?? a;
      if (!from || !to) return fail("fatal: branch name required");
      if (!validName(to)) return fail(`fatal: '${to}' is not a valid branch name`);
      return run(s, [{ type: "renameBranch", from, to }]);
    }
    if (p.flags.has("-d") || p.flags.has("-D")) {
      if (!p.rest.length) return fail("fatal: branch name required");
      return run(s, p.rest.map((name) => ({ type: "deleteBranch", name, force: p.flags.has("-D") || undefined }) as GitAction));
    }
    if (p.rest.length && !p.flags.has("--list")) {
      const [name, at] = p.rest as [string, string | undefined];
      if (!validName(name)) return fail(`fatal: '${name}' is not a valid branch name`);
      return run(s, [{ type: "branch", name, at }]);
    }
    const output: TermLine[] = [];
    const verbose = (id: string) => (p.flags.has("-v") ? ` ${short(id)} ${firstLine(s.commits[id]!.message)}` : "");
    const head = headId(s);
    const keep = (id: string) =>
      (!p.flags.has("--merged") || Boolean(head && isAncestor(s, id, head))) && (!p.flags.has("--no-merged") || !(head && isAncestor(s, id, head)));
    if (!p.flags.has("-r")) {
      if (s.head.kind === "detached") output.push(out(`* (HEAD detached at ${short(s.head.id)})${verbose(s.head.id)}`, "add"));
      for (const name of Object.keys(s.branches).sort().filter((b) => keep(s.branches[b]!))) {
        const mine = s.head.kind === "branch" && s.head.name === name;
        output.push(out(`${mine ? "*" : " "} ${name}${verbose(s.branches[name]!)}`, mine ? "add" : "out"));
      }
    }
    if (p.flags.has("-a") || p.flags.has("-r")) {
      for (const ref of Object.keys(s.tracking).sort()) output.push(out(`  ${p.flags.has("-a") ? "remotes/" : ""}${ref}${verbose(s.tracking[ref]!)}`, "del"));
    }
    return { actions: [], output };
  },

  switch(s, args) {
    const p = parse(args, { "-c": "-c=", "--create": "-c=", "-C": "-c=", "--detach": "--detach", "-d": "--detach" });
    if (typeof p === "string") return fail(p);
    const create = p.flags.get("-c");
    if (typeof create === "string") {
      if (!validName(create)) return fail(`fatal: '${create}' is not a valid branch name`);
      const at = p.rest[0];
      if (at) return run(s, [{ type: "branch", name: create, at }, { type: "switch", target: create }], { created: create });
      return run(s, [{ type: "switch", target: create, create: true }], { created: create });
    }
    let target = p.rest[0];
    if (!target) return fail("fatal: missing branch or commit argument");
    if (target === "-") {
      const prev = previousBranch(s);
      if (!prev) return fail("fatal: invalid reference: @{-1}");
      target = prev;
    }
    if (p.flags.has("--detach")) return run(s, [{ type: "checkout", target }]);
    if (!s.branches[target]) {
      // Like Git: a branch that exists only on origin is created to track it.
      if (s.tracking[`origin/${target}`]) return run(s, [{ type: "branch", name: target, at: `origin/${target}` }, { type: "switch", target }], { tracks: target });
      if (resolve(s, target)) return fail(`fatal: a branch is expected, got commit '${target}'\nhint: If you want to detach HEAD at the commit, try again with the --detach option.`);
      return fail(`fatal: invalid reference: ${target}`);
    }
    return run(s, [{ type: "switch", target }]);
  },

  checkout(s, args) {
    const p = parse(args, { "-b": "-b=", "-B": "-b=", "--ours": "--ours", "--theirs": "--theirs", "--detach": "--detach" });
    if (typeof p === "string") return fail(p);
    if (p.flags.has("--ours") || p.flags.has("--theirs")) {
      const take = p.flags.has("--ours") ? "ours" : "theirs";
      const paths = [...p.rest, ...p.paths];
      const r = run(s, paths.map((path) => ({ type: "resolve", path, take }) as GitAction));
      return r.failed ? r : { ...r, output: [out(`Updated ${paths.length} path${paths.length > 1 ? "s" : ""} from the index`)] };
    }
    const create = p.flags.get("-b");
    if (typeof create === "string") {
      if (!validName(create)) return fail(`fatal: '${create}' is not a valid branch name`);
      const at = p.rest[0];
      if (at) return run(s, [{ type: "branch", name: create, at }, { type: "switch", target: create }], { created: create });
      return run(s, [{ type: "switch", target: create, create: true }], { created: create });
    }
    if (p.paths.length) {
      for (const path of p.paths) if (!(path in s.index)) return fail(`error: pathspec '${path}' did not match any file(s) known to git`);
      const changed = p.paths.filter((x) => s.work[x] !== s.index[x]);
      const r = run(s, changed.map((path) => ({ type: "restore", path }) as GitAction));
      return r.failed ? r : { ...r, output: [out(`Updated ${changed.length} path${changed.length === 1 ? "" : "s"} from the index`)] };
    }
    let target = p.rest[0];
    if (!target) return fail("error: you must specify a branch or a commit");
    if (target === "-") target = previousBranch(s) ?? target;
    if (s.branches[target] && !p.flags.has("--detach")) return run(s, [{ type: "switch", target }]);
    if (!s.branches[target] && s.tracking[`origin/${target}`]) return run(s, [{ type: "branch", name: target, at: `origin/${target}` }, { type: "switch", target }], { tracks: target });
    if (resolve(s, target)) return run(s, [{ type: "checkout", target }]);
    if (target in s.index) {
      const r = run(s, s.work[target] !== s.index[target] ? [{ type: "restore", path: target }] : []);
      return r.failed ? r : { ...r, output: [out(`Updated ${r.actions.length} path${r.actions.length === 1 ? "" : "s"} from the index`)] };
    }
    return fail(`error: pathspec '${target}' did not match any file(s) known to git`);
  },

  merge(s, args) {
    const p = parse(args, { "--no-ff": "--no-ff", "--ff-only": "--ff-only", "--abort": "--abort", "--continue": "--continue", "--no-edit": "--no-edit", "-m": "-m=" });
    if (typeof p === "string") return fail(p);
    if (p.flags.has("--abort")) {
      if (s.op?.kind !== "merge") return fail("fatal: There is no merge to abort (MERGE_HEAD missing).");
      return run(s, [{ type: "abort" }]);
    }
    if (p.flags.has("--continue")) {
      if (s.op?.kind !== "merge") return fail("fatal: There is no merge in progress (MERGE_HEAD missing).");
      return run(s, [{ type: "continue" }]);
    }
    if (p.flags.has("-m")) return say("(this sandbox writes Git's default merge message; leave out -m)", "dim");
    const target = p.rest[0];
    if (!target) return fail("fatal: No remote for the current branch.");
    if (!resolve(s, target)) return fail(`merge: ${target} - not something we can merge`);
    return run(s, [{ type: "merge", target, noFf: p.flags.has("--no-ff") || undefined, ffOnly: p.flags.has("--ff-only") || undefined }], { mergeFrom: target, cmd: "merge" });
  },

  rebase(s, args) {
    const p = parse(args, { "--continue": "--continue", "--abort": "--abort", "-i": "-i", "--interactive": "-i", "--skip": "--skip", "--autosquash": "--autosquash" });
    if (typeof p === "string") return fail(p);
    if (p.flags.has("--abort")) {
      if (s.op?.kind !== "rebase") return fail("fatal: No rebase in progress?");
      return run(s, [{ type: "abort" }]);
    }
    if (p.flags.has("--continue")) {
      if (s.op?.kind !== "rebase") return fail("fatal: No rebase in progress?");
      return run(s, [{ type: "continue" }]);
    }
    if (p.flags.has("--skip")) return say("(--skip is not in this sandbox: resolve the conflict, or --abort)", "dim");
    const onto = p.rest[0];
    if (!onto) return fail("fatal: There is no tracking information for the current branch.\nPlease specify which branch you want to rebase against.");
    if (!resolve(s, onto)) return fail(`fatal: invalid upstream '${onto}'`);
    if (p.flags.has("-i")) return interactive(s, onto, p.flags.has("--autosquash"));
    return run(s, [{ type: "rebase", onto }], { cmd: "rebase" });
  },

  "cherry-pick": (s, args) => pickLike(s, args, "cherryPick"),
  revert: (s, args) => pickLike(s, args, "revert"),

  reset(s, args) {
    const p = parse(args, { "--soft": "--soft", "--mixed": "--mixed", "--hard": "--hard", "-q": "-q" });
    if (typeof p === "string") return fail(p);
    const mode: ResetMode = p.flags.has("--hard") ? "hard" : p.flags.has("--soft") ? "soft" : "mixed";
    const words = [...p.rest, ...p.paths];
    const target = words[0] && resolve(s, words[0]) && !(words[0] in s.work) ? words[0] : undefined;
    const paths = words.filter((w) => w !== target);
    if (paths.length) {
      if (mode !== "mixed") return fail(`fatal: Cannot do ${mode} reset with paths.`);
      const staged = new Set(status(s).staged.map((c) => c.path));
      const r = run(s, paths.filter((x) => staged.has(x)).map((path) => ({ type: "unstage", path }) as GitAction));
      return r.failed ? r : { ...r, output: unstagedAfterReset(s, r) };
    }
    if (words[0] && !target) return fail(`fatal: ambiguous argument '${words[0]}': unknown revision or path not in the working tree.`);
    return run(s, [{ type: "reset", target: target ?? "HEAD", mode }]);
  },

  stash(s, args) {
    const [sub, ...rest] = args;
    if (!sub || sub === "push" || sub === "save" || sub.startsWith("-")) {
      const words = sub && !sub.startsWith("-") ? rest : args;
      const p = parse(words, { "-m": "-m=", "--message": "-m=", "-u": "-u", "--include-untracked": "-u" });
      if (typeof p === "string") return fail(p);
      const m = p.flags.get("-m");
      const message = typeof m === "string" ? m : sub === "save" && p.rest.length ? p.rest.join(" ") : undefined;
      return run(s, [{ type: "stash", message }]);
    }
    if ((sub === "pop" || sub === "drop") && rest[0] && rest[0] !== "stash@{0}" && rest[0] !== "0")
      return say(`(only the newest entry, stash@{0}, can be ${sub === "pop" ? "popped" : "dropped"} in this sandbox)`, "dim");
    if (sub === "pop") return run(s, [{ type: "stashPop" }]);
    if (sub === "drop") {
      const top = s.stash[0];
      const r = run(s, [{ type: "stashDrop" }]);
      return r.failed || !top ? r : { ...r, output: [out(`Dropped refs/stash@{0}`)] };
    }
    if (sub === "list") return { actions: [], output: s.stash.map((e, i) => out(`stash@{${i}}: ${e.message}`)) };
    if (sub === "apply" || sub === "show") return say(`(git stash ${sub} is not in this sandbox: use git stash pop)`, "dim");
    return fail(`error: unknown subcommand: \`${sub}'`);
  },

  tag(s, args) {
    const p = parse(args, { "-a": "-a", "-m": "-m=", "-l": "-l", "--list": "-l", "-d": "-d" });
    if (typeof p === "string") return fail(p);
    if (p.flags.has("-d")) return say("(deleting tags is not in this sandbox)", "dim");
    if (!p.rest.length || p.flags.has("-l")) return { actions: [], output: Object.keys(s.tags).sort().map((t) => out(t)) };
    const [name, target] = p.rest as [string, string | undefined];
    const r = run(s, [{ type: "tag", name, target }]);
    if (!r.failed && (p.flags.has("-a") || p.flags.has("-m"))) r.output.push(out("(tags here are lightweight: the name points straight at the commit)", "dim"));
    return r;
  },

  fetch(s) {
    return run(s, [{ type: "fetch" }]);
  },

  pull(s, args) {
    const p = parse(args, { "--rebase": "--rebase", "-r": "--rebase", "--no-rebase": "--no-rebase", "--ff-only": "--ff-only" });
    if (typeof p === "string") return fail(p);
    if (p.rest[0] && p.rest[0] !== "origin") return fail(`fatal: '${p.rest[0]}' does not appear to be a git repository`);
    const from = p.rest[1];
    if (from && s.remote && !s.remote.branches[from]) return fail(`fatal: couldn't find remote ref ${from}`);
    return run(s, [{ type: "pull", rebase: p.flags.has("--rebase") || undefined, from }], { cmd: "pull" });
  },

  push(s, args) {
    const p = parse(args, { "-u": "-u", "--set-upstream": "-u", "-f": "-f", "--force": "-f", "--force-with-lease": "--lease", "--tags": "--tags" });
    if (typeof p === "string") return fail(p);
    const [remote, branch] = p.rest;
    if (remote && remote !== "origin") return fail(`fatal: '${remote}' does not appear to be a git repository\nfatal: Could not read from remote repository.`);
    if (!s.remote) return fail("fatal: No configured push destination.");
    if (p.flags.has("--tags")) return say("(tags are pushed with their branch in this sandbox)", "dim");
    const force = p.flags.has("--lease") ? "lease" : p.flags.has("-f") ? "force" : undefined;
    const name = (branch === "HEAD" ? currentBranch(s) : branch) ?? currentBranch(s) ?? undefined;
    return run(s, [{ type: "push", branch: name, force, setUpstream: p.flags.has("-u") || undefined, explicit: Boolean(branch) || undefined }], { pushUp: p.flags.has("-u") });
  },

  remote(s, args) {
    if (!s.remote) return { actions: [], output: [] };
    if (args.includes("-v")) return say(`origin\t${REMOTE_URL} (fetch)\norigin\t${REMOTE_URL} (push)`);
    return say("origin");
  },

  reflog(s) {
    return {
      actions: [],
      output: [...s.reflog].reverse().map((e, i) => out(`${short(e.to)} HEAD@{${i}}: ${e.message}`, i === 0 ? "hl" : "out")),
    };
  },

  bisect(s, args) {
    const [sub, ...rest] = args;
    if (sub === "start") {
      const [bad, good] = rest;
      if (!bad || !good) return say("(in this sandbox, start with both ends at once: git bisect start <bad> <good>,\n for example: git bisect start HEAD v1.0)", "dim");
      return run(s, [{ type: "bisectStart", bad, good }]);
    }
    if (sub === "good" || sub === "bad") {
      if (!s.bisect) return fail("You need to start by \"git bisect start\"\n(in this sandbox: git bisect start <bad> <good>)");
      if (rest[0] && resolve(s, rest[0]) !== s.bisect.testing) return say(`(in this sandbox, mark the commit being tested: git bisect ${sub})`, "dim");
      return run(s, [{ type: "bisectMark", verdict: sub }]);
    }
    if (sub === "skip" || sub === "run" || sub === "log") return say(`(git bisect ${sub} is not in this sandbox)`, "dim");
    if (sub === "reset") {
      if (!s.bisect) return say("We are not bisecting.");
      return run(s, [{ type: "bisectReset" }]);
    }
    return fail("usage: git bisect [start <bad> <good> | good | bad | reset]");
  },

  "rev-parse": (s, args) => {
    const shortOut = args.includes("--short");
    if (args.includes("--show-toplevel")) return say(`/home/you/${PROJECT}`);
    if (args.includes("--abbrev-ref")) return say(currentBranch(s) ?? "HEAD");
    const rev = args.find((a) => !a.startsWith("-")) ?? "HEAD";
    const colon = rev.indexOf(":");
    if (colon > 0) {
      const at = resolve(s, rev.slice(0, colon));
      const file = at ? s.commits[at]!.files[rev.slice(colon + 1)] : undefined;
      if (file === undefined) return fail(`fatal: path '${rev.slice(colon + 1)}' does not exist in '${rev.slice(0, colon)}'`);
      return say(hashBlob(file));
    }
    if (rev.endsWith("^{tree}")) {
      const at = resolve(s, rev.slice(0, -7));
      if (!at) return fail(`fatal: ambiguous argument '${rev}'`);
      return say(s.commits[at]!.tree);
    }
    const id = resolve(s, rev);
    if (!id) return fail(`fatal: ambiguous argument '${rev}': unknown revision or path not in the working tree.`);
    return say(shortOut ? short(id) : id);
  },

  "ls-files": (s) => say(Object.keys(s.index).sort().join("\n")),

  "cat-file": (s, args) => {
    const p = parse(args, { "-t": "-t", "-p": "-p", "-s": "-s" });
    if (typeof p === "string") return fail(p);
    const ref = p.rest[0];
    if (!ref) return fail("usage: git cat-file (-t | -s | -p) <object>");
    const obj = findObject(s, ref.endsWith("^{tree}") ? (resolve(s, ref.slice(0, -7)) ? s.commits[resolve(s, ref.slice(0, -7))!]!.tree : ref) : ref.includes(":") ? blobAt(s, ref) : ref);
    if (!obj) return fail(`fatal: Not a valid object name ${ref}`);
    if (p.flags.has("-t")) return say(obj.type);
    if (obj.type === "commit") return say(commitText(obj.commit).replace(/\n$/, ""));
    if (obj.type === "tree") return say(obj.entries.map((e) => `${e.mode === "40000" ? "040000" : e.mode} ${e.type} ${e.id}\t${e.name}`).join("\n"));
    return say(obj.content);
  },

  "hash-object": (s, args) => {
    const path = args.find((a) => !a.startsWith("-"));
    if (!path || !(path in s.work)) return fail(`fatal: could not open '${path ?? ""}' for reading: No such file or directory`);
    return say(hashBlob(s.work[path]!));
  },

  init(s) {
    void s;
    return say(`Reinitialized existing Git repository in /home/you/${PROJECT}/.git/`);
  },

  config(s, args) {
    if (args.includes("user.name") && args.length === 1) return say(s.author.replace(/ <.*/, ""));
    if (args.includes("user.email") && args.length === 1) return say(/<(.*)>/.exec(s.author)?.[1] ?? "");
    return say("(settings are already made in this sandbox)", "dim");
  },

  clone() {
    return say("(this sandbox already has the project cloned in ~/shop)", "dim");
  },
};

/** `add`, `restore` and friends print nothing when they work, like Git. */
const quiet = (r: Run): Run => (r.failed ? r : { ...r, output: r.output.filter((l) => l.tone === "err" || l.tone === "dim") });

function finish(r: Run): CliResult {
  return { actions: r.actions, output: r.output, moves: r.actions.length ? 1 : 0, editor: r.editor };
}

function unstagedAfterReset(s: Repo, r: Run): TermLine[] {
  let repo = s;
  for (const a of r.actions) repo = apply(repo, a).state;
  const st = status(repo);
  if (!st.unstaged.length) return [];
  return [out("Unstaged changes after reset:"), ...st.unstaged.map((c) => out(`${c.change === "deleted" ? "D" : "M"}\t${c.path}`))];
}

function pickLike(s: Repo, args: string[], type: "cherryPick" | "revert"): Run {
  const name = type === "cherryPick" ? "cherry-pick" : "revert";
  const p = parse(args, { "--continue": "--continue", "--abort": "--abort", "--no-edit": "--no-edit", "-n": "-n" });
  if (typeof p === "string") return fail(p);
  const busy = s.op?.kind === (type === "cherryPick" ? "cherry-pick" : "revert");
  if (p.flags.has("--abort")) return busy ? run(s, [{ type: "abort" }]) : fail(`error: no ${name} or revert in progress`);
  if (p.flags.has("--continue")) return busy ? run(s, [{ type: "continue" }]) : fail(`error: no ${name} or revert in progress`);
  if (!p.rest.length) return fail(`usage: git ${name} <commit>...`);
  for (const r of p.rest) if (!resolve(s, r)) return fail(`fatal: bad revision '${r}'`);
  return run(s, p.rest.map((target) => ({ type, target }) as GitAction), { cmd: name });
}

/* ------------------------------------------------------- interactive rebase */

const TODO_HELP = `
# Commands:
# p, pick <commit> = use commit
# r, reword <commit> = use commit, but edit the commit message
# s, squash <commit> = use commit, but meld into previous commit
# f, fixup <commit> = like "squash" but keep only the previous
#                    commit's log message
# d, drop <commit> = remove commit
#
# These lines can be re-ordered; they are executed from top to bottom.
# If you remove a line here THAT COMMIT WILL BE LOST.`;

const ALIASES: Record<string, PlanItem["action"]> = { p: "pick", pick: "pick", r: "reword", reword: "reword", s: "squash", squash: "squash", f: "fixup", fixup: "fixup", d: "drop", drop: "drop" };

function interactive(s: Repo, base: string, autosquash = false): Run {
  const head = headId(s);
  const baseId = resolve(s, base)!;
  if (!head) return fail("fatal: no commits yet");
  if (s.op) return fail("error: there is already an operation in progress");
  const chain = firstParents(s, head);
  const at = chain.indexOf(baseId);
  if (at === -1) return fail(`fatal: '${base}' is not an ancestor of HEAD in this sandbox`);
  const todo = chain.slice(0, at).reverse();
  // --autosquash: each "fixup! X" commit moves right after the commit called X, marked fixup.
  const order: { id: string; action: PlanItem["action"] }[] = todo.map((id) => ({ id, action: "pick" }));
  if (autosquash) {
    for (const id of todo) {
      const m = /^(fixup|squash)! (.*)$/.exec(firstLine(s.commits[id]!.message));
      if (!m) continue;
      const target = order.find((o) => o.id !== id && firstLine(s.commits[o.id]!.message) === m[2]);
      if (!target) continue;
      const item = order.splice(order.findIndex((o) => o.id === id), 1)[0]!;
      item.action = m[1] as PlanItem["action"];
      let at2 = order.indexOf(target) + 1;
      while (order[at2] && order[at2]!.action !== "pick") at2++;
      order.splice(at2, 0, item);
    }
  }
  if (!todo.length) return say("Successfully rebased and updated refs/heads/" + (currentBranch(s) ?? "HEAD") + ".");
  const text = `${order.map((o) => `${o.action} ${short(o.id)} ${firstLine(s.commits[o.id]!.message)}`).join("\n")}\n\n# Rebase ${short(baseId)}..${short(head)} onto ${short(baseId)} (${todo.length} command${todo.length > 1 ? "s" : ""})\n#${TODO_HELP}`;
  return {
    actions: [],
    output: [],
    editor: {
      file: ".git/rebase-merge/git-rebase-todo",
      text,
      save: (repo, saved) => {
        const plan: PlanItem[] = [];
        const rows = saved.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
        for (const [i, row] of rows.entries()) {
          const [word, ref] = row.split(/\s+/);
          const action = ALIASES[word ?? ""];
          const id = ref ? todo.find((c) => c.startsWith(ref)) : undefined;
          if (!action || !id) return finish(fail(`error: invalid line ${i + 1}: ${row}\nYou can fix this with 'git rebase --edit-todo' and then run 'git rebase --continue'.\nOr you can abort the rebase with 'git rebase --abort'.`));
          plan.push({ id, action });
        }
        if (!plan.length) return finish(say("Nothing to do"));
        return messagesFor(repo, baseId, plan, 0);
      },
    },
  };
}

/** Opens the message editors an interactive rebase opens (one per reword, one per squash group), then runs it. */
function messagesFor(repo: Repo, base: string, plan: PlanItem[], from: number): CliResult {
  for (let i = from; i < plan.length; i++) {
    const item = plan[i]!;
    const msg = (id: string) => repo.commits[id]!.message;
    if (item.action === "reword") {
      return finish({
        actions: [],
        output: [],
        editor: {
          file: ".git/COMMIT_EDITMSG",
          text: `${msg(item.id)}\n\n${COMMIT_TEMPLATE}`,
          save: (r, text) => {
            const m = stripComments(text);
            if (!m) return finish(fail("Aborting commit due to empty commit message."));
            return messagesFor(r, base, plan.map((x, k) => (k === i ? { ...x, message: m } : x)), i + 1);
          },
        },
      });
    }
    // At the last squash of a group, one editor shows every message of the group.
    const groupEnd = item.action === "squash" || item.action === "fixup" ? (plan[i + 1]?.action === "squash" || plan[i + 1]?.action === "fixup" ? null : i) : null;
    if (groupEnd !== null) {
      let start = i;
      while (start > 0 && (plan[start]!.action === "squash" || plan[start]!.action === "fixup")) start--;
      const group = plan.slice(start, i + 1).filter((x) => x.action !== "drop");
      if (!group.slice(1).some((x) => x.action === "squash")) continue;
      const parts = group.filter((x, k) => k === 0 || x.action === "squash").map((x) => x.message ?? msg(x.id));
      const text = `# This is a combination of ${group.length} commits.\n${parts.map((m, k) => `# This is the ${k === 0 ? "1st commit message" : `commit message #${k + 1}`}:\n\n${m}`).join("\n\n")}\n\n${COMMIT_TEMPLATE}`;
      return finish({
        actions: [],
        output: [],
        editor: {
          file: ".git/COMMIT_EDITMSG",
          text,
          save: (r, saved) => {
            const m = stripComments(saved);
            if (!m) return finish(fail("Aborting commit due to empty commit message."));
            return messagesFor(r, base, plan.map((x, k) => (k === i ? { ...x, message: m } : x)), i + 1);
          },
        },
      });
    }
  }
  return finish(run(repo, [{ type: "rebaseInteractive", base, plan }], { interactive: true }));
}

/* ------------------------------------------------------------------ output */

interface OutCtx {
  /** The command that ran, where Git's wording depends on it. */
  cmd?: string;
  created?: string;
  tracks?: string;
  mergeFrom?: string;
  pushUp?: boolean;
  interactive?: boolean;
}

function eventLines(e: GitEvent, before: Repo, after: Repo, ctx: OutCtx): TermLine[] {
  const where = () => (after.head.kind === "branch" ? after.head.name : "detached HEAD");
  switch (e.type) {
    case "committed": {
      const c = after.commits[e.id]!;
      const root = c.parents.length === 0 ? " (root-commit)" : "";
      const n = e.files;
      return [out(`[${e.branch ?? "detached HEAD"}${root} ${short(e.id)}] ${firstLine(e.message)}`, "hl"), out(` ${n} file${n === 1 ? "" : "s"} changed`)];
    }
    case "untracked":
      return [out(`rm '${e.path}'`)];
    case "branchDeleted":
      return [out(`Deleted branch ${e.name} (was ${short(e.at)}).`)];
    case "switched": {
      if (e.detached) {
        const id = headId(after)!;
        return lines(`Note: switching to '${e.to}'.\n\nYou are in 'detached HEAD' state. You can look around, make experimental\nchanges and commit them, and you can discard any commits you make in this\nstate without impacting any branches by switching back to a branch.\n\nHEAD is now at ${short(id)} ${firstLine(after.commits[id]!.message)}`);
      }
      if (ctx.tracks === e.to) return lines(`branch '${e.to}' set up to track 'origin/${e.to}'.\nSwitched to a new branch '${e.to}'`);
      return [out(ctx.created === e.to ? `Switched to a new branch '${e.to}'` : `Switched to branch '${e.to}'`)];
    }
    case "fastForward":
      return [out(`Updating ${short(e.from)}..${short(e.to)}`), out("Fast-forward")];
    case "upToDate":
      return [out("Already up to date.")];
    case "conflict": {
      const conflictLines = e.paths.flatMap((p) => [out(`Auto-merging ${p}`), out(`CONFLICT (content): Merge conflict in ${p}`, "err")]);
      if (e.during === "merge") return [...conflictLines, out("Automatic merge failed; fix conflicts and then commit the result.", "err")];
      const op = after.op;
      const target = op && (op.kind === "rebase" ? op.applying : op.kind !== "merge" ? op.target : null);
      const what = target ? `${short(target)}... ${firstLine(after.commits[target]?.message ?? "")}` : "";
      const verb = e.during === "rebase" ? "rebase" : e.during;
      const hint =
        e.during === "rebase"
          ? `hint: Resolve all conflicts manually, mark them as resolved with\nhint: "git add/rm <conflicted_files>", then run "git rebase --continue".\nhint: To abort and get back to the state before "git rebase", run "git rebase --abort".`
          : `hint: After resolving the conflicts, mark them with\nhint: "git add/rm <pathspec>", then run\nhint: "git ${verb} --continue".`;
      return [out(`error: could not apply ${what}`, "err"), ...conflictLines, ...lines(hint, "dim")];
    }
    case "resolved":
      return [];
    case "aborted":
      return [];
    case "rebased":
      return [out(`Successfully rebased and updated refs/heads/${e.branch}.`)];
    case "picked": {
      const c = after.commits[e.id]!;
      return [out(`[${where()} ${short(e.id)}] ${firstLine(c.message)}`, "hl")];
    }
    case "reverted": {
      const c = after.commits[e.id]!;
      return [out(`[${where()} ${short(e.id)}] ${firstLine(c.message)}`, "hl")];
    }
    case "reset": {
      if (e.mode === "hard") return [out(`HEAD is now at ${short(e.to)} ${firstLine(after.commits[e.to]!.message)}`)];
      if (e.mode === "mixed") {
        const st = status(after);
        return st.unstaged.length ? [out("Unstaged changes after reset:"), ...st.unstaged.map((c) => out(`${c.change === "deleted" ? "D" : "M"}\t${c.path}`))] : [];
      }
      return [];
    }
    case "stashed": {
      const id = headId(before)!;
      return [out(`Saved working directory and index state ${after.stash[0]?.message ?? `WIP on ${where()}: ${short(id)}`}`)];
    }
    case "stashApplied":
      return [...longStatus(after), out(`Dropped refs/stash@{0}`)];
    case "stashDropped":
      return [out("Dropped refs/stash@{0}")];
    case "fetched": {
      if (!e.updates.length) return [];
      return [
        out(`From ${REMOTE_URL.replace(/\.git$/, "")}`),
        ...e.updates.map((u) =>
          u.from ? out(`   ${short(u.from)}..${short(u.to)}  ${u.ref.replace(/^origin\//, "").padEnd(10)} -> ${u.ref}`) : out(` * [new branch]      ${u.ref.replace(/^origin\//, "").padEnd(10)} -> ${u.ref}`),
        ),
      ];
    }
    case "pushed": {
      const lineText = !e.from
        ? ` * [new branch]      ${e.branch} -> ${e.branch}`
        : e.forced
          ? ` + ${short(e.from)}...${short(e.to)} ${e.branch} -> ${e.branch} (forced update)`
          : `   ${short(e.from)}..${short(e.to)}  ${e.branch} -> ${e.branch}`;
      const up = ctx.pushUp ? [out(`branch '${e.branch}' set up to track 'origin/${e.branch}'.`)] : [];
      return [out(`To ${REMOTE_URL}`), out(lineText), ...up];
    }
    case "pushRejected": {
      if (e.reason === "no-upstream")
        return lines(`fatal: The current branch ${e.branch} has no upstream branch.\nTo push the current branch and set the remote as upstream, use\n\n    git push --set-upstream origin ${e.branch}\n`, "err");
      if (e.reason === "stale")
        return [out(`To ${REMOTE_URL}`), out(` ! [rejected]        ${e.branch} -> ${e.branch} (stale info)`, "err"), out(`error: failed to push some refs to '${REMOTE_URL}'`, "err")];
      return [
        out(`To ${REMOTE_URL}`),
        out(` ! [rejected]        ${e.branch} -> ${e.branch} (fetch first)`, "err"),
        out(`error: failed to push some refs to '${REMOTE_URL}'`, "err"),
        ...lines("hint: Updates were rejected because the remote contains work that you do not\nhint: have locally. Integrate the remote changes (e.g.\nhint: 'git pull ...') before pushing again.", "dim"),
      ];
    }
    case "bisectTesting": {
      const c = after.commits[e.id]!;
      const steps = Math.max(0, Math.ceil(Math.log2(e.left + 1)));
      return [out(`Bisecting: ${e.left} revision${e.left === 1 ? "" : "s"} left to test after this (roughly ${steps} step${steps === 1 ? "" : "s"})`), out(`[${e.id}] ${firstLine(c.message)}`, "hl")];
    }
    case "bisectFound": {
      const c = after.commits[e.id]!;
      return [out(`${e.id} is the first bad commit`, "hl"), out(`commit ${e.id}`), out(`Author: ${c.author}`), out(""), out(`    ${firstLine(c.message)}`)];
    }
    case "bisectDone":
      return [out(`Switched to branch '${e.back}'`)];
    case "error":
      return errorLines(e.code, e.message, before, ctx.cmd);
    default:
      return [];
  }
}

/** Git's own wording for the model's errors, where it differs. */
function errorLines(code: string, message: string, s: Repo, cmd?: string): TermLine[] {
  switch (code) {
    case "nothing-to-commit": {
      if (message.startsWith("Nothing changed")) return [out("nothing to commit, working tree clean")];
      const st = status(s);
      if (st.unstaged.length) return [...longStatus(s).slice(0, -1), out('no changes added to commit (use "git add" and/or "git commit -a")')];
      if (st.untracked.length) return [...longStatus(s)];
      return [out(`On branch ${currentBranch(s) ?? "HEAD"}`), out("nothing to commit, working tree clean")];
    }
    case "no-op":
      return message === "Nothing to stage" ? [] : [out(message)];
    case "would-overwrite": {
      const file = /changes to (.+) would be/.exec(message)?.[1];
      if (file) return lines(`error: Your local changes to the following files would be overwritten by ${cmd === "merge" || cmd === "pull" ? "merge" : "checkout"}:\n\t${file}\nPlease commit your changes or stash them before you ${cmd === "merge" || cmd === "pull" ? "merge" : "switch branches"}.\nAborting`, "err");
      return lines(`error: ${message}`, "err");
    }
    case "dirty": {
      const files = dirtyFiles(s);
      if (cmd === "cherry-pick" || cmd === "revert")
        return lines(`error: your local changes would be overwritten by ${cmd}.\nhint: commit your changes or stash them to proceed.\nfatal: ${cmd} failed`, "err");
      if (cmd === "merge" || (cmd === "pull" && !message.includes("rebase")))
        return lines(`error: Your local changes to the following files would be overwritten by merge:\n${files.map((f) => `\t${f}`).join("\n")}\nPlease commit your changes or stash them before you merge.\nAborting`, "err");
      return lines("error: cannot rebase: You have unstaged changes.\nerror: Please commit or stash them.", "err");
    }
    case "not-merged":
      return lines(`${message.replace(/^The branch/, "error: the branch")}.\nIf you are sure you want to delete it, run 'git branch -D ${/'(.+)'/.exec(message)?.[1] ?? ""}'.`, "err");
    case "branch-exists":
      return lines(`fatal: ${message.replace(/^A branch named/, "a branch named")}`, "err");
    case "current-branch":
      return lines(`error: cannot delete branch '${currentBranch(s)}' used by worktree at '/home/you/${PROJECT}'`, "err");
    case "no-stash":
      return lines("error: No stash entries found.", "err");
    case "no-such-ref":
      return lines(`fatal: ${message}`, "err");
    case "conflicts-left":
      return lines(`error: Committing is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use 'git add/rm <file>'\nhint: as appropriate to mark resolution and make a commit.\nfatal: Exiting because of an unresolved conflict.`, "err");
    default:
      return lines(`error: ${message}`, "err");
  }
}

/* ------------------------------------------------------------------ status */

const label = (change: string) => (change === "added" ? "new file:   " : change === "deleted" ? "deleted:    " : "modified:   ");

export function longStatus(s: Repo): TermLine[] {
  const st = status(s);
  const o: TermLine[] = [];
  const branch = currentBranch(s);
  if (s.op?.kind === "rebase") {
    o.push(out(`interactive rebase in progress; onto ${short(s.op.onto)}`), out(`You are currently rebasing branch '${s.op.branch}' on '${short(s.op.onto)}'.`));
    o.push(out(st.conflicted.length ? '  (fix conflicts and then run "git rebase --continue")' : '  (all conflicts fixed: run "git rebase --continue")', "dim"));
    o.push(out('  (use "git rebase --abort" to check out the original branch)', "dim"), out(""));
  } else if (branch) o.push(out(`On branch ${branch}`));
  else if (s.head.kind === "detached") o.push(out(`HEAD detached at ${short(s.head.id)}`, "err"));

  if (branch && !s.op) {
    const up = s.upstream[branch];
    const id = s.branches[branch];
    if (up && id && s.tracking[up]) {
      const { ahead, behind } = aheadBehind(s, id, s.tracking[up]!);
      if (!ahead && !behind) o.push(out(`Your branch is up to date with '${up}'.`));
      else if (ahead && !behind) o.push(out(`Your branch is ahead of '${up}' by ${ahead} commit${ahead > 1 ? "s" : ""}.`), out('  (use "git push" to publish your local commits)', "dim"));
      else if (behind && !ahead) o.push(out(`Your branch is behind '${up}' by ${behind} commit${behind > 1 ? "s" : ""}, and can be fast-forwarded.`), out('  (use "git pull" to update your local branch)', "dim"));
      else o.push(out(`Your branch and '${up}' have diverged,`), out(`and have ${ahead} and ${behind} different commits each, respectively.`), out('  (use "git pull" if you want to integrate the remote branch with yours)', "dim"));
    }
  }
  if (s.op?.kind === "merge") {
    if (st.conflicted.length) o.push(out("You have unmerged paths."), out('  (fix conflicts and run "git commit")', "dim"), out('  (use "git merge --abort" to abort the merge)', "dim"));
    else o.push(out("All conflicts fixed but you are still merging."), out('  (use "git commit" to conclude merge)', "dim"));
  }
  if (s.op && (s.op.kind === "cherry-pick" || s.op.kind === "revert")) {
    const verb = s.op.kind === "cherry-pick" ? "cherry-picking" : "reverting";
    o.push(out(`You are currently ${verb} commit ${short(s.op.target)}.`), out(`  (fix conflicts and run "git ${s.op.kind} --continue")`, "dim"), out(`  (use "git ${s.op.kind} --abort" to cancel the operation)`, "dim"));
  }
  if (!headId(s)) o.push(out(""), out("No commits yet"));
  if (st.staged.length) {
    o.push(out(""), out("Changes to be committed:"), out('  (use "git restore --staged <file>..." to unstage)', "dim"));
    for (const c of st.staged) o.push(out(`\t${label(c.change)}${c.path}`, "add"));
  }
  if (st.conflicted.length) {
    o.push(out(""), out("Unmerged paths:"), out('  (use "git add <file>..." to mark resolution)', "dim"));
    for (const p of st.conflicted) o.push(out(`\tboth modified:   ${p}`, "del"));
  }
  if (st.unstaged.length) {
    o.push(out(""), out("Changes not staged for commit:"), out('  (use "git add <file>..." to update what will be committed)', "dim"), out('  (use "git restore <file>..." to discard changes in working directory)', "dim"));
    for (const c of st.unstaged) o.push(out(`\t${label(c.change)}${c.path}`, "del"));
  }
  if (st.untracked.length) {
    o.push(out(""), out("Untracked files:"), out('  (use "git add <file>..." to include in what will be committed)', "dim"));
    for (const p of st.untracked) o.push(out(`\t${p}`, "del"));
  }
  o.push(out(""));
  if (st.staged.length || st.conflicted.length) o.pop();
  else if (st.unstaged.length) o.push(out('no changes added to commit (use "git add" and/or "git commit -a")'));
  else if (st.untracked.length) o.push(out('nothing added to commit but untracked files present (use "git add" to track)'));
  else o.push(out(headId(s) ? "nothing to commit, working tree clean" : 'nothing to commit (create/copy files and use "git add" to track)'));
  return o;
}

function shortStatus(s: Repo): TermLine[] {
  const head = headFiles(s);
  const st = status(s);
  const paths = [...new Set([...Object.keys(head), ...Object.keys(s.index), ...Object.keys(s.work)])].sort();
  const o: TermLine[] = [];
  for (const p of paths) {
    if (st.conflicted.includes(p)) {
      o.push(out(`UU ${p}`, "del"));
      continue;
    }
    if (st.untracked.includes(p)) {
      o.push(out(`?? ${p}`, "del"));
      continue;
    }
    const x = head[p] === s.index[p] ? " " : head[p] === undefined ? "A" : s.index[p] === undefined ? "D" : "M";
    const y = !(p in s.index) ? " " : !(p in s.work) ? "D" : s.work[p] !== s.index[p] ? "M" : " ";
    if (x !== " " || y !== " ") o.push(out(`${x}${y} ${p}`, x !== " " ? "add" : "del"));
  }
  return o;
}

/* -------------------------------------------------------------------- misc */

const COMMIT_TEMPLATE = "# Please enter the commit message for your changes. Lines starting\n# with '#' will be ignored, and an empty message aborts the commit.";

const stripComments = (text: string) =>
  text
    .split("\n")
    .filter((l) => !l.startsWith("#"))
    .join("\n")
    .trim();

const firstLine = (m: string) => m.split("\n")[0]!;

/** A revision or a range: `main..feature` is what feature has that main does not. */
function resolveRange(s: Repo, word: string): { from: string | null; to: string } | null {
  const m = /^(.*?)\.\.(\.?)(.*)$/.exec(word);
  if (m && !m[2]) {
    const from = resolve(s, m[1] || "HEAD");
    const to = resolve(s, m[3] || "HEAD");
    return from && to ? { from, to } : null;
  }
  const id = resolve(s, word);
  return id ? { from: null, to: id } : null;
}

/** The branch HEAD was on before the last switch, for `git switch -`. */
function previousBranch(s: Repo): string | null {
  for (let i = s.reflog.length - 1; i >= 0; i--) {
    const m = /^checkout: moving from (\S+) to /.exec(s.reflog[i]!.message);
    if (m && s.branches[m[1]!]) return m[1]!;
  }
  return null;
}

/** The few files under .git a reader might `cat`: HEAD and the refs. */
function dotGit(s: Repo, path: string): string | null {
  const p = path.replace(/^\.\//, "");
  if (p === ".git/HEAD") return s.head.kind === "branch" ? `ref: refs/heads/${s.head.name}` : s.head.id;
  const ref = /^\.git\/refs\/(heads|tags|remotes)\/(.+)$/.exec(p);
  if (!ref) return null;
  const id = ref[1] === "heads" ? s.branches[ref[2]!] : ref[1] === "tags" ? s.tags[ref[2]!] : s.tracking[ref[2]!];
  return id ?? null;
}

/** `rev:path` as a blob id, for cat-file. */
function blobAt(s: Repo, ref: string): string {
  const i = ref.indexOf(":");
  const at = resolve(s, ref.slice(0, i));
  const file = at ? s.commits[at]!.files[ref.slice(i + 1)] : undefined;
  return file === undefined ? ref : hashBlob(file);
}

function dirtyFiles(s: Repo): string[] {
  const st = status(s);
  return [...new Set([...st.staged, ...st.unstaged].map((c) => c.path))].sort();
}

/** `--format` with the common placeholders. */
function formatCommit(s: Repo, id: string, format: string): string {
  const c = s.commits[id]!;
  return format
    .replace(/%H/g, id)
    .replace(/%h/g, short(id))
    .replace(/%s/g, firstLine(c.message))
    .replace(/%an/g, c.author.replace(/ <.*/, ""))
    .replace(/%ae/g, /<(.*)>/.exec(c.author)?.[1] ?? "")
    .replace(/%ad/g, gitDate(c.time))
    .replace(/%P/g, c.parents.join(" "))
    .replace(/%p/g, c.parents.map(short).join(" "))
    .replace(/%d/g, decorations(s, id) ? ` (${decorations(s, id)})` : "")
    .replace(/%n/g, "\n");
}

/** `--stat`: one line per changed file, then the totals. */
function statLines(from: Files, to: Files): TermLine[] {
  const paths = [...new Set([...Object.keys(from), ...Object.keys(to)])].sort().filter((p) => from[p] !== to[p]);
  const count = (x: string | undefined) => (x === undefined || x === "" ? 0 : x.split("\n").length);
  let plus = 0;
  let minus = 0;
  const width = Math.max(0, ...paths.map((p) => p.length));
  const o = paths.map((p) => {
    const a = count(to[p]);
    const d = count(from[p]);
    plus += a;
    minus += d;
    return out(` ${p.padEnd(width)} | ${a + d} ${"+".repeat(a)}${"-".repeat(d)}`);
  });
  if (!paths.length) return [];
  o.push(out(` ${paths.length} file${paths.length > 1 ? "s" : ""} changed, ${plus} insertion${plus === 1 ? "" : "s"}(+), ${minus} deletion${minus === 1 ? "" : "s"}(-)`));
  return o;
}

const validName = (name: string) => /^[A-Za-z0-9._/-]+$/.test(name) && !name.startsWith("-") && !name.endsWith("/") && !name.includes("..");

/** The folder's version of every tracked file (a deleted one is simply missing). */
function trackedWork(s: Repo): Files {
  return Object.fromEntries(Object.keys(s.index).filter((p) => p in s.work).map((p) => [p, s.work[p]!]));
}

/** Refs pointing at a commit, in the order `git log` decorates them. */
function decorations(s: Repo, id: string): string {
  const out: string[] = [];
  const head = headId(s);
  if (head === id) out.push(s.head.kind === "branch" ? `HEAD -> ${s.head.name}` : "HEAD");
  for (const [t, at] of Object.entries(s.tags)) if (at === id) out.push(`tag: ${t}`);
  for (const [r, at] of Object.entries(s.tracking)) if (at === id) out.push(r);
  for (const [b, at] of Object.entries(s.branches)) if (at === id && !(s.head.kind === "branch" && s.head.name === b && head === id)) out.push(b);
  return out.join(", ");
}

function diffLines(from: Files, to: Files): TermLine[] {
  const paths = [...new Set([...Object.keys(from), ...Object.keys(to)])].sort();
  const o: TermLine[] = [];
  for (const p of paths) {
    if (from[p] === to[p]) continue;
    o.push(out(`diff --git a/${p} b/${p}`, "hl"));
    if (from[p] === undefined) o.push(out("new file mode 100644"));
    if (to[p] === undefined) o.push(out("deleted file mode 100644"));
    o.push(out(from[p] === undefined ? "--- /dev/null" : `--- a/${p}`), out(to[p] === undefined ? "+++ /dev/null" : `+++ b/${p}`));
    const a = from[p] === undefined || from[p] === "" ? [] : from[p]!.split("\n");
    const b = to[p] === undefined || to[p] === "" ? [] : to[p]!.split("\n");
    o.push(out(`@@ -${a.length ? 1 : 0},${a.length} +${b.length ? 1 : 0},${b.length} @@`, "dim"));
    for (const line of a) o.push(out(`-${line}`, "del"));
    for (const line of b) o.push(out(`+${line}`, "add"));
  }
  return o;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function gitDate(t: number): string {
  const d = new Date(t * 1000);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())} ${d.getUTCFullYear()} +0000`;
}

type Found =
  | { type: "commit"; commit: Commit }
  | { type: "tree"; entries: ReturnType<typeof buildTrees>[number]["entries"] }
  | { type: "blob"; content: string };

/** Looks an object up by id (or a ref, for commits): commits, their trees, and every file version. */
function findObject(s: Repo, ref: string): Found | null {
  const id = resolve(s, ref);
  if (id) return { type: "commit", commit: s.commits[id]! };
  if (!/^[0-9a-f]{4,40}$/.test(ref)) return null;
  for (const c of Object.values(s.commits)) {
    for (const t of buildTrees(c.files)) if (t.id.startsWith(ref)) return { type: "tree", entries: t.entries };
    for (const content of Object.values(c.files)) if (hashBlob(content).startsWith(ref)) return { type: "blob", content };
  }
  for (const content of [...Object.values(s.index), ...Object.values(s.work)]) if (hashBlob(content).startsWith(ref)) return { type: "blob", content };
  return null;
}

const HELP = `This sandbox understands:
  git <command>     the usual Git commands (try: git help)
  ls, cat <file>    list files, print a file
  echo "text" > f   write a file (>> adds a line)
  touch f, rm f     create an empty file, delete a file
  nano <file>       edit a file
  clear             clear the screen
Keys: ↑ ↓ for earlier commands, Tab to complete.`;

const GIT_HELP = `usage: git <command> [<args>]

start a working area      init, clone
work on the current change add, restore, rm
examine the history        status, log, show, diff, reflog, cat-file
grow and tweak history     commit, branch, switch, checkout, merge, rebase,
                           reset, revert, cherry-pick, stash, tag
collaborate                fetch, pull, push, remote
find a bug                 bisect`;
