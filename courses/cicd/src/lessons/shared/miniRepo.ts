import type { CommandLine, ShellEditor, ShellResult } from "@lets-explain/core/components/TypedSandbox";
import { complete, lines, out, shellWords, splitCommands, type TermLine } from "@lets-explain/core/lib/terminal";

/**
 * A small project folder with git, for lessons that have their own model instead of the
 * course's GitHub one (least privilege, reusable workflows, deploy strategies). Files are edited
 * with `nano`/`echo`, staged, committed and pushed like real git; what a push hands to GitHub
 * (or `kubectl apply` to a cluster) is up to the lesson.
 */

export type Files = Record<string, string>;

export interface MiniRepo {
  /** The folder. */
  files: Files;
  /** What `git add` staged. */
  index: Files;
  /** The last commit. */
  head: Files;
  /** What GitHub has. */
  remote: Files;
  /** Commit messages not pushed yet. */
  ahead: string[];
}

export const repoOf = (files: Files): MiniRepo => ({ files: { ...files }, index: { ...files }, head: { ...files }, remote: { ...files }, ahead: [] });

/** Paths that differ between two trees. */
export const changedPaths = (a: Files, b: Files) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((p) => a[p] !== b[p]).sort();

/** One command's result, before moves are counted. */
export interface Step<A, S> {
  actions: A[];
  output: TermLine[];
  failed?: boolean;
  editor?: ShellEditor<A, S>;
  clear?: boolean;
}

export const say = <A, S>(text: string, tone: TermLine["tone"] = "out"): Step<A, S> => ({ actions: [], output: lines(text, tone) });
export const fail = <A, S>(text: string): Step<A, S> => ({ actions: [], output: lines(text, "err"), failed: true });

export interface RepoHost<A, S> {
  repo: (s: S) => MiniRepo;
  /** The action that puts a new repo state in place. */
  setRepo: (repo: MiniRepo) => A;
  apply: (s: S, a: A) => S;
  /** `git push`: the repo after the push, and what the lesson does with the pushed files. A string refuses. */
  push: (s: S, pushed: MiniRepo, paths: string[]) => { actions: A[]; output: TermLine[] } | string;
  /** The lesson's own commands (kubectl, gh…); null when the command is not the lesson's. */
  extra?: (s: S, words: string[]) => Step<A, S> | null;
  prompt?: (s: S) => string;
  help: string;
  /** Extra words for Tab completion. */
  words?: string[];
}

/** A shell over a lesson's state that holds a MiniRepo. */
export function miniShell<A, S>(host: RepoHost<A, S>): CommandLine<A, S> {
  const run = (start: S, line: string): ShellResult<A, S> => {
    const result: ShellResult<A, S> = { actions: [], output: [], moves: 0 };
    let s = start;
    for (const words of splitCommands(shellWords(line))) {
      const r = command(host, s, words);
      result.actions.push(...r.actions);
      result.output.push(...r.output);
      if (r.clear) {
        result.clear = true;
        result.output = [];
      }
      if (r.actions.length) result.moves++;
      for (const a of r.actions) s = host.apply(s, a);
      if (r.editor) {
        result.editor = r.editor;
        break;
      }
      if (r.failed) break;
    }
    return result;
  };
  return {
    run,
    prompt: host.prompt ?? (() => "~/shop (main)$"),
    complete: (s, input) => {
      const words = input.trimStart().split(/\s+/);
      const files = Object.keys(host.repo(s).files);
      const candidates = words.length <= 1 ? ["git", "nano", "cat", "ls", "echo", "rm", "clear", "help", ...(host.words ?? [])] : words[0] === "git" && words.length === 2 ? ["status", "add", "commit", "push", "diff", "log", "ls-remote"] : [...files, ...(host.words ?? [])];
      return complete(input, candidates);
    },
    title: "bash",
  };
}

function command<A, S>(host: RepoHost<A, S>, s: S, words: string[]): Step<A, S> {
  const lesson = host.extra?.(s, words);
  if (lesson) return lesson;
  const [cmd, ...args] = words;
  const repo = host.repo(s);
  const write = (path: string, content: string): A => host.setRepo({ ...repo, files: { ...repo.files, [path]: content } });
  switch (cmd) {
    case "clear":
      return { actions: [], output: [], clear: true };
    case "help":
      return say(host.help);
    case "pwd":
      return say("/home/you/shop");
    case "cd":
      return say("cd: this sandbox stays in the project folder", "dim");
    case "mkdir":
      return { actions: [], output: [] };
    case "ls": {
      const dir = args.find((a) => !a.startsWith("-"))?.replace(/\/$/, "");
      const all = Object.keys(repo.files).sort();
      const names = dir ? all.filter((p) => p.startsWith(`${dir}/`)).map((p) => p.slice(dir.length + 1)) : all;
      if (dir && !names.length) return fail(`ls: ${dir}: No such file or directory`);
      return say([...new Set(names.map((p) => (p.includes("/") ? `${p.split("/")[0]}/` : p)))].join("  "));
    }
    case "tree":
      return say(Object.keys(repo.files).sort().join("\n"));
    case "cat": {
      if (!args.length) return fail("cat: missing file operand");
      const o: TermLine[] = [];
      for (const p of args) {
        if (!(p in repo.files)) return { actions: [], output: [...o, out(`cat: ${p}: No such file or directory`, "err")], failed: true };
        o.push(...lines(repo.files[p]!));
      }
      return { actions: [], output: o };
    }
    case "echo": {
      const at = args.findIndex((a) => a === ">" || a === ">>");
      if (at === -1) return say(args.join(" "));
      const path = args[at + 1];
      if (!path) return fail("bash: syntax error near unexpected token `newline'");
      const text = args.slice(0, at).join(" ");
      const old = repo.files[path];
      return { actions: [write(path, args[at] === ">>" && old ? `${old}\n${text}` : text)], output: [] };
    }
    case "rm": {
      const paths = args.filter((a) => !a.startsWith("-"));
      for (const p of paths) if (!(p in repo.files)) return fail(`rm: ${p}: No such file or directory`);
      const files = { ...repo.files };
      for (const p of paths) delete files[p];
      return { actions: [host.setRepo({ ...repo, files })], output: [] };
    }
    case "nano":
    case "vim":
    case "vi":
    case "code": {
      const path = args.find((a) => !a.startsWith("-"));
      if (!path) return fail(`${cmd}: give the file to open, e.g. ${cmd} .github/workflows/ci.yml`);
      return {
        actions: [],
        output: [],
        editor: {
          file: path,
          text: repo.files[path] ?? "",
          save: (state, text) => {
            const r = host.repo(state);
            const content = text.replace(/\s+$/, "");
            if (r.files[path] === content) return { actions: [], output: [], moves: 0 };
            return { actions: [host.setRepo({ ...r, files: { ...r.files, [path]: content } })], output: [], moves: 1 };
          },
        },
      };
    }
    case "git":
      return git(host, s, args);
    default:
      return fail(`bash: ${cmd}: command not found`);
  }
}

const COMMIT_TEMPLATE = "\n# Please enter the commit message for your changes. Lines starting\n# with '#' will be ignored, and an empty message aborts the commit.";

function git<A, S>(host: RepoHost<A, S>, s: S, args: string[]): Step<A, S> {
  const [sub, ...rest] = args;
  const repo = host.repo(s);
  const unstaged = changedPaths(repo.index, repo.files).filter((p) => p in repo.index || p in repo.head);
  const untracked = Object.keys(repo.files).filter((p) => !(p in repo.index)).sort();
  const staged = changedPaths(repo.head, repo.index);
  switch (sub) {
    case "status": {
      const o: TermLine[] = [out("On branch main")];
      if (repo.ahead.length) o.push(out(`Your branch is ahead of 'origin/main' by ${repo.ahead.length} commit${repo.ahead.length > 1 ? "s" : ""}.`), out('  (use "git push" to publish your local commits)', "dim"));
      else o.push(out("Your branch is up to date with 'origin/main'."));
      const kind = (p: string, from: Files, to: Files) => (!(p in from) ? "new file:   " : !(p in to) ? "deleted:    " : "modified:   ");
      if (staged.length) o.push(out(""), out("Changes to be committed:"), ...staged.map((p) => out(`\t${kind(p, repo.head, repo.index)}${p}`, "add")));
      if (unstaged.length) o.push(out(""), out("Changes not staged for commit:"), ...unstaged.map((p) => out(`\t${kind(p, repo.index, repo.files)}${p}`, "del")));
      if (untracked.length) o.push(out(""), out("Untracked files:"), out('  (use "git add <file>..." to include in what will be committed)', "dim"), ...untracked.map((p) => out(`\t${p}`, "del")));
      if (!staged.length && !unstaged.length && !untracked.length) o.push(out(""), out("nothing to commit, working tree clean"));
      return { actions: [], output: o };
    }
    case "add": {
      const paths = rest.filter((a) => !a.startsWith("-"));
      const all = rest.includes("-A") || rest.includes("--all") || paths.includes(".");
      if (!paths.length && !all) return say("Nothing specified, nothing added.\nhint: Maybe you wanted to say 'git add .'?", "dim");
      const index = { ...repo.index };
      const targets = all ? [...new Set([...Object.keys(repo.files), ...Object.keys(repo.index)])] : paths;
      for (const p of targets) {
        if (!(p in repo.files) && !(p in repo.index)) return fail(`fatal: pathspec '${p}' did not match any files`);
        if (p in repo.files) index[p] = repo.files[p]!;
        else delete index[p];
      }
      if (!changedPaths(repo.index, index).length) return { actions: [], output: [] };
      return { actions: [host.setRepo({ ...repo, index })], output: [] };
    }
    case "commit": {
      let message: string | undefined;
      let all = false;
      for (let i = 0; i < rest.length; i++) {
        const a = rest[i]!;
        if (a === "-m" || a === "--message") message = rest[++i];
        else if (a === "-a" || a === "--all") all = true;
        else if (/^-[a-z]*m$/.test(a) && a.includes("a")) {
          all = true;
          message = rest[++i];
        } else if (a.startsWith("-")) return fail(`error: unknown option \`${a.replace(/^-+/, "")}'`);
      }
      const commitWith = (r: MiniRepo, msg: string): Step<A, S> => {
        const index = { ...r.index };
        if (all) for (const p of Object.keys(index)) {
          if (p in r.files) index[p] = r.files[p]!;
          else delete index[p];
        }
        const paths = changedPaths(r.head, index);
        if (!paths.length) return fail("nothing to commit, working tree clean");
        return {
          actions: [host.setRepo({ ...r, index, head: { ...index }, ahead: [...r.ahead, msg] })],
          output: [out(`[main ${fakeSha(r)}] ${msg.split("\n")[0]}`, "hl"), out(` ${paths.length} file${paths.length > 1 ? "s" : ""} changed`)],
        };
      };
      if (message !== undefined) return commitWith(repo, message);
      return {
        actions: [],
        output: [],
        editor: {
          file: ".git/COMMIT_EDITMSG",
          text: COMMIT_TEMPLATE,
          save: (state, text) => {
            const msg = text.split("\n").filter((l) => !l.startsWith("#")).join("\n").trim();
            if (!msg) return { actions: [], output: [out("Aborting commit due to empty commit message.", "err")], moves: 0 };
            const r = commitWith(host.repo(state), msg);
            return { actions: r.actions, output: r.output, moves: r.actions.length ? 1 : 0 };
          },
        },
      };
    }
    case "push": {
      const pos = rest.filter((a) => !a.startsWith("-"));
      if (pos[0] && pos[0] !== "origin") return fail(`fatal: '${pos[0]}' does not appear to be a git repository`);
      if (pos[1] && pos[1] !== "main" && pos[1] !== "HEAD") return fail(`error: src refspec ${pos[1]} does not match any`);
      if (!repo.ahead.length) return say("Everything up-to-date");
      const paths = changedPaths(repo.remote, repo.head);
      const pushed: MiniRepo = { ...repo, remote: { ...repo.head }, ahead: [] };
      const r = host.push(s, pushed, paths);
      if (typeof r === "string") return fail(r);
      return {
        actions: [host.setRepo(pushed), ...r.actions],
        output: [out("To https://github.com/ada/shop.git"), out(`   ${fakeSha(repo, -1)}..${fakeSha(repo)}  main -> main`), ...r.output],
      };
    }
    case "diff": {
      const stagedOnly = rest.includes("--staged") || rest.includes("--cached");
      const [from, to] = stagedOnly ? [repo.head, repo.index] : [repo.index, Object.fromEntries(Object.keys(repo.index).filter((p) => p in repo.files).map((p) => [p, repo.files[p]!]))];
      const o: TermLine[] = [];
      for (const p of changedPaths(from, to)) {
        o.push(out(`diff --git a/${p} b/${p}`, "hl"));
        const a = (from[p] ?? "").split("\n");
        const b = (to[p] ?? "").split("\n");
        for (const l of a) if (!b.includes(l)) o.push(out(`-${l}`, "del"));
        for (const l of b) if (!a.includes(l)) o.push(out(`+${l}`, "add"));
      }
      return { actions: [], output: o };
    }
    case "log":
      return say(repo.ahead.length ? [...repo.ahead].reverse().map((m, i) => `${fakeSha(repo, -i)} ${m.split("\n")[0]}`).join("\n") : `${fakeSha(repo)} (HEAD -> main, origin/main) the last pushed commit`);
    case undefined:
      return say("usage: git <command> [<args>]");
    default:
      return say(`(git ${sub} is not in this sandbox)`, "dim");
  }
}

const SHAS = ["a41c2e9", "7d03b5f", "e9f1a62", "3b8c4d0", "c52e7a1", "0f6d9b3", "98a1c4e", "5e2b07d"];
const fakeSha = (r: MiniRepo, shift = 0) => SHAS[(((r.ahead.length + Object.keys(r.remote).length + shift) % SHAS.length) + SHAS.length) % SHAS.length]!;
