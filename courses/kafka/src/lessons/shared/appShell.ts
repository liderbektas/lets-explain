import type { CommandLine, ShellEditor, ShellResult } from "@lets-explain/core/components/TypedSandbox";
import { complete as completeWord, lines, out, shellWords, splitCommands, type TermLine } from "@lets-explain/core/lib/terminal";

/**
 * A terminal for lessons whose model is the lesson's own (an email service, a billing app, a
 * connector, a Streams app). In real life these are set up through files and code, so the
 * reader works the same way: project files opened with `nano`, then the commands that run or
 * talk to the app (`./run-consumer.sh`, `curl …`, the Kafka tools). Each lesson supplies its
 * commands; this file brings the files, the shell built-ins and replaying.
 */

export interface AppBox<M> {
  model: M;
  files: Record<string, string>;
}

export type AppAction<A> = { kind: "model"; action: A } | { kind: "file"; path: string; content: string | null };

export interface Program<A> {
  actions: AppAction<A>[];
  output: TermLine[];
  failed?: boolean;
}

export interface AppLesson<M, A, E> {
  step: (model: M, action: A) => { state: M; events: E[] };
  /** The lesson's own commands. Return null for a command it does not know. */
  command: (box: AppBox<M>, words: string[]) => Program<A> | null;
  /** Lines `help` prints about the lesson's commands. */
  help: string;
  /** Command names, for Tab. */
  names: string[];
  dir: string;
}

export type AppResult<A, M> = ShellResult<AppAction<A>, AppBox<M>>;

export interface AppRun<M, E> {
  boxes: AppBox<M>[];
  /** The model after each model action, starting with the start: what the scene replays. */
  states: M[];
  /** Events of each model action, in order. */
  events: E[][];
}

export const model = <A>(action: A): AppAction<A> => ({ kind: "model", action });
export const file = <A>(path: string, content: string | null): AppAction<A> => ({ kind: "file", path, content });

export const ok = <A>(output: TermLine[] = [], actions: AppAction<A>[] = []): Program<A> => ({ actions, output });
export const say = <A>(text: string, tone: TermLine["tone"] = "out"): Program<A> => ({ actions: [], output: text ? lines(text, tone) : [] });
export const fail = <A>(text: string): Program<A> => ({ actions: [], output: lines(text, "err"), failed: true });

export function applyApp<M, A, E>(lesson: Pick<AppLesson<M, A, E>, "step">, box: AppBox<M>, a: AppAction<A>): { box: AppBox<M>; events: E[] | null } {
  if (a.kind === "file") {
    const files = { ...box.files };
    if (a.content === null) delete files[a.path];
    else files[a.path] = a.content;
    return { box: { ...box, files }, events: null };
  }
  const r = lesson.step(box.model, a.action);
  return { box: { ...box, model: r.state }, events: r.events };
}

export function replayApp<M, A, E>(lesson: Pick<AppLesson<M, A, E>, "step">, start: AppBox<M>, actions: AppAction<A>[]): AppRun<M, E> {
  const boxes = [start];
  const states = [start.model];
  const events: E[][] = [];
  let box = start;
  for (const a of actions) {
    const r = applyApp(lesson, box, a);
    box = r.box;
    boxes.push(box);
    if (r.events) {
      states.push(box.model);
      events.push(r.events);
    }
  }
  return { boxes, states, events };
}

export const finalBox = <M, E>(r: AppRun<M, E>) => r.boxes[r.boxes.length - 1]!;

/** What a scenario check sees: the boxes and, for the model, the same shape the old missions had. */
export interface AppCtx<M, A, E> {
  startBox: AppBox<M>;
  box: AppBox<M>;
  start: M;
  state: M;
  /** Model actions only, in order, with their events at the same index. */
  actions: A[];
  events: E[][];
}

export function appCtx<M, A, E>(start: AppBox<M>, actions: AppAction<A>[], r: AppRun<M, E>): AppCtx<M, A, E> {
  const box = finalBox(r);
  return {
    startBox: start,
    box,
    start: start.model,
    state: box.model,
    actions: actions.flatMap((a) => (a.kind === "model" ? [a.action] : [])),
    events: r.events,
  };
}

/* ------------------------------------------------------------------ shell */

export function makeAppShell<M, A, E>(lesson: AppLesson<M, A, E>): CommandLine<AppAction<A>, AppBox<M>> {
  const run = (start: AppBox<M>, line: string): AppResult<A, M> => {
    const result: AppResult<A, M> = { actions: [], output: [], moves: 0 };
    let box = start;
    for (const words of splitCommands(shellWords(line))) {
      const r = runOne(lesson, box, words);
      if ("clear" in r) {
        result.clear = true;
        result.output = [];
        continue;
      }
      if ("editor" in r) {
        result.editor = r.editor;
        return result;
      }
      result.actions.push(...r.actions);
      result.output.push(...r.output);
      if (r.actions.length) result.moves++;
      for (const a of r.actions) box = applyApp(lesson, box, a).box;
      if (r.failed) break;
    }
    return result;
  };
  const complete = (box: AppBox<M>, input: string) => {
    const words = input.trimStart().split(/\s+/);
    const candidates = words.length <= 1 ? [...BUILTINS, ...lesson.names] : Object.keys(box.files);
    return completeWord(input, candidates);
  };
  return { run, prompt: () => `~/${lesson.dir}$`, complete, title: "bash" };
}

const BUILTINS = ["ls", "cat", "echo", "nano", "cp", "rm", "clear", "help"];

type One<M, A> = Program<A> | { clear: true } | { editor: ShellEditor<AppAction<A>, AppBox<M>> };

function runOne<M, A, E>(lesson: AppLesson<M, A, E>, box: AppBox<M>, words: string[]): One<M, A> {
  const [cmd, ...args] = words;
  switch (cmd) {
    case "clear":
      return { clear: true };
    case "help":
      return say(`${lesson.help}\n\nAlso: ls, cat <file>, nano <file>, cp <from> <to>, echo "text" > <file>, rm <file>, clear.\nKeys: ↑ ↓ for earlier commands, Tab to complete.`);
    case "ls": {
      // Like a real ls, dotfiles show only with -a.
      const all = args.some((a) => /^-\w*a/.test(a));
      return say(Object.keys(box.files).filter((p) => all || !p.startsWith(".")).sort().join("  "));
    }
    case "pwd":
      return say(`/home/you/${lesson.dir}`);
    case "cd":
      return say("cd: this sandbox stays in the project folder", "dim");
    case "cat": {
      if (!args.length) return fail("cat: missing file operand");
      const output: TermLine[] = [];
      for (const p of args) {
        const text = box.files[p];
        if (text === undefined) return { actions: [], output: [...output, out(`cat: ${p}: No such file or directory`, "err")], failed: true };
        output.push(...lines(text));
      }
      return ok(output);
    }
    case "echo":
    case "printf": {
      const at = args.findIndex((a) => a === ">" || a === ">>");
      const text = (at === -1 ? args : args.slice(0, at)).join(" ").replace(/\\n$/, "");
      if (at === -1) return say(text);
      const path = args[at + 1];
      if (!path) return fail("bash: syntax error near unexpected token `newline'");
      const old = box.files[path];
      return ok([], [file(path, args[at] === ">>" && old ? `${old.replace(/\n$/, "")}\n${text}` : text)]);
    }
    case "cp": {
      const [from, to] = args.filter((a) => !a.startsWith("-"));
      if (!from || !to) return fail(`cp: missing destination file operand after '${from ?? ""}'`);
      const text = box.files[from];
      if (text === undefined) return fail(`cp: ${from}: No such file or directory`);
      const dest = to.endsWith("/") ? `${to}${from.split("/").pop()}` : to;
      return ok([], [file(dest, text)]);
    }
    case "rm": {
      const paths = args.filter((a) => !a.startsWith("-"));
      if (!paths.length) return fail("rm: missing operand");
      for (const p of paths) if (!(p in box.files)) return fail(`rm: ${p}: No such file or directory`);
      return ok([], paths.map((p) => file<A>(p, null)));
    }
    case "nano":
    case "vim":
    case "vi":
    case "code": {
      const path = args.find((a) => !a.startsWith("-"));
      if (!path) return fail(`${cmd}: give the file to open, e.g. ${cmd} ${Object.keys(box.files)[0] ?? "file"}`);
      return {
        editor: {
          file: path,
          text: box.files[path] ?? "",
          save: (b, text) => {
            const content = text.replace(/\s+$/, "");
            if (b.files[path] === content) return { actions: [], output: [], moves: 0 };
            return { actions: [file(path, content)], output: [], moves: 1 };
          },
        },
      };
    }
  }
  if (!cmd) return ok();
  const r = lesson.command(box, words);
  if (r) return r;
  if (cmd.startsWith("./")) return fail(`bash: ${cmd}: No such file or directory`);
  return fail(`bash: ${cmd}: command not found`);
}

/* ---------------------------------------------------------- file formats */

/** A Java .properties file: `key=value` lines; `#` and `!` start comments. */
export function readProps(text: string | undefined): Record<string, string> {
  const props: Record<string, string> = {};
  for (const raw of (text ?? "").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("!")) continue;
    const at = line.search(/[=:]/);
    if (at === -1) props[line] = "";
    else props[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return props;
}

/** Reads `--flag value` / `--flag=value` pairs and repeated `-H`/`-d` style options; the rest are positionals. */
export function flags(args: string[], withValue: string[]): { values: Record<string, string[]>; rest: string[]; bare: Set<string> } {
  const values: Record<string, string[]> = {};
  const rest: string[] = [];
  const bare = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    const eq = a.startsWith("--") ? a.indexOf("=") : -1;
    const name = eq > 0 ? a.slice(0, eq) : a;
    if (withValue.includes(name)) {
      const v = eq > 0 ? a.slice(eq + 1) : args[++i];
      if (v !== undefined) (values[name] ??= []).push(v);
    } else if (a.startsWith("-")) bare.add(a);
    else rest.push(a);
  }
  return { values, rest, bare };
}

/** Plays typed lines without a screen, for scenario tests. */
export function typeApp<M, A, E>(
  lesson: AppLesson<M, A, E>,
  shell: CommandLine<AppAction<A>, AppBox<M>>,
  start: AppBox<M>,
  typed: string[],
  edits: ((text: string) => string)[] = [],
): { ctx: AppCtx<M, A, E>; moves: number; output: string[] } {
  let box = start;
  const actions: AppAction<A>[] = [];
  const output: string[] = [];
  let moves = 0;
  const settle = (r: AppResult<A, M>) => {
    actions.push(...r.actions);
    output.push(...r.output.map((l) => l.text));
    moves += r.moves;
    for (const a of r.actions) box = applyApp(lesson, box, a).box;
    if (r.editor) {
      const edit = edits.shift();
      if (!edit) throw new Error(`an editor for ${r.editor.file} was left open`);
      settle(r.editor.save(box, edit(r.editor.text)));
    }
  };
  for (const line of typed) settle(shell.run(box, line));
  return { ctx: appCtx(start, actions, replayApp(lesson, start, actions)), moves, output };
}

/** Replaces one `key=value` line of a properties text (adding it when missing), for tests' editor saves. */
export function setProp(text: string, key: string, value: string): string {
  const re = new RegExp(`^\\s*${key.replace(/\./g, "\\.")}\\s*[=:].*$`, "m");
  return re.test(text) ? text.replace(re, `${key}=${value}`) : `${text.replace(/\n*$/, "")}\n${key}=${value}`;
}
