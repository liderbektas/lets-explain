import type { CommandLine, ShellEditor, ShellResult } from "@lets-explain/core/components/TypedSandbox";
import { complete, lines, out, shellWords, splitCommands, type TermLine } from "@lets-explain/core/lib/terminal";
import { checksFor, fmt, latestRun, runById, type CiAction, type Run, type Status, type World } from "./ci";
import { applyDesk, changed, isWorkflowPath, type Desk, type DeskAction } from "./desk";
import { ghApi } from "./ghApi";
import { problemText } from "./readYaml";
import { workflowFile } from "./yaml";

/**
 * The CI/CD course's command line: the reader edits files (the workflow above all) with
 * `nano`, commits and pushes with a small git, and talks to GitHub with `gh`. Each command
 * turns into desk actions; output follows what git and gh print. Unknown commands say so.
 */

export type CiResult = ShellResult<DeskAction, Desk>;
type CiEditor = ShellEditor<DeskAction, Desk>;

const REPO = "ada/shop";
const URL = `https://github.com/${REPO}`;

interface Run1 {
  actions: DeskAction[];
  output: TermLine[];
  failed?: boolean;
  editor?: CiEditor;
  clear?: boolean;
}

const say = (text: string, tone: TermLine["tone"] = "out"): Run1 => ({ actions: [], output: lines(text, tone) });
const fail = (text: string): Run1 => ({ actions: [], output: lines(text, "err"), failed: true });

export function runCi(start: Desk, line: string): CiResult {
  const result: CiResult = { actions: [], output: [], moves: 0 };
  let desk = start;
  for (const words of splitCommands(shellWords(line))) {
    const r = command(desk, words);
    result.actions.push(...r.actions);
    result.output.push(...r.output);
    if (r.clear) {
      result.clear = true;
      result.output = [];
    }
    if (r.actions.length) result.moves++;
    for (const a of r.actions) desk = applyDesk(desk, a).state;
    if (r.editor) {
      result.editor = r.editor;
      break;
    }
    if (r.failed) break;
  }
  return result;
}

export const promptCi = (d: Desk) => `~/shop (${d.branch})$`;

const GIT_SUBS = ["add", "status", "commit", "push", "pull", "switch", "checkout", "branch", "log", "diff", "restore"];
const GH_SUBS = ["pr", "run", "workflow", "secret"];

export function completeCi(d: Desk, input: string) {
  const words = input.trimStart().split(/\s+/);
  let candidates: string[];
  if (words.length <= 1) candidates = ["git", "gh", "ls", "cat", "echo", "nano", "rm", "touch", "clear", "help"];
  else if (words[0] === "git" && words.length === 2) candidates = GIT_SUBS;
  else if (words[0] === "gh" && words.length === 2) candidates = GH_SUBS;
  else if (words[0] === "gh" && words.length === 3)
    candidates = { pr: ["create", "list", "checks", "merge", "view"], run: ["list", "view", "rerun", "watch"], workflow: ["list", "run"], secret: ["set", "list", "delete"] }[words[1]!] ?? [];
  else candidates = [...Object.keys(d.files), ".github/workflows/", ...Object.keys(d.trees), ...d.world.workflows.map((w) => workflowFile(w).replace(/^.*\//, "")), "--log-failed", "--failed", "--base", "--head", "--fill", "--body"];
  return complete(input, candidates);
}

/** The CI/CD command line, as the shared terminal takes it. */
export const ciShell: CommandLine<DeskAction, Desk> = { run: runCi, prompt: promptCi, complete: completeCi, title: "bash" };

function command(d: Desk, words: string[]): Run1 {
  const [cmd, ...args] = words;
  switch (cmd) {
    case "git":
      return git(d, args);
    case "gh":
      return gh(d, args);
    case "clear":
      return { actions: [], output: [], clear: true };
    case "help":
      return say(HELP);
    case "pwd":
      return say("/home/you/shop");
    case "cd":
      return say("cd: this sandbox stays in the project folder", "dim");
    case "mkdir":
      return { actions: [], output: [] };
    case "ls":
      return ls(d, args);
    case "tree":
      return say(Object.keys(d.files).sort().join("\n"));
    case "cat": {
      if (!args.length) return fail("cat: missing file operand");
      const o: TermLine[] = [];
      for (const p of args) {
        if (!(p in d.files)) return { actions: [], output: [...o, out(`cat: ${p}: No such file or directory`, "err")], failed: true };
        o.push(...lines(d.files[p]!));
      }
      return { actions: [], output: o };
    }
    case "echo": {
      const at = args.findIndex((a) => a === ">" || a === ">>");
      if (at === -1) return say(args.join(" "));
      const path = args[at + 1];
      if (!path) return fail("bash: syntax error near unexpected token `newline'");
      const text = args.slice(0, at).join(" ");
      const old = d.files[path];
      return { actions: [{ type: "write", path, content: args[at] === ">>" && old ? `${old}\n${text}` : text }], output: [] };
    }
    case "touch":
      return { actions: args.filter((p) => !(p in d.files)).map((path) => ({ type: "write", path, content: "" })), output: [] };
    case "rm": {
      const paths = args.filter((a) => !a.startsWith("-"));
      for (const p of paths) if (!(p in d.files)) return fail(`rm: ${p}: No such file or directory`);
      return { actions: paths.map((path) => ({ type: "remove", path })), output: [] };
    }
    case "npm":
      return npm(d, args);
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
          text: d.files[path] ?? "",
          save: (desk, text) => {
            const content = text.replace(/\s+$/, "");
            if (desk.files[path] === content) return { actions: [], output: [], moves: 0 };
            return { actions: [{ type: "write", path, content }], output: [], moves: 1 };
          },
        },
      };
    }
    default:
      return fail(`bash: ${cmd}: command not found`);
  }
}

/**
 * `npm install <pkg>` adds a dependency: package.json gets it and package-lock.json changes,
 * which is what a cache keyed on the lockfile notices. Everything else npm does runs in CI here.
 */
function npm(d: Desk, args: string[]): Run1 {
  const [sub, ...rest] = args;
  const pkgs = rest.filter((a) => !a.startsWith("-"));
  if ((sub === "install" || sub === "i" || sub === "add") && pkgs.length) {
    const pkg = d.files["package.json"] ?? "{}";
    let json: { dependencies?: Record<string, string> } & Record<string, unknown>;
    try {
      json = JSON.parse(pkg);
    } catch {
      return fail("npm error code EJSONPARSE\nnpm error JSON.parse Failed to parse package.json data.");
    }
    const deps = { ...(json.dependencies ?? {}) };
    const added = pkgs.filter((p) => !deps[p.replace(/@[^@/]*$/, "")]);
    if (!added.length) return say(`\nup to date, audited 412 packages in 1s`);
    for (const p of added) deps[p.replace(/@[^@/]*$/, "")] = "^1.11.13";
    json.dependencies = Object.fromEntries(Object.entries(deps).sort());
    const lock = d.files["package-lock.json"] ?? `{\n  "name": "shop",\n  "lockfileVersion": 3\n}`;
    const n = (lock.match(/"node_modules\//g) ?? []).length;
    const entries = added.map((p) => `  "node_modules/${p.replace(/@[^@/]*$/, "")}": { "version": "1.11.13" }`).join(",\n");
    const newLock = lock.replace(/\n\}\s*$/, `,\n${entries}\n}`);
    return {
      actions: [
        { type: "write", path: "package.json", content: JSON.stringify(json, null, 2) },
        { type: "write", path: "package-lock.json", content: newLock },
      ],
      output: [out(""), out(`added ${added.length} package${added.length > 1 ? "s" : ""}, and audited ${413 + n} packages in 2s`), out(""), out("found 0 vulnerabilities")],
    };
  }
  if (sub === "install" || sub === "i" || sub === "ci") return say("\nup to date, audited 412 packages in 1s");
  return say(`(npm ${sub ?? ""} runs in CI in this sandbox: push and read the run)`.replace("npm  runs", "npm runs"), "dim");
}

function ls(d: Desk, args: string[]): Run1 {
  const dir = (args.find((a) => !a.startsWith("-")) ?? "").replace(/\/$/, "");
  const all = args.some((a) => a.startsWith("-") && a.includes("a"));
  const names = new Set<string>();
  for (const p of Object.keys(d.files)) {
    if (dir && !p.startsWith(`${dir}/`)) continue;
    const rest = dir ? p.slice(dir.length + 1) : p;
    const first = rest.split("/")[0]!;
    if (first.startsWith(".") && !all && !dir) continue;
    names.add(rest.includes("/") ? `${first}/` : first);
  }
  if (dir && !names.size) return fail(`ls: ${dir}: No such file or directory`);
  return say([...(all && !dir ? [".git/"] : []), ...[...names].sort()].join("  "));
}

/* -------------------------------------------------------------------- git */

/** Tiny flag reader: known boolean flags, flags that take a value, the rest. */
function flags(args: string[], valued: string[] = []) {
  const set = new Map<string, string | true>();
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith("--") && a.includes("=")) set.set(a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1));
    else if (valued.includes(a)) set.set(a, args[++i] ?? "");
    else if (/^-[a-zA-Z]{2,}$/.test(a) && valued.some((v) => a.endsWith(v.slice(1)))) {
      // -am "msg": every letter is a flag, the last one takes the value.
      for (const ch of a.slice(1, -1)) set.set(`-${ch}`, true);
      set.set(`-${a.at(-1)}`, args[++i] ?? "");
    } else if (a.startsWith("-")) set.set(a, true);
    else rest.push(a);
  }
  return { set, rest };
}

function git(d: Desk, args: string[]): Run1 {
  const [sub, ...rest] = args;
  const tree = d.trees[d.branch] ?? {};
  switch (sub) {
    case "status": {
      const staged = changed(tree, d.index);
      const tracked = Object.keys(d.index);
      const unstaged = tracked.filter((p) => d.files[p] !== d.index[p]);
      const untracked = Object.keys(d.files).filter((p) => !(p in d.index)).sort();
      const o: TermLine[] = [out(`On branch ${d.branch}`)];
      const ahead = (d.ahead[d.branch] ?? []).length;
      if (d.upstream.includes(d.branch)) {
        if (ahead) o.push(out(`Your branch is ahead of 'origin/${d.branch}' by ${ahead} commit${ahead > 1 ? "s" : ""}.`), out('  (use "git push" to publish your local commits)', "dim"));
        else o.push(out(`Your branch is up to date with 'origin/${d.branch}'.`));
      }
      const kind = (p: string, a: Record<string, string>, b: Record<string, string>) => (!(p in a) ? "new file:   " : !(p in b) ? "deleted:    " : "modified:   ");
      if (staged.length) o.push(out(""), out("Changes to be committed:"), out('  (use "git restore --staged <file>..." to unstage)', "dim"), ...staged.map((p) => out(`\t${kind(p, tree, d.index)}${p}`, "add")));
      if (unstaged.length) o.push(out(""), out("Changes not staged for commit:"), out('  (use "git add <file>..." to update what will be committed)', "dim"), ...unstaged.map((p) => out(`\t${kind(p, d.index, d.files)}${p}`, "del")));
      if (untracked.length) o.push(out(""), out("Untracked files:"), out('  (use "git add <file>..." to include in what will be committed)', "dim"), ...untracked.map((p) => out(`\t${p}`, "del")));
      o.push(out(""));
      if (staged.length) o.pop();
      else if (unstaged.length) o.push(out('no changes added to commit (use "git add" and/or "git commit -a")'));
      else if (untracked.length) o.push(out('nothing added to commit but untracked files present (use "git add" to track)'));
      else o.push(out("nothing to commit, working tree clean"));
      return { actions: [], output: o };
    }
    case "add": {
      const paths = rest.filter((a) => !a.startsWith("-"));
      if (rest.includes("-A") || rest.includes("--all") || paths.includes(".")) return quiet(d, [{ type: "add", paths: "." }]);
      if (!paths.length) return say("Nothing specified, nothing added.\nhint: Maybe you wanted to say 'git add .'?", "dim");
      // `git add .github/` adds everything under a folder.
      const expanded = paths.flatMap((p) => (p in d.files || p in d.index ? [p] : [...Object.keys(d.files), ...Object.keys(d.index)].filter((f) => f.startsWith(p.replace(/\/?$/, "/")))));
      if (!expanded.length) return fail(`fatal: pathspec '${paths[0]}' did not match any files`);
      return quiet(d, [{ type: "add", paths: [...new Set(expanded)] }]);
    }
    case "restore": {
      const { set, rest: paths } = flags(rest);
      if (!paths.length) return fail("fatal: you must specify path(s) to restore");
      if (set.has("--staged") || set.has("-S")) return say("(git restore --staged is not in this sandbox: commit what you need, or edit the file back)", "dim");
      const actions: DeskAction[] = [];
      for (const p of paths) {
        if (!(p in d.index)) return fail(`error: pathspec '${p}' did not match any file(s) known to git`);
        if (d.files[p] !== d.index[p]) actions.push({ type: "write", path: p, content: d.index[p]! });
      }
      return { actions, output: [] };
    }
    case "commit": {
      const { set } = flags(rest, ["-m"]);
      const all = set.has("-a") || set.has("--all");
      const message = set.get("-m");
      const commitWith = (desk: Desk, msg: string): Run1 => {
        const r = applyDesk(desk, { type: "commit", message: msg, all });
        if (r.error) return r.error.startsWith("nothing") ? { ...statusAsNothing(desk), failed: true } : fail(r.error);
        const files = changed(desk.trees[desk.branch] ?? {}, r.state.trees[desk.branch]!).length;
        const sha = fakeSha(r.state);
        return { actions: [{ type: "commit", message: msg, all }], output: [out(`[${desk.branch} ${sha}] ${msg.split("\n")[0]}`, "hl"), out(` ${files} file${files === 1 ? "" : "s"} changed`)] };
      };
      if (typeof message === "string") return commitWith(d, message);
      return {
        actions: [],
        output: [],
        editor: {
          file: ".git/COMMIT_EDITMSG",
          text: "\n# Please enter the commit message for your changes. Lines starting\n# with '#' will be ignored, and an empty message aborts the commit.",
          save: (desk, text) => {
            const msg = text.split("\n").filter((x) => !x.startsWith("#")).join("\n").trim();
            const r = msg ? commitWith(desk, msg) : fail("Aborting commit due to empty commit message.");
            return { actions: r.actions, output: r.output, moves: r.actions.length ? 1 : 0 };
          },
        },
      };
    }
    case "push": {
      const { set, rest: pos } = flags(rest);
      const [remote, branchArg] = pos;
      if (remote && remote !== "origin") return fail(`fatal: '${remote}' does not appear to be a git repository\nfatal: Could not read from remote repository.`);
      const branch = branchArg === "HEAD" ? d.branch : branchArg;
      if (set.has("--force") || set.has("-f") || set.has("--force-with-lease")) return say("(force-pushing is not in this sandbox)", "dim");
      const action: DeskAction = { type: "push", branch, setUpstream: set.has("-u") || set.has("--set-upstream") || undefined };
      const r = applyDesk(d, action);
      if (r.error) return r.error === "Everything up-to-date" ? say(r.error) : fail(r.error);
      const b = branch ?? d.branch;
      const before = d.world.heads[b];
      const after = r.state.world.heads[b]!;
      const o: TermLine[] = [out(`To ${URL}.git`), out(before ? `   ${before}..${after}  ${b} -> ${b}` : ` * [new branch]      ${b} -> ${b}`)];
      if (action.setUpstream) o.push(out(`branch '${b}' set up to track 'origin/${b}'.`));
      if (!before && b !== "main") o.push(out(""), out("remote: Create a pull request for '" + b + "' on GitHub by visiting:", "dim"), out(`remote:      ${URL}/pull/new/${b}`, "dim"));
      for (const [file, problems] of Object.entries(r.state.invalid)) {
        o.push(out(""), out(`GitHub Actions: ${problemText(file, problems[0]!).replace(/\n/g, "\n  ")}`, "err"));
      }
      return { actions: [action], output: o };
    }
    case "pull": {
      const r = applyDesk(d, { type: "pull" });
      if (r.error) return r.error === "Already up to date." ? say(r.error) : fail(r.error);
      const files = changed(d.trees[d.branch] ?? {}, r.state.trees[d.branch]!);
      return { actions: [{ type: "pull" }], output: [out(`From ${URL}`), out("Fast-forward"), ...files.map((p) => out(` ${p}`)), out(` ${files.length} file${files.length === 1 ? "" : "s"} changed`)] };
    }
    case "switch":
    case "checkout": {
      const { set, rest: pos } = flags(rest, ["-c", "-b"]);
      const created = set.get("-c") ?? set.get("-b");
      const name = typeof created === "string" ? created : pos[0];
      if (!name) return fail("fatal: missing branch or commit argument");
      const action: DeskAction = { type: "switch", branch: name, create: typeof created === "string" || undefined };
      const r = applyDesk(d, action);
      if (r.error) return r.error.startsWith("Already") ? say(r.error) : fail(r.error);
      const tracking = !d.trees[name] && d.remote[name] ? [out(`branch '${name}' set up to track 'origin/${name}'.`)] : [];
      return { actions: [action], output: [...tracking, out(action.create ? `Switched to a new branch '${name}'` : `Switched to branch '${name}'`)] };
    }
    case "branch":
      return { actions: [], output: Object.keys(d.trees).sort().map((b) => out(`${b === d.branch ? "*" : " "} ${b}`, b === d.branch ? "add" : "out")) };
    case "log": {
      const local = [...(d.ahead[d.branch] ?? [])].reverse().map((c, i) => out(`${i === 0 ? "(local) " : ""}${c.message}`, "hl"));
      const shas: string[] = [];
      for (const c of [...d.world.commits].reverse()) if (c.branch === d.branch || c.branch === "main") shas.push(`${c.sha} ${c.message}`);
      return { actions: [], output: [...local, ...shas.map((s) => out(s))] };
    }
    case "diff": {
      const staged = rest.includes("--staged") || rest.includes("--cached");
      const [from, to] = staged ? [tree, d.index] : [d.index, d.files];
      const o: TermLine[] = [];
      for (const p of changed(from, to)) {
        if (!staged && !(p in d.index)) continue;
        o.push(out(`diff --git a/${p} b/${p}`, "hl"), out(`--- a/${p}`), out(`+++ b/${p}`));
        const a = (from[p] ?? "").split("\n");
        const b = (to[p] ?? "").split("\n");
        for (const l of a) if (!b.includes(l)) o.push(out(`-${l}`, "del"));
        for (const l of b) if (!a.includes(l)) o.push(out(`+${l}`, "add"));
      }
      return { actions: [], output: o };
    }
    case "init":
    case "clone":
      return say("(this sandbox already has the project in ~/shop, cloned from GitHub)", "dim");
    case undefined:
      return say("usage: git <command> [<args>]");
    default:
      return fail(`git: '${sub}' is not a git command. See 'git --help'.`);
  }
}

const quiet = (d: Desk, actions: DeskAction[]): Run1 => {
  for (const a of actions) {
    const r = applyDesk(d, a);
    if (r.error) return fail(r.error);
  }
  return { actions, output: [] };
};

function statusAsNothing(d: Desk): Run1 {
  const unstaged = Object.keys(d.index).filter((p) => d.files[p] !== d.index[p]);
  if (unstaged.length) return { actions: [], output: [out(`On branch ${d.branch}`), out("Changes not staged for commit:"), ...unstaged.map((p) => out(`\tmodified:   ${p}`, "del")), out(""), out('no changes added to commit (use "git add" and/or "git commit -a")')] };
  return { actions: [], output: [out(`On branch ${d.branch}`), out("nothing to commit, working tree clean")] };
}

/** A short id for a local commit, stable for the same state. */
const fakeSha = (d: Desk) => {
  const n = Object.values(d.ahead).reduce((k, xs) => k + xs.length, 0) + d.world.commits.length;
  return ["a41c2e9", "7d03b5f", "e9f1a62", "3b8c4d0", "c52e7a1", "0f6d9b3", "98a1c4e", "5e2b07d"][n % 8]!;
};

/* --------------------------------------------------------------------- gh */

const ICON: Record<Status, string> = { success: "✓", failure: "X", cancelled: "-", skipped: "-", waiting: "*", queued: "*" };
const TONE: Record<Status, TermLine["tone"]> = { success: "add", failure: "del", cancelled: "dim", skipped: "dim", waiting: "hl", queued: "hl" };
const EVENT: Record<Run["event"], string> = { push: "push", pull_request: "pull_request", schedule: "schedule", dispatch: "workflow_dispatch" };

const ago = (w: World, t: number) => {
  const m = Math.round((w.clock - t) / 60);
  return m < 1 ? "less than a minute ago" : m === 1 ? "about 1 minute ago" : `about ${m} minutes ago`;
};
const short = (seconds: number) => fmt(seconds).replace(/ /g, "");
const pad = (s: string, n: number) => (s.length >= n ? `${s} ` : s + " ".repeat(n - s.length));

function titleOf(w: World, r: Run): string {
  if (r.event === "dispatch" || r.event === "schedule") return r.workflow;
  return w.commits.find((c) => c.sha === r.sha)?.message ?? r.workflow;
}

function ghRun(d: Desk, args: string[]): Run1 {
  const [sub, ...rest] = args;
  const w = d.world;
  const { set, rest: pos } = flags(rest, ["--workflow", "-w", "-L", "--limit", "--branch", "-b", "--job", "--status", "-s"]);
  const wanted = (set.get("--status") ?? set.get("-s")) as string | undefined;
  const pickRun = (): Run | undefined => (pos[0] ? runById(w, Number(pos[0])) : latestRun(w));
  switch (sub) {
    case "list": {
      const wfName = (set.get("--workflow") ?? set.get("-w")) as string | undefined;
      const branch = (set.get("--branch") ?? set.get("-b")) as string | undefined;
      const limit = Number(set.get("-L") ?? set.get("--limit") ?? 20);
      const runs = [...w.runs].reverse().filter((r) => (!wfName || r.workflow === wfName || workflowFile({ name: r.workflow } as never).endsWith(String(wfName))) && (!branch || r.branch === branch) && (!wanted || r.status === wanted || (wanted === "completed" && !["queued", "waiting"].includes(r.status)))).slice(0, limit);
      const invalid = Object.keys(d.invalid).map((f) => out(`X       ${pad(f, 28)}${pad(f.replace(/^.*\//, ""), 10)}${pad(d.branch, 9)}${pad("push", 13)}${pad("-", 4)}0s       Invalid workflow file`, "del"));
      if (!runs.length && !invalid.length) return say("no runs found");
      return {
        actions: [],
        output: [
          out("STATUS  TITLE                       WORKFLOW  BRANCH   EVENT        ID  ELAPSED  AGE", "dim"),
          ...invalid,
          ...runs.map((r) => out(`${pad(ICON[r.status], 8)}${pad(titleOf(w, r).slice(0, 27), 28)}${pad(r.workflow, 10)}${pad(r.branch, 9)}${pad(EVENT[r.event], 13)}${pad(String(r.id), 4)}${pad(short(r.end - r.start), 9)}${ago(w, r.end)}`, TONE[r.status])),
        ],
      };
    }
    case "view":
    case "watch": {
      const r = pickRun();
      if (!r) return fail(pos[0] ? `could not find any workflow run with ID ${pos[0]}` : "no runs found");
      if (set.has("--log-failed") || set.has("--log")) {
        const failedOnly = set.has("--log-failed");
        const o: TermLine[] = [];
        for (const j of r.jobs) for (const s of j.steps) {
          if (failedOnly && s.status !== "failure") continue;
          for (const l of s.log) o.push(out(`${j.label}\t${s.name}\t${l}`, s.status === "failure" ? "del" : "out"));
          if (s.status === "failure") o.push(out(`${j.label}\t${s.name}\t##[error]Process completed with exit code ${s.exit ?? 1}.`, "err"));
        }
        if (!o.length) return say(failedOnly ? "no failed steps in this run" : "no logs");
        return { actions: [], output: o };
      }
      const o: TermLine[] = [out(`${ICON[r.status]} ${r.branch} ${r.workflow} · ${r.id}${r.attempt > 1 ? ` (attempt #${r.attempt})` : ""}`, TONE[r.status]), out(`Triggered via ${EVENT[r.event]} ${ago(w, r.start)}`), out(""), out("JOBS")];
      for (const j of r.jobs) {
        o.push(out(`${ICON[j.status]} ${j.label}${j.status === "skipped" ? "" : ` in ${short(j.end - j.start)}`} (ID ${r.id * 100 + r.jobs.indexOf(j) + 1})${j.status === "waiting" ? ` waiting for review: ${j.environment}` : ""}`, TONE[j.status]));
        if (j.status === "failure" || j.status === "cancelled") for (const s of j.steps) o.push(out(`  ${ICON[s.status]} ${s.name}`, TONE[s.status]));
      }
      const failed = r.jobs.filter((j) => j.status === "failure");
      if (failed.length) {
        o.push(out(""), out("ANNOTATIONS"));
        for (const j of failed) {
          const s = j.steps.find((x) => x.status === "failure");
          o.push(out(j.reason === "timeout" ? `X The job running on runner GitHub Actions has exceeded the maximum execution time of ${j.end - j.start >= 60 ? Math.round((j.end - j.start) / 60) : 0} minutes.` : `X Process completed with exit code ${s?.exit ?? 1}.`, "del"), out(`${j.label}: .github#1`, "dim"));
        }
        o.push(out(""), out("To see what failed, try: gh run view " + r.id + " --log-failed", "dim"));
      }
      o.push(out(`View this run on GitHub: ${URL}/actions/runs/${r.id}`, "dim"));
      return { actions: [], output: o };
    }
    case "rerun": {
      const r = pickRun();
      if (!r) return fail("no runs found");
      if (r.status === "success" && !pos[0]) return fail(`run ${r.id} cannot be rerun; its workflow file may be broken or it completed successfully`);
      const action: DeskAction = { type: "gh", action: { type: "rerun", run: r.id } };
      const res = applyDesk(d, action);
      if (res.error) return fail(`run ${r.id} cannot be rerun`);
      return { actions: [action], output: [out(`✓ Requested rerun${set.has("--failed") ? " (failed jobs)" : ""} of run ${r.id}`, "add")] };
    }
    default:
      return fail(`unknown command "${sub ?? ""}" for "gh run"`);
  }
}

function ghPr(d: Desk, args: string[]): Run1 {
  const [sub, ...rest] = args;
  const w = d.world;
  const { set, rest: pos } = flags(rest, ["--base", "-B", "--head", "-H", "--title", "-t", "--body", "-b"]);
  const prOf = () => (pos[0] ? w.prs.find((p) => p.id === Number(pos[0]!.replace(/^#/, ""))) : (w.prs.find((p) => p.branch === d.branch && p.state === "open") ?? [...w.prs].reverse().find((p) => p.state === "open")));
  switch (sub) {
    case "create": {
      const head = String(set.get("--head") ?? set.get("-H") ?? d.branch);
      const base = String(set.get("--base") ?? set.get("-B") ?? "main");
      if (base !== "main") return fail(`(in this sandbox pull requests go into main)`);
      if (head === "main") return fail("pull request create failed: GraphQL: No commits between main and main (createPullRequest)");
      if (!w.heads[head]) return fail(`aborted: you must first push the current branch to a remote, or use the --head flag`);
      if (!set.has("--fill") && !set.has("--title") && !set.has("-t")) {
        // gh asks interactively; in this terminal the title comes from the last commit, as with --fill.
      }
      const action: DeskAction = { type: "gh", action: { type: "openPr", branch: head } };
      const r = applyDesk(d, action);
      if (r.error) return fail(r.error === "pr-exists" ? `a pull request for branch "${head}" into branch "main" already exists:\n${URL}/pull/${w.prs.find((p) => p.branch === head && p.state === "open")?.id}` : `pull request create failed`);
      const pr = r.state.world.prs.at(-1)!;
      return { actions: [action], output: [out(`Creating pull request for ${head} into main in ${REPO}`), out(""), out(`${URL}/pull/${pr.id}`, "hl")] };
    }
    case "list": {
      const open = w.prs.filter((p) => p.state === "open");
      if (!open.length) return say(`no open pull requests in ${REPO}`);
      return { actions: [], output: [out(`Showing ${open.length} of ${open.length} open pull request${open.length > 1 ? "s" : ""} in ${REPO}`), out(""), ...open.map((p) => out(`#${p.id}  ${titleOfPr(w, p.branch)}  ${p.branch}  OPEN`))] };
    }
    case "checks":
    case "view": {
      const pr = prOf();
      if (!pr) return fail(`no pull requests found for branch "${d.branch}"`);
      const checks = checksFor(w, pr.id);
      if (!checks.length) return say(`no checks reported on the '${pr.branch}' branch`);
      const failing = checks.filter((c) => c.state === "failure" || c.state === "cancelled").length;
      const ok = checks.filter((c) => c.state === "success").length;
      const skipped = checks.filter((c) => c.state === "skipped").length;
      const pending = checks.length - failing - ok - skipped;
      const icon = (s: string) => (s === "success" ? "✓" : s === "failure" || s === "cancelled" ? "X" : s === "skipped" ? "-" : "*");
      return {
        actions: [],
        output: [
          out(failing ? "Some checks were not successful" : pending ? "Some checks are still pending" : "All checks were successful", failing ? "del" : pending ? "hl" : "add"),
          out(`${failing} failing, ${ok} successful, ${skipped} skipped, and ${pending} pending checks`),
          out(""),
          ...checks.map((c) => out(`${icon(c.state)}  ${pad(c.name, 30)}${c.required ? "required" : ""}`, c.state === "success" ? "add" : c.state === "failure" ? "del" : "dim")),
        ],
      };
    }
    case "merge": {
      const pr = prOf();
      if (!pr) return fail(`no pull requests found for branch "${d.branch}"`);
      const action: DeskAction = { type: "gh", action: { type: "merge", pr: pr.id } };
      const r = applyDesk(d, action);
      if (r.events.some((e) => e.type === "mergeBlocked"))
        return fail(`X Pull request #${pr.id} is not mergeable: the base branch policy prohibits the merge.\nTo have the pull request merged after all the requirements have been met, add the \`--auto\` flag.`);
      if (r.error) return fail(`X Pull request #${pr.id} (${titleOfPr(w, pr.branch)}) can't be merged`);
      return { actions: [action], output: [out(`✓ Merged pull request #${pr.id} (${titleOfPr(w, pr.branch)})`, "add")] };
    }
    default:
      return fail(`unknown command "${sub ?? ""}" for "gh pr"`);
  }
}

const titleOfPr = (w: World, branch: string) => [...w.commits].reverse().find((c) => c.branch === branch)?.message ?? branch;

function ghWorkflow(d: Desk, args: string[]): Run1 {
  const [sub, ...rest] = args;
  const w = d.world;
  const { set, rest: pos } = flags(rest, ["--ref", "-r", "-f", "--field", "-F", "--raw-field"]);
  switch (sub) {
    case "list":
      return { actions: [], output: w.workflows.map((wf) => out(`${pad(wf.name, 14)}active  ${workflowFile(wf)}`)) };
    case "run": {
      const id = pos[0];
      if (!id) return fail("workflow ID, name, or filename required");
      const wf = w.workflows.find((x) => x.name === id || workflowFile(x).endsWith(`/${id}`) || workflowFile(x) === id);
      if (!wf) return fail(`could not find any workflows named ${id}`);
      const ref = String(set.get("--ref") ?? set.get("-r") ?? "main");
      if (ref !== "main") return fail("(in this sandbox, workflow_dispatch runs on main)");
      if (!wf.on.dispatch) return fail(`could not create workflow dispatch event: HTTP 422: Workflow does not have 'workflow_dispatch' trigger (https://api.github.com/repos/${REPO}/actions/workflows/${workflowFile(wf).replace(/^.*\//, "")}/dispatches)`);
      const inputs: Record<string, string> = {};
      for (let i = 0; i < rest.length; i++) if (["-f", "--field", "-F", "--raw-field"].includes(rest[i]!)) {
        const [k, ...v] = (rest[i + 1] ?? "").split("=");
        if (k) inputs[k] = v.join("=");
      }
      const missing = wf.on.dispatch.filter((n) => !(n in inputs));
      if (missing.length) return fail(`could not create workflow dispatch event: HTTP 422: Required input '${missing[0]}' not provided`);
      const action: DeskAction = { type: "gh", action: { type: "dispatch", workflow: wf.name, inputs } };
      return { actions: [action], output: [out(`✓ Created workflow_dispatch event for ${workflowFile(wf).replace(/^.*\//, "")} at ${ref}`, "add"), out(""), out(`To see runs for this workflow, try: gh run list --workflow=${workflowFile(wf).replace(/^.*\//, "")}`, "dim")] };
    }
    default:
      return fail(`unknown command "${sub ?? ""}" for "gh workflow"`);
  }
}

function ghSecret(d: Desk, args: string[]): Run1 {
  const [sub, ...rest] = args;
  const { set, rest: pos } = flags(rest, ["--body", "-b", "--env", "-e"]);
  const name = pos[0];
  const envName = set.get("--env") ?? set.get("-e");
  const scoped = typeof envName === "string" ? envName : undefined;
  // With --env the secret belongs to that environment: only its jobs get it.
  const setTo = (value: string): DeskAction =>
    scoped ? { type: "gh", action: { type: "setEnvSecret", env: scoped, name: name!, value } satisfies CiAction } : { type: "gh", action: { type: "setSecret", name: name!, value } satisfies CiAction };
  if (scoped && !d.world.envs[scoped] && sub !== "list") return fail(`failed to fetch public key: HTTP 404: Not Found (https://api.github.com/repos/${REPO}/environments/${scoped}/secrets/public-key)`);
  const setToNull = (): DeskAction => (scoped ? { type: "gh", action: { type: "setEnvSecret", env: scoped, name: name!, value: null } } : { type: "gh", action: { type: "setSecret", name: name!, value: null } });
  switch (sub) {
    case "set": {
      if (!name) return fail("must pass name argument");
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || /^GITHUB_/i.test(name)) return fail(`failed to set secret "${name}": HTTP 422: Secret names can only contain alphanumeric characters ([a-z], [A-Z], [0-9]) or underscores (_). Spaces are not allowed. Must start with a letter ([a-z], [A-Z]) or underscores (_). Secret names cannot start with GITHUB_.`);
      const where = scoped ? `environment ${scoped}` : REPO;
      const body = set.get("--body") ?? set.get("-b");
      if (typeof body === "string") return { actions: [setTo(body)], output: [out(`✓ Set Actions secret ${name} for ${where}`, "add")] };
      return {
        actions: [],
        output: [out("? Paste your secret (the editor below stands in for the hidden prompt)", "dim")],
        editor: {
          file: `secret ${name}`,
          text: "",
          save: (_desk, text) => {
            const value = text.trim();
            if (!value) return { actions: [], output: [out("X secret value cannot be empty", "err")], moves: 0 };
            return { actions: [setTo(value)], output: [out(`✓ Set Actions secret ${name} for ${where}`, "add")], moves: 1 };
          },
        },
      };
    }
    case "list": {
      if (scoped && !d.world.envs[scoped]) return fail(`HTTP 404: Not Found (https://api.github.com/repos/${REPO}/environments/${scoped}/secrets?per_page=100)`);
      const names = Object.keys(scoped ? (d.world.envs[scoped]!.secrets ?? {}) : d.world.secrets).sort();
      return { actions: [], output: names.length ? [out("NAME              UPDATED", "dim"), ...names.map((n) => out(`${pad(n, 18)}less than a minute ago`))] : [out("no secrets found", "dim")] };
    }
    case "delete":
    case "remove": {
      if (!name) return fail("must pass name argument");
      if (!(name in (scoped ? (d.world.envs[scoped]?.secrets ?? {}) : d.world.secrets))) return fail(`failed to delete secret ${name}: HTTP 404: Not Found`);
      return { actions: [setToNull()], output: [out(`✓ Deleted secret ${name} from ${scoped ? `environment ${scoped}` : REPO}`, "add")] };
    }
    default:
      return fail(`unknown command "${sub ?? ""}" for "gh secret"`);
  }
}

function gh(d: Desk, args: string[]): Run1 {
  const [area, ...rest] = args;
  switch (area) {
    case "run":
      return ghRun(d, rest);
    case "pr":
      return ghPr(d, rest);
    case "workflow":
      return ghWorkflow(d, rest);
    case "secret":
      return ghSecret(d, rest);
    case "auth":
      return say(`github.com\n  ✓ Logged in to github.com account ada (keyring)`);
    case "api":
      return ghApi(d, rest);
    case "repo":
    case "issue":
    case "release":
      return say(`(gh ${area} is not in this sandbox)`, "dim");
    case undefined:
    case "help":
    case "--help":
      return say("Work seamlessly with GitHub from the command line.\n\nUSAGE\n  gh <command> <subcommand> [flags]\n\nIN THIS SANDBOX\n  pr:        create, list, checks, merge\n  run:       list, view [--log-failed], rerun [--failed], watch\n  workflow:  list, run\n  secret:    set, list, delete");
    default:
      return fail(`unknown command "${area}" for "gh"`);
  }
}

const HELP = `This sandbox understands:
  nano <file>          edit a file (the workflow: nano .github/workflows/ci.yml)
  cat, ls, echo > f    read and write files; rm, touch
  git                  status, add, commit, push, pull, switch, branch, log, diff
  gh                   pr create/checks/merge, run list/view/rerun, workflow run, secret set
  clear
Keys: ↑ ↓ for earlier commands, Tab to complete.`;

/** Workflow files that differ between the folder and what GitHub has, for status lines. */
export const pendingWorkflows = (d: Desk) => changed(d.remote[d.branch] ?? {}, d.files).filter(isWorkflowPath);
